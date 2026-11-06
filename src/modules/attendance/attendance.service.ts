import { randomUUID } from 'node:crypto';
import { Injectable, Inject, Optional } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import { AuditLog } from '../audit/audit-log';
import { PeriodGate } from '../periods/period-gate';
import { BadRequestError, assertEmployed } from '../../common';
import { businessDateText, businessTimeText } from '../../common/business-date';
import { isValidDateText } from '../../common/date-text';
import { checkPunchLocation, isWorkday, SettingsReader, TypeWeekMissingError } from '../settings';
import { RealtimeBus } from '../realtime/realtime-bus';
import type { RealtimeEvent } from '../realtime/realtime-event';
import { PunchRefusedError } from './attendance.errors';
import { AttendanceRepository, TimesheetFilter } from './attendance.repository';
import { AttendanceDaysService, employeeLockKey } from './attendance-days.service';
import {
  GeoLocation,
  PunchEvent,
  PunchEventDTO,
  DailyTimesheetDTO,
  CreatePunchEventProps,
  addDaysText,
  datesOfMonth,
  workDateOfPunch,
} from './domain';
import { MONTH_PATTERN } from './domain/calendar';

export interface RecordPunchInput {
  employeeId: string;
  type: 'IN' | 'OUT';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  userLocation?: { latitude: number; longitude: number; accuracyMeters?: number };
  note?: string;
  workDate?: string;
  punchedAt?: Date | string;
}

/** Cùng câu với kiểm tra `workDate` của domain chấm công. */
const workDateError = (workDate: unknown): string => `Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${workDate}`;

export interface RecordPunchResult {
  punch: PunchEventDTO;
  timesheet: DailyTimesheetDTO;
}

@Injectable()
export class AttendanceService {
  // Ruling: tham số bắt buộc trước, @Optional() cuối. `settings` bắt buộc trong DI (không @Optional, thiếu import thì Nest
  // báo lỗi lúc khởi động) nên đứng thứ ba; `txCoordinator` đứng cuối. Kiểu TS của `settings` vẫn tuỳ chọn để test dựng tay
  // gọi `new AttendanceService(repo, days)` hoặc `new AttendanceService(repo, days, settings, coordinator)`.
  constructor(
    @Inject(AttendanceRepository) private readonly repo: AttendanceRepository,
    @Inject(AttendanceDaysService) private readonly days: AttendanceDaysService,
    @Inject(SettingsReader) private readonly settings?: Pick<SettingsReader, 'workWeekOf' | 'zone'>,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
    // Cổng kỳ (spec kỳ lương §5): tháng của ngày công đã chốt thì không chấm, không tính lại.
    @Optional() @Inject(PeriodGate) private readonly periodGate?: Pick<PeriodGate, 'hold'>,
    // Phát sự kiện realtime sau khi commit; thiếu thì không phát.
    @Optional() @Inject(RealtimeBus) private readonly bus?: RealtimeBus,
    // Nhật ký punch.correct (Admin chấm hộ); Nest luôn tiêm (AuditModule toàn cục), test dựng tay không có thì không ghi.
    @Optional() @Inject(AuditLog) private readonly audit?: Pick<AuditLog, 'append'>,
  ) {}

  /** Phát sự kiện sau commit. Lỗi ở đây (tra tên, bus) chỉ ghi log, không làm hỏng request chấm công/tính lại. */
  private async announce(employeeId: string, build: (who: { username: string; name: string }) => RealtimeEvent): Promise<void> {
    if (!this.bus) return;
    try {
      const who = await this.repo.findIdentity(employeeId);
      if (who) this.bus.publish(build(who));
    } catch (err) {
      console.error('Không phát được sự kiện realtime:', err);
    }
  }

  /**
   * Ngày `date` có phải ngày làm của người này không: có lịch đã duyệt không phải REGULAR (đổi ca, làm bù, tăng ca),
   * thứ thuộc tuần làm của tháng đó, hoặc có đơn đã duyệt (tăng ca, đổi ca, làm bù); lịch nghỉ đã duyệt (ON_LEAVE)
   * thì luôn không phải. Dòng REGULAR cũ không còn mở ngày làm: tuần làm chỉ lấy từ cài đặt, như `buildDay`.
   * Không có cài đặt thì coi mọi ngày là ngày làm.
   */
  async workdayOf(employeeId: string, date: string): Promise<boolean> {
    if (!this.settings) return true;
    const schedule = await this.repo.findSchedule(employeeId, date);
    if (schedule && schedule.status === 'ON_LEAVE') return false; // lịch nghỉ phép đã duyệt không phải ngày làm
    if (schedule && schedule.scheduleType !== 'REGULAR') return true;
    return await this.workdayWithoutSchedule(this.settings, this.repo, employeeId, date);
  }

  /** `repo` và `trx`: trong khoá chấm công thì đọc trên giao dịch đang giữ khoá; ngoài khoá thì đọc thẳng. */
  private async workdayWithoutSchedule(
    settings: Pick<SettingsReader, 'workWeekOf'>,
    repo: AttendanceRepository,
    employeeId: string,
    date: string,
    trx?: DatabaseTransaction,
  ): Promise<boolean> {
    // Loại nhân sự chưa có tuần làm (vd. tài khoản quản trị đầu tiên) thì coi như tuần T2–T7, cùng mặc định với app nhân viên.
    let weekdays: readonly number[] = [1, 2, 3, 4, 5, 6];
    try {
      weekdays = (await settings.workWeekOf(employeeId, date.slice(0, 7), trx)).weekdays;
    } catch (err) {
      if (!(err instanceof TypeWeekMissingError)) throw err;
    }
    return isWorkday(weekdays, date) || (await repo.hasApprovedWorkOn(employeeId, date));
  }

  /**
   * Ghi nhận sự kiện chấm công rồi để AttendanceDaysService dựng lại dòng ngày (T1).
   * Mọi bước chạy trong một giao dịch, dưới khoá của nhân sự (cùng khoá với Đơn từ).
   * Có cài đặt thì kiểm ngày làm (chỉ lần vào) rồi vùng chấm công (khi `checkZone`) trước khi lưu lần chấm.
   * `actor` (route Admin chấm hộ) thì ghi nhật ký `punch.correct` cuối giao dịch; nhân viên tự chấm không truyền nên không ghi.
   */
  async recordPunch(
    input: RecordPunchInput,
    options: { checkZone?: boolean; actor?: string } = {},
  ): Promise<RecordPunchResult> {
    if (!input.employeeId) {
      throw new Error('Mã nhân viên (employeeId) không được để trống');
    }
    if (input.type !== 'IN' && input.type !== 'OUT') {
      throw new Error("Loại chấm công phải là 'IN' hoặc 'OUT'");
    }
    // Kiểm trước cổng kỳ: cột DATE vẫn đọc được '20261020' hay ' 2026-10-20', nhưng tháng cắt ra từ đó là rác.
    if (input.workDate && !isValidDateText(input.workDate)) {
      throw new Error(workDateError(input.workDate));
    }

    const punchedAt = input.punchedAt ? new Date(input.punchedAt) : new Date();
    if (isNaN(punchedAt.getTime())) {
      throw new Error(`Thời điểm chấm công (punchedAt) không hợp lệ: ${input.punchedAt}`);
    }

    const execute = async (trx?: DatabaseTransaction): Promise<RecordPunchResult> => {
      const repo = trx ? this.repo.withTransaction(trx) : this.repo;

      // Ngày công: có workDate thì giữ nguyên; không thì theo ngày D của lần chấm, riêng lần ra ca đêm theo L21.
      // Đọc dòng D−1 sau khi đã có khoá của nhân sự.
      let workDate = input.workDate;
      if (!workDate) {
        const day = businessDateText(punchedAt);
        const previous = input.type === 'OUT' ? await repo.findTimesheet(input.employeeId, addDaysText(day, -1)) : null;
        workDate = workDateOfPunch({
          at: punchedAt,
          type: input.type,
          previousDay: {
            crossesMidnight: Boolean(
              previous?.shiftStartTime && previous.shiftEndTime && previous.shiftEndTime <= previous.shiftStartTime,
            ),
            hasInWithoutOut: Boolean(previous?.actualCheckIn && !previous.actualCheckOut),
          },
        });
      }

      // 0. Tháng của NGÀY CÔNG (không phải ngày của lần chấm: lần ra 05:00 ngày 01/12 của ca đêm 30/11 thuộc tháng 11) đã
      // chốt thì không ghi gì. Giữ khoá chia sẻ của tháng trên chính giao dịch của khoá nhân sự, để Chốt công chờ lượt chấm
      // đang chạy.
      await this.periodGate?.hold(trx, [workDate.slice(0, 7)], 'punch');

      // 0b. Ngày công phải nằm trong thời gian làm việc (vào làm .. nghỉ việc); ngoài khoảng đó thì không ghi gì.
      const employment = await repo.findEmployment(input.employeeId);
      if (employment) assertEmployed(employment, [workDate]);

      // 1. Chặn chấm công nếu nhân viên đang trong ngày nghỉ phép
      const schedule = await repo.findSchedule(input.employeeId, workDate);
      if (schedule && schedule.status === 'ON_LEAVE') {
        throw new Error('Nhân viên đang trong ngày nghỉ phép / làm bù đã duyệt, không thể chấm công');
      }

      // 2. Kiểm tra xem ngày công đã bị khóa chưa
      const existing = await repo.findTimesheet(input.employeeId, workDate);
      if (existing && existing.isLocked) {
        throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
      }

      // 3. Kiểm theo cài đặt: ngày làm (chỉ lần vào, ngày chưa có lịch hoặc chỉ có dòng REGULAR cũ), rồi vùng chấm công (khi `checkZone`).
      let distanceM = 0;
      if (this.settings) {
        // Dòng REGULAR cũ không mở ngày làm (FP4): chỉ lịch đổi ca, làm bù, tăng ca mới qua cổng này mà không cần tuần làm.
        if ((!schedule || schedule.scheduleType === 'REGULAR') && input.type === 'IN') {
          if (!(await this.workdayWithoutSchedule(this.settings, repo, input.employeeId, workDate, trx))) {
            throw new PunchRefusedError('NOT_A_WORKDAY', 'Hôm nay không phải ngày làm của bạn');
          }
        }
        if (options.checkZone) {
          const zone = await this.settings.zone(trx);
          const check = checkPunchLocation(zone, {
            lat: input.latitude ?? input.userLocation?.latitude,
            lng: input.longitude ?? input.userLocation?.longitude,
          });
          if (check.kind === 'no-location') throw new PunchRefusedError('NO_LOCATION', 'Không lấy được vị trí');
          if (check.kind === 'outside') {
            throw new PunchRefusedError('OUTSIDE_ZONE', `Bạn đang cách văn phòng ${check.distanceM} m`, {
              distanceM: check.distanceM,
              radiusM: zone!.radiusM,
            });
          }
          distanceM = check.distanceM ?? 0;
        }
      }

      // 4. Lưu lần chấm
      const lat = input.latitude ?? input.userLocation?.latitude ?? 0;
      const lng = input.longitude ?? input.userLocation?.longitude ?? 0;
      const accuracy = input.accuracyMeters ?? input.userLocation?.accuracyMeters ?? 0;
      const userLocation = new GeoLocation({
        latitude: lat,
        longitude: lng,
        accuracyMeters: accuracy,
      });

      const punchProps: CreatePunchEventProps = {
        employeeId: input.employeeId,
        workDate,
        punchedAt,
        type: input.type,
        userLocation,
        note: input.note,
        distanceMeters: distanceM,
        isWithinOffice: true,
      };

      const punch = PunchEvent.create(punchProps);
      await repo.savePunch(punch);

      // 5. Dựng lại dòng ngày từ nguồn sự thật, 6. rồi đọc lại để trả về
      await this.days.refreshDays(input.employeeId, [workDate], trx ? { trx } : undefined);
      const timesheet = await repo.findTimesheet(input.employeeId, workDate);
      if (!timesheet) {
        throw new Error(`Không đọc lại được bảng công ngày ${workDate} sau khi chấm công`);
      }

      // 7. Admin chấm hộ: nhật ký là câu ghi cuối của giao dịch (ghi lỗi thì lần chấm và dòng ngày cùng huỷ).
      if (trx && this.audit && options.actor) {
        const hhmm = (d: Date | null | undefined) => (d ? businessTimeText(d) : null);
        const who = await repo.findIdentity(input.employeeId);
        await this.audit.append(trx, {
          actor: options.actor,
          action: 'punch.correct',
          entityKind: 'attendance-day',
          entityId: workDate,
          subject: who?.username ?? null,
          subjectUuid: input.employeeId,
          month: workDate.slice(0, 7),
          before: { in: hhmm(existing?.actualCheckIn), out: hhmm(existing?.actualCheckOut) },
          after: {
            in: hhmm(timesheet.actualCheckIn),
            out: hhmm(timesheet.actualCheckOut),
            added: `${input.type} ${businessTimeText(punchedAt)}`,
          },
          reason: input.note?.trim() || null,
          sensitivity: 'normal',
          requestId: randomUUID(),
        });
      }

      return {
        punch: punch.toJSON(),
        timesheet: timesheet.toJSON(),
      };
    };

    const result = this.txCoordinator
      ? await this.txCoordinator.withLock(employeeLockKey(input.employeeId), trx => execute(trx))
      : await execute();
    const { punch } = result;
    await this.announce(input.employeeId, who => ({
      type: 'attendance.punched',
      username: who.username,
      name: who.name,
      workDate: punch.workDate,
      direction: input.type,
      at: punchedAt.toISOString(),
      time: businessTimeText(punchedAt),
      source: options.checkZone ? 'self' : 'admin',
    }));
    return result;
  }

  /** Admin tính lại một ngày (T7): dựng lại dòng ngày từ nguồn rồi trả dòng đó. */
  async recalculateTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheetDTO> {
    // Như ở recordPunch. Route tính lại không đổi lỗi thường thành 400, nên lỗi ngày là BadRequestError.
    if (!isValidDateText(workDate)) {
      throw new BadRequestError(workDateError(workDate), { code: 'INVALID_DATE' });
    }
    const execute = async (trx?: DatabaseTransaction): Promise<DailyTimesheetDTO> => {
      // Tháng đã chốt thì 409 PERIOD_LOCKED, không dựng lại gì; khoá chia sẻ của tháng giữ tới commit, như lúc chấm công.
      await this.periodGate?.hold(trx, [workDate.slice(0, 7)], 'recalculate');
      await this.days.refreshDays(employeeId, [workDate], trx ? { trx } : undefined);
      const repo = trx ? this.repo.withTransaction(trx) : this.repo;
      const timesheet = await repo.findTimesheet(employeeId, workDate);
      if (!timesheet) {
        throw new Error(`Không tìm thấy bảng công ngày ${workDate}`);
      }
      return timesheet.toJSON();
    };

    const result = this.txCoordinator
      ? await this.txCoordinator.withLock(employeeLockKey(employeeId), trx => execute(trx))
      : await execute();
    await this.announce(employeeId, who => ({ type: 'attendance.changed', username: who.username, workDate }));
    return result;
  }

  /** Admin tính lại cả tháng 'YYYY-MM' (T7): trả mọi dòng ngày của tháng theo ngày tăng. */
  async recalculateMonth(employeeId: string, month: string): Promise<DailyTimesheetDTO[]> {
    if (!MONTH_PATTERN.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }
    const dates = datesOfMonth(month);

    const execute = async (trx?: DatabaseTransaction): Promise<DailyTimesheetDTO[]> => {
      // Cùng cổng kỳ với tính lại một ngày, theo tháng được tính lại.
      await this.periodGate?.hold(trx, [month], 'recalculate');
      await this.days.refreshMonth(employeeId, month, trx ? { trx } : undefined);
      const repo = trx ? this.repo.withTransaction(trx) : this.repo;
      const timesheets = await repo.listTimesheets({
        employeeId,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
      });
      return timesheets.map((t) => t.toJSON());
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(employeeLockKey(employeeId), trx => execute(trx));
    }
    return await execute();
  }

  async getPunches(employeeId: string, workDate: string): Promise<PunchEventDTO[]> {
    const punches = await this.repo.findPunches(employeeId, workDate);
    return punches.map((p) => p.toJSON());
  }

  async getTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheetDTO | null> {
    const timesheet = await this.repo.findTimesheet(employeeId, workDate);
    return timesheet ? timesheet.toJSON() : null;
  }

  async listTimesheets(filter: TimesheetFilter = {}): Promise<DailyTimesheetDTO[]> {
    const timesheets = await this.repo.listTimesheets(filter);
    return timesheets.map((t) => t.toJSON());
  }
}
