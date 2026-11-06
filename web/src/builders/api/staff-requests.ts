// Form tạo yêu cầu của nhân viên (J8–J10, K3): hàm thuần biến request-context (spec staff-requests 2.1) thành lựa chọn
// của các ô và dòng chữ. Chỉ đưa ra lựa chọn hợp lệ (spec 4.4). Import tương đối để chạy được bằng node:test.
import type {
  AdvanceInfo,
  ContextDay,
  ExplanationCase,
  HalfShift,
  HourEnd,
  HourSlot,
  MakeupSlot,
  PreviewResult,
  RequestContext,
  RequestDraft,
  RequestKind,
  TimeRange
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

const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const monthOf = (iso: string) => iso.slice(0, 7);
const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2));

/** '2026-11-13' → 'T6 13/11' */
export const dateLabel = (iso: string) => `${DOW_SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${ddmm(iso)}`;

// Mọi lựa chọn ngày, số ngày, số phút bù, giờ OT còn lại đều do BE tính (request-context: choices, days, months, rules; kế hoạch
// bù của form Nghỉ có làm bù: POST /me/requests/leave-with-makeup/plan). Các hàm dưới tra cứu và ghép chữ.

type RangeKind = 'leave' | 'leave-with-makeup' | 'shift-change';
const rangeChoice = (ctx: RequestContext, kind: RangeKind, start: string, end: string) =>
  ctx.choices[kind].ends[start]?.find(e => e.date === end);

/** "Từ ngày" (hoặc ngày duy nhất) chọn được của từng loại, tăng dần; Giải trình theo thứ tự explanationDays. */
export function startDates(ctx: RequestContext, kind: RequestKind): string[] {
  switch (kind) {
    case 'leave':
    case 'leave-with-makeup':
    case 'shift-change':
      return ctx.choices[kind].starts;
    case 'overtime':
      return ctx.choices.overtime.dates;
    case 'half-shift-leave':
      return ctx.choices['half-shift-leave']?.dates ?? [];
    case 'explanation':
      return ctx.explanationDays.map(d => d.date);
    default:
      return [];
  }
}

/** "Đến ngày" chọn được khi "Từ ngày" là `start` (rỗng khi `start` không chọn được hoặc loại chỉ có một ngày). */
export function endDates(ctx: RequestContext, kind: RequestKind, start: string): string[] {
  if (kind !== 'leave' && kind !== 'leave-with-makeup' && kind !== 'shift-change') return [];
  return (ctx.choices[kind].ends[start] ?? []).map(e => e.date);
}

/** Giữ "Đến ngày" khi còn hợp lệ với "Từ ngày" mới, không thì đặt lại về lựa chọn đầu (chính "Từ ngày"). */
export function fitEnd(ctx: RequestContext, kind: RequestKind, start: string, end: string): string {
  const ends = endDates(ctx, kind, start);
  return ends.includes(end) ? end : (ends[0] ?? '');
}

/** Ngày bù chọn được theo ngày nghỉ cuối (BE: sau đó, cùng tháng, còn giờ trống). */
export function slotDates(ctx: RequestContext, leaveEnd: string): string[] {
  return ctx.choices['leave-with-makeup'].slotDates[leaveEnd] ?? [];
}

/** Giờ bắt đầu chọn được của một bảng giờ (ngày bù: `hours`; OT: `otHours`). */
export const startHours = (hours: HourSlot[]): number[] => hours.map(h => h.start);
/** Giờ kết thúc chọn được khi giờ bắt đầu là `start`. */
export const endHours = (hours: HourSlot[], start: number): HourEnd[] => hours.find(h => h.start === start)?.ends ?? [];

const minutesIn = (hours: HourSlot[], start: number, end: number) =>
  hours.find(h => h.start === start)?.ends.find(e => e.end === end)?.minutes ?? 0;

// Ngày của khoảng mà đơn giữ, theo cờ BE đặt trên từng ngày.
const keptDates = (ctx: RequestContext, start: string, end: string, flag: 'leaveCounted' | 'shiftChangeable') =>
  start && end ? ctx.days.filter(d => d.date >= start && d.date <= end && d[flag]).map(d => d.date) : [];
export const leaveDates = (ctx: RequestContext, start: string, end: string) => keptDates(ctx, start, end, 'leaveCounted');
export const shiftChangeDates = (ctx: RequestContext, start: string, end: string) =>
  keptDates(ctx, start, end, 'shiftChangeable');

// 120 → '2', 270 → '4,5' (giờ, dấu phẩy thập phân).
const hoursText = (minutes: number) => String(Math.round((minutes / 60) * 10) / 10).replace('.', ',');

/** Bộ đếm của Nghỉ có làm bù: 'Đã xếp 4 / 8 giờ' (số phút do BE tính, ở đây chỉ ghép chữ). */
export function makeupCountLine(plannedMinutes: number, requiredMinutes: number): string {
  return `Đã xếp ${hoursText(plannedMinutes)} / ${hoursText(requiredMinutes)} giờ`;
}

/** Dòng phụ của tóm tắt Nghỉ có làm bù (board J14): 'Cần bù 8 giờ, sau ngày nghỉ cuối và trong tháng 11'. */
export function makeupNeedLine(requiredMinutes: number, endDate: string): string {
  const required = requiredMinutes;
  return required ? `Cần bù ${hoursText(required)} giờ, sau ngày nghỉ cuối và trong tháng ${Number(endDate.slice(5, 7))}` : '';
}

/** Giờ OT đã đăng ký của tháng (đơn chờ duyệt và đã duyệt) trên trần: 'Đã đăng ký tháng 10: 9 / 40 giờ'. */
export function otMonthLine(ctx: RequestContext, month: string): string {
  const m = ctx.months.find(x => x.month === month);
  return m ? `Đã đăng ký tháng ${Number(month.slice(5, 7))}: ${hoursText(m.otMinutes)} / ${hoursText(m.otCapMinutes)} giờ` : '';
}

/**
 * Nợ nghỉ giữa ca của tháng trong form Làm thêm giờ (yêu cầu FE của BE mục 2), số do BE tính (`months[].halfShiftDebt`):
 * 'Nợ nghỉ giữa ca tháng 11: đã đăng ký bù 2 / 4 giờ, còn 2 giờ' và dòng ghi chú cách trả. Tháng không nợ thì rỗng.
 */
export function otDebtLines(ctx: RequestContext, month: string): string[] {
  const debt = ctx.months.find(x => x.month === month)?.halfShiftDebt;
  if (!debt || debt.owedMinutes <= 0) return [];
  return [
    `Nợ nghỉ giữa ca tháng ${Number(month.slice(5, 7))}: đã đăng ký bù ${hoursText(debt.registeredMinutes)} / ${hoursText(debt.owedMinutes)} giờ, còn ${hoursText(Math.max(0, debt.remainingMinutes))} giờ`,
    'Giờ làm thêm trong tháng trả nợ trước: ×1, không phụ cấp'
  ];
}

/**
 * Trần phút một khung OT của tháng: tháng có Nghỉ có làm bù mà còn nợ nghỉ giữa ca thì OT chỉ để trả nợ, nên khung không vượt
 * phần nợ còn lại (BE kiểm lại khi nộp). Tháng khác không có trần ở đây (Infinity): `otHours` của BE đã đủ.
 */
export function otCapMinutes(ctx: RequestContext, month: string): number {
  const m = ctx.months.find(x => x.month === month);
  const left = m?.halfShiftDebt?.remainingMinutes ?? 0;
  return m?.hasMakeupLeave && left > 0 ? left : Infinity;
}

/** Bảng giờ OT của ngày sau trần `otCapMinutes`: bỏ giờ kết thúc vượt trần, bỏ giờ bắt đầu không còn giờ kết thúc. */
export function otHoursOf(ctx: RequestContext, day: ContextDay): HourSlot[] {
  const cap = otCapMinutes(ctx, day.date.slice(0, 7));
  if (cap === Infinity) return day.otHours;
  return day.otHours.map(h => ({ start: h.start, ends: h.ends.filter(e => e.minutes <= cap) })).filter(h => h.ends.length > 0);
}

/** Ngày OT chọn được: ngày BE đưa, còn ít nhất một khung sau trần `otCapMinutes`. */
export function otDates(ctx: RequestContext): string[] {
  return ctx.choices.overtime.dates.filter(date => {
    const day = ctx.days.find(d => d.date === date);
    return !!day && otHoursOf(ctx, day).length > 0;
  });
}

// ---------- Nghỉ giữa ca ----------

const HALVES: HalfShift[] = ['FIRST', 'SECOND'];
const span = (r: TimeRange) => `${r.start}–${r.end}`;

/** Hai nửa ca của ngày do BE chia (`days[].halfShift`): 'Làm 08:00–12:00, nghỉ 13:00–17:00'. Ngày không chọn được thì rỗng. */
export function halfShiftChoices(ctx: RequestContext, date: string): { half: HalfShift; label: string }[] {
  const options = ctx.days.find(d => d.date === date)?.halfShift;
  if (!options) return [];
  return HALVES.map(half => ({ half, label: `Làm ${span(options[half].work)}, nghỉ ${span(options[half].leave)}` }));
}

/** Tóm tắt Nghỉ giữa ca từ lần xem trước của BE: 'Còn 4 giờ cần bù' và tháng phải bù. */
export function halfShiftOwedLines(summary: { date: string; owedMinutes: number }): string[] {
  return [`Còn ${hoursText(summary.owedMinutes)} giờ cần bù`, `Bù bằng Làm thêm giờ trong tháng ${Number(summary.date.slice(5, 7))}`];
}

/**
 * Số giờ của khung OT đang chọn (board J15): '2 giờ làm thêm, sau ca 08–17'. Số phút lấy từ `hours` (BE đã trừ giờ nghỉ).
 * Ngày không có ca chỉ ghi số giờ.
 */
export function otHoursLine(day: ContextDay, start: number, end: number): string {
  const text = `${hoursText(minutesIn(day.otHours, start, end))} giờ làm thêm`;
  if (!day.shift) return text;
  const from = hourOf(day.shift.start);
  const to = hourOf(day.shift.end);
  const before = to > from && end <= from;
  return `${text}, ${before ? 'trước' : 'sau'} ca ${day.shift.start.slice(0, 2)}–${day.shift.end.slice(0, 2)}`;
}

const FRAME_NAME: Record<string, string> = { NORMAL: 'Normal', FLEX: 'Flex', NIGHT: 'Night' };
/** Tên khung ca (spec 2.4): 'FLEX', '06:00', '15:00' → 'Flex 06–15'. Không rõ loại (type rỗng) thì chỉ ghi giờ: '10–19'. */
export const frameLabel = (type: string, start: string, end: string) =>
  [FRAME_NAME[type] ?? type, `${start.slice(0, 2)}–${end.slice(0, 2)}`].filter(Boolean).join(' ');

/** Tóm tắt Đổi ca (board J16): '5 ngày đổi sang Flex 06–15: 02, 03, 05, 06 và 07/11'. Rỗng khi khoảng không có ngày đổi. */
export function shiftChangeSummary(ctx: RequestContext, start: string, end: string, frame: string): string {
  const dates = shiftChangeDates(ctx, start, end);
  const count = rangeChoice(ctx, 'shift-change', start, end)?.daysCount ?? 0;
  return count ? `${count} ngày đổi sang ${frame}: ${dayList(dates)}` : '';
}

// ['2026-11-13', '2026-11-14', '2026-11-16'] → '13, 14 và 16/11'; khác tháng ghi tháng sau ngày cuối của tháng đó.
export function dayList(dates: string[]): string {
  const parts = dates.map((d, i) => (dates[i + 1] && monthOf(dates[i + 1]) === monthOf(d) ? d.slice(8, 10) : ddmm(d)));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** Dòng tóm tắt do máy đếm: '3 ngày làm việc: 13, 14 và 16/11'. Rỗng khi khoảng không có ngày làm. */
export function leaveSummary(ctx: RequestContext, start: string, end: string): string {
  const dates = leaveDates(ctx, start, end);
  const count = rangeChoice(ctx, 'leave', start, end)?.daysCount ?? rangeChoice(ctx, 'leave-with-makeup', start, end)?.daysCount ?? 0;
  return count ? `${count} ngày làm việc: ${dayList(dates)}` : '';
}

/** Mã hình thức nghỉ trừ vào số ngày phép năm còn lại (spec 2.1 leaveTypes). */
export const ANNUAL_LEAVE = 'ANNUAL';

/**
 * Dòng số dư dưới tóm tắt Đơn nghỉ, do máy đếm như leaveSummary: 'Phép năm còn 11 ngày, sau đơn này còn 9' (board J9).
 * Rỗng khi không phải Phép năm, nhân viên không có phép năm, hay chưa đủ hai ngày. Xin quá số còn lại thì chỉ ghi số còn
 * lại; xem trước từ chối và nói vì sao (brief FE mục 2).
 */
export function leaveBalance(ctx: RequestContext, leaveType: string, start: string, end: string): string {
  const left = ctx.annualLeaveLeft;
  const after = rangeChoice(ctx, 'leave', start, end)?.annualLeaveLeftAfter;
  if (leaveType !== ANNUAL_LEAVE || left === null || after === undefined || after === null) return '';
  return after < 0 ? `Phép năm còn ${left} ngày` : `Phép năm còn ${left} ngày, sau đơn này còn ${after}`;
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

/** Dòng chi tiết dưới trường hợp (board J17): giờ chấm thực của ngày, vd. 'Giờ vào 07:52, không có giờ ra'. */
export function caseDetail(day: { checkIn: string | null; checkOut: string | null }): string {
  const { checkIn: i, checkOut: o } = day;
  if (i && o) return `Giờ vào ${i}, giờ ra ${o}`;
  if (i) return `Giờ vào ${i}, không có giờ ra`;
  if (o) return `Giờ ra ${o}, không có giờ vào`;
  return 'Không có giờ vào, không có giờ ra';
}

/** Hai dòng của form Tạm ứng: số tiền và cách tính. */
export function advanceLines(advance: AdvanceInfo): [string, string] {
  return [
    `Số tiền được ứng: ${vnd(advance.amount)} ₫`,
    `${advance.ratePct}% lương ngày công ${advance.from.slice(8, 10)}–${ddmm(advance.to)} · ${advance.workDays} ngày`
  ];
}

// ---------- Nối máy chủ thật (Task 11) ----------

/** Phần của `api` (services/http) mà luồng yêu cầu dùng; test thay bằng bản ghi lại lời gọi. */
export type RequestsApi = {
  get(path: string): Promise<any>;
  post(path: string, body: unknown): Promise<any>;
  patch(path: string, body: unknown): Promise<any>;
};

/**
 * request-context của máy chủ thật → `RequestContext` của form. Khác biệt duy nhất: ngày làm của máy chủ chỉ có
 * `shift: { start, end }`, còn form đọc `shift.type`. `type` lấy từ khung ca (`shiftFrames`) cùng giờ; không khung nào khớp
 * (vd. ca 10–19) thì `type` rỗng và `frameLabel` chỉ ghi giờ. Không đổi đầu vào.
 */
export function contextFromApi(ctx: Omit<RequestContext, 'days'> & { days: Array<Omit<ContextDay, 'shift'> & { shift: { start: string; end: string; type?: string } | null }> }): RequestContext {
  const typeOf = (start: string, end: string) => ctx.shiftFrames.find(f => f.start === start && f.end === end)?.shiftType ?? '';
  return {
    ...ctx,
    days: ctx.days.map(d => ({
      ...d,
      shift: d.shift && { type: d.shift.type ?? typeOf(d.shift.start, d.shift.end), start: d.shift.start, end: d.shift.end }
    }))
  };
}

/** Bốn lời gọi của luồng yêu cầu trên máy chủ thật (me.controller). Server từ chối thì `api` ném ApiError mang câu lỗi của server. */
export function staffRequestsClient(api: RequestsApi) {
  return {
    getRequestContext: async (): Promise<RequestContext> => contextFromApi(await api.get('/me/request-context')),
    /** Luôn 200: `ok: false` kèm câu lỗi khi đơn chưa gửi được. */
    previewRequest: <K extends RequestKind>(kind: K, draft: RequestDraft[K]): Promise<PreviewResult<K>> =>
      api.post(`/me/requests/${kind}/preview`, draft),
    /** 201 `{ created, request, warnings }`: id đơn ở `request.id`. */
    createRequest: async <K extends RequestKind>(kind: K, draft: RequestDraft[K]): Promise<{ id: string }> => {
      const body = await api.post(`/me/requests/${kind}`, draft);
      return { id: body.request.id };
    },
    cancelRequest: async (id: string): Promise<void> => {
      await api.patch(`/me/requests/${encodeURIComponent(id)}/cancel`, {});
    }
  };
}
