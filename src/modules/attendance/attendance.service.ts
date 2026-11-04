import { Injectable, Inject, Optional } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
import { businessDateText } from '../../common/business-date';
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
  shiftConfig?: ShiftConfigInput;
  officeLocation?: OfficeLocationInput;
}

export interface RecordPunchResult {
  punch: PunchEventDTO;
  timesheet: DailyTimesheetDTO;
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(AttendanceRepository) private readonly repo: AttendanceRepository,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
  ) {}

  /**
   * Ghi nhận sự kiện chấm công và tính toán lại bảng công nhật (với lock bảo vệ)
   */
  async recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
    if (!input.employeeId) {
      throw new Error('Mã nhân viên (employeeId) không được để trống');
    }
    if (input.type !== 'IN' && input.type !== 'OUT') {
      throw new Error("Loại chấm công phải là 'IN' hoặc 'OUT'");
    }

    const workDate = input.workDate || businessDateText();
    const lockKey = `punch_${input.employeeId}_${workDate}`;

    const executePunch = async () => {
      // 1. Lấy hoặc tạo lịch làm việc cho ngày công
      let schedule = await this.repo.findSchedule(input.employeeId, workDate);
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
      return await this.txCoordinator.withLock(lockKey, executePunch);
    }
    return await executePunch();
  }

  async recalculateTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheetDTO> {
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
