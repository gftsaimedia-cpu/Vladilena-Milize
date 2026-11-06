import { randomUUID } from 'node:crypto';
import { toDateText } from '../../../common/date-text';
import type { HalfShift } from '../../../common/half-shift';
import { WorkMetrics, WorkMetricsDTO } from './work-metrics';
import { ShiftType, CheckInStatus, CheckOutStatus, DayStatus } from './work-schedule';
import type { AttendanceDayStatus, ExplanationStatus } from './attendance-day';
import type { DetectedCase } from './explanation-detect';
import type { LeaveType } from '../../requests/domain/leave-types';

export type DailyTimesheetStatus = AttendanceDayStatus;

/** Các trường dòng ngày đầy đủ (spec attendance-core 6); thiếu thì lấy mặc định của cột. */
export interface DayRowProps {
  leaveType?: LeaveType | null;
  sourceRequestId?: string | null;
  cases?: DetectedCase[];
  explanationStatus?: ExplanationStatus;
  explanationRequestId?: string | null;
  payUnits?: 0 | 0.5 | 1;
  halfShift?: HalfShift | null;
  deductionMinutes?: number;
  countsAsWorkday?: boolean;
  countsAsDayOff?: boolean;
  makeupMinutes?: number;
  makeupCreditMinutes?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export interface DailyTimesheetProps extends DayRowProps {
  id: string;
  employeeId: string;
  workDate: string;
  /** Ca rỗng (null) trên ngày không có ca. */
  shiftType: ShiftType | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  shiftAllowancePct: number | null;
  actualCheckIn?: Date | null;
  actualCheckOut?: Date | null;
  metrics?: WorkMetrics;
  status?: DailyTimesheetStatus;
  isLocked?: boolean;
  checkInStatus?: CheckInStatus;
  checkOutStatus?: CheckOutStatus;
  dayStatus?: DayStatus;
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
  checkInStatus?: CheckInStatus;
  checkOutStatus?: CheckOutStatus;
  dayStatus?: DayStatus;
}

export interface DailyTimesheetRow {
  id: string;
  employee_id: string;
  work_date: string;
  shift_type: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  shift_allowance_pct: number | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  work_hours: number;
  work_units: number;
  ot_hours: number;
  late_minutes: number;
  early_minutes: number;
  status: string;
  is_locked: boolean;
  check_in_status?: string;
  check_out_status?: string;
  day_status?: string;
  leave_type?: string | null;
  source_request_id?: string | null;
  cases_json?: string;
  explanation_status?: string;
  explanation_request_id?: string | null;
  pay_units?: number;
  half_shift?: string | null;
  deduction_minutes?: number;
  counts_as_workday?: boolean;
  counts_as_day_off?: boolean;
  makeup_minutes?: number;
  makeup_credit_minutes?: number;
}

export interface DailyTimesheetDTO {
  id: string;
  employeeId: string;
  workDate: string;
  shiftType: ShiftType | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  shiftAllowancePct: number | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  metrics: WorkMetricsDTO;
  status: DailyTimesheetStatus;
  isLocked: boolean;
  checkInStatus: CheckInStatus;
  checkOutStatus: CheckOutStatus;
  dayStatus: DayStatus;
  leaveType: LeaveType | null;
  sourceRequestId: string | null;
  cases: DetectedCase[];
  explanationStatus: ExplanationStatus;
  explanationRequestId: string | null;
  payUnits: number;
  halfShift: HalfShift | null;
  deductionMinutes: number;
  countsAsWorkday: boolean;
  countsAsDayOff: boolean;
  makeupMinutes: number;
  makeupCreditMinutes: number;
}

export class DailyTimesheet {
  readonly id: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly shiftType: ShiftType | null;
  readonly shiftStartTime: string | null;
  readonly shiftEndTime: string | null;
  readonly shiftAllowancePct: number | null;
  readonly actualCheckIn: Date | null;
  readonly actualCheckOut: Date | null;
  readonly metrics: WorkMetrics;
  readonly status: DailyTimesheetStatus;
  readonly isLocked: boolean;
  readonly checkInStatus: CheckInStatus;
  readonly checkOutStatus: CheckOutStatus;
  readonly dayStatus: DayStatus;
  readonly leaveType: LeaveType | null;
  readonly sourceRequestId: string | null;
  readonly cases: DetectedCase[];
  readonly explanationStatus: ExplanationStatus;
  readonly explanationRequestId: string | null;
  readonly payUnits: number;
  readonly halfShift: HalfShift | null;
  readonly deductionMinutes: number;
  readonly countsAsWorkday: boolean;
  readonly countsAsDayOff: boolean;
  readonly makeupMinutes: number;
  readonly makeupCreditMinutes: number;

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

    const hasShift = props.shiftType !== null;
    if (hasShift) {
      if (
        props.shiftType !== 'NORMAL' &&
        props.shiftType !== 'FLEX' &&
        props.shiftType !== 'NIGHT' &&
        props.shiftType !== 'CUSTOM'
      ) {
        throw new Error(`Loại ca không hợp lệ (NORMAL, FLEX, NIGHT, CUSTOM): ${props.shiftType}`);
      }

      if (
        typeof props.shiftStartTime !== 'string' ||
        !TIME_REGEX.test(props.shiftStartTime) ||
        typeof props.shiftEndTime !== 'string' ||
        !TIME_REGEX.test(props.shiftEndTime)
      ) {
        throw new Error('Định dạng giờ ca không hợp lệ (HH:mm)');
      }
    } else if (props.shiftStartTime !== null || props.shiftEndTime !== null || props.shiftAllowancePct !== null) {
      throw new Error('Ngày không có ca thì giờ ca và phụ cấp ca cũng phải rỗng');
    }

    // Kiểm tra tính toàn vẹn phụ cấp ca
    if (!hasShift) {
      // không có ca: không có gì để kiểm
    } else if (props.shiftType === 'NORMAL') {
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
    this.shiftAllowancePct = !hasShift
      ? null
      : (props.shiftAllowancePct ?? (props.shiftType === 'FLEX' ? 10 : props.shiftType === 'NIGHT' ? 30 : 0));
    this.actualCheckIn = checkIn;
    this.actualCheckOut = checkOut;
    this.metrics = props.metrics instanceof WorkMetrics ? props.metrics : new WorkMetrics(props.metrics);
    this.status = props.status ?? 'ABSENT';
    this.isLocked = Boolean(props.isLocked);
    this.checkInStatus = props.checkInStatus ?? 'PENDING';
    this.checkOutStatus = props.checkOutStatus ?? 'PENDING';
    this.dayStatus = props.dayStatus ?? 'PLANNED';
    this.leaveType = props.leaveType ?? null;
    this.sourceRequestId = props.sourceRequestId ?? null;
    this.cases = props.cases ?? [];
    this.explanationStatus = props.explanationStatus ?? 'NONE';
    this.explanationRequestId = props.explanationRequestId ?? null;
    this.payUnits = props.payUnits ?? 0;
    this.halfShift = props.halfShift ?? null;
    this.deductionMinutes = props.deductionMinutes ?? 0;
    this.countsAsWorkday = props.countsAsWorkday ?? false;
    this.countsAsDayOff = props.countsAsDayOff ?? false;
    this.makeupMinutes = props.makeupMinutes ?? 0;
    this.makeupCreditMinutes = props.makeupCreditMinutes ?? this.makeupMinutes;
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
      isLocked: props.isLocked ?? false,
      checkInStatus: props.checkInStatus ?? 'PENDING',
      checkOutStatus: props.checkOutStatus ?? 'PENDING',
      dayStatus: props.dayStatus ?? 'PLANNED'
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
      isLocked: true,
      checkInStatus: this.checkInStatus,
      checkOutStatus: this.checkOutStatus,
      dayStatus: this.dayStatus,
      leaveType: this.leaveType,
      sourceRequestId: this.sourceRequestId,
      cases: this.cases,
      explanationStatus: this.explanationStatus,
      explanationRequestId: this.explanationRequestId,
      payUnits: this.payUnits as 0 | 0.5 | 1,
      halfShift: this.halfShift,
      deductionMinutes: this.deductionMinutes,
      countsAsWorkday: this.countsAsWorkday,
      countsAsDayOff: this.countsAsDayOff,
      makeupMinutes: this.makeupMinutes,
      makeupCreditMinutes: this.makeupCreditMinutes
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
      is_locked: this.isLocked,
      check_in_status: this.checkInStatus,
      check_out_status: this.checkOutStatus,
      day_status: this.dayStatus,
      leave_type: this.leaveType,
      source_request_id: this.sourceRequestId,
      cases_json: JSON.stringify(this.cases),
      explanation_status: this.explanationStatus,
      explanation_request_id: this.explanationRequestId,
      pay_units: this.payUnits,
      half_shift: this.halfShift,
      deduction_minutes: this.deductionMinutes,
      counts_as_workday: this.countsAsWorkday,
      counts_as_day_off: this.countsAsDayOff,
      makeup_minutes: this.makeupMinutes,
      makeup_credit_minutes: this.makeupCreditMinutes
    };
  }

  static fromRow(row: DailyTimesheetRow): DailyTimesheet {
    if (!row || typeof row !== 'object') {
      throw new Error('Dữ liệu row DailyTimesheet không hợp lệ');
    }

    const workDate = toDateText((row.work_date as string | Date) || '');

    return new DailyTimesheet({
      id: row.id,
      employeeId: row.employee_id,
      workDate,
      shiftType: (row.shift_type as ShiftType | null) ?? null,
      shiftStartTime: row.shift_start_time ?? null,
      shiftEndTime: row.shift_end_time ?? null,
      shiftAllowancePct: row.shift_allowance_pct == null ? null : Number(row.shift_allowance_pct),
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
      isLocked: Boolean(row.is_locked),
      checkInStatus: (row.check_in_status as CheckInStatus) || 'PENDING',
      checkOutStatus: (row.check_out_status as CheckOutStatus) || 'PENDING',
      dayStatus: (row.day_status as DayStatus) || 'PLANNED',
      leaveType: (row.leave_type as LeaveType | null | undefined) ?? null,
      sourceRequestId: row.source_request_id ?? null,
      cases: row.cases_json ? (JSON.parse(row.cases_json) as DetectedCase[]) : [],
      explanationStatus: (row.explanation_status as ExplanationStatus | undefined) ?? 'NONE',
      explanationRequestId: row.explanation_request_id ?? null,
      payUnits: Number(row.pay_units ?? 0) === 1 ? 1 : Number(row.pay_units ?? 0) === 0.5 ? 0.5 : 0,
      halfShift: (row.half_shift as HalfShift | null | undefined) ?? null,
      deductionMinutes: Number(row.deduction_minutes ?? 0),
      countsAsWorkday: Boolean(row.counts_as_workday),
      countsAsDayOff: Boolean(row.counts_as_day_off),
      makeupMinutes: Number(row.makeup_minutes ?? 0),
      makeupCreditMinutes: Number(row.makeup_credit_minutes ?? row.makeup_minutes ?? 0)
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
      isLocked: this.isLocked,
      checkInStatus: this.checkInStatus,
      checkOutStatus: this.checkOutStatus,
      dayStatus: this.dayStatus,
      leaveType: this.leaveType,
      sourceRequestId: this.sourceRequestId,
      cases: this.cases,
      explanationStatus: this.explanationStatus,
      explanationRequestId: this.explanationRequestId,
      payUnits: this.payUnits,
      halfShift: this.halfShift,
      deductionMinutes: this.deductionMinutes,
      countsAsWorkday: this.countsAsWorkday,
      countsAsDayOff: this.countsAsDayOff,
      makeupMinutes: this.makeupMinutes,
      makeupCreditMinutes: this.makeupCreditMinutes
    };
  }
}
