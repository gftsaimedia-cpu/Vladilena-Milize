import { Injectable, Inject, Optional } from '@nestjs/common';
import { STORE } from '../../core/tokens';
import { AttendanceV2Repository, TimesheetFilter } from '../../data/attendance-v2.repository';
import {
  GeoLocation,
  PunchEvent,
  PunchEventDTO,
  DailyTimesheet,
  DailyTimesheetDTO,
  ShiftType,
  CreatePunchEventProps,
  WorkSchedule
} from '../../domain/attendance-v2';

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
  latitude: number;
  longitude: number;
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
export class AttendanceV2Service {
  private readonly repo: AttendanceV2Repository;

  constructor(
    @Optional() repo?: AttendanceV2Repository,
    @Optional() @Inject(STORE) private readonly store?: any
  ) {
    if (repo) {
      this.repo = repo;
    } else if (this.store?.queryBuilder) {
      this.repo = new AttendanceV2Repository(this.store.queryBuilder);
    } else {
      this.repo = new AttendanceV2Repository({} as any);
    }
  }

  /**
   * Ghi nhận sự kiện chấm công và tính toán lại bảng công nhật
   */
  async recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
    if (!input.employeeId) {
      throw new Error('Mã nhân viên (employeeId) không được để trống');
    }
    if (input.type !== 'IN' && input.type !== 'OUT') {
      throw new Error("Loại chấm công phải là 'IN' hoặc 'OUT'");
    }

    const workDate = input.workDate || new Date().toISOString().slice(0, 10);

    // 1. Lấy hoặc tạo lịch làm việc cho ngày công
    let schedule = await this.repo.findSchedule(input.employeeId, workDate);
    if (!schedule) {
      if (input.shiftConfig) {
        schedule = WorkSchedule.create({
          employeeId: input.employeeId,
          workDate,
          shiftType: input.shiftConfig.shiftType,
          plannedStartTime: input.shiftConfig.shiftStartTime,
          plannedEndTime: input.shiftConfig.shiftEndTime
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

    const userLocation = new GeoLocation({
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: 0
    });

    const punchProps: CreatePunchEventProps = {
      employeeId: input.employeeId,
      workDate,
      punchedAt: input.punchedAt,
      type: input.type,
      userLocation,
      note: input.note
    };

    if (input.officeLocation) {
      punchProps.officeLocation = new GeoLocation({
        latitude: input.officeLocation.latitude,
        longitude: input.officeLocation.longitude
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
        shiftAllowancePct
      });
    }

    timesheet = timesheet.calculate(punches, schedule);
    await this.repo.saveTimesheet(timesheet);

    return {
      punch: punch.toJSON(),
      timesheet: timesheet.toJSON()
    };
  }

  async getPunches(employeeId: string, workDate: string): Promise<PunchEventDTO[]> {
    const punches = await this.repo.findPunches(employeeId, workDate);
    return punches.map(p => p.toJSON());
  }

  async getTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheetDTO | null> {
    const timesheet = await this.repo.findTimesheet(employeeId, workDate);
    return timesheet ? timesheet.toJSON() : null;
  }

  async listTimesheets(filter: TimesheetFilter = {}): Promise<DailyTimesheetDTO[]> {
    const timesheets = await this.repo.listTimesheets(filter);
    return timesheets.map(t => t.toJSON());
  }

  async lockTimesheets(employeeId: string, startDate: string, endDate: string): Promise<number> {
    return await this.repo.lockTimesheets(employeeId, startDate, endDate);
  }
}
