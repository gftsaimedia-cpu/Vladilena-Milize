import { businessDateText } from '../../../common/business-date';
import type { HalfShift } from '../../../common/half-shift';
import {
  isOutside,
  leaveStatusOf,
  shiftOf,
  workShiftOf,
  type Benefits,
  type DayFacts,
  type ShiftFacts
} from '../../attendance/domain/attendance-day';
import { datesOfMonth, weekdayOf } from '../../attendance/domain/calendar';
import { expectedBounds, type TimeWindow } from '../../attendance/domain/explanation-detect';
import type { Claim } from './claim';

/**
 * Ngày này là ngày gì (chỉ do lịch và đơn đã duyệt quyết, không phụ thuộc lần chấm công) và đã diễn ra chưa.
 * Thứ tự quyết giữ đúng thứ tự trong `buildDay`: ngoài thời gian làm → lễ trên ngày làm → lịch nghỉ đã duyệt →
 * ngoài tuần làm (nghỉ hoặc có khung OT/bù) → ngày làm.
 */
export type DayKind =
  | 'WORK'
  | 'EXTRA'
  | 'LEAVE_PAID'
  | 'LEAVE_UNPAID'
  | 'LEAVE_MAKEUP'
  | 'ISAT'
  | 'HOLIDAY'
  | 'REST'
  | 'OUTSIDE';

/** Sắp diễn ra, đang diễn ra, đã diễn ra. Mốc chờ đánh giá 30 phút của chấm công không nằm ở đây. */
export type Phase = 'UPCOMING' | 'IN_PROGRESS' | 'DONE';

/** Dữ kiện của một ngày (đúng phần `DayFacts` mà việc phân loại cần). */
export type DayInput = Pick<DayFacts, 'date' | 'schedule' | 'otWindows' | 'makeupWindows' | 'halfShift' | 'isHoliday'>;

/** Dữ kiện chung của cả tháng cho một người. */
export interface DayContext {
  employment: { startDate: string | null; resignedOn: string | null };
  benefits: Benefits;
  /** Các thứ (1 = T2 … 6 = T7) là ngày làm của người này ở tháng đang xét. */
  workWeek: readonly number[];
  /** Ca mặc định của hồ sơ; hoặc hàm theo ngày khi nhân sự đã đổi ca (ngày trước ngày áp dụng giữ ca cũ). */
  defaultShift: ShiftFacts | ((date: string) => ShiftFacts);
}

export interface TimeSpan {
  start: Date;
  end: Date;
}

export interface Window {
  kind: 'OT' | 'MAKEUP';
  start: string;
  end: string;
}

export interface DayParts {
  date: string;
  kind: DayKind;
  shift: ShiftFacts | null;
  half: HalfShift | null;
  windows: readonly Window[];
  span: TimeSpan | null;
  claims: readonly Claim[];
}

const OFF_KINDS: ReadonlySet<DayKind> = new Set(['LEAVE_PAID', 'LEAVE_UNPAID', 'LEAVE_MAKEUP', 'ISAT', 'HOLIDAY', 'REST']);
const LEAVE_KINDS: ReadonlySet<DayKind> = new Set(['LEAVE_PAID', 'LEAVE_UNPAID', 'LEAVE_MAKEUP', 'ISAT']);

const isWorkdayOfWeek = (date: string, workWeek: readonly number[]): boolean => {
  const dow = weekdayOf(date);
  return dow !== 0 && workWeek.includes(dow);
};

function phaseOf(date: string, span: TimeSpan | null, now: Date): Phase {
  if (span) {
    if (now.getTime() < span.start.getTime()) return 'UPCOMING';
    return now.getTime() < span.end.getTime() ? 'IN_PROGRESS' : 'DONE';
  }
  const today = businessDateText(now);
  if (date > today) return 'UPCOMING';
  return date === today ? 'IN_PROGRESS' : 'DONE';
}

export class Day {
  readonly date: string;
  readonly kind: DayKind;
  readonly phase: Phase;
  /** Ca của ngày (đã tính đổi ca và nửa ca); null khi không phải ngày làm. */
  readonly shift: ShiftFacts | null;
  readonly half: HalfShift | null;
  /** Khung OT/bù đã duyệt. */
  readonly windows: readonly Window[];
  /** Khoảng giờ của ca và khung của ngày (ca đêm sang ngày kế); null khi ngày không có giờ làm. */
  readonly span: TimeSpan | null;
  /** Mọi claim của ngày, kể cả đang chờ duyệt. */
  readonly claims: readonly Claim[];

  private constructor(parts: DayParts, phase: Phase) {
    this.date = parts.date;
    this.kind = parts.kind;
    this.phase = phase;
    this.shift = parts.shift;
    this.half = parts.half;
    this.windows = parts.windows;
    this.span = parts.span;
    this.claims = parts.claims;
  }

  /** Dựng một ngày: phân loại từ dữ kiện, rồi xác định giai đoạn theo `now`. */
  static resolve(input: DayInput, ctx: DayContext, now: Date, pending: readonly Claim[] = []): Day {
    const parts = classify(input, ctx, pending);
    return new Day(parts, phaseOf(parts.date, parts.span, now));
  }

  /** Cùng ngày, giai đoạn tính lại theo `now` (không dựng lại từ dữ kiện). */
  at(now: Date): Day {
    return new Day(this, phaseOf(this.date, this.span, now));
  }

  get isWork(): boolean {
    return this.kind === 'WORK';
  }
  /** Ngày làm hoặc ngày ngoài tuần có khung OT/bù: có giờ để chấm công. */
  get hasWorkTime(): boolean {
    return this.kind === 'WORK' || this.kind === 'EXTRA';
  }
  get isOff(): boolean {
    return OFF_KINDS.has(this.kind);
  }
  get isLeave(): boolean {
    return LEAVE_KINDS.has(this.kind);
  }
  get isHoliday(): boolean {
    return this.kind === 'HOLIDAY';
  }
  get isOutside(): boolean {
    return this.kind === 'OUTSIDE';
  }
  get hasStarted(): boolean {
    return this.phase !== 'UPCOMING';
  }
  get isOver(): boolean {
    return this.phase === 'DONE';
  }
  /** Claim đang chờ duyệt: đơn chờ nằm ở đây, `kind` chưa đổi. */
  get pending(): readonly Claim[] {
    return this.claims.filter(c => c.status === 'PENDING');
  }
  /** Đơn bị từ chối hoặc huỷ mới nhất của ngày; null khi ngày còn đơn chờ hoặc đã duyệt (đơn mới thay đơn cũ). */
  get declined(): Claim | null {
    if (this.claims.some(c => c.status === 'PENDING' || c.status === 'APPROVED')) return null;
    const gone = this.claims.filter(c => c.status === 'REJECTED' || c.status === 'CANCELLED');
    return gone[gone.length - 1] ?? null;
  }
  claimOf(kind: Claim['kind']): Claim | null {
    return this.claims.find(c => c.kind === kind) ?? null;
  }
}

/** Claim đã duyệt, suy từ dữ kiện của ngày (lịch, nửa ca, khung OT/bù). */
function approvedClaims(input: DayInput, shift: ShiftFacts | null): Claim[] {
  const { date, schedule } = input;
  const out: Claim[] = [];
  if (schedule && schedule.status === 'ON_LEAVE') {
    const requestId = schedule.sourceRequestId;
    if (schedule.scheduleType === 'ISAT' || schedule.requestType === 'ISAT') {
      out.push({ requestId, date, kind: 'ISAT', status: 'APPROVED', detail: { kind: 'ISAT' } });
    } else if (schedule.requestType === 'LEAVE_WITH_MAKEUP') {
      out.push({ requestId, date, kind: 'LEAVE_MAKEUP', status: 'APPROVED', detail: { kind: 'LEAVE_MAKEUP' } });
    } else {
      out.push({ requestId, date, kind: 'LEAVE', status: 'APPROVED', detail: { kind: 'LEAVE', leaveType: schedule.leaveType } });
    }
  }
  if (schedule && schedule.scheduleType === 'SHIFT_CHANGE' && schedule.status !== 'CANCELLED') {
    out.push({
      requestId: schedule.sourceRequestId,
      date,
      kind: 'SHIFT_CHANGE',
      status: 'APPROVED',
      detail: { kind: 'SHIFT_CHANGE', shift }
    });
  }
  if (input.halfShift) {
    const h = input.halfShift;
    out.push({
      requestId: h.requestId,
      date,
      kind: 'HALF_SHIFT',
      status: 'APPROVED',
      detail: { kind: 'HALF_SHIFT', half: h.half, start: h.start, end: h.end }
    });
  }
  for (const w of input.otWindows) {
    out.push({ requestId: null, date, kind: 'OT_WINDOW', status: 'APPROVED', detail: { kind: 'OT_WINDOW', start: w.start, end: w.end } });
  }
  for (const w of input.makeupWindows) {
    out.push({ requestId: null, date, kind: 'MAKEUP_WINDOW', status: 'APPROVED', detail: { kind: 'MAKEUP_WINDOW', start: w.start, end: w.end } });
  }
  return out;
}

const defaultShiftOn = (ctx: DayContext, date: string): ShiftFacts =>
  typeof ctx.defaultShift === 'function' ? ctx.defaultShift(date) : ctx.defaultShift;

/** Phân loại một ngày. Nơi duy nhất giữ thứ tự ưu tiên của các loại ngày. */
export function classify(input: DayInput, ctx: DayContext, pending: readonly Claim[] = []): DayParts {
  const { date, schedule } = input;
  const windows: Window[] = [
    ...input.otWindows.map(w => ({ kind: 'OT' as const, start: w.start, end: w.end })),
    ...input.makeupWindows.map(w => ({ kind: 'MAKEUP' as const, start: w.start, end: w.end }))
  ];
  const base = { date, half: null, windows, shift: null, span: null } as const;
  const claimsOf = (shift: ShiftFacts | null) => [...approvedClaims(input, shift), ...pending.filter(c => c.date === date)];

  if (isOutside(date, ctx.employment)) {
    return { ...base, kind: 'OUTSIDE', windows: [], claims: pending.filter(c => c.date === date) };
  }

  const isWorkday = isWorkdayOfWeek(date, ctx.workWeek);
  if (input.isHoliday && isWorkday) {
    return { ...base, kind: 'HOLIDAY', claims: claimsOf(null) };
  }

  if (schedule && schedule.status === 'ON_LEAVE') {
    const status = leaveStatusOf(schedule, ctx.benefits);
    const kind: DayKind =
      status === 'ISAT' ? 'ISAT' : status === 'LEAVE_MAKEUP' ? 'LEAVE_MAKEUP' : status === 'LEAVE_PAID' ? 'LEAVE_PAID' : 'LEAVE_UNPAID';
    return { ...base, kind, claims: claimsOf(null) };
  }

  if (!isWorkday) {
    if (windows.length === 0) return { ...base, kind: 'REST', claims: claimsOf(null) };
    const timeWindows: TimeWindow[] = windows;
    const bounds = expectedBounds(date, null, timeWindows);
    return { ...base, kind: 'EXTRA', span: bounds ? { start: bounds.start, end: bounds.end } : null, claims: claimsOf(null) };
  }

  const shift = workShiftOf({ date, schedule, defaultShift: defaultShiftOn(ctx, date), halfShift: input.halfShift });
  const timeWindows: TimeWindow[] = windows;
  const bounds = expectedBounds(date, shift, timeWindows);
  return {
    date,
    kind: 'WORK',
    shift: { type: shift.type, start: shift.start, end: shift.end, allowancePct: shift.allowancePct },
    half: input.halfShift?.half ?? null,
    windows,
    span: bounds ? { start: bounds.start, end: bounds.end } : null,
    claims: claimsOf(shiftOf({ schedule, defaultShift: defaultShiftOn(ctx, date) }))
  };
}

export interface MonthInput {
  month: string;
  context: DayContext;
  /** Dữ kiện của các ngày trong tháng (đủ mọi ngày, theo ngày tăng). */
  days: readonly DayInput[];
  /** Claim đang chờ duyệt của người này trong tháng. */
  pending?: readonly Claim[];
}

/** Mọi ngày của một người trong một tháng. */
export class Month {
  readonly month: string;
  readonly days: readonly Day[];
  private readonly byDate: ReadonlyMap<string, Day>;

  private constructor(month: string, days: readonly Day[]) {
    this.month = month;
    this.days = days;
    this.byDate = new Map(days.map(d => [d.date, d]));
  }

  static of(input: MonthInput, now: Date): Month {
    const by = new Map(input.days.map(d => [d.date, d]));
    const pending = input.pending ?? [];
    const days = datesOfMonth(input.month).map(date => {
      const facts = by.get(date) ?? { date, schedule: null, otWindows: [], makeupWindows: [], halfShift: null, isHoliday: false };
      return Day.resolve(facts, input.context, now, pending.filter(c => c.date === date));
    });
    return new Month(input.month, days);
  }

  /** Ngày `date` của tháng; ném lỗi nếu ngoài tháng này (lỗi lập trình, không phải dữ liệu). */
  day(date: string): Day {
    const found = this.byDate.get(date);
    if (!found) throw new Error(`Ngày ${date} không thuộc tháng ${this.month}`);
    return found;
  }

  has(date: string): boolean {
    return this.byDate.has(date);
  }

  between(from: string, to: string): readonly Day[] {
    return this.days.filter(d => d.date >= from && d.date <= to);
  }

  at(now: Date): Month {
    return new Month(this.month, this.days.map(d => d.at(now)));
  }
}
