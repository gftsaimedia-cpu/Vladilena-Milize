import { Injectable, Inject, Optional } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import { PeriodGate } from '../periods/period-gate';
import { BadRequestError } from '../../common';
import { businessDateText } from '../../common/business-date';
import { isValidDateText } from '../../common/date-text';
import { checkPunchLocation, isWorkday, SettingsReader, TypeWeekMissingError } from '../settings';
import { PunchRefusedError } from './attendance.errors';
import { AttendanceRepository, TimesheetFilter } from './attendance.repository';
import {
  GeoLocation,
  PunchEvent,
  PunchEventDTO,
  DailyTimesheet,
  DailyTimesheetDTO,
  ShiftType,
  CreatePunchEventProps,
  WorkSchedule,
} from './domain';

export interface ShiftConfigInput {
  shiftType: ShiftType;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftAllowancePct?: number;
}

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
  shiftConfig?: ShiftConfigInput;
}

/** Cùng câu với kiểm tra `workDate` của domain chấm công. */
const workDateError = (workDate: unknown): string => `Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${workDate}`;

export interface RecordPunchResult {
  punch: PunchEventDTO;
  timesheet: DailyTimesheetDTO;
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(AttendanceRepository) private readonly repo: AttendanceRepository,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
    @Inject(SettingsReader) private readonly settings?: Pick<SettingsReader, 'workWeekOf' | 'zone'>,
    @Optional() @Inject(PeriodGate) private readonly periodGate?: PeriodGate,
  ) {}

  /**
   * Ngày `date` có phải ngày làm của người này không: đã có lịch, thứ thuộc tuần làm của tháng đó,
   * hoặc có đơn đã duyệt (tăng ca, đổi ca, làm bù); lịch nghỉ đã duyệt (ON_LEAVE) thì luôn không phải. Không có cài đặt thì coi mọi ngày là ngày làm.
   */
  async workdayOf(employeeId: string, date: string): Promise<boolean> {
    if (!this.settings) return true;
    const schedule = await this.repo.findSchedule(employeeId, date);
    if (schedule) return schedule.status !== 'ON_LEAVE'; // lịch nghỉ phép đã duyệt không phải ngày làm
    return await this.workdayWithoutSchedule(this.settings, employeeId, date);
  }

  private async workdayWithoutSchedule(settings: Pick<SettingsReader, 'workWeekOf'>, employeeId: string, date: string): Promise<boolean> {
    // Loại nhân sự chưa có tuần làm (vd. tài khoản quản trị đầu tiên) thì coi như tuần T2–T7, cùng mặc định với app nhân viên.
    let weekdays: readonly number[] = [1, 2, 3, 4, 5, 6];
    try {
      weekdays = (await settings.workWeekOf(employeeId, date.slice(0, 7))).weekdays;
    } catch (err) {
      if (!(err instanceof TypeWeekMissingError)) throw err;
    }
    return isWorkday(weekdays, date) || (await this.repo.hasApprovedWorkOn(employeeId, date));
  }

  /**
   * Ghi nhận sự kiện chấm công và tính toán lại bảng công nhật (với lock bảo vệ).
   * Có cài đặt thì kiểm ngày làm (chỉ chấm vào) rồi vùng chấm công (khi `checkZone`) trước khi ghi bất cứ gì.
   */
  async recordPunch(input: RecordPunchInput, options: { checkZone?: boolean } = {}): Promise<RecordPunchResult> {
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

    const workDate = input.workDate || businessDateText();
    const lockKey = `punch_${input.employeeId}_${workDate}`;

    const executePunch = async (trx?: DatabaseTransaction) => {
      // 0. Tháng đã chốt thì không ghi gì; giữ khoá chia sẻ của tháng trên chính giao dịch của khoá chấm công, để Chốt công chờ lượt chấm đang chạy.
      await this.periodGate?.hold(trx, [workDate.slice(0, 7)], 'punch');

      // 1. Lấy hoặc tạo lịch làm việc cho ngày công
      let schedule = await this.repo.findSchedule(input.employeeId, workDate);

      // Kiểm ngày làm và vùng trước khi tạo lịch mặc định: repo ghi bằng pool riêng nên kiểm sau thì lần bị từ chối vẫn để lại lịch.
      let distanceM = 0;
      if (this.settings) {
        if (!schedule && !input.shiftConfig && input.type === 'IN') {
          if (!(await this.workdayWithoutSchedule(this.settings, input.employeeId, workDate))) {
            throw new PunchRefusedError('NOT_A_WORKDAY', 'Hôm nay không phải ngày làm của bạn');
          }
        }
        if (options.checkZone) {
          const zone = await this.settings.zone();
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

      if (!schedule) {
        if (input.shiftConfig) {
          schedule = WorkSchedule.create({
            employeeId: input.employeeId,
            workDate,
            shiftType: input.shiftConfig.shiftType,
            plannedStartTime: input.shiftConfig.shiftStartTime,
            plannedEndTime: input.shiftConfig.shiftEndTime,
          });
          await this.repo.saveSchedule(schedule);
        } else {
          schedule = await this.repo.ensureDefaultSchedule(input.employeeId, workDate);
        }
      }

      // 2. Chặn chấm công nếu nhân viên đang trong ngày nghỉ phép
      if (schedule.status === 'ON_LEAVE') {
        throw new Error('Nhân viên đang trong ngày nghỉ phép / làm bù đã duyệt, không thể chấm công');
      }

      // 3. Kiểm tra xem ngày công đã bị khóa chưa
      let timesheet = await this.repo.findTimesheet(input.employeeId, workDate);
      if (timesheet && timesheet.isLocked) {
        throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
      }

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
        punchedAt: input.punchedAt,
        type: input.type,
        userLocation,
        note: input.note,
        distanceMeters: distanceM,
        isWithinOffice: true,
      };

      const punch = PunchEvent.create(punchProps);
      await this.repo.savePunch(punch);

      const punches = await this.repo.findPunches(input.employeeId, workDate);

      if (!timesheet) {
        const shiftType = (schedule.shiftType === 'CUSTOM' ? 'NORMAL' : schedule.shiftType) as ShiftType;
        const shiftStartTime = schedule.plannedStartTime;
        const shiftEndTime = schedule.plannedEndTime;
        let shiftAllowancePct = input.shiftConfig?.shiftAllowancePct;
        if (shiftAllowancePct === undefined) {
          if (shiftType === 'NORMAL') shiftAllowancePct = 0;
          else if (shiftType === 'FLEX') shiftAllowancePct = 10;
          else shiftAllowancePct = 30;
        }

        timesheet = DailyTimesheet.create({
          employeeId: input.employeeId,
          workDate,
          shiftType,
          shiftStartTime,
          shiftEndTime,
          shiftAllowancePct,
        });
      }

      timesheet = timesheet.calculate(punches, schedule);
      await this.repo.saveTimesheet(timesheet);

      return {
        punch: punch.toJSON(),
        timesheet: timesheet.toJSON(),
      };
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(lockKey, trx => executePunch(trx));
    }
    return await executePunch();
  }

  async recalculateTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheetDTO> {
    // Như ở recordPunch. Route tính lại không đổi lỗi thường thành 400, nên lỗi ngày là BadRequestError.
    if (!isValidDateText(workDate)) {
      throw new BadRequestError(workDateError(workDate), { code: 'INVALID_DATE' });
    }
    await this.periodGate?.hold(undefined, [workDate.slice(0, 7)], 'recalculate');
    const schedule = await this.repo.findSchedule(employeeId, workDate);
    if (!schedule) {
      throw new Error(`Không tìm thấy lịch làm việc cho ngày ${workDate}`);
    }

    let timesheet = await this.repo.findTimesheet(employeeId, workDate);
    if (!timesheet) {
      timesheet = DailyTimesheet.create({
        employeeId,
        workDate,
        shiftType: (schedule.shiftType === 'CUSTOM' ? 'NORMAL' : schedule.shiftType) as ShiftType,
        shiftStartTime: schedule.plannedStartTime,
        shiftEndTime: schedule.plannedEndTime,
      });
    }

    const punches = await this.repo.findPunches(employeeId, workDate);
    timesheet = timesheet.calculate(punches, schedule);
    await this.repo.saveTimesheet(timesheet);
    return timesheet.toJSON();
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

  async lockTimesheets(employeeId: string, startDate: string, endDate: string): Promise<number> {
    return await this.repo.lockTimesheets(employeeId, startDate, endDate);
  }
}
