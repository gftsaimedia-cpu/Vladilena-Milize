// Form tạo yêu cầu của nhân viên (J8–J10, K3): hàm thuần biến request-context (spec staff-requests 2.1) thành lựa chọn
// của các ô và dòng chữ. Chỉ đưa ra lựa chọn hợp lệ (spec 4.4). Import tương đối để chạy được bằng node:test.
import type {
  AdvanceInfo,
  ContextDay,
  ExplanationCase,
  HourEnd,
  MakeupSlot,
  RequestContext,
  RequestKind
} from '../../mock/staff-requests-types';
import { vnd } from '../../utils/format';

export type {
  AdvanceInfo,
  ContextDay,
  ExplanationCase,
  ExplanationDay,
  HourEnd,
  HourSlot,
  MakeupSlot,
  PreviewResult,
  RequestContext,
  RequestDraft,
  RequestKind
} from '../../mock/staff-requests-types';

/** Khung giờ tròn [start, end), tính bằng giờ: { start: 18, end: 20 } là 18–20h. */
export type HourWindow = { start: number; end: number };
export type HourOptions = { taken?: HourWindow[]; capMinutes?: number };

/** Mỗi ngày nghỉ của Nghỉ có làm bù nợ 8 giờ bù. */
export const MAKEUP_MINUTES_PER_DAY = 480;

const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const monthOf = (iso: string) => iso.slice(0, 7);
const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2));

/** '2026-11-13' → 'T6 13/11' */
export const dateLabel = (iso: string) => `${DOW_SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${ddmm(iso)}`;

const held = (d: ContextDay) => d.claim?.status === 'LEAVE' || d.claim?.status === 'LEAVE_WITH_MAKEUP';
/** Thứ Bảy có iSAT được duyệt: đơn nghỉ theo khoảng bỏ ngày này kèm cảnh báo (BE planClaims). */
export const approvedIsat = (d: ContextDay) => d.claim?.status === 'ISAT' && !d.claim.pending;
/** Thứ Bảy có iSAT chờ duyệt: BE chặn cả đơn (DAY_CONFLICT). */
export const pendingIsat = (d: ContextDay) => d.claim?.status === 'ISAT' && d.claim.pending;
/** Ngày chọn được làm ngày nghỉ: ngày làm, không bị đơn nghỉ giữ, không có iSAT. */
export const countsAsLeave = (d: ContextDay) => d.workday && !held(d) && d.claim?.status !== 'ISAT';
const monthInfo = (ctx: RequestContext, month: string) => ctx.months.find(m => m.month === month);
// Ngày thuộc tháng đã chốt (hoặc tháng không có trong months) không bao giờ là lựa chọn.
const openDays = (ctx: RequestContext) => ctx.days.filter(d => monthInfo(ctx, monthOf(d.date))?.closed === false);
// Sau ngày `date` còn ít nhất một ngày cùng tháng có giờ trống để bù.
const roomAfter = (ctx: RequestContext, date: string) =>
  openDays(ctx).some(d => d.date > date && monthOf(d.date) === monthOf(date) && d.hours.length > 0);

/** Phút OT còn đăng ký được trong tháng (40 giờ trừ phần đã có); tháng không có trong months là 0. */
export function otLeftMinutes(ctx: RequestContext, month: string): number {
  const m = monthInfo(ctx, month);
  return m ? Math.max(0, m.otCapMinutes - m.otMinutes) : 0;
}

/** "Từ ngày" (hoặc ngày duy nhất) chọn được của từng loại, tăng dần; Giải trình theo thứ tự explanationDays. */
export function startDates(ctx: RequestContext, kind: RequestKind): string[] {
  const days = openDays(ctx);
  switch (kind) {
    case 'leave':
      return days.filter(countsAsLeave).map(d => d.date);
    case 'leave-with-makeup':
      return days
        .filter(d => countsAsLeave(d) && !monthInfo(ctx, monthOf(d.date))!.hasOvertime && roomAfter(ctx, d.date))
        .map(d => d.date);
    case 'overtime':
      return days
        .filter(d => !monthInfo(ctx, monthOf(d.date))!.hasMakeupLeave)
        .filter(d => startHours(d, { capMinutes: otLeftMinutes(ctx, monthOf(d.date)) }).length > 0)
        .map(d => d.date);
    case 'shift-change':
      return days.map(d => d.date);
    case 'explanation':
      return ctx.explanationDays.map(d => d.date);
    default:
      return [];
  }
}

/**
 * "Đến ngày" chọn được khi "Từ ngày" là `start` (rỗng khi `start` không chọn được hoặc loại chỉ có một ngày).
 * Đơn nghỉ: ngày làm từ `start`, dừng trước ngày kế tiếp bị đơn nghỉ giữ hoặc có iSAT chờ duyệt; Thứ Bảy có iSAT được
 * duyệt nằm giữa khoảng thì được, nhưng không là "Đến ngày". Nghỉ có làm bù: thêm cùng tháng và sau đó còn ngày để bù.
 * Đổi ca: mọi ngày từ `start`.
 */
export function endDates(ctx: RequestContext, kind: RequestKind, start: string): string[] {
  if (!start || !startDates(ctx, kind).includes(start)) return [];
  const days = openDays(ctx).filter(d => d.date >= start);
  if (kind === 'shift-change') return days.map(d => d.date);
  if (kind !== 'leave' && kind !== 'leave-with-makeup') return [];
  const out: string[] = [];
  for (const d of days) {
    if (held(d) || pendingIsat(d)) break;
    if (kind === 'leave-with-makeup' && (monthOf(d.date) !== monthOf(start) || !roomAfter(ctx, d.date))) break;
    if (countsAsLeave(d)) out.push(d.date);
  }
  return out;
}

/** Giữ "Đến ngày" khi còn hợp lệ với "Từ ngày" mới, không thì đặt lại về lựa chọn đầu (chính "Từ ngày"). */
export function fitEnd(ctx: RequestContext, kind: RequestKind, start: string, end: string): string {
  const ends = endDates(ctx, kind, start);
  return ends.includes(end) ? end : (ends[0] ?? '');
}

/** Ngày bù chọn được: sau ngày nghỉ cuối, cùng tháng, còn giờ trống. */
export function slotDates(ctx: RequestContext, leaveEnd: string): string[] {
  if (!leaveEnd) return [];
  return openDays(ctx)
    .filter(d => d.date > leaveEnd && monthOf(d.date) === monthOf(leaveEnd) && d.hours.length > 0)
    .map(d => d.date);
}

const overlaps = (start: number, end: number, w: HourWindow) => start < w.end && end > w.start;
const minutesIn = (day: ContextDay, w: HourWindow) =>
  day.hours.find(h => h.start === w.start)?.ends.find(e => e.end === w.end)?.minutes ?? (w.end - w.start) * 60;

// Số phút còn xếp được trong ngày. Khung dài nhất trong `hours` là phần còn lại của trần 12 giờ một ngày, nên các khung
// đã chọn ở dòng khác cùng ngày (`taken`) trừ vào đó; `capMinutes` (giờ OT còn lại, giờ bù còn thiếu) chặn thêm.
function budget(day: ContextDay, opts: HourOptions): number {
  let cap = opts.capMinutes ?? Infinity;
  const taken = opts.taken ?? [];
  if (taken.length) {
    const longest = Math.max(0, ...day.hours.flatMap(h => h.ends.map(e => e.minutes)));
    cap = Math.min(cap, longest - taken.reduce((sum, w) => sum + minutesIn(day, w), 0));
  }
  return cap;
}

/** "Đến" chọn được khi "Từ" là `start`: không chồng khung đã chọn, không quá số phút còn lại. */
export function endHours(day: ContextDay, start: number, opts: HourOptions = {}): HourEnd[] {
  const slot = day.hours.find(h => h.start === start);
  const taken = opts.taken ?? [];
  if (!slot || taken.some(w => start >= w.start && start < w.end)) return [];
  const cap = budget(day, opts);
  return slot.ends.filter(e => e.minutes <= cap && !taken.some(w => overlaps(start, e.end, w)));
}

/** "Từ" chọn được: giờ bắt đầu còn ít nhất một giờ kết thúc hợp lệ. */
export function startHours(day: ContextDay, opts: HourOptions = {}): number[] {
  return day.hours.filter(h => endHours(day, h.start, opts).length > 0).map(h => h.start);
}

// Ngày nghỉ thật của một khoảng: ngày làm, bỏ Thứ Bảy đã có iSAT được duyệt (spec 2.2).
export function leaveDates(ctx: RequestContext, start: string, end: string): string[] {
  if (!start || !end) return [];
  return ctx.days
    .filter(d => d.date >= start && d.date <= end && d.workday && !approvedIsat(d))
    .map(d => d.date);
}

/** Bộ đếm "Đã xếp x / 8 giờ", tính bằng phút. Dòng chưa điền đủ tính 0. */
export function makeupCounter(
  ctx: RequestContext,
  startDate: string,
  endDate: string,
  slots: MakeupSlot[]
): { planned: number; required: number } {
  const required = leaveDates(ctx, startDate, endDate).length * MAKEUP_MINUTES_PER_DAY;
  const planned = slots.reduce((sum, s) => {
    if (!s.date || !s.startTime || !s.endTime) return sum;
    const w = { start: hourOf(s.startTime), end: hourOf(s.endTime) };
    const day = ctx.days.find(d => d.date === s.date);
    return sum + (day ? minutesIn(day, w) : (w.end - w.start) * 60);
  }, 0);
  return { planned, required };
}

// ['2026-11-13', '2026-11-14', '2026-11-16'] → '13, 14 và 16/11'; khác tháng ghi tháng sau ngày cuối của tháng đó.
export function dayList(dates: string[]): string {
  const parts = dates.map((d, i) => (dates[i + 1] && monthOf(dates[i + 1]) === monthOf(d) ? d.slice(8, 10) : ddmm(d)));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** Dòng tóm tắt do máy đếm: '3 ngày làm việc: 13, 14 và 16/11'. Rỗng khi khoảng không có ngày làm. */
export function leaveSummary(ctx: RequestContext, start: string, end: string): string {
  const dates = leaveDates(ctx, start, end);
  return dates.length ? `${dates.length} ngày làm việc: ${dayList(dates)}` : '';
}

const CASE_TEXT: Record<ExplanationCase, string> = {
  LATE_CHECK_IN: 'Vào muộn',
  EARLY_CHECK_IN: 'Vào sớm',
  EARLY_CHECK_OUT: 'Ra sớm',
  FORGOT_CHECK_OUT: 'Quên check-out',
  MISSING_CHECK_IN: 'Thiếu giờ vào',
  MISSING_CHECK_OUT: 'Thiếu giờ ra'
};

/** Chữ của các trường hợp giải trình (spec 3.2); thiếu cả giờ vào lẫn giờ ra là "Quên chấm công". */
export function caseText(cases: ExplanationCase[]): string {
  const both = cases.includes('MISSING_CHECK_IN') && cases.includes('MISSING_CHECK_OUT');
  const words = cases.filter(c => !(both && c.startsWith('MISSING_'))).map(c => CASE_TEXT[c] ?? c);
  return (both ? ['Quên chấm công', ...words] : words).join(' · ');
}

/** Hai dòng của form Tạm ứng: số tiền và cách tính. */
export function advanceLines(advance: AdvanceInfo): [string, string] {
  return [
    `Số tiền được ứng: ${vnd(advance.amount)} ₫`,
    `80% lương ngày công ${advance.from.slice(8, 10)}–${ddmm(advance.to)} · ${advance.workDays} ngày`
  ];
}
