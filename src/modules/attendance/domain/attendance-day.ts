import { LEAVE_TYPES, type LeaveType } from '../../requests/domain/leave-types';
import { vnInstant, weekdayOf } from './calendar';
import {
  detectCases,
  expectedBounds,
  spanOf,
  windowSpans,
  type DetectedCase,
  type TimeWindow
} from './explanation-detect';
import type {
  CheckInStatus,
  CheckOutStatus,
  DayStatus,
  ScheduleStatus,
  ScheduleType
} from './work-schedule';

export type AttendanceDayStatus =
  | 'OUTSIDE'
  | 'HOLIDAY'
  | 'ISAT'
  | 'LEAVE_PAID'
  | 'LEAVE_UNPAID'
  | 'LEAVE_MAKEUP'
  | 'REST'
  | 'EXTRA'
  | 'PENDING'
  | 'PRESENT'
  | 'ABSENT';

export type ExplanationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ShiftFacts {
  type: 'NORMAL' | 'FLEX' | 'NIGHT';
  start: string;
  end: string;
  allowancePct: number;
}

export interface ScheduleFacts {
  scheduleType: ScheduleType;
  status: ScheduleStatus;
  shiftType: string;
  start: string;
  end: string;
  sourceRequestId: string | null;
  requestType: string | null;
  leaveType: LeaveType | null;
}

/** Giải trình của ngày; giờ 'HH:mm' là giờ ghi trong đơn. */
export interface ExplanationFacts {
  requestId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  checkIn: string | null;
  checkOut: string | null;
}

export interface DayFacts {
  date: string;
  schedule: ScheduleFacts | null;
  punches: ReadonlyArray<{ type: 'IN' | 'OUT'; at: Date }>;
  otWindows: ReadonlyArray<{ start: string; end: string }>;
  makeupWindows: ReadonlyArray<{ start: string; end: string }>;
  explanation: ExplanationFacts | null;
  isHoliday: boolean;
}

export interface Benefits {
  paidLeave: boolean;
  paidHoliday: boolean;
  isat: boolean;
}

export interface DaySources extends DayFacts {
  now: Date;
  employment: { startDate: string | null; resignedOn: string | null };
  benefits: Benefits;
  workWeek: readonly number[];
  graceMinutes: number;
  defaultShift: ShiftFacts;
}

export interface AttendanceDay {
  employeeId: string;
  workDate: string;
  status: AttendanceDayStatus;
  shift: ShiftFacts | null;
  checkIn: Date | null;
  checkOut: Date | null;
  workHours: number;
  lateMinutes: number;
  earlyMinutes: number;
  leaveType: LeaveType | null;
  sourceRequestId: string | null;
  cases: DetectedCase[];
  explanationStatus: ExplanationStatus;
  explanationRequestId: string | null;
  payUnits: 0 | 1;
  deductionMinutes: number;
  countsAsWorkday: boolean;
  countsAsDayOff: boolean;
  makeupMinutes: number;
  // Cột cũ, ghi cho khớp (spec 6).
  dayStatus: DayStatus;
  checkInStatus: CheckInStatus;
  checkOutStatus: CheckOutStatus;
}

/** Phút bị trừ một ngày không quá mức này, để tiền ngày không âm (R7). */
export const MAX_DEDUCTION_MINUTES = 480;

/** Hết thời gian này sau mốc cuối dự kiến thì ngày được xét (spec 4.3). */
const EVALUATE_AFTER_MS = 30 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Khối trừ 30 phút: ≤ 15 → 0; 16–44 → 30; 45–74 → 60; 75–104 → 90 (L4). */
export function deductionBlock(minutes: number): number {
  if (minutes <= 15) return 0;
  return Math.floor((minutes + 15) / 30) * 30;
}

/** Phụ cấp mặc định theo loại ca khi lịch đổi ca không mang phụ cấp. */
function defaultAllowancePct(type: ShiftFacts['type']): number {
  if (type === 'FLEX') return 10;
  if (type === 'NIGHT') return 30;
  return 0;
}

function shiftTypeOf(raw: string): ShiftFacts['type'] {
  if (raw === 'NORMAL' || raw === 'NIGHT') return raw;
  return 'FLEX';
}

/** Ca của ngày làm: lịch SHIFT_CHANGE chưa huỷ, nếu không thì ca mặc định trong hồ sơ (R3). */
function shiftOf(src: DaySources): ShiftFacts {
  const s = src.schedule;
  if (!s || s.scheduleType !== 'SHIFT_CHANGE' || s.status === 'CANCELLED') return src.defaultShift;
  const type = shiftTypeOf(s.shiftType);
  return {
    type,
    start: s.start,
    end: s.end,
    allowancePct: type === src.defaultShift.type ? src.defaultShift.allowancePct : defaultAllowancePct(type)
  };
}

function isOutside(date: string, employment: DaySources['employment']): boolean {
  if (employment.startDate !== null && date < employment.startDate) return true;
  return employment.resignedOn !== null && date > employment.resignedOn;
}

function leaveStatusOf(s: ScheduleFacts, benefits: Benefits): AttendanceDayStatus {
  if (s.scheduleType === 'ISAT' || s.requestType === 'ISAT') return 'ISAT';
  if (s.requestType === 'LEAVE_WITH_MAKEUP') return 'LEAVE_MAKEUP';
  const group = LEAVE_TYPES.find(t => t.code === s.leaveType)?.payGroup;
  return group === 'PAID' && benefits.paidLeave ? 'LEAVE_PAID' : 'LEAVE_UNPAID';
}

function roundHours(ms: number): number {
  return Math.round((ms / HOUR_MS) * 100) / 100;
}

/** Giờ ghi trong đơn thành thời điểm; giờ nhỏ hơn mốc vào thì ở ngày hôm sau. */
function explainedInstant(date: string, hhmm: string, notBefore: Date | null): Date {
  const same = vnInstant(date, hhmm);
  if (!notBefore || same >= notBefore) return same;
  return new Date(same.getTime() + 24 * HOUR_MS);
}

export function buildDay(employeeId: string, src: DaySources): AttendanceDay {
  const { date, schedule, explanation } = src;
  const ins = src.punches.filter(p => p.type === 'IN').map(p => p.at);
  const outs = src.punches.filter(p => p.type === 'OUT').map(p => p.at);
  const checkIn = ins.length ? new Date(Math.min(...ins.map(d => d.getTime()))) : null;
  const checkOut = outs.length ? new Date(Math.max(...outs.map(d => d.getTime()))) : null;
  const explanationStatus: ExplanationStatus = explanation?.status ?? 'NONE';
  const windows: TimeWindow[] = [
    ...src.otWindows.map(w => ({ kind: 'OT' as const, start: w.start, end: w.end })),
    ...src.makeupWindows.map(w => ({ kind: 'MAKEUP' as const, start: w.start, end: w.end }))
  ];

  const row: AttendanceDay = {
    employeeId,
    workDate: date,
    status: 'REST',
    shift: null,
    checkIn,
    checkOut,
    workHours: checkIn && checkOut ? roundHours(checkOut.getTime() - checkIn.getTime()) : 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    leaveType: null,
    sourceRequestId: null,
    cases: [],
    explanationStatus,
    explanationRequestId: explanation?.requestId ?? null,
    payUnits: 0,
    deductionMinutes: 0,
    countsAsWorkday: false,
    countsAsDayOff: false,
    makeupMinutes: 0,
    dayStatus: 'PLANNED',
    checkInStatus: 'PENDING',
    checkOutStatus: 'PENDING'
  };

  /** Dò trường hợp; `shift` null trên ngày EXTRA/HOLIDAY nên mọi mã chỉ để biết. */
  const detect = (shift: ShiftFacts | null) => {
    const bounds = expectedBounds(date, shift, windows);
    const evaluated =
      (checkIn !== null && checkOut !== null) ||
      (bounds !== null && src.now.getTime() >= bounds.end.getTime() + EVALUATE_AFTER_MS);
    const firstOutInShift = shift
      ? (() => {
          const end = spanOf(date, shift.start, shift.end).end;
          const early = outs.filter(o => o < end);
          return early.length ? new Date(Math.min(...early.map(d => d.getTime()))) : null;
        })()
      : null;
    return {
      evaluated,
      result: detectCases({
        date,
        shift,
        windows,
        checkIn,
        checkOut,
        firstOutInShift,
        graceMinutes: src.graceMinutes,
        evaluated
      })
    };
  };

  /** Phút có mặt trùng khung bù; thiếu một bên thì dùng giờ ghi trong giải trình đã duyệt (R9). */
  const makeupMinutesOf = (shift: ShiftFacts | null): number => {
    if (src.makeupWindows.length === 0) return 0;
    const approvedTimes = explanation?.status === 'APPROVED' ? explanation : null;
    const from =
      checkIn ?? (approvedTimes?.checkIn ? vnInstant(date, approvedTimes.checkIn) : null);
    const to =
      checkOut ??
      (approvedTimes?.checkOut ? explainedInstant(date, approvedTimes.checkOut, from) : null);
    if (!from || !to || to <= from) return 0;
    const spans = windowSpans(
      date,
      shift,
      src.makeupWindows.map(w => ({ kind: 'MAKEUP' as const, start: w.start, end: w.end }))
    );
    return spans.reduce((sum, span) => {
      const lo = Math.max(from.getTime(), span.start.getTime());
      const hi = Math.min(to.getTime(), span.end.getTime());
      return sum + (hi > lo ? Math.floor((hi - lo) / MINUTE_MS) : 0);
    }, 0);
  };

  const finish = (): AttendanceDay => {
    applyLegacyColumns(row, checkIn !== null, checkOut !== null);
    return row;
  };

  // 1. Ngoài thời gian làm (L13).
  if (isOutside(date, src.employment)) {
    row.status = 'OUTSIDE';
    row.checkIn = null;
    row.checkOut = null;
    row.workHours = 0;
    return finish();
  }

  const isWorkday = weekdayOf(date) !== 0 && src.workWeek.includes(weekdayOf(date));

  // 2. Lễ trên ngày làm (L9, L10).
  if (src.isHoliday && isWorkday) {
    row.status = 'HOLIDAY';
    row.payUnits = src.benefits.paidHoliday ? 1 : 0;
    row.cases = detect(null).result.cases;
    return finish();
  }

  // 3. Lịch nghỉ đã duyệt.
  if (schedule && schedule.status === 'ON_LEAVE') {
    const status = leaveStatusOf(schedule, src.benefits);
    row.status = status;
    row.sourceRequestId = schedule.sourceRequestId;
    if (status !== 'ISAT') row.leaveType = schedule.leaveType;
    if (status === 'ISAT') row.payUnits = src.benefits.isat ? 1 : 0;
    if (status === 'LEAVE_PAID') row.payUnits = 1;
    row.countsAsDayOff = status === 'LEAVE_PAID' || status === 'LEAVE_UNPAID';
    return finish();
  }

  // 4. Ngoài tuần làm việc (L12).
  if (!isWorkday) {
    if (windows.length === 0) {
      row.status = 'REST';
      return finish();
    }
    row.status = 'EXTRA';
    const { result } = detect(null);
    row.cases = result.cases;
    row.makeupMinutes = makeupMinutesOf(null);
    return finish();
  }

  // 5. Ngày làm.
  const shift = shiftOf(src);
  row.shift = shift;
  const { evaluated, result } = detect(shift);
  row.cases = result.cases;
  row.lateMinutes = result.lateMinutes;
  row.earlyMinutes = result.earlyMinutes;

  const hasPunch = checkIn !== null || checkOut !== null;
  if (!evaluated) {
    row.status = 'PENDING';
    return finish();
  }
  if (!hasPunch && explanation?.status !== 'APPROVED') {
    row.status = 'ABSENT';
    row.countsAsDayOff = true;
    return finish();
  }

  row.status = 'PRESENT';
  row.makeupMinutes = makeupMinutesOf(shift);
  const payAffecting = result.cases.some(c => c.affectsPay);
  if (!payAffecting) {
    row.payUnits = 1;
  } else if (explanation?.status === 'APPROVED') {
    row.payUnits = 1;
    row.deductionMinutes = Math.min(
      MAX_DEDUCTION_MINUTES,
      deductionBlock(result.lateMinutes) + deductionBlock(result.earlyMinutes)
    );
  }
  row.countsAsWorkday = row.payUnits === 1;
  return finish();
}

/** Ghi ba cột cũ cho khớp với dòng (spec 6, P10). */
function applyLegacyColumns(row: AttendanceDay, hasIn: boolean, hasOut: boolean): void {
  const has = (code: DetectedCase['code'], payOnly: boolean): boolean =>
    row.cases.some(c => c.code === code && (!payOnly || c.affectsPay));

  if (has('LATE_CHECK_IN', true)) row.checkInStatus = 'LATE';
  else if (has('EARLY_CHECK_IN', true)) row.checkInStatus = 'EARLY';
  else if (has('MISSING_CHECK_IN', false)) row.checkInStatus = 'MISSED';
  else if (hasIn) row.checkInStatus = 'VALID';
  else row.checkInStatus = 'PENDING';

  if (has('EARLY_CHECK_OUT', true)) row.checkOutStatus = 'EARLY';
  else if (has('LATE_CHECK_OUT', true) || has('FORGOT_CHECK_OUT', true)) row.checkOutStatus = 'LATE_WITHOUT_OT';
  else if (has('MISSING_CHECK_OUT', false)) row.checkOutStatus = 'MISSED';
  else if (hasOut) row.checkOutStatus = 'VALID';
  else row.checkOutStatus = 'PENDING';

  switch (row.status) {
    case 'PENDING':
      row.dayStatus = hasIn || hasOut ? 'IN_PROGRESS' : 'PLANNED';
      break;
    case 'PRESENT':
      row.dayStatus =
        row.cases.some(c => c.affectsPay) && row.explanationStatus !== 'APPROVED'
          ? 'NEEDS_EXPLANATION'
          : 'VALID';
      break;
    case 'LEAVE_PAID':
    case 'LEAVE_UNPAID':
    case 'LEAVE_MAKEUP':
    case 'ISAT':
      row.dayStatus = 'ON_LEAVE';
      break;
    default:
      row.dayStatus = 'PLANNED';
  }
}
