import type { FilingDayState, FilingMonthState } from './request-context';
import type { HourOption } from './filing-rules';

/** Mỗi ngày nghỉ của đơn nghỉ có làm bù cần đúng 480 phút (8 giờ) làm bù (§6.2). */
export const MAKEUP_MINUTES_PER_LEAVE_DAY = 480;

/** Trần OT tháng: 40 giờ (Điều 107 Bộ luật Lao động). */
export const MONTH_OT_CAP_MINUTES = 40 * 60;

/** Một "Đến ngày" chọn được của "Từ ngày" nào đó, kèm số liệu của khoảng [từ..đến] để form chỉ việc hiện. */
export interface RangeChoice {
  date: string;
  /** Số ngày đơn thật sự giữ trong khoảng (nghỉ: ngày làm trừ iSAT đã duyệt; đổi ca: ngày làm chưa bị đơn nào giữ). */
  daysCount: number;
  /** Chỉ đơn nghỉ: phép năm còn lại sau đơn nếu là Phép năm; null khi không có tài khoản phép. */
  annualLeaveLeftAfter?: number | null;
  /** Chỉ nghỉ có làm bù: số phút phải bù. */
  makeupMinutesRequired?: number;
}

export interface RangeChoices {
  starts: string[];
  /** Theo "Từ ngày". */
  ends: Record<string, RangeChoice[]>;
}

/** Lựa chọn ngày của các form (spec 4.4) do server quyết, form chỉ vẽ. */
export interface FilingChoices {
  leave: RangeChoices;
  'leave-with-makeup': RangeChoices & {
    /** Ngày bù chọn được theo ngày nghỉ cuối: sau đó, cùng tháng, còn giờ trống. */
    slotDates: Record<string, string[]>;
  };
  overtime: { dates: string[] };
  'shift-change': RangeChoices;
}

/** Quy tắc con số mà form hiện chữ (không tự tính). */
export interface FilingRules {
  makeupMinutesPerLeaveDay: 480;
  dayCapMinutes: 720;
  monthOtCapMinutes: 2400;
}

export const FILING_RULES: FilingRules = {
  makeupMinutesPerLeaveDay: 480,
  dayCapMinutes: 720,
  monthOtCapMinutes: 2400
};

/** Phần của một ngày mà luật lựa chọn cần. */
export type DayFacts = Pick<FilingDayState, 'date' | 'workday' | 'claim' | 'hours'>;

const monthOf = (iso: string) => iso.slice(0, 7);

const held = (d: DayFacts) => d.claim?.status === 'LEAVE' || d.claim?.status === 'LEAVE_WITH_MAKEUP';
const approvedIsat = (d: DayFacts) => d.claim?.status === 'ISAT' && !d.claim.pending;
const pendingIsat = (d: DayFacts) => d.claim?.status === 'ISAT' && d.claim.pending;
/** Ngày chọn được làm ngày nghỉ: ngày làm, không bị đơn nghỉ giữ, không có iSAT. */
const countsAsLeave = (d: DayFacts) => d.workday && !held(d) && d.claim?.status !== 'ISAT';
/** Ngày đơn nghỉ giữ trong một khoảng: ngày làm, bỏ Thứ Bảy có iSAT đã duyệt (spec 2.2). */
export const leaveCounted = (d: DayFacts) => d.workday && !approvedIsat(d);
/** Ngày đổi được ca: ngày làm chưa bị đơn nào giữ. */
export const shiftChangeable = (d: DayFacts) => d.workday && !d.claim;
const blocksShiftChange = (d: DayFacts) => d.claim?.status === 'SHIFT_CHANGE' || pendingIsat(d);

/** Phút OT còn đăng ký được trong tháng (40 giờ trừ phần đã có). */
export function otLeftMinutes(month: FilingMonthState | undefined): number {
  return month ? Math.max(0, month.otCapMinutes - month.otMinutes) : 0;
}

/** Giờ OT chọn được của một ngày: bỏ khung dài hơn số phút OT còn lại của tháng; tháng đã có nghỉ có làm bù thì không có. */
export function overtimeHours(day: Pick<DayFacts, 'hours'>, month: FilingMonthState | undefined): HourOption[] {
  if (!month || month.closed || month.hasMakeupLeave) return [];
  const left = otLeftMinutes(month);
  return day.hours
    .map(h => ({ start: h.start, ends: h.ends.filter(e => e.minutes <= left) }))
    .filter(h => h.ends.length > 0);
}

/**
 * Mọi lựa chọn ngày của bốn form từ các ngày trong khoảng nộp. Ngày thuộc tháng đã chốt (hoặc không có trong `months`)
 * không bao giờ là lựa chọn.
 */
export function filingChoices(input: {
  days: readonly DayFacts[];
  months: readonly FilingMonthState[];
  annualLeaveLeft: number | null;
}): FilingChoices {
  const { annualLeaveLeft } = input;
  const monthInfo = (month: string) => input.months.find(m => m.month === month);
  const open = input.days.filter(d => monthInfo(monthOf(d.date))?.closed === false);
  const roomAfter = (date: string) =>
    open.some(d => d.date > date && monthOf(d.date) === monthOf(date) && d.hours.length > 0);
  const count = (pred: (d: DayFacts) => boolean, from: string, to: string) =>
    input.days.filter(d => d.date >= from && d.date <= to && pred(d)).length;

  const leaveStarts = open.filter(countsAsLeave).map(d => d.date);
  const makeupStarts = open
    .filter(d => countsAsLeave(d) && !monthInfo(monthOf(d.date))!.hasOvertime && roomAfter(d.date))
    .map(d => d.date);

  // Đơn nghỉ: ngày làm từ `start`, dừng trước ngày kế tiếp bị đơn nghỉ giữ hoặc iSAT chờ duyệt. Nghỉ có làm bù: thêm cùng
  // tháng và sau đó còn ngày để bù.
  const leaveEnds = (start: string, makeup: boolean): string[] => {
    const out: string[] = [];
    for (const d of open.filter(x => x.date >= start)) {
      if (held(d) || pendingIsat(d)) break;
      if (makeup && (monthOf(d.date) !== monthOf(start) || !roomAfter(d.date))) break;
      if (countsAsLeave(d)) out.push(d.date);
    }
    return out;
  };

  // Đổi ca: dừng trước ngày chặn kế tiếp; `[start..e]` phải có ít nhất một ngày đổi được.
  const shiftEnds = (from: readonly DayFacts[]): string[] => {
    const out: string[] = [];
    let changes = false;
    for (const d of from) {
      if (blocksShiftChange(d)) break;
      changes ||= shiftChangeable(d);
      if (changes) out.push(d.date);
    }
    return out;
  };
  const shiftStarts = open.filter((_, i) => shiftEnds(open.slice(i)).length > 0).map(d => d.date);

  const ranged = (starts: string[], endsOf: (s: string) => string[], extra: (s: string, e: string, n: number) => Partial<RangeChoice>, counted: (d: DayFacts) => boolean): RangeChoices => ({
    starts,
    ends: Object.fromEntries(
      starts.map(s => [
        s,
        endsOf(s).map(e => {
          const daysCount = count(counted, s, e);
          return { date: e, daysCount, ...extra(s, e, daysCount) };
        })
      ])
    )
  });

  const makeup = ranged(
    makeupStarts,
    s => leaveEnds(s, true),
    (_s, _e, n) => ({ makeupMinutesRequired: n * MAKEUP_MINUTES_PER_LEAVE_DAY }),
    leaveCounted
  );
  const slotDates: Record<string, string[]> = {};
  for (const list of Object.values(makeup.ends)) {
    for (const { date } of list) {
      slotDates[date] ??= open
        .filter(d => d.date > date && monthOf(d.date) === monthOf(date) && d.hours.length > 0)
        .map(d => d.date);
    }
  }

  return {
    leave: ranged(
      leaveStarts,
      s => leaveEnds(s, false),
      (_s, _e, n) => ({ annualLeaveLeftAfter: annualLeaveLeft === null ? null : annualLeaveLeft - n }),
      leaveCounted
    ),
    'leave-with-makeup': { ...makeup, slotDates },
    overtime: { dates: open.filter(d => overtimeHours(d, monthInfo(monthOf(d.date))).length > 0).map(d => d.date) },
    'shift-change': ranged(shiftStarts, s => shiftEnds(open.filter(d => d.date >= s)), () => ({}), shiftChangeable)
  };
}
