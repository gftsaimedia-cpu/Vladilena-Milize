import { randomUUID } from 'node:crypto';
import { WorkMetrics, WorkMetricsDTO } from './work-metrics';
import { PunchEvent } from './punch-event';

export type ShiftType = 'NORMAL' | 'FLEX' | 'NIGHT';
export type DailyTimesheetStatus = 'PRESENT' | 'LEAVE_PAID' | 'LEAVE_UNPAID' | 'ABSENT' | 'HOLIDAY';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DailyTimesheetProps {
  id: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftAllowancePct: number;
  actualCheckIn?: Date | null;
  actualCheckOut?: Date | null;
  metrics?: WorkMetrics;
  status?: DailyTimesheetStatus;
  isLocked?: boolean;
}

export interface CreateDailyTimesheetProps {
  id?: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftAllowancePct?: number;
  actualCheckIn?: Date | null;
  actualCheckOut?: Date | null;
  metrics?: WorkMetrics;
  status?: DailyTimesheetStatus;
  isLocked?: boolean;
}

export interface CalculateOptions {
  gracePeriodMinutes?: number;
}

export interface DailyTimesheetRow {
  id: string;
  employee_id: string;
  work_date: string;
  shift_type: string;
  shift_start_time: string;
  shift_end_time: string;
  shift_allowance_pct: number;
  actual_check_in: string | null;
  actual_check_out: string | null;
  work_hours: number;
  work_units: number;
  ot_hours: number;
  late_minutes: number;
  early_minutes: number;
  status: string;
  is_locked: boolean;
}

export interface DailyTimesheetDTO {
  id: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftAllowancePct: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  metrics: WorkMetricsDTO;
  status: DailyTimesheetStatus;
  isLocked: boolean;
}

function buildShiftBoundaries(
  workDate: string,
  startTimeStr: string,
  endTimeStr: string,
  referenceCheckIn?: Date | null
): { plannedStart: Date; plannedEnd: Date } {
  const [sH, sM] = startTimeStr.split(':').map(Number);
  const [eH, eM] = endTimeStr.split(':').map(Number);
  const [y, m, d] = workDate.split('-').map(Number);
  const isOvernight = endTimeStr < startTimeStr;

  let useUtc = true;
  if (referenceCheckIn) {
    const utcStart = new Date(`${workDate}T${startTimeStr}:00.000Z`).getTime();
    const localStart = new Date(y, m - 1, d, sH, sM, 0, 0).getTime();
    useUtc = Math.abs(referenceCheckIn.getTime() - utcStart) <= Math.abs(referenceCheckIn.getTime() - localStart);
  }

  let plannedStart: Date;
  let plannedEnd: Date;

  if (useUtc) {
    plannedStart = new Date(`${workDate}T${startTimeStr}:00.000Z`);
    const dayOffsetMs = isOvernight ? 86400000 : 0;
    plannedEnd = new Date(new Date(`${workDate}T${endTimeStr}:00.000Z`).getTime() + dayOffsetMs);
  } else {
    plannedStart = new Date(y, m - 1, d, sH, sM, 0, 0);
    plannedEnd = new Date(y, m - 1, d + (isOvernight ? 1 : 0), eH, eM, 0, 0);
  }

  return { plannedStart, plannedEnd };
}

export class DailyTimesheet {
  readonly id: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly shiftType: ShiftType;
  readonly shiftStartTime: string;
  readonly shiftEndTime: string;
  readonly shiftAllowancePct: number;
  readonly actualCheckIn: Date | null;
  readonly actualCheckOut: Date | null;
  readonly metrics: WorkMetrics;
  readonly status: DailyTimesheetStatus;
  readonly isLocked: boolean;

  constructor(props: DailyTimesheetProps) {
    if (!props || typeof props !== 'object') {
      throw new Error('Thông số DailyTimesheet không được để trống');
    }

    if (!props.id || !UUID_REGEX.test(props.id)) {
      throw new Error(`Mã DailyTimesheet (id) không hợp lệ (cần UUID): ${props.id}`);
    }

    if (!props.employeeId || !UUID_REGEX.test(props.employeeId)) {
      throw new Error(`Mã nhân viên (employeeId) không hợp lệ (cần UUID): ${props.employeeId}`);
    }

    if (!props.workDate || !DATE_REGEX.test(props.workDate)) {
      throw new Error(`Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${props.workDate}`);
    }

    if (props.shiftType !== 'NORMAL' && props.shiftType !== 'FLEX' && props.shiftType !== 'NIGHT') {
      throw new Error(`Loại ca không hợp lệ (NORMAL, FLEX, NIGHT): ${props.shiftType}`);
    }

    if (
      typeof props.shiftStartTime !== 'string' ||
      !TIME_REGEX.test(props.shiftStartTime) ||
      typeof props.shiftEndTime !== 'string' ||
      !TIME_REGEX.test(props.shiftEndTime)
    ) {
      throw new Error('Định dạng giờ ca không hợp lệ (HH:mm)');
    }

    // Kiểm tra tính toàn vẹn phụ cấp ca
    if (props.shiftType === 'NORMAL') {
      if (props.shiftAllowancePct !== undefined && props.shiftAllowancePct !== 0) {
        throw new Error('Ca NORMAL không có phụ cấp ca (0%)');
      }
    } else if (props.shiftType === 'FLEX') {
      if (props.shiftAllowancePct !== undefined && props.shiftAllowancePct !== 10) {
        throw new Error('Ca FLEX có phụ cấp ca cố định là 10%');
      }
    } else {
      // NIGHT
      if (
        props.shiftAllowancePct !== undefined &&
        props.shiftAllowancePct !== 30 &&
        props.shiftAllowancePct !== 40 &&
        props.shiftAllowancePct !== 60
      ) {
        throw new Error('Ca NIGHT chỉ nhận phụ cấp ca 30%, 40% hoặc 60%');
      }
    }

    const checkIn =
      props.actualCheckIn != null
        ? props.actualCheckIn instanceof Date
          ? props.actualCheckIn
          : new Date(props.actualCheckIn)
        : null;
    const checkOut =
      props.actualCheckOut != null
        ? props.actualCheckOut instanceof Date
          ? props.actualCheckOut
          : new Date(props.actualCheckOut)
        : null;

    if (checkIn && isNaN(checkIn.getTime())) {
      throw new Error(`Thời điểm Check-in không hợp lệ: ${props.actualCheckIn}`);
    }
    if (checkOut && isNaN(checkOut.getTime())) {
      throw new Error(`Thời điểm Check-out không hợp lệ: ${props.actualCheckOut}`);
    }

    this.id = props.id;
    this.employeeId = props.employeeId;
    this.workDate = props.workDate;
    this.shiftType = props.shiftType;
    this.shiftStartTime = props.shiftStartTime;
    this.shiftEndTime = props.shiftEndTime;
    this.shiftAllowancePct =
      props.shiftAllowancePct ?? (props.shiftType === 'FLEX' ? 10 : props.shiftType === 'NIGHT' ? 30 : 0);
    this.actualCheckIn = checkIn;
    this.actualCheckOut = checkOut;
    this.metrics = props.metrics instanceof WorkMetrics ? props.metrics : new WorkMetrics(props.metrics);
    this.status = props.status ?? 'ABSENT';
    this.isLocked = Boolean(props.isLocked);
  }

  static create(props: CreateDailyTimesheetProps): DailyTimesheet {
    const id = props.id ?? randomUUID();
    let allowancePct = props.shiftAllowancePct;
    if (allowancePct === undefined) {
      if (props.shiftType === 'NORMAL') allowancePct = 0;
      else if (props.shiftType === 'FLEX') allowancePct = 10;
      else allowancePct = 30;
    }

    return new DailyTimesheet({
      id,
      employeeId: props.employeeId,
      workDate: props.workDate,
      shiftType: props.shiftType,
      shiftStartTime: props.shiftStartTime,
      shiftEndTime: props.shiftEndTime,
      shiftAllowancePct: allowancePct,
      actualCheckIn: props.actualCheckIn ?? null,
      actualCheckOut: props.actualCheckOut ?? null,
      metrics: props.metrics ?? WorkMetrics.zero(),
      status: props.status ?? 'ABSENT',
      isLocked: props.isLocked ?? false
    });
  }

  /**
   * Tính toán công nhật từ danh sách PunchEvent
   */
  calculate(punches: PunchEvent[], options?: CalculateOptions): DailyTimesheet {
    if (this.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
    }

    // Lọc punch hợp lệ của nhân viên này
    const validPunches = (punches || [])
      .filter(p => p.employeeId === this.employeeId && p.isValid())
      .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());

    const firstIn = validPunches.find(p => p.type === 'IN');
    const lastOut = [...validPunches].reverse().find(p => p.type === 'OUT');

    if (!firstIn || !lastOut || firstIn.punchedAt.getTime() > lastOut.punchedAt.getTime()) {
      return new DailyTimesheet({
        id: this.id,
        employeeId: this.employeeId,
        workDate: this.workDate,
        shiftType: this.shiftType,
        shiftStartTime: this.shiftStartTime,
        shiftEndTime: this.shiftEndTime,
        shiftAllowancePct: this.shiftAllowancePct,
        actualCheckIn: firstIn?.punchedAt ?? null,
        actualCheckOut: lastOut?.punchedAt ?? null,
        metrics: WorkMetrics.zero(),
        status:
          this.status === 'LEAVE_PAID' || this.status === 'LEAVE_UNPAID' || this.status === 'HOLIDAY'
            ? this.status
            : 'ABSENT',
        isLocked: this.isLocked
      });
    }

    const checkIn = firstIn.punchedAt;
    const checkOut = lastOut.punchedAt;

    // Xử lý ca qua đêm và xác định khung giờ ca
    const { plannedStart, plannedEnd } = buildShiftBoundaries(
      this.workDate,
      this.shiftStartTime,
      this.shiftEndTime,
      checkIn
    );

    // Tính thời lượng làm việc thực tế
    const actualDurationHours = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 3600));
    const workHours = Math.round(actualDurationHours * 10) / 10;

    // Phút vào muộn (lateMinutes)
    let lateMinutes = 0;
    if (checkIn.getTime() > plannedStart.getTime()) {
      const rawLate = Math.floor((checkIn.getTime() - plannedStart.getTime()) / 60000);
      const grace = options?.gracePeriodMinutes ?? 0;
      if (rawLate > grace) {
        lateMinutes = rawLate;
      }
    }

    // Phút về sớm (earlyMinutes)
    let earlyMinutes = 0;
    if (checkOut.getTime() < plannedEnd.getTime()) {
      earlyMinutes = Math.floor((plannedEnd.getTime() - checkOut.getTime()) / 60000);
    }

    // Giờ làm thêm (otHours)
    let otHours = 0;
    if (checkOut.getTime() > plannedEnd.getTime()) {
      otHours = Math.round(((checkOut.getTime() - plannedEnd.getTime()) / 3600000) * 10) / 10;
    }

    // Công chuẩn (workUnits: >= 7.0h -> 1.0; >= 3.5h -> 0.5; else 0)
    let workUnits = 0;
    if (workHours >= 7.0) {
      workUnits = 1.0;
    } else if (workHours >= 3.5) {
      workUnits = 0.5;
    }

    const metrics = new WorkMetrics({
      workHours,
      workUnits,
      otHours,
      lateMinutes,
      earlyMinutes
    });

    return new DailyTimesheet({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      shiftStartTime: this.shiftStartTime,
      shiftEndTime: this.shiftEndTime,
      shiftAllowancePct: this.shiftAllowancePct,
      actualCheckIn: checkIn,
      actualCheckOut: checkOut,
      metrics,
      status: 'PRESENT',
      isLocked: this.isLocked
    });
  }

  /**
   * Áp dụng nghỉ phép đã duyệt (LEAVE_PAID hoặc LEAVE_UNPAID)
   */
  applyApprovedLeave(isPaid: boolean): DailyTimesheet {
    if (this.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể áp dụng nghỉ phép');
    }

    const newStatus: DailyTimesheetStatus = isPaid ? 'LEAVE_PAID' : 'LEAVE_UNPAID';
    const newWorkUnits = isPaid ? 1.0 : 0.0;

    const newMetrics = this.metrics.withChanges({
      workHours: 0,
      workUnits: newWorkUnits,
      otHours: 0,
      lateMinutes: 0,
      earlyMinutes: 0
    });

    return new DailyTimesheet({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      shiftStartTime: this.shiftStartTime,
      shiftEndTime: this.shiftEndTime,
      shiftAllowancePct: this.shiftAllowancePct,
      actualCheckIn: this.actualCheckIn,
      actualCheckOut: this.actualCheckOut,
      metrics: newMetrics,
      status: newStatus,
      isLocked: this.isLocked
    });
  }

  /**
   * Khóa bảng công ngày phục vụ chốt kỳ lương
   */
  lockForPayroll(): DailyTimesheet {
    return new DailyTimesheet({
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      shiftStartTime: this.shiftStartTime,
      shiftEndTime: this.shiftEndTime,
      shiftAllowancePct: this.shiftAllowancePct,
      actualCheckIn: this.actualCheckIn,
      actualCheckOut: this.actualCheckOut,
      metrics: this.metrics,
      status: this.status,
      isLocked: true
    });
  }

  toRow(): DailyTimesheetRow {
    return {
      id: this.id,
      employee_id: this.employeeId,
      work_date: this.workDate,
      shift_type: this.shiftType,
      shift_start_time: this.shiftStartTime,
      shift_end_time: this.shiftEndTime,
      shift_allowance_pct: this.shiftAllowancePct,
      actual_check_in: this.actualCheckIn ? this.actualCheckIn.toISOString() : null,
      actual_check_out: this.actualCheckOut ? this.actualCheckOut.toISOString() : null,
      work_hours: this.metrics.workHours,
      work_units: this.metrics.workUnits,
      ot_hours: this.metrics.otHours,
      late_minutes: this.metrics.lateMinutes,
      early_minutes: this.metrics.earlyMinutes,
      status: this.status,
      is_locked: this.isLocked
    };
  }

  static fromRow(row: DailyTimesheetRow): DailyTimesheet {
    if (!row || typeof row !== 'object') {
      throw new Error('Dữ liệu row DailyTimesheet không hợp lệ');
    }

    return new DailyTimesheet({
      id: row.id,
      employeeId: row.employee_id,
      workDate: row.work_date,
      shiftType: row.shift_type as ShiftType,
      shiftStartTime: row.shift_start_time,
      shiftEndTime: row.shift_end_time,
      shiftAllowancePct: Number(row.shift_allowance_pct),
      actualCheckIn: row.actual_check_in ? new Date(row.actual_check_in) : null,
      actualCheckOut: row.actual_check_out ? new Date(row.actual_check_out) : null,
      metrics: new WorkMetrics({
        workHours: Number(row.work_hours ?? 0),
        workUnits: Number(row.work_units ?? 0),
        otHours: Number(row.ot_hours ?? 0),
        lateMinutes: Number(row.late_minutes ?? 0),
        earlyMinutes: Number(row.early_minutes ?? 0)
      }),
      status: row.status as DailyTimesheetStatus,
      isLocked: Boolean(row.is_locked)
    });
  }

  toJSON(): DailyTimesheetDTO {
    return {
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      shiftType: this.shiftType,
      shiftStartTime: this.shiftStartTime,
      shiftEndTime: this.shiftEndTime,
      shiftAllowancePct: this.shiftAllowancePct,
      actualCheckIn: this.actualCheckIn ? this.actualCheckIn.toISOString() : null,
      actualCheckOut: this.actualCheckOut ? this.actualCheckOut.toISOString() : null,
      metrics: this.metrics.toJSON(),
      status: this.status,
      isLocked: this.isLocked
    };
  }
}
