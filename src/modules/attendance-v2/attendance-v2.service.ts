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
  DailyTimesheetStatus,
  CreatePunchEventProps
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

export interface AdjustTimesheetInput {
  checkIn?: Date | string | null;
  checkOut?: Date | string | null;
  status?: DailyTimesheetStatus;
  reason: string;
  adjustedBy: string;
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

    // Kiểm tra xem ngày công đã bị khóa chưa
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
      const shiftType = input.shiftConfig?.shiftType ?? 'NORMAL';
      const shiftStartTime = input.shiftConfig?.shiftStartTime ?? (shiftType === 'NIGHT' ? '21:00' : '08:00');
      const shiftEndTime = input.shiftConfig?.shiftEndTime ?? (shiftType === 'NIGHT' ? '06:00' : '17:00');
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

    timesheet = timesheet.calculate(punches);
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

  async adjustTimesheet(id: string, adjustments: AdjustTimesheetInput): Promise<DailyTimesheetDTO> {
    const timesheet = await this.repo.findTimesheetById(id);
    if (!timesheet) {
      throw new Error(`Không tìm thấy bảng công với mã: ${id}`);
    }

    if (timesheet.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể điều chỉnh');
    }

    if (!adjustments.reason || !adjustments.reason.trim()) {
      throw new Error('Lý do điều chỉnh không được để trống');
    }

    if (!adjustments.adjustedBy || !adjustments.adjustedBy.trim()) {
      throw new Error('Người thực hiện điều chỉnh không được để trống');
    }

    const hasCheckInAdjustment = adjustments.checkIn !== undefined;
    const hasCheckOutAdjustment = adjustments.checkOut !== undefined;

    const finalCheckIn = hasCheckInAdjustment
      ? adjustments.checkIn
        ? adjustments.checkIn instanceof Date
          ? adjustments.checkIn
          : new Date(adjustments.checkIn)
        : null
      : timesheet.actualCheckIn;

    const finalCheckOut = hasCheckOutAdjustment
      ? adjustments.checkOut
        ? adjustments.checkOut instanceof Date
          ? adjustments.checkOut
          : new Date(adjustments.checkOut)
        : null
      : timesheet.actualCheckOut;

    let updated = timesheet;

    if (hasCheckInAdjustment || hasCheckOutAdjustment) {
      if (finalCheckIn && finalCheckOut) {
        const syntheticPunches = [
          PunchEvent.create({
            employeeId: timesheet.employeeId,
            punchedAt: finalCheckIn,
            workDate: timesheet.workDate,
            type: 'IN',
            userLocation: new GeoLocation({ latitude: 10.7725, longitude: 106.698 }),
            distanceMeters: 0,
            isWithinOffice: true,
            note: `Điều chỉnh bởi ${adjustments.adjustedBy}: ${adjustments.reason}`
          }),
          PunchEvent.create({
            employeeId: timesheet.employeeId,
            punchedAt: finalCheckOut,
            workDate: timesheet.workDate,
            type: 'OUT',
            userLocation: new GeoLocation({ latitude: 10.7725, longitude: 106.698 }),
            distanceMeters: 0,
            isWithinOffice: true,
            note: `Điều chỉnh bởi ${adjustments.adjustedBy}: ${adjustments.reason}`
          })
        ];
        updated = timesheet.calculate(syntheticPunches);
      } else {
        updated = timesheet.calculate([]);
      }
    }

    if (adjustments.status) {
      if (adjustments.status === 'LEAVE_PAID') {
        updated = updated.applyApprovedLeave(true);
      } else if (adjustments.status === 'LEAVE_UNPAID') {
        updated = updated.applyApprovedLeave(false);
      } else {
        updated = new DailyTimesheet({
          id: updated.id,
          employeeId: updated.employeeId,
          workDate: updated.workDate,
          shiftType: updated.shiftType,
          shiftStartTime: updated.shiftStartTime,
          shiftEndTime: updated.shiftEndTime,
          shiftAllowancePct: updated.shiftAllowancePct,
          actualCheckIn: updated.actualCheckIn,
          actualCheckOut: updated.actualCheckOut,
          metrics: updated.metrics,
          status: adjustments.status,
          isLocked: updated.isLocked
        });
      }
    }

    await this.repo.saveTimesheet(updated);
    return updated.toJSON();
  }
}
