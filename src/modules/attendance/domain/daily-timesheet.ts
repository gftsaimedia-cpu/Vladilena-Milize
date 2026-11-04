import { randomUUID } from 'node:crypto';
import { toDateText } from '../../../common/date-text';
import { WorkMetrics, WorkMetricsDTO } from './work-metrics';
import { PunchEvent } from './punch-event';
import { WorkSchedule, ShiftType, CheckInStatus, CheckOutStatus, DayStatus } from './work-schedule';

export type DailyTimesheetStatus = 'PRESENT' | 'LEAVE_PAID' | 'LEAVE_UNPAID' | 'ABSENT' | 'HOLIDAY';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

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
  check_in_status?: string;
  check_out_status?: string;
  day_status?: string;
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
  checkInStatus: CheckInStatus;
  checkOutStatus: CheckOutStatus;
  dayStatus: DayStatus;
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
  readonly checkInStatus: CheckInStatus;
  readonly checkOutStatus: CheckOutStatus;
  readonly dayStatus: DayStatus;

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
    this.checkInStatus = props.checkInStatus ?? 'PENDING';
    this.checkOutStatus = props.checkOutStatus ?? 'PENDING';
    this.dayStatus = props.dayStatus ?? 'PLANNED';
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
   * Tính toán công nhật từ danh sách PunchEvent và WorkSchedule
   */
  calculate(
    punches: PunchEvent[],
    scheduleOrOptions?: WorkSchedule | CalculateOptions,
    nowOrOptions?: Date | CalculateOptions
  ): DailyTimesheet {
    if (this.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
    }

    let schedule: WorkSchedule | undefined;
    let now: Date | undefined;
    let options: CalculateOptions | undefined;

    if (scheduleOrOptions instanceof WorkSchedule) {
      schedule = scheduleOrOptions;
      if (nowOrOptions instanceof Date) {
        now = nowOrOptions;
      } else if (nowOrOptions && typeof nowOrOptions === 'object' && 'gracePeriodMinutes' in nowOrOptions) {
        options = nowOrOptions;
      }
    } else if (
      scheduleOrOptions &&
      typeof scheduleOrOptions === 'object' &&
      'gracePeriodMinutes' in scheduleOrOptions
    ) {
      options = scheduleOrOptions;
      if (nowOrOptions instanceof Date) {
        now = nowOrOptions;
      }
    } else if (nowOrOptions instanceof Date) {
      now = nowOrOptions;
    }

    const isExplicitSchedule = Boolean(schedule);
    if (!schedule) {
      schedule = WorkSchedule.create({
        employeeId: this.employeeId,
        workDate: this.workDate,
        shiftType: this.shiftType,
        plannedStartTime: this.shiftStartTime,
        plannedEndTime: this.shiftEndTime
      });
    }

    const plannedStartStr = schedule.plannedStartTime;
    const plannedEndStr = schedule.plannedEndTime;

    if (schedule.status === 'ON_LEAVE') {
      return new DailyTimesheet({
        id: this.id,
        employeeId: this.employeeId,
        workDate: this.workDate,
        shiftType: schedule.shiftType === 'CUSTOM' ? this.shiftType : (schedule.shiftType as ShiftType),
        shiftStartTime: plannedStartStr,
        shiftEndTime: plannedEndStr,
        shiftAllowancePct: this.shiftAllowancePct,
        actualCheckIn: null,
        actualCheckOut: null,
        metrics: WorkMetrics.zero(),
        status: this.status === 'LEAVE_PAID' || this.status === 'LEAVE_UNPAID' ? this.status : 'LEAVE_PAID',
        isLocked: this.isLocked,
        checkInStatus: 'PENDING',
        checkOutStatus: 'PENDING',
        dayStatus: 'ON_LEAVE'
      });
    }

    // Lọc punch hợp lệ của nhân viên này
    const validPunches = (punches || [])
      .filter(p => p.employeeId === this.employeeId && p.isValid())
      .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());

    const firstIn = validPunches.find(p => p.type === 'IN');
    const lastOut = [...validPunches].reverse().find(p => p.type === 'OUT');

    const referencePunch = firstIn?.punchedAt ?? lastOut?.punchedAt ?? now ?? null;
    const { plannedStart, plannedEnd } = buildShiftBoundaries(
      this.workDate,
      plannedStartStr,
      plannedEndStr,
      referencePunch
    );

    const currentTime = now
      ? now.getTime()
      : lastOut
        ? Math.max(lastOut.punchedAt.getTime(), plannedEnd.getTime() + 31 * 60000)
        : new Date().getTime();

    // 1. Check-in status
    let checkInStatus: CheckInStatus = 'PENDING';
    let lateMinutes = 0;
    if (firstIn) {
      const tin = firstIn.punchedAt.getTime();
      const diffInMin = (tin - plannedStart.getTime()) / 60000;
      if (diffInMin < -15) {
        checkInStatus = 'EARLY';
      } else if (diffInMin <= 15) {
        checkInStatus = 'VALID';
      } else {
        checkInStatus = 'LATE';
        const rawLate = Math.floor(diffInMin);
        const grace = options?.gracePeriodMinutes ?? 0;
        if (rawLate > grace) {
          lateMinutes = rawLate;
        }
      }

      if (!isExplicitSchedule && tin > plannedStart.getTime()) {
        const rawLate = Math.floor((tin - plannedStart.getTime()) / 60000);
        const grace = options?.gracePeriodMinutes ?? 0;
        if (rawLate > grace) {
          lateMinutes = rawLate;
        }
      }
    } else {
      if (currentTime > plannedStart.getTime() + 30 * 60000) {
        checkInStatus = 'MISSED';
      } else {
        checkInStatus = 'PENDING';
      }
    }

    // 2. Check-out status & earlyMinutes & otHours
    let checkOutStatus: CheckOutStatus = 'PENDING';
    let earlyMinutes = 0;
    let otHours = 0;

    if (lastOut) {
      const tout = lastOut.punchedAt.getTime();
      const diffOutMin = (tout - plannedEnd.getTime()) / 60000;
      if (diffOutMin < 0) {
        checkOutStatus = 'EARLY';
        earlyMinutes = Math.floor((plannedEnd.getTime() - tout) / 60000);
      } else if (diffOutMin <= 30) {
        checkOutStatus = 'VALID';
        if (schedule.approvedOtHours > 0) {
          otHours = schedule.approvedOtHours;
        } else if (!isExplicitSchedule && tout > plannedEnd.getTime()) {
          otHours = Math.round(((tout - plannedEnd.getTime()) / 3600000) * 10) / 10;
        }
      } else {
        // Sau plannedEnd + 30 phút
        if (schedule.approvedOtHours > 0) {
          checkOutStatus = 'LATE_WITHOUT_OT';
          otHours = schedule.approvedOtHours;
        } else {
          checkOutStatus = 'LATE_WITHOUT_OT';
          if (!isExplicitSchedule) {
            otHours = Math.round(((tout - plannedEnd.getTime()) / 3600000) * 10) / 10;
          }
        }
      }
    } else {
      if (currentTime > plannedEnd.getTime() + 30 * 60000) {
        checkOutStatus = 'MISSED';
      } else {
        checkOutStatus = 'PENDING';
      }
    }

    // 3. Work hours and units
    let workHours = 0;
    let workUnits = 0;
    if (firstIn && lastOut && firstIn.punchedAt.getTime() <= lastOut.punchedAt.getTime()) {
      const actualDurationHours = Math.max(0, (lastOut.punchedAt.getTime() - firstIn.punchedAt.getTime()) / 3600000);
      workHours = Math.round(actualDurationHours * 10) / 10;
      if (workHours >= 7.0) {
        workUnits = 1.0;
      } else if (workHours >= 3.5) {
        workUnits = 0.5;
      }
    }

    // 4. Day status
    let dayStatus: DayStatus = 'PLANNED';
    if (
      checkInStatus === 'EARLY' ||
      checkInStatus === 'LATE' ||
      checkInStatus === 'MISSED' ||
      checkOutStatus === 'EARLY' ||
      checkOutStatus === 'LATE_WITHOUT_OT' ||
      checkOutStatus === 'MISSED'
    ) {
      dayStatus = 'NEEDS_EXPLANATION';
    } else if (checkInStatus === 'VALID' && checkOutStatus === 'VALID') {
      dayStatus = 'VALID';
    } else if (checkInStatus === 'VALID' && checkOutStatus === 'PENDING') {
      dayStatus = 'IN_PROGRESS';
    } else if (checkInStatus === 'PENDING' && checkOutStatus === 'PENDING') {
      dayStatus = 'PLANNED';
    }

    // 5. DailyTimesheetStatus
    let status: DailyTimesheetStatus = 'ABSENT';
    if (firstIn && lastOut && firstIn.punchedAt.getTime() <= lastOut.punchedAt.getTime()) {
      status = 'PRESENT';
    } else if (this.status === 'LEAVE_PAID' || this.status === 'LEAVE_UNPAID' || this.status === 'HOLIDAY') {
      status = this.status;
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
      shiftType: schedule.shiftType === 'CUSTOM' ? this.shiftType : (schedule.shiftType as ShiftType),
      shiftStartTime: plannedStartStr,
      shiftEndTime: plannedEndStr,
      shiftAllowancePct: this.shiftAllowancePct,
      actualCheckIn: firstIn?.punchedAt ?? null,
      actualCheckOut: lastOut?.punchedAt ?? null,
      metrics,
      status,
      isLocked: this.isLocked,
      checkInStatus,
      checkOutStatus,
      dayStatus
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
      isLocked: this.isLocked,
      checkInStatus: 'PENDING',
      checkOutStatus: 'PENDING',
      dayStatus: 'ON_LEAVE'
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
      dayStatus: this.dayStatus
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
      day_status: this.dayStatus
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
      isLocked: Boolean(row.is_locked),
      checkInStatus: (row.check_in_status as CheckInStatus) || 'PENDING',
      checkOutStatus: (row.check_out_status as CheckOutStatus) || 'PENDING',
      dayStatus: (row.day_status as DayStatus) || 'PLANNED'
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
      dayStatus: this.dayStatus
    };
  }
}
