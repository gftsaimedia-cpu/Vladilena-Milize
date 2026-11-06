// Máy luật giả của mock (nhánh __MOCK__): làm đúng việc của BE (src/modules/requests/domain/filing-choices.ts), tức dựng
// `choices`, cờ từng ngày và `otHours` của request-context, và kiểm đơn khi xem trước / tạo. FE thật không import file này.
import type {
  ContextDay,
  HalfShiftOptions,
  HourEnd,
  HourSlot,
  MakeupSlot,
  RangeChoice,
  RequestChoices,
  RequestContext,
  RequestKind
} from './staff-requests-types';

/** Request-context trước khi dựng phần BE tính (choices, cờ ngày, otHours). */
export type EngineDay = Omit<ContextDay, 'leaveCounted' | 'shiftChangeable' | 'otHours'>;
export type EngineCtx = Omit<RequestContext, 'choices' | 'rules' | 'days'> & { days: EngineDay[] };

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

// Ngày bị đơn nghỉ giữ (kể cả nghỉ giữa ca): đơn nghỉ theo khoảng dừng trước ngày này (BE day-status).
const held = (d: EngineDay) =>
  d.claim?.status === 'LEAVE' || d.claim?.status === 'LEAVE_WITH_MAKEUP' || d.claim?.status === 'HALF_SHIFT';
/** Thứ Bảy có iSAT được duyệt: đơn nghỉ theo khoảng bỏ ngày này kèm cảnh báo (BE planClaims). */
export const approvedIsat = (d: EngineDay) => d.claim?.status === 'ISAT' && !d.claim.pending;
/** Thứ Bảy có iSAT chờ duyệt: BE chặn cả đơn (DAY_CONFLICT). */
export const pendingIsat = (d: EngineDay) => d.claim?.status === 'ISAT' && d.claim.pending;
/** Ngày chọn được làm ngày nghỉ: ngày làm, không bị đơn nghỉ giữ, không có iSAT. */
export const countsAsLeave = (d: EngineDay) => d.workday && !held(d) && d.claim?.status !== 'ISAT';
const monthInfo = (ctx: EngineCtx, month: string) => ctx.months.find(m => m.month === month);
// Ngày thuộc tháng đã chốt (hoặc tháng không có trong months) không bao giờ là lựa chọn.
const openDays = (ctx: EngineCtx) => ctx.days.filter(d => monthInfo(ctx, monthOf(d.date))?.closed === false);
// Sau ngày `date` còn ít nhất một ngày cùng tháng có giờ trống để bù.
const roomAfter = (ctx: EngineCtx, date: string) =>
  openDays(ctx).some(d => d.date > date && monthOf(d.date) === monthOf(date) && d.hours.length > 0);

// Ruling (progress.md): ngày Đổi ca bỏ ngày đã có đơn đổi ca khác hay iSAT chờ duyệt, và khoảng phải có ít nhất một ngày đổi
// được: hẹp hơn "mọi ngày trong window" của spec 4.4, theo brief FE và luật chỉ đưa lựa chọn hợp lệ. Nếu sai, form đưa ít ngày
// hơn BE nhận (hôm nay BE từ chối đúng các khoảng này, day-status.ts:110).
// Ngày chặn khoảng Đổi ca: đã có đơn đổi ca (chờ duyệt hay đã duyệt) hoặc Thứ Bảy có iSAT chờ duyệt.
const blocksShiftChange = (d: EngineDay) => d.claim?.status === 'SHIFT_CHANGE' || pendingIsat(d);
// Ngày đổi được ca: ngày làm chưa bị đơn nào giữ (như summary.dates của xem trước). Ngày nghỉ, iSAT được duyệt nằm trong
// khoảng thì giữ nguyên.
const changeable = (d: EngineDay) => d.workday && !d.claim;
// "Đến ngày" của Đổi ca khi `from[0]` là "Từ ngày": dừng trước ngày chặn kế tiếp; `[from[0]..e]` phải có một ngày đổi được.
function shiftChangeEnds(from: EngineDay[]): string[] {
  const out: string[] = [];
  let changes = false;
  for (const d of from) {
    if (blocksShiftChange(d)) break;
    changes ||= changeable(d);
    if (changes) out.push(d.date);
  }
  return out;
}

/** Nợ nghỉ giữa ca còn lại của tháng (phút); 0 khi không nợ. */
const debtLeft = (ctx: EngineCtx, month: string) => monthInfo(ctx, month)?.halfShiftDebt?.remainingMinutes ?? 0;
/**
 * Tháng có Nghỉ có làm bù chặn OT của ngày, trừ khi còn nợ nghỉ giữa ca mà khung ngày này trả được (BE T6): cùng tháng, có
 * đơn nghỉ giữa ca đã duyệt từ ngày này trở về trước (khung trước ngày nghỉ giữa ca không trả được nợ của ngày đó).
 */
const otBlocked = (ctx: EngineCtx, day: EngineDay) => {
  const month = monthOf(day.date);
  if (!monthInfo(ctx, month)?.hasMakeupLeave) return false;
  if (debtLeft(ctx, month) <= 0) return true;
  const owedBy = (d: EngineDay) => d.claim?.status === 'HALF_SHIFT' && !d.claim.pending;
  return !ctx.days.some(d => owedBy(d) && monthOf(d.date) === month && d.date <= day.date);
};

/** Phút OT còn đăng ký được trong tháng (40 giờ trừ phần đã có); tháng không có trong months là 0. */
export function otLeftMinutes(ctx: EngineCtx, month: string): number {
  const m = monthInfo(ctx, month);
  return m ? Math.max(0, m.otCapMinutes - m.otMinutes) : 0;
}

/** "Từ ngày" (hoặc ngày duy nhất) chọn được của từng loại, tăng dần; Giải trình theo thứ tự explanationDays. */
export function startDates(ctx: EngineCtx, kind: RequestKind): string[] {
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
        .filter(d => !otBlocked(ctx, d))
        .filter(d => startHours(d, { capMinutes: otLeftMinutes(ctx, monthOf(d.date)) }).length > 0)
        .map(d => d.date);
    case 'half-shift-leave':
      return days.filter(d => d.halfShift).map(d => d.date);
    case 'shift-change':
      return days.filter((_, i) => shiftChangeEnds(days.slice(i)).length > 0).map(d => d.date);
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
 * Đổi ca: các ngày từ `start`, dừng trước ngày kế tiếp đã có đơn đổi ca khác hay iSAT chờ duyệt; ngày `e` được khi
 * `[start..e]` có ít nhất một ngày làm chưa bị đơn nào giữ (Chủ nhật, ngày nghỉ, iSAT được duyệt nằm trong khoảng thì được).
 */
export function endDates(ctx: EngineCtx, kind: RequestKind, start: string): string[] {
  if (!start || !startDates(ctx, kind).includes(start)) return [];
  const days = openDays(ctx).filter(d => d.date >= start);
  if (kind === 'shift-change') return shiftChangeEnds(days);
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
export function fitEnd(ctx: EngineCtx, kind: RequestKind, start: string, end: string): string {
  const ends = endDates(ctx, kind, start);
  return ends.includes(end) ? end : (ends[0] ?? '');
}

/** Ngày bù chọn được: sau ngày nghỉ cuối, cùng tháng, còn giờ trống. */
export function slotDates(ctx: EngineCtx, leaveEnd: string): string[] {
  if (!leaveEnd) return [];
  return openDays(ctx)
    .filter(d => d.date > leaveEnd && monthOf(d.date) === monthOf(leaveEnd) && d.hours.length > 0)
    .map(d => d.date);
}

const overlaps = (start: number, end: number, w: HourWindow) => start < w.end && end > w.start;
const minutesIn = (day: EngineDay, w: HourWindow) =>
  day.hours.find(h => h.start === w.start)?.ends.find(e => e.end === w.end)?.minutes ?? (w.end - w.start) * 60;

// Số phút còn xếp được trong ngày. Khung dài nhất trong `hours` là phần còn lại của trần 12 giờ một ngày, nên các khung
// đã chọn ở dòng khác cùng ngày (`taken`) trừ vào đó; `capMinutes` (giờ OT còn lại, giờ bù còn thiếu) chặn thêm.
// Khung dài nhất có thể bị cách xếp giờ trống trong ngày giới hạn chứ không phải trần 12 giờ (vd. ca 10–19: khung dài nhất
// 06–09 là 3 giờ, trần còn 4). Khi đó số phút cho dòng thứ hai chặt hơn của BE, nhưng không bao giờ lỏng hơn, nên không đưa
// ra khung không hợp lệ.
function budget(day: EngineDay, opts: HourOptions): number {
  let cap = opts.capMinutes ?? Infinity;
  const taken = opts.taken ?? [];
  if (taken.length) {
    const longest = Math.max(0, ...day.hours.flatMap(h => h.ends.map(e => e.minutes)));
    cap = Math.min(cap, longest - taken.reduce((sum, w) => sum + minutesIn(day, w), 0));
  }
  return cap;
}

/** "Đến" chọn được khi "Từ" là `start`: không chồng khung đã chọn, không quá số phút còn lại. */
export function endHours(day: EngineDay, start: number, opts: HourOptions = {}): HourEnd[] {
  const slot = day.hours.find(h => h.start === start);
  const taken = opts.taken ?? [];
  if (!slot || taken.some(w => start >= w.start && start < w.end)) return [];
  const cap = budget(day, opts);
  return slot.ends.filter(e => e.minutes <= cap && !taken.some(w => overlaps(start, e.end, w)));
}

/** "Từ" chọn được: giờ bắt đầu còn ít nhất một giờ kết thúc hợp lệ. */
export function startHours(day: EngineDay, opts: HourOptions = {}): number[] {
  return day.hours.filter(h => endHours(day, h.start, opts).length > 0).map(h => h.start);
}

// Ngày nghỉ thật của một khoảng: ngày làm, bỏ Thứ Bảy đã có iSAT được duyệt (spec 2.2).
export function leaveDates(ctx: EngineCtx, start: string, end: string): string[] {
  if (!start || !end) return [];
  return ctx.days
    .filter(d => d.date >= start && d.date <= end && d.workday && !approvedIsat(d))
    .map(d => d.date);
}

/** Bộ đếm "Đã xếp x / 8 giờ", tính bằng phút. Dòng chưa điền đủ tính 0. */
export function makeupCounter(
  ctx: EngineCtx,
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

// Giờ của các dòng khung bù đang điền (dòng khác đã chiếm, số giờ còn thiếu) do builders/api/staff-requests.ts (slotHours,
// fitSlots) lọc trên bảng giờ của request-context, cả ở mock lẫn máy chủ thật.

// ---------- Dựng phần request-context mà BE tính ----------
const daysIn = (ctx: EngineCtx, start: string, end: string) => ctx.days.filter(d => d.date >= start && d.date <= end);

/**
 * Giờ OT chọn được của ngày: bỏ khung dài hơn số phút OT còn lại; tháng đã chốt, hay có nghỉ có làm bù mà không còn nợ nghỉ
 * giữa ca, thì rỗng. Tháng có nghỉ có làm bù và còn nợ: mock không cắt theo nợ còn lại (FE tự cắt, BE kiểm lại khi nộp).
 */
export function otHoursOf(ctx: EngineCtx, day: EngineDay): HourSlot[] {
  const m = monthInfo(ctx, monthOf(day.date));
  if (!m || m.closed || otBlocked(ctx, day)) return [];
  return day.hours
    .map(h => ({ start: h.start, ends: h.ends.filter(e => e.minutes <= m.otLeftMinutes) }))
    .filter(h => h.ends.length > 0);
}

export const leaveCountedOf = (d: EngineDay) => d.workday && !approvedIsat(d);

// ---------- Nghỉ giữa ca (BE halvesOf) ----------
const HALF_MINUTES = 240; // mỗi nửa 4 giờ, nghỉ giữa 1 giờ
const SHIFT_SPAN = 540; // chỉ ca 9 giờ chia được (T3)
const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const minOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Hai nửa ca của ngày: ngày làm, có ca 9 giờ, tháng chưa chốt, không có đơn giữ ngày (đổi ca thì được, nửa ca theo ca đã đổi).
 * Ca 08–17: nửa đầu làm 08–12 nghỉ 13–17, nửa sau làm 13–17 nghỉ 08–12. Không chọn được thì null.
 */
export function halfShiftOf(ctx: EngineCtx, d: EngineDay): HalfShiftOptions | null {
  if (!d.workday || !d.shift || monthInfo(ctx, monthOf(d.date))?.closed !== false) return null;
  if (d.claim && d.claim.status !== 'SHIFT_CHANGE') return null;
  const start = minOf(d.shift.start);
  if ((minOf(d.shift.end) - start + 1440) % 1440 !== SHIFT_SPAN) return null;
  const first = { start: clock(start), end: clock(start + HALF_MINUTES) };
  const second = { start: clock(start + SHIFT_SPAN - HALF_MINUTES), end: clock(start + SHIFT_SPAN) };
  return { FIRST: { work: first, leave: second }, SECOND: { work: second, leave: first } };
}
export const shiftChangeableOf = (d: EngineDay) => d.workday && !d.claim;

/** Dựng `choices` như BE: từ ngày bắt đầu, các ngày kết thúc kèm số ngày giữ và số phút bù. */
export function buildChoices(ctx: EngineCtx): RequestChoices {
  const range = (kind: 'leave' | 'leave-with-makeup' | 'shift-change') => {
    const starts = startDates(ctx, kind);
    const counted = kind === 'shift-change' ? shiftChangeableOf : leaveCountedOf;
    const ends: Record<string, RangeChoice[]> = {};
    for (const s of starts)
      ends[s] = endDates(ctx, kind, s).map(e => {
        const daysCount = daysIn(ctx, s, e).filter(counted).length;
        const c: RangeChoice = { date: e, daysCount };
        if (kind === 'leave') c.annualLeaveLeftAfter = ctx.annualLeaveLeft === null ? null : ctx.annualLeaveLeft - daysCount;
        if (kind === 'leave-with-makeup') c.makeupMinutesRequired = daysCount * MAKEUP_MINUTES_PER_DAY;
        return c;
      });
    return { starts, ends };
  };
  const makeup = range('leave-with-makeup');
  const slotDays: Record<string, string[]> = {};
  for (const list of Object.values(makeup.ends)) for (const { date } of list) slotDays[date] ??= slotDates(ctx, date);
  return {
    leave: range('leave'),
    'leave-with-makeup': { ...makeup, slotDates: slotDays },
    overtime: { dates: startDates(ctx, 'overtime') },
    'shift-change': range('shift-change'),
    'half-shift-leave': { dates: startDates(ctx, 'half-shift-leave') }
  };
}
