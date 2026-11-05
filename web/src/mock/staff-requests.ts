// Dữ liệu giả của luồng tạo và huỷ yêu cầu của nhân viên (spec staff-requests 2.1, 2.2, 3.2, 4.8): luôn là Lê Hoàng Nam,
// ca HC 08:00–17:00, làm thứ Hai – thứ Bảy, có quyền lợi ot, makeup và leaveAccount, không có ngày lễ.
// Hôm nay là MOCK_TODAY (28/10/2026); riêng request-context dời được bằng ?homnay=YYYY-MM-DD (spec 4.8).
// Ngày công tháng 10 đọc từ mock/staff-phone. Đơn tạo trong phiên nằm trong bộ nhớ, tải lại trang thì về như cũ;
// ngày đơn giữ, khung OT, khung bù đều suy ra từ các đơn chưa huỷ, nên huỷ đơn là trả lại hết.
import {
  approvedIsat,
  caseText,
  dayList,
  endDates,
  endHours,
  leaveDates,
  makeupCounter,
  otLeftMinutes,
  pendingIsat,
  slotDates,
  startDates
} from '@/builders/api/staff-requests';
import { vnd } from '@/utils/format';
import { MOCK_NOW, MOCK_TODAY } from './clock';
import {
  addRequest,
  dayRecord,
  requestDetail,
  STATUS_TEXT,
  updateRequest,
  type RequestDetail,
  type RequestStep
} from './staff-phone';
import type {
  RequestKind,
  ClaimStatus,
  ExplanationCase,
  ExplanationNeeds,
  HourEnd,
  HourSlot,
  ContextDay,
  ExplanationDay,
  ContextMonth,
  AdvanceInfo,
  RequestContext,
  LeaveDraft,
  MakeupDraft,
  OvertimeDraft,
  ShiftChangeDraft,
  ExplanationDraft,
  RequestDraft,
  PreviewSummary,
  PreviewResult,
  Refusal
} from './staff-requests-types';

// Kiểu nằm ở mock/staff-requests-types; xuất lại để màn import được từ đây.
export type {
  RequestKind,
  ClaimStatus,
  ExplanationCase,
  ExplanationNeeds,
  HourEnd,
  HourSlot,
  ContextDay,
  ExplanationDay,
  ContextKind,
  ContextMonth,
  AdvanceInfo,
  RequestContext,
  LeaveDraft,
  MakeupSlot,
  MakeupDraft,
  OvertimeDraft,
  ShiftChangeDraft,
  ExplanationDraft,
  AdvanceDraft,
  RequestDraft,
  PreviewSummary,
  PreviewResult,
  Refusal
} from './staff-requests-types';

// ---------- Hằng số của người và công ty ----------
const SHIFT = { type: 'NORMAL', start: '08:00', end: '17:00' };
const BASE_SALARY = 6_000_000;
const STANDARD_DAYS = 26;
const ANNUAL_LEAVE_LEFT = 11; // đã trừ Phép năm 12/10
const OT_CAP_MINUTES = 2400;
const DAY_CAP_HOURS = 12; // ca 8 giờ làm + OT + bù trong một ngày
const SHIFT_WORK_HOURS = 8;
// Tháng trước tháng 10 đã chốt công; tháng 10 có 540 phút OT đã đăng ký từ trước.
const FIRST_OPEN_MONTH = '2026-10';
const MONTH_SEED: Record<string, { otMinutes: number; hasOvertime: boolean }> = {
  '2026-10': { otMinutes: 540, hasOvertime: true }
};
// Admin đã nhắc giải trình 24/10 lúc 09:30 ngày 28/10 (giờ VN).
const REMINDERS: Record<string, string> = { '2026-10-24': '2026-10-28T02:30:00.000Z' };
const LEAVE_TYPES = [
  { code: 'ANNUAL', label: 'Phép năm' },
  { code: 'PERSONAL_PAID', label: 'Việc riêng có lương' },
  { code: 'PERSONAL_UNPAID', label: 'Việc riêng không lương' },
  { code: 'SOCIAL_INSURANCE', label: 'Chế độ BHXH' },
  { code: 'WELFARE', label: 'Phúc lợi nội bộ' },
  { code: 'UNPAID', label: 'Không lương' }
];
const SHIFT_FRAMES = [
  { shiftType: 'NORMAL', start: '08:00', end: '17:00' },
  { shiftType: 'NORMAL', start: '10:00', end: '19:00' },
  { shiftType: 'FLEX', start: '06:00', end: '15:00' },
  { shiftType: 'FLEX', start: '13:00', end: '22:00' },
  { shiftType: 'NIGHT', start: '22:00', end: '07:00' },
  { shiftType: 'NIGHT', start: '21:00', end: '06:00' }
];
const FRAME_LABEL: Record<string, string> = { NORMAL: 'Normal', FLEX: 'Flex', NIGHT: 'Night' };
const KIND_LABEL: Record<RequestKind, string> = {
  leave: 'Đơn nghỉ',
  'leave-with-makeup': 'Nghỉ có làm bù',
  overtime: 'Làm thêm giờ',
  'shift-change': 'Đổi ca',
  explanation: 'Giải trình',
  advance: 'Tạm ứng lương'
};
const KIND_ICON: Record<RequestKind, RequestDetail['icon']> = {
  leave: 'leave',
  'leave-with-makeup': 'leave',
  overtime: 'clock',
  'shift-change': 'clock',
  explanation: 'clock',
  advance: 'coin'
};

// ---------- Ngày giờ ----------
const DOW_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOf(new Date(dateOf(iso).getTime() + n * 86400000));
const dowOf = (iso: string) => dateOf(iso).getUTCDay();
const monthOf = (iso: string) => iso.slice(0, 7);
const monthNo = (iso: string) => Number(iso.slice(5, 7));
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmy = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2));
const lastOfNextMonth = (iso: string) => isoOf(new Date(Date.UTC(+iso.slice(0, 4), monthNo(iso) + 1, 0)));
const nextMonthOf = (iso: string) => monthOf(isoOf(new Date(Date.UTC(+iso.slice(0, 4), monthNo(iso), 1))));
const prevMonthFirst = (iso: string) => isoOf(new Date(Date.UTC(+iso.slice(0, 4), monthNo(iso) - 2, 1)));
const nowTime = () => new Date(Date.parse(MOCK_NOW) + 7 * 3600000).toISOString().slice(11, 16); // '09:40'
const quote = (s: string) => `“${s.trim()}”`;
// Khoảng ngày trong tiêu đề: '13/11', '13–16/11', '30/11–02/12' (spec 2.4).
const rangeText = (a: string, b: string) =>
  a === b ? ddmm(a) : monthOf(a) === monthOf(b) ? `${a.slice(8, 10)}–${ddmm(b)}` : `${ddmm(a)}–${ddmm(b)}`;
const longRange = (a: string, b: string) => (a === b ? `${DOW_LONG[dowOf(a)]} ${dmy(a)}` : `${dmy(a)} – ${dmy(b)}`);
const isHour = (t: string | undefined) => !!t && /^([01]\d|2[0-3]):00$/.test(t);
const isTime = (t: string | undefined) => !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Hôm nay của request-context: ?homnay=YYYY-MM-DD khi chạy dữ liệu giả, không thì MOCK_TODAY. */
export function mockRequestToday(): string {
  if (__MOCK__ && typeof location !== 'undefined') {
    const v = new URLSearchParams(location.search).get('homnay');
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && isoOf(dateOf(v)) === v) return v;
  }
  return MOCK_TODAY;
}

// ---------- Đơn trong phiên ----------
type Window = { date: string; start: number; end: number };
type Entry = {
  id: string;
  kind: RequestKind;
  claims: { date: string; status: ClaimStatus }[]; // ngày đơn giữ (day_status)
  windows: Window[]; // khung OT hoặc khung bù
  frame?: { type: string; start: string; end: string }; // ca mới của đơn đổi ca, trên các ngày SHIFT_CHANGE
  month?: string; // tháng của đơn OT, Nghỉ có làm bù, Tạm ứng
  explanationDate?: string;
  annualDays?: number; // số ngày Phép năm đơn này trừ
};
// Hai đơn giải trình và đơn tạm ứng có sẵn trong mock/staff-phone. Phép năm 12/10 và iSAT 17/10 đọc từ ngày công.
const ENTRIES: Entry[] = [
  { id: 'giai-trinh-2710', kind: 'explanation', claims: [], windows: [], explanationDate: '2026-10-27' },
  { id: 'gio-vao-0909', kind: 'explanation', claims: [], windows: [], explanationDate: '2026-09-09' },
  { id: 'tam-ung-09', kind: 'advance', claims: [], windows: [], month: '2026-09' }
];
let seq = 0;

const statusOf = (e: Entry) => requestDetail(e.id)?.status ?? 'cancel';
// Chờ duyệt hoặc đã duyệt: còn giữ ngày, còn tính giờ.
const live = () => ENTRIES.filter(e => statusOf(e) === 'pend' || statusOf(e) === 'done');

function claimOn(date: string): ContextDay['claim'] {
  const found: { status: ClaimStatus; pending: boolean }[] = [];
  const rec = dayRecord(date);
  if (rec?.leave) found.push({ status: rec.leave.type === 'iSAT' ? 'ISAT' : 'LEAVE', pending: false });
  for (const e of live())
    for (const c of e.claims) if (c.date === date) found.push({ status: c.status, pending: statusOf(e) === 'pend' });
  // Đơn nghỉ chiếm chỗ của đổi ca (BE planClaims): ngày nghỉ thắng.
  const rank = (s: ClaimStatus) => ['LEAVE', 'LEAVE_WITH_MAKEUP', 'ISAT', 'SHIFT_CHANGE'].indexOf(s);
  return found.sort((a, b) => rank(a.status) - rank(b.status))[0] ?? null;
}

const windowsOn = (date: string) => live().flatMap(e => e.windows.filter(w => w.date === date));
const shiftOn = (date: string) => {
  if (dowOf(date) === 0) return null;
  const change = live().find(e => e.frame && e.claims.some(c => c.date === date && c.status === 'SHIFT_CHANGE'));
  return change?.frame ?? SHIFT;
};

// Giờ trống cho một khung OT / bù mới (spec 2.1 `hours`): trong 06–22, cách ca 1 giờ, khung trước ca kết thúc ở giờ
// trước ca một tiếng, khung sau ca bắt đầu sau ca một tiếng; ngày không ca thì mọi khung trong 06–22. Trần 12 giờ một ngày
// tính cả 8 giờ làm của ca; khung đã có không được chồng và trừ vào trần. Số phút = số giờ đồng hồ × 60.
function hoursOf(shift: ContextDay['shift'], windows: Window[]): HourSlot[] {
  const used = windows.reduce((sum, w) => sum + (w.end - w.start) * 60, 0);
  const capMinutes = (shift ? DAY_CAP_HOURS - SHIFT_WORK_HOURS : DAY_CAP_HOURS) * 60 - used;
  const span = (start: number, end: number): HourEnd => ({ end, minutes: (end - start) * 60 });
  const base: HourSlot[] = [];
  if (!shift) {
    for (let s = 6; s < 22; s++)
      base.push({ start: s, ends: Array.from({ length: Math.min(22, s + DAY_CAP_HOURS) - s }, (_, i) => span(s, s + i + 1)) });
  } else {
    const capHours = DAY_CAP_HOURS - SHIFT_WORK_HOURS;
    const beforeEnd = hourOf(shift.start) - 1;
    for (let s = Math.max(6, beforeEnd - capHours); s < beforeEnd; s++) base.push({ start: s, ends: [span(s, beforeEnd)] });
    const afterStart = hourOf(shift.end) + 1;
    if (afterStart >= 6 && afterStart < 22)
      base.push({
        start: afterStart,
        ends: Array.from({ length: Math.min(22, afterStart + capHours) - afterStart }, (_, i) => span(afterStart, afterStart + i + 1))
      });
    base.sort((a, b) => a.start - b.start);
  }
  return base
    .map(h => ({
      start: h.start,
      ends: h.ends.filter(e => e.minutes <= capMinutes && !windows.some(w => h.start < w.end && e.end > w.start))
    }))
    .filter(h => h.ends.length > 0);
}

function contextDay(date: string): ContextDay {
  const claim = claimOn(date);
  const shift = shiftOn(date);
  const off = claim?.status === 'LEAVE' || claim?.status === 'LEAVE_WITH_MAKEUP';
  return { date, workday: dowOf(date) !== 0, shift, holiday: null, claim, hours: off ? [] : hoursOf(shift, windowsOn(date)) };
}

function monthOfContext(month: string): ContextMonth {
  const seed = MONTH_SEED[month] ?? { otMinutes: 0, hasOvertime: false };
  const entries = live().filter(e => e.month === month);
  const ot = entries.filter(e => e.kind === 'overtime');
  return {
    month,
    closed: month < FIRST_OPEN_MONTH,
    otMinutes: seed.otMinutes + ot.reduce((sum, e) => sum + e.windows.reduce((s, w) => s + (w.end - w.start) * 60, 0), 0),
    otCapMinutes: OT_CAP_MINUTES,
    hasOvertime: seed.hasOvertime || ot.length > 0,
    hasMakeupLeave: entries.some(e => e.kind === 'leave-with-makeup')
  };
}

// ---------- Ngày cần giải trình (spec 3.1, 3.2) ----------
const CASE_ORDER: ExplanationCase[] = [
  'LATE_CHECK_IN',
  'EARLY_CHECK_OUT',
  'MISSING_CHECK_IN',
  'MISSING_CHECK_OUT',
  'EARLY_CHECK_IN',
  'FORGOT_CHECK_OUT'
];

// Trường hợp máy thấy trên giờ vào / ra thật. Hôm nay chỉ tính trường hợp đã chắc chắn: chưa ra, chưa chấm thì chưa thiếu.
function casesOf(inAt: string | null, outAt: string | null, shift: { start: string; end: string }, isToday: boolean) {
  const start = toMin(shift.start);
  const end = toMin(shift.end);
  const found = new Set<ExplanationCase>();
  if (inAt && toMin(inAt) > start + 15) found.add('LATE_CHECK_IN');
  if (inAt && toMin(inAt) < start - 15) found.add('EARLY_CHECK_IN');
  if (outAt && toMin(outAt) < end) found.add('EARLY_CHECK_OUT');
  if (outAt && toMin(outAt) > end + 30) found.add('FORGOT_CHECK_OUT');
  if (outAt && !inAt) found.add('MISSING_CHECK_IN');
  if (inAt && !outAt && !isToday) found.add('MISSING_CHECK_OUT');
  if (!inAt && !outAt && !isToday) found.add('MISSING_CHECK_IN').add('MISSING_CHECK_OUT');
  const cases = CASE_ORDER.filter(c => found.has(c));
  return { cases, needs: { checkIn: found.has('MISSING_CHECK_IN'), checkOut: found.has('MISSING_CHECK_OUT') } };
}

/**
 * Ngày cần giải trình, mới nhất trước: từ ngày 01 tháng trước tới `today`, chỉ tháng chưa chốt, ngày có ca, không nghỉ,
 * chưa có đơn giải trình chưa huỷ, máy thấy ít nhất một trường hợp. Chấm công giả chỉ có tới MOCK_TODAY.
 */
export function explanationDaysOf(today: string): ExplanationDay[] {
  const explained = new Set(
    ENTRIES.filter(e => e.kind === 'explanation' && statusOf(e) !== 'cancel').map(e => e.explanationDate)
  );
  const out: ExplanationDay[] = [];
  const from = prevMonthFirst(today);
  for (let d = today; d >= from; d = addDays(d, -1)) {
    if (monthOf(d) < FIRST_OPEN_MONTH || d > MOCK_TODAY || explained.has(d)) continue;
    const shift = shiftOn(d);
    const claim = claimOn(d)?.status;
    if (!shift || claim === 'LEAVE' || claim === 'LEAVE_WITH_MAKEUP' || claim === 'ISAT') continue;
    const rec = dayRecord(d);
    const { cases, needs } = casesOf(rec?.in ?? null, rec?.out ?? null, shift, d === today);
    if (cases.length) out.push({ date: d, cases, needs, remindedAt: REMINDERS[d] ?? null });
  }
  return out;
}

/** Ngày cần giải trình (theo MOCK_TODAY) mà Admin đã nhắc. */
export function remindersOf(): { date: string; remindedAt: string }[] {
  return explanationDaysOf(MOCK_TODAY)
    .filter(d => d.remindedAt)
    .map(d => ({ date: d.date, remindedAt: d.remindedAt! }));
}

/** Trường hợp, ô giờ phải nhập và lần nhắc của một ngày còn cần giải trình (theo MOCK_TODAY); không thì null. */
export function dueOf(date: string): { cases: ExplanationCase[]; needs: ExplanationNeeds; remindedAt: string | null } | null {
  const day = explanationDaysOf(MOCK_TODAY).find(d => d.date === date);
  return day ? { cases: day.cases, needs: day.needs, remindedAt: day.remindedAt } : null;
}

// ---------- Tạm ứng (spec 2.5) ----------
function advanceQuote(month: string): AdvanceInfo {
  const from = `${month}-01`;
  const to = `${month}-15`;
  let workDays = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayRecord(d)?.in) workDays++;
  return { month, amount: Math.round((0.8 * workDays * BASE_SALARY) / STANDARD_DAYS), workDays, from, to };
}

// Vì sao hôm nay chưa nộp được tạm ứng: ngoài ngày 16–17, tháng đã có đơn, hay chưa có ngày công 01–15.
type AdvanceBlock = 'not-filing-day' | 'month-filed' | 'no-workdays';
type AdvanceState = { advance: AdvanceInfo; block: null } | { advance: null; block: AdvanceBlock; reason: string };

function advanceState(today: string): AdvanceState {
  const month = monthOf(today);
  const day = Number(today.slice(8, 10));
  if (day !== 16 && day !== 17) return { advance: null, block: 'not-filing-day', reason: 'Chỉ nộp ngày 16 và 17' };
  if (live().some(e => e.kind === 'advance' && e.month === month))
    return { advance: null, block: 'month-filed', reason: `Tháng ${monthNo(today)} đã có đơn tạm ứng` };
  const quote = advanceQuote(month);
  if (!quote.amount)
    return { advance: null, block: 'no-workdays', reason: `Chưa có ngày công 01–15/${pad(monthNo(today))}` };
  return { advance: quote, block: null };
}

// ---------- request-context ----------
export function requestContext(): RequestContext {
  const today = mockRequestToday();
  const to = lastOfNextMonth(today);
  const days: ContextDay[] = [];
  for (let d = today; d <= to; d = addDays(d, 1)) days.push(contextDay(d));
  const explanationDays = explanationDaysOf(today);
  const adv = advanceState(today);
  const ctx: RequestContext = {
    today,
    window: { from: today, to },
    kinds: [],
    months: [monthOf(today), nextMonthOf(today)].map(monthOfContext),
    leaveTypes: LEAVE_TYPES,
    annualLeaveLeft: ANNUAL_LEAVE_LEFT - live().reduce((sum, e) => sum + (e.annualDays ?? 0), 0),
    shiftFrames: SHIFT_FRAMES,
    days,
    explanationDays,
    advance: adv.advance
  };
  const open = (kind: RequestKind, reason: string) =>
    startDates(ctx, kind).length > 0 ? { enabled: true } : { enabled: false, reason };
  ctx.kinds = [
    { kind: 'leave', enabled: true },
    { kind: 'leave-with-makeup', ...open('leave-with-makeup', 'Không còn ngày đăng ký được') },
    { kind: 'overtime', ...open('overtime', 'Không còn ngày đăng ký được') },
    { kind: 'shift-change', enabled: true },
    { kind: 'explanation', ...open('explanation', 'Không có ngày cần giải trình') },
    { kind: 'advance', ...(adv.block ? { enabled: false, reason: adv.reason } : { enabled: true }) }
  ];
  return ctx;
}

// ---------- Xem trước: chỉ các luật FE cần để bật Gửi (spec 4.8) ----------
const MISSING: Refusal = { ok: false, message: 'Chưa điền đủ thông tin' };
const filled = (...values: (string | undefined)[]) => values.every(v => !!v && !!v.trim());
const windowText = (ctx: RequestContext) => `Chỉ chọn ngày từ ${ddmm(ctx.window.from)} đến ${ddmm(ctx.window.to)}`;

// Một khoảng ngày ngoài lựa chọn của form: ngoài window, tháng đã chốt, hay bị đơn khác giữ.
function rangeRefusal(ctx: RequestContext, kind: RequestKind, start: string, end: string): Refusal | null {
  if (endDates(ctx, kind, start).includes(end)) return null;
  if (start < ctx.window.from || end > ctx.window.to || end < start) return { ok: false, message: windowText(ctx) };
  const closed = ctx.months.find(m => m.closed && (m.month === monthOf(start) || m.month === monthOf(end)));
  if (closed) return { ok: false, message: `Tháng ${monthNo(`${closed.month}-01`)} đã chốt công` };
  if (kind === 'leave-with-makeup' && ctx.months.find(m => m.month === monthOf(start))?.hasOvertime)
    return { ok: false, message: `Tháng ${monthNo(start)} đã có đơn OT, không nộp đơn nghỉ có làm bù được` };
  for (const day of ctx.days.filter(x => x.date >= start && x.date <= end)) {
    if (day.claim?.status === 'LEAVE' || day.claim?.status === 'LEAVE_WITH_MAKEUP')
      return { ok: false, code: 'DAY_CONFLICT', message: `Ngày ${ddmm(day.date)} đã có đơn nghỉ` };
    if (pendingIsat(day)) return isatPendingConflict(day.date);
  }
  const first = ctx.days.find(x => x.date === start);
  if (first && approvedIsat(first)) return isatApprovedConflict(start);
  return { ok: false, message: 'Khoảng ngày không chọn được' };
}

// Câu của BE (day-status planDay / planClaims) cho Thứ Bảy có iSAT.
const satText = (date: string) => `Thứ Bảy ${ddmm(date)}`;
const isatPendingConflict = (date: string): Refusal => ({
  ok: false,
  code: 'DAY_CONFLICT',
  message: `${satText(date)} đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.`
});
const isatApprovedConflict = (date: string): Refusal => ({
  ok: false,
  code: 'DAY_CONFLICT',
  message: `${satText(date)} đã có iSAT được duyệt, không chọn được ngày này.`
});
const isatSkipped = (date: string) => `${satText(date)} đã có iSAT được duyệt, không tính vào đơn.`;

// Thứ Bảy đã có iSAT được duyệt bị bỏ khỏi đơn nghỉ, kèm cảnh báo (spec 2.2).
const isatWarnings = (ctx: RequestContext, start: string, end: string) =>
  ctx.days.filter(d => d.date >= start && d.date <= end && approvedIsat(d)).map(d => isatSkipped(d.date));

type Built = { ok: true; title: string; summary: PreviewSummary[RequestKind]; warnings: string[]; entry: Omit<Entry, 'id'>; facts: [string, string][] };

function build(ctx: RequestContext, kind: RequestKind, draft: RequestDraft[RequestKind]): Built | Refusal {
  switch (kind) {
    case 'leave': {
      const d = draft as LeaveDraft;
      if (!filled(d.leaveType, d.startDate, d.endDate, d.reason)) return MISSING;
      const type = ctx.leaveTypes.find(t => t.code === d.leaveType);
      if (!type) return MISSING;
      const bad = rangeRefusal(ctx, kind, d.startDate, d.endDate);
      if (bad) return bad;
      const dates = leaveDates(ctx, d.startDate, d.endDate);
      if (!dates.length) return { ok: false, message: 'Khoảng nghỉ không có ngày làm việc' };
      const annual = d.leaveType === 'ANNUAL';
      const left = ctx.annualLeaveLeft ?? 0;
      if (annual && dates.length > left) return { ok: false, message: `Phép năm chỉ còn ${left} ngày` };
      const after = annual ? left - dates.length : null;
      return {
        ok: true,
        title: `${type.label} ${rangeText(d.startDate, d.endDate)}`,
        summary: { dates, daysCount: dates.length, annualLeaveLeftAfter: after },
        warnings: isatWarnings(ctx, d.startDate, d.endDate),
        entry: { kind, claims: dates.map(date => ({ date, status: 'LEAVE' })), windows: [], annualDays: annual ? dates.length : 0 },
        facts: [
          ['Ngày nghỉ', longRange(d.startDate, d.endDate)],
          ['Số ngày', String(dates.length)],
          ['Hình thức', type.label],
          ['Lý do', quote(d.reason)],
          ...(after === null ? [] : [['Phép năm còn lại', `${after} ngày`] as [string, string]])
        ]
      };
    }
    case 'leave-with-makeup': {
      const d = draft as MakeupDraft;
      const slots = d.slots ?? [];
      if (!filled(d.startDate, d.endDate, d.reason) || !slots.length || !slots.every(s => filled(s.date, s.startTime, s.endTime)))
        return MISSING;
      const bad = rangeRefusal(ctx, kind, d.startDate, d.endDate);
      if (bad) return bad;
      if (!slots.every(s => isHour(s.startTime) && isHour(s.endTime))) return { ok: false, message: 'Chỉ chọn giờ tròn' };
      const allowed = slotDates(ctx, d.endDate);
      for (const [i, s] of slots.entries()) {
        const day = ctx.days.find(x => x.date === s.date);
        const taken = slots
          .filter((o, j) => j !== i && o.date === s.date)
          .map(o => ({ start: hourOf(o.startTime), end: hourOf(o.endTime) }));
        const ok = !!day && allowed.includes(s.date) && endHours(day, hourOf(s.startTime), { taken }).some(e => e.end === hourOf(s.endTime));
        if (!ok) return { ok: false, message: `Khung bù ${ddmm(s.date)} ${s.startTime.slice(0, 2)}–${s.endTime.slice(0, 2)}h không chọn được` };
      }
      const dates = leaveDates(ctx, d.startDate, d.endDate);
      const { planned, required } = makeupCounter(ctx, d.startDate, d.endDate, slots);
      if (planned < required) return { ok: false, message: `Còn thiếu ${(required - planned) / 60} giờ bù` };
      if (planned > required) return { ok: false, message: `Chỉ cần xếp ${required / 60} giờ bù` };
      const windows = slots.map(s => ({ date: s.date, start: hourOf(s.startTime), end: hourOf(s.endTime) }));
      return {
        ok: true,
        title: `Nghỉ có làm bù ${rangeText(d.startDate, d.endDate)}`,
        summary: { dates, daysCount: dates.length, makeupMinutesRequired: required, makeupMinutesPlanned: planned },
        warnings: isatWarnings(ctx, d.startDate, d.endDate),
        entry: { kind, claims: dates.map(date => ({ date, status: 'LEAVE_WITH_MAKEUP' })), windows, month: monthOf(d.startDate) },
        facts: [
          ['Ngày nghỉ', longRange(d.startDate, d.endDate)],
          ['Số ngày', String(dates.length)],
          ['Giờ bù', windows.map(w => `${ddmm(w.date)} ${pad(w.start)}–${pad(w.end)}h`).join(', ')],
          ['Lý do', quote(d.reason)]
        ]
      };
    }
    case 'overtime': {
      const d = draft as OvertimeDraft;
      if (!filled(d.otDate, d.startTime, d.endTime, d.reason)) return MISSING;
      if (!isHour(d.startTime) || !isHour(d.endTime)) return { ok: false, message: 'Chỉ chọn giờ tròn' };
      const day = ctx.days.find(x => x.date === d.otDate);
      if (!day) return { ok: false, message: windowText(ctx) };
      const month = monthOf(d.otDate);
      const ends = startDates(ctx, kind).includes(d.otDate) ? endHours(day, hourOf(d.startTime), { capMinutes: otLeftMinutes(ctx, month) }) : [];
      const pick = ends.find(e => e.end === hourOf(d.endTime));
      if (!pick) return { ok: false, message: `Giờ làm thêm ${ddmm(d.otDate)} không chọn được` };
      const info = ctx.months.find(m => m.month === month)!;
      const start = hourOf(d.startTime);
      return {
        ok: true,
        title: `Làm thêm ${ddmm(d.otDate)} ${pad(start)}–${pad(pick.end)}h`,
        summary: { minutes: pick.minutes, monthMinutesAfter: info.otMinutes + pick.minutes },
        warnings: [],
        entry: { kind, claims: [], windows: [{ date: d.otDate, start, end: pick.end }], month },
        facts: [
          ['Ngày', `${DOW_LONG[dowOf(d.otDate)]} ${dmy(d.otDate)}`],
          ['Khung giờ', `${d.startTime}–${d.endTime}`],
          ['Lý do', quote(d.reason)]
        ]
      };
    }
    case 'shift-change': {
      const d = draft as ShiftChangeDraft;
      if (!filled(d.startDate, d.endDate, d.shiftType, d.startTime, d.reason)) return MISSING;
      const frame = ctx.shiftFrames.find(f => f.shiftType === d.shiftType && f.start === d.startTime);
      if (!frame) return MISSING;
      const bad = rangeRefusal(ctx, kind, d.startDate, d.endDate);
      if (bad) return bad;
      // Rút gọn của mock: không kiểm lại khung OT, khung bù đã lưu trên các ngày đổi ca với ca mới; BE kiểm việc đó.
      const work = ctx.days.filter(x => x.date >= d.startDate && x.date <= d.endDate && x.workday);
      for (const x of work) {
        if (x.claim?.status === 'SHIFT_CHANGE')
          return { ok: false, code: 'DAY_CONFLICT', message: `Ngày ${ddmm(x.date)} đã có đơn đổi ca khác` };
        if (pendingIsat(x)) return isatPendingConflict(x.date);
      }
      // Ngày nghỉ và Thứ Bảy có iSAT được duyệt giữ nguyên, kèm cảnh báo; các ngày còn lại đổi ca.
      const keptDays = work.filter(x => x.claim);
      const kept = keptDays.map(x => x.date);
      const dates = work.filter(x => !x.claim).map(x => x.date);
      if (!dates.length)
        return keptDays.length && keptDays.every(approvedIsat)
          ? isatApprovedConflict(kept[0])
          : { ok: false, message: 'Khoảng đổi ca không có ngày làm việc' };
      const label = `${FRAME_LABEL[frame.shiftType] ?? frame.shiftType} ${frame.start.slice(0, 2)}–${frame.end.slice(0, 2)}`;
      return {
        ok: true,
        title: `Đổi ca ${label}, ${rangeText(d.startDate, d.endDate)}`,
        summary: { dates, keptDates: kept },
        warnings: keptDays.map(x =>
          approvedIsat(x) ? isatSkipped(x.date) : `Ngày ${ddmm(x.date)} đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.`
        ),
        entry: {
          kind,
          claims: dates.map(date => ({ date, status: 'SHIFT_CHANGE' })),
          windows: [],
          frame: { type: frame.shiftType, start: frame.start, end: frame.end }
        },
        facts: [
          ['Ngày', longRange(d.startDate, d.endDate)],
          ['Ca mới', `${FRAME_LABEL[frame.shiftType] ?? frame.shiftType} ${frame.start}–${frame.end}`],
          ['Ngày đổi', dayList(dates)],
          ...(kept.length ? [['Giữ nguyên ngày nghỉ', dayList(kept)] as [string, string]] : []),
          ['Lý do', quote(d.reason)]
        ]
      };
    }
    case 'explanation': {
      const d = draft as ExplanationDraft;
      if (!filled(d.workDate, d.reason)) return MISSING;
      const due = ctx.explanationDays.find(x => x.date === d.workDate);
      if (!due) {
        if (monthOf(d.workDate) < FIRST_OPEN_MONTH) return { ok: false, message: `Tháng ${monthNo(d.workDate)} đã chốt công` };
        const filed = ENTRIES.some(e => e.explanationDate === d.workDate && statusOf(e) !== 'cancel');
        return {
          ok: false,
          message: filed ? `Ngày ${ddmm(d.workDate)} đã có đơn giải trình` : `Ngày ${ddmm(d.workDate)} không có gì cần giải trình`
        };
      }
      if ((due.needs.checkIn && !filled(d.actualCheckIn)) || (due.needs.checkOut && !filled(d.actualCheckOut))) return MISSING;
      if ((due.needs.checkIn && !isTime(d.actualCheckIn)) || (due.needs.checkOut && !isTime(d.actualCheckOut)))
        return { ok: false, message: 'Giờ thực tế dạng HH:MM' };
      if (due.needs.checkIn && due.needs.checkOut && toMin(d.actualCheckOut!) <= toMin(d.actualCheckIn!))
        return { ok: false, message: 'Giờ ra phải sau giờ vào' };
      const rec = dayRecord(d.workDate);
      const inAt = due.needs.checkIn ? d.actualCheckIn! : rec?.in;
      return {
        ok: true,
        title: `Giải trình ${ddmm(d.workDate)}`,
        summary: { cases: due.cases, needs: due.needs },
        warnings: [],
        entry: { kind, claims: [], windows: [], explanationDate: d.workDate },
        facts: [
          ['Ngày', `${DOW_LONG[dowOf(d.workDate)]} ${dmy(d.workDate)}`],
          ['Trường hợp', caseText(due.cases)],
          ...(inAt ? [[due.needs.checkIn ? 'Giờ vào khai' : 'Giờ vào', inAt] as [string, string]] : []),
          ...(due.needs.checkOut ? [['Giờ ra khai', d.actualCheckOut!] as [string, string]] : []),
          ['Lý do', quote(d.reason)]
        ]
      };
    }
    case 'advance': {
      const adv = advanceState(ctx.today);
      if (!adv.advance) return { ok: false, message: adv.block === 'not-filing-day' ? 'Chỉ nộp tạm ứng ngày 16 và 17' : adv.reason };
      const advance = adv.advance;
      return {
        ok: true,
        title: `Tạm ứng lương tháng ${monthNo(advance.from)}`,
        summary: { month: advance.month, amount: advance.amount, workDays: advance.workDays },
        warnings: [],
        entry: { kind, claims: [], windows: [], month: advance.month },
        facts: [
          ['Số tiền', `${vnd(advance.amount)} ₫`],
          ['Trừ vào lương', `Tháng ${monthNo(advance.from)}/${advance.month.slice(0, 4)}`]
        ]
      };
    }
  }
}

export function previewRequest<K extends RequestKind>(kind: K, draft: RequestDraft[K]): PreviewResult<K> {
  const r = build(requestContext(), kind, draft);
  return (r.ok ? { ok: true, title: r.title, summary: r.summary, warnings: r.warnings } : r) as PreviewResult<K>;
}

/** Tạo đơn: xem trước rồi lưu; xem trước không hợp lệ thì từ chối với đúng câu lỗi đó. */
export function createRequest<K extends RequestKind>(kind: K, draft: RequestDraft[K]): { ok: true; id: string } | Refusal {
  const ctx = requestContext();
  const r = build(ctx, kind, draft);
  if (!r.ok) return r;
  const id = `yc-moi-${++seq}`;
  ENTRIES.push({ id, ...r.entry });
  const steps: RequestStep[] = [
    { label: 'Đã gửi', at: `${ddmm(ctx.today)} ${nowTime()}`, state: 'done', note: null },
    { label: 'Chờ Admin duyệt', at: null, state: 'pend', note: null }
  ];
  addRequest({
    id,
    icon: KIND_ICON[kind],
    title: r.title,
    status: 'pend',
    statusText: STATUS_TEXT.pend,
    month: monthOf(ctx.today),
    kindLabel: KIND_LABEL[kind],
    facts: r.facts,
    steps
  });
  return { ok: true, id };
}

/** Huỷ đơn đang chờ duyệt của mình; các ngày, khung giờ đơn giữ được trả lại (spec 2.6). */
export function cancelRequest(id: string): { ok: true } | Refusal {
  const r = requestDetail(id);
  if (!r) return { ok: false, message: 'Không tìm thấy đơn' };
  if (r.status !== 'pend') return { ok: false, message: 'Chỉ huỷ được đơn đang chờ duyệt' };
  updateRequest(id, {
    status: 'cancel',
    statusText: STATUS_TEXT.cancel,
    steps: [
      ...r.steps.filter(s => s.state !== 'pend'),
      { label: 'Đã huỷ', at: `${ddmm(mockRequestToday())} ${nowTime()}`, state: 'cancel', note: null }
    ]
  });
  return { ok: true };
}
