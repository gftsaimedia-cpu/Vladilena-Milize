import { randomUUID } from 'node:crypto';

export type ShiftType = 'NORMAL' | 'FLEX' | 'NIGHT' | 'CUSTOM';
export type ScheduleType = 'REGULAR' | 'SHIFT_CHANGE' | 'MAKE_UP' | 'OVERTIME';
export type ScheduleStatus = 'PLANNED' | 'COMPLETED' | 'ON_LEAVE' | 'CANCELLED';

export type CheckInStatus = 'VALID' | 'EARLY' | 'LATE' | 'MISSED' | 'PENDING';
export type CheckOutStatus = 'VALID' | 'EARLY' | 'LATE_WITHOUT_OT' | 'MISSED' | 'PENDING';
export type DayStatus = 'PLANNED' | 'IN_PROGRESS' | 'VALID' | 'NEEDS_EXPLANATION' | 'ON_LEAVE';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export interface WorkScheduleProps {
  id: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType;
  plannedStartTime: string;
  plannedEndTime: string;
  approvedOtHours?: number;
  scheduleType?: ScheduleType;
  status?: ScheduleStatus;
  sourceRequestId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateWorkScheduleProps {
  id?: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType;
  plannedStartTime: string;
  plannedEndTime: string;
  approvedOtHours?: number;
  scheduleType?: ScheduleType;
  status?: ScheduleStatus;
  sourceRequestId?: string | null;
}

export interface WorkScheduleRow {
  id: string;
  employee_id: string;
  work_date: string;
  shift_type: string;
  planned_start_time: string;
  planned_end_time: string;
  approved_ot_hours: number;
  schedule_type: string;
  status: string;
  source_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkScheduleDTO {
  id: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType;
  plannedStartTime: string;
  plannedEndTime: string;
  approvedOtHours: number;
  scheduleType: ScheduleType;
  status: ScheduleStatus;
  sourceRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeTime(t: string): string {
  if (!t || typeof t !== 'string' || !TIME_REGEX.test(t)) {
    throw new Error(`Định dạng giờ không hợp lệ (HH:mm hoặc HH:mm:ss): ${t}`);
  }
  return t.slice(0, 5); // Format về HH:mm
}

export class WorkSchedule {
  readonly id: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly shiftType: ShiftType;
  readonly plannedStartTime: string;
  readonly plannedEndTime: string;
  readonly approvedOtHours: number;
  readonly scheduleType: ScheduleType;
  readonly status: ScheduleStatus;
  readonly sourceRequestId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: WorkScheduleProps) {
    if (!props || typeof props !== 'object') {
      throw new Error('Thông số WorkSchedule không được để trống');
    }

    if (!props.id || !UUID_REGEX.test(props.id)) {
      throw new Error(`Mã WorkSchedule (id) không hợp lệ (cần UUID): ${props.id}`);
    }

    if (!props.employeeId || typeof props.employeeId !== 'string') {
      throw new Error('Mã nhân viên (employeeId) không hợp lệ');
    }

    if (!props.workDate || !DATE_REGEX.test(props.workDate)) {
      throw new Error(`Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${props.workDate}`);
    }

    this.id = props.id;
    this.employeeId = props.employeeId;
    this.workDate = props.workDate;
    this.shiftType = props.shiftType;
    this.plannedStartTime = normalizeTime(props.plannedStartTime);
    this.plannedEndTime = normalizeTime(props.plannedEndTime);
    this.approvedOtHours = props.approvedOtHours ?? 0;
    this.scheduleType = props.scheduleType ?? 'REGULAR';
    this.status = props.status ?? 'PLANNED';
    this.sourceRequestId = props.sourceRequestId ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: CreateWorkScheduleProps): WorkSchedule {
    return new WorkSchedule({
      id: props.id ?? randomUUID(),
      employeeId: props.employeeId,
      workDate: props.workDate,
      shiftType: props.shiftType,
      plannedStartTime: props.plannedStartTime,
      plannedEndTime: props.plannedEndTime,
      approvedOtHours: props.approvedOtHours ?? 0,
      scheduleType: props.scheduleType ?? 'REGULAR',
      status: props.status ?? 'PLANNED',
      sourceRequestId: props.sourceRequestId ?? null
    });
  }

  withShiftChange(newShiftType: ShiftType, newStartTime: string, newEndTime: string, requestId?: string): WorkSchedule {
    return new WorkSchedule({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: newShiftType,
      plannedStartTime: newStartTime,
      plannedEndTime: newEndTime,
      approvedOtHours: this.approvedOtHours,
      scheduleType: 'SHIFT_CHANGE',
      status: this.status,
      sourceRequestId: requestId ?? this.sourceRequestId,
      createdAt: this.createdAt,
      updatedAt: new Date()
    });
  }

  withMakeUp(makeupStartTime: string, makeupEndTime: string, requestId?: string): WorkSchedule {
    return new WorkSchedule({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      plannedStartTime: makeupStartTime,
      plannedEndTime: makeupEndTime,
      approvedOtHours: this.approvedOtHours,
      scheduleType: 'MAKE_UP',
      status: this.status,
      sourceRequestId: requestId ?? this.sourceRequestId,
      createdAt: this.createdAt,
      updatedAt: new Date()
    });
  }

  withOvertime(extendedEndTime: string, otHours: number, requestId?: string): WorkSchedule {
    return new WorkSchedule({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      plannedStartTime: this.plannedStartTime,
      plannedEndTime: extendedEndTime,
      approvedOtHours: otHours,
      scheduleType: 'OVERTIME',
      status: this.status,
      sourceRequestId: requestId ?? this.sourceRequestId,
      createdAt: this.createdAt,
      updatedAt: new Date()
    });
  }

  withLeave(requestId?: string): WorkSchedule {
    return new WorkSchedule({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      plannedStartTime: this.plannedStartTime,
      plannedEndTime: this.plannedEndTime,
      approvedOtHours: 0,
      scheduleType: this.scheduleType,
      status: 'ON_LEAVE',
      sourceRequestId: requestId ?? this.sourceRequestId,
      createdAt: this.createdAt,
      updatedAt: new Date()
    });
  }

  toRow(): WorkScheduleRow {
    return {
      id: this.id,
      employee_id: this.employeeId,
      work_date: this.workDate,
      shift_type: this.shiftType,
      planned_start_time: this.plannedStartTime,
      planned_end_time: this.plannedEndTime,
      approved_ot_hours: this.approvedOtHours,
      schedule_type: this.scheduleType,
      status: this.status,
      source_request_id: this.sourceRequestId,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString()
    };
  }

  static fromRow(row: WorkScheduleRow): WorkSchedule {
    const rawDate = row.work_date as any;
    let workDate = String(rawDate || '');
    if (rawDate instanceof Date) {
      const y = rawDate.getUTCFullYear();
      const m = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(rawDate.getUTCDate()).padStart(2, '0');
      workDate = `${y}-${m}-${d}`;
    } else if (workDate.length > 10) {
      workDate = workDate.slice(0, 10);
    }

    return new WorkSchedule({
      id: row.id,
      employeeId: row.employee_id,
      workDate,
      shiftType: row.shift_type as ShiftType,
      plannedStartTime: row.planned_start_time,
      plannedEndTime: row.planned_end_time,
      approvedOtHours: Number(row.approved_ot_hours ?? 0),
      scheduleType: row.schedule_type as ScheduleType,
      status: row.status as ScheduleStatus,
      sourceRequestId: row.source_request_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    });
  }

  toJSON(): WorkScheduleDTO {
    return {
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      plannedStartTime: this.plannedStartTime,
      plannedEndTime: this.plannedEndTime,
      approvedOtHours: this.approvedOtHours,
      scheduleType: this.scheduleType,
      status: this.status,
      sourceRequestId: this.sourceRequestId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }
}
