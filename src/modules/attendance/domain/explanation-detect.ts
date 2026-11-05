import type { ExplanationCase } from '../../requests/domain/explanation-cases';
import { addDaysText, vnInstant } from './calendar';

export type WindowKind = 'OT' | 'MAKEUP';
export interface TimeWindow { kind: WindowKind; start: string; end: string }

export interface DetectInput {
  /** Ngày công 'YYYY-MM-DD'. */
  date: string;
  /** null trên ngày EXTRA/HOLIDAY. */
  shift: { start: string; end: string } | null;
  /** Khung OT/bù đã duyệt của ngày. */
  windows: readonly TimeWindow[];
  /** Lần vào đầu tiên. */
  checkIn: Date | null;
  /** Lần ra cuối cùng. */
  checkOut: Date | null;
  /** Lần ra đầu tiên trước giờ hết ca (L7). */
  firstOutInShift: Date | null;
  /** Ân hạn vào trễ, tính bằng phút. */
  graceMinutes: number;
  /** Đã tới mốc xét (spec 4.3). */
  evaluated: boolean;
}

export interface DetectedCase { code: ExplanationCase; minutes: number; affectsPay: boolean }
export interface DetectResult { cases: DetectedCase[]; lateMinutes: number; earlyMinutes: number }

/** Vào sớm / ra muộn quá ngưỡng này mới thành trường hợp (spec 4.2). */
const SLACK_MINUTES = 15;
/** Ra sau mốc cuối quá ngưỡng này là quên check-out. */
const FORGOT_MINUTES = 30;
const MINUTE_MS = 60 * 1000;

const CASE_ORDER: readonly ExplanationCase[] = [
  'LATE_CHECK_IN',
  'EARLY_CHECK_IN',
  'EARLY_CHECK_OUT',
  'LATE_CHECK_OUT',
  'FORGOT_CHECK_OUT',
  'MISSING_CHECK_IN',
  'MISSING_CHECK_OUT'
];

export interface Span { start: Date; end: Date }

/** Giờ bắt đầu/hết dạng 'HH:mm' thành hai thời điểm; giờ hết ≤ giờ bắt đầu thì ở ngày hôm sau. */
export function spanOf(date: string, start: string, end: string): Span {
  const endDate = end <= start ? addDaysText(date, 1) : date;
  return { start: vnInstant(date, start), end: vnInstant(endDate, end) };
}

/** Khung theo thời điểm. Với ca đêm, khung bắt đầu từ giờ hết ca trở xuống (trước giờ vào ca) nằm ở ngày hôm sau. */
export function windowSpans(date: string, shift: DetectInput['shift'], windows: readonly TimeWindow[]): Span[] {
  const overnight = shift !== null && shift.end <= shift.start;
  return windows.map(w => {
    const afterMidnight = overnight && w.start < shift.start && w.start <= shift.end;
    return spanOf(afterMidnight ? addDaysText(date, 1) : date, w.start, w.end);
  });
}

function minMs(dates: readonly Date[]): Date {
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

function maxMs(dates: readonly Date[]): Date {
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

/** Mốc đầu và mốc cuối dự kiến của ngày (spec 4.2); null khi không có ca lẫn khung. */
export function expectedBounds(
  date: string,
  shift: DetectInput['shift'],
  windows: readonly TimeWindow[]
): { start: Date; end: Date } | null {
  const spans = windowSpans(date, shift, windows);
  const starts = spans.map(s => s.start);
  const ends = spans.map(s => s.end);
  if (shift) {
    const own = spanOf(date, shift.start, shift.end);
    starts.push(own.start);
    ends.push(own.end);
  }
  if (starts.length === 0) return null;
  return { start: minMs(starts), end: maxMs(ends) };
}

/** Số phút nguyên của hiệu `later - earlier` (có thể âm). */
function wholeMinutes(later: Date, earlier: Date): number {
  return Math.trunc((later.getTime() - earlier.getTime()) / MINUTE_MS);
}

/**
 * Bộ dò trường hợp giải trình duy nhất (spec 4). Ảnh hưởng tiền đo so với ca;
 * chỉ để biết đo so với khung. Một mã một lần; bản ảnh hưởng tiền thắng.
 */
export function detectCases(input: DetectInput): DetectResult {
  const { date, shift, windows, checkIn, checkOut, firstOutInShift, graceMinutes, evaluated } = input;
  const found = new Map<ExplanationCase, DetectedCase>();
  const add = (code: ExplanationCase, minutes: number, affectsPay: boolean): void => {
    const existing = found.get(code);
    if (!existing || (affectsPay && !existing.affectsPay)) found.set(code, { code, minutes, affectsPay });
  };

  const bounds = expectedBounds(date, shift, windows);
  // Không có ca lẫn khung thì không có mốc nào để so.
  if (!bounds) return { cases: [], lateMinutes: 0, earlyMinutes: 0 };

  const shiftSpan = shift ? spanOf(date, shift.start, shift.end) : null;
  const spans = windowSpans(date, shift, windows);
  const hasWindowBefore = shiftSpan ? spans.some(s => s.start < shiftSpan.start) : false;
  const hasWindowAfter = shiftSpan ? spans.some(s => s.end > shiftSpan.end) : false;
  const payFlag = shiftSpan !== null;

  // Vào: so với ca (ảnh hưởng tiền), rồi so với mốc đầu (chỉ để biết).
  if (checkIn) {
    if (shiftSpan) {
      const afterShiftStart = wholeMinutes(checkIn, shiftSpan.start);
      if (afterShiftStart > graceMinutes) add('LATE_CHECK_IN', afterShiftStart, true);
      const beforeShiftStart = wholeMinutes(shiftSpan.start, checkIn);
      if (!hasWindowBefore && beforeShiftStart > SLACK_MINUTES) add('EARLY_CHECK_IN', beforeShiftStart, true);
    }
    if (!shiftSpan || hasWindowBefore) {
      const afterFirst = wholeMinutes(checkIn, bounds.start);
      if (afterFirst > SLACK_MINUTES) add('LATE_CHECK_IN', afterFirst, false);
      const beforeFirst = wholeMinutes(bounds.start, checkIn);
      if (beforeFirst > SLACK_MINUTES) add('EARLY_CHECK_IN', beforeFirst, false);
    }
  }

  // Ra sớm giữa ca (L7): theo lần ra đầu tiên trước giờ hết ca.
  if (shiftSpan && firstOutInShift) {
    const early = wholeMinutes(shiftSpan.end, firstOutInShift);
    if (early >= 1) add('EARLY_CHECK_OUT', early, true);
  }

  // Ra cuối cùng: so với ca nếu không có khung sau ca, ngược lại so với mốc cuối.
  if (checkOut) {
    if (shiftSpan && !hasWindowAfter) {
      const afterEnd = wholeMinutes(checkOut, shiftSpan.end);
      if (afterEnd > FORGOT_MINUTES) add('FORGOT_CHECK_OUT', afterEnd, true);
      else if (afterEnd > SLACK_MINUTES) add('LATE_CHECK_OUT', afterEnd, true);
    } else {
      const beforeLast = wholeMinutes(bounds.end, checkOut);
      const pastShift = !shiftSpan || checkOut > shiftSpan.end;
      if (pastShift && beforeLast >= 1) add('EARLY_CHECK_OUT', beforeLast, false);
      const afterLast = -beforeLast;
      if (afterLast > FORGOT_MINUTES) add('FORGOT_CHECK_OUT', afterLast, false);
      else if (afterLast > SLACK_MINUTES) add('LATE_CHECK_OUT', afterLast, false);
    }
  }

  // Thiếu: ngày chưa tới mốc xét thì chưa tính thiếu giờ ra; thiếu giờ vào còn khi đã có giờ ra.
  if (!checkIn && (checkOut || evaluated)) add('MISSING_CHECK_IN', 0, payFlag);
  if (!checkOut && evaluated) add('MISSING_CHECK_OUT', 0, payFlag);

  const cases = CASE_ORDER.flatMap(code => {
    const hit = found.get(code);
    return hit ? [hit] : [];
  });
  const late = found.get('LATE_CHECK_IN');
  const early = found.get('EARLY_CHECK_OUT');
  return {
    cases,
    lateMinutes: late?.affectsPay ? late.minutes : 0,
    earlyMinutes: early?.affectsPay ? early.minutes : 0
  };
}
