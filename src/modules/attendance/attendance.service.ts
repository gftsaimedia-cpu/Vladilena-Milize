import { Injectable, Inject, Optional } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import { businessDateText } from '../../common/business-date';
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

export interface OfficeLocationInput {
  latitude: number;
  longitude: number;
  maxDistanceMeters?: number;
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
  officeLocation?: OfficeLocationInput;
}

export interface RecordPunchResult {
  punch: PunchEventDTO;
  timesheet: DailyTimesheetDTO;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class AttendanceService {
  // Ruling: `days` đứng trước `txCoordinator` vì tham số bắt buộc không được đứng sau tham số @Optional();
  // test đơn vị không có coordinator gọi `new AttendanceService(repo, days)`.
  constructor(
    @Inject(AttendanceRepository) private readonly repo: AttendanceRepository,
    @Inject(AttendanceDaysService) private readonly days: AttendanceDaysService,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
  ) {}

  /**
   * Ghi nhận sự kiện chấm công rồi để AttendanceDaysService dựng lại dòng ngày (T1).
   * Mọi bước chạy trong một giao dịch, dưới khoá của nhân sự (cùng khoá với Đơn từ).
   */
  async recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
    if (!input.employeeId) {
      throw new Error('Mã nhân viên (employeeId) không được để trống');
    }
    if (input.type !== 'IN' && input.type !== 'OUT') {
      throw new Error("Loại chấm công phải là 'IN' hoặc 'OUT'");
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

      // 3. Lưu lần chấm
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
      };

      if (input.officeLocation) {
        punchProps.officeLocation = new GeoLocation({
          latitude: input.officeLocation.latitude,
          longitude: input.officeLocation.longitude,
        });
        punchProps.allowedRadiusMeters = input.officeLocation.maxDistanceMeters ?? 100;
      } else {
        punchProps.distanceMeters = 0;
        punchProps.isWithinOffice = true;
      }

      const punch = PunchEvent.create(punchProps);
      await repo.savePunch(punch);

      // 4. Dựng lại dòng ngày từ nguồn sự thật, 5. rồi đọc lại để trả về
      await this.days.refreshDays(input.employeeId, [workDate], trx ? { trx } : undefined);
      const timesheet = await repo.findTimesheet(input.employeeId, workDate);
      if (!timesheet) {
        throw new Error(`Không đọc lại được bảng công ngày ${workDate} sau khi chấm công`);
      }

      return {
        punch: punch.toJSON(),
        timesheet: timesheet.toJSON(),
      };
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(employeeLockKey(input.employeeId), trx => execute(trx));
    }
    return await execute();
  }

  /** Admin tính lại một ngày (T7): dựng lại dòng ngày từ nguồn rồi trả dòng đó. */
  async recalculateTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheetDTO> {
    const execute = async (trx?: DatabaseTransaction): Promise<DailyTimesheetDTO> => {
      await this.days.refreshDays(employeeId, [workDate], trx ? { trx } : undefined);
      const repo = trx ? this.repo.withTransaction(trx) : this.repo;
      const timesheet = await repo.findTimesheet(employeeId, workDate);
      if (!timesheet) {
        throw new Error(`Không tìm thấy bảng công ngày ${workDate}`);
      }
      return timesheet.toJSON();
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(employeeLockKey(employeeId), trx => execute(trx));
    }
    return await execute();
  }

  /** Admin tính lại cả tháng 'YYYY-MM' (T7): trả mọi dòng ngày của tháng theo ngày tăng. */
  async recalculateMonth(employeeId: string, month: string): Promise<DailyTimesheetDTO[]> {
    if (!MONTH_PATTERN.test(month)) {
      throw new Error(`Tháng không hợp lệ (YYYY-MM): ${month}`);
    }
    const dates = datesOfMonth(month);

    const execute = async (trx?: DatabaseTransaction): Promise<DailyTimesheetDTO[]> => {
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

  async lockTimesheets(employeeId: string, startDate: string, endDate: string): Promise<number> {
    return await this.repo.lockTimesheets(employeeId, startDate, endDate);
  }
}
