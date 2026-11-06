// Hàm thuần dựng dữ liệu "của tôi" từ bảng công và đơn từ: ngày theo giờ Việt Nam, tuần thứ Hai – Chủ nhật,
// một ô ngày công, công cả tháng và các bước của một đơn.

/** Loại ô ngày công, suy ra từ dòng ngày dùng chung (spec attendance-core 8.2). */
export type DayKind = 'work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'future' | 'outside' | 'extra';
/** Loại của một ngày nghỉ, lấy thẳng từ trạng thái dòng ngày. */
export type LeaveKind = 'paid' | 'unpaid' | 'holiday' | 'isat' | 'makeup';
/** Trạng thái giải trình của ngày, chữ thường. */
export type ExplanationState = 'none' | 'pending' | 'approved' | 'rejected';
/** Một trường hợp giải trình đã dò được trên ngày (mã, số phút, có ảnh hưởng tiền hay không). */
export type DayCase = { code: string; minutes: number; affectsPay: boolean };
export type DaySummary = {
  date: string;
  kind: DayKind;
  leave?: LeaveKind;
  in: string | null;
  out: string | null;
  lateMinutes: number;
  /** Không đặt tên là `explanation`: route ngày đã trả đối tượng `explanation` của đơn giải trình. */
  explanationStatus: ExplanationState;
  cases: DayCase[];
};

/** Phần của dòng ngày (DailyTimesheetDTO) mà /me đọc. */
export type TimesheetLike = {
  workDate: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  status: string;
  isLocked?: boolean;
  metrics?: { lateMinutes?: number };
  cases?: DayCase[];
  explanationStatus?: string;
  payUnits?: number;
  deductionMinutes?: number;
  countsAsWorkday?: boolean;
};

const LEAVE_OF: Record<string, LeaveKind> = {
  HOLIDAY: 'holiday',
  ISAT: 'isat',
  LEAVE_PAID: 'paid',
  LEAVE_UNPAID: 'unpaid',
  LEAVE_MAKEUP: 'makeup'
};

const PAID_LEAVE_STATUSES = new Set(['LEAVE_PAID', 'HOLIDAY', 'ISAT']);

const VN_OFFSET_MS = 7 * 3600000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Ngày hôm nay 'YYYY-MM-DD' theo giờ Việt Nam (UTC+7). */
export const vnToday = (now: Date = new Date()) => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** Bảy ngày thứ Hai → Chủ nhật của tuần chứa `date`. */
export function weekOf(date: string): string[] {
  const monday = addDays(date, -((dow(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// Giờ "HH:mm" từ "HH:mm[:ss]" hoặc thời điểm ISO (đổi sang giờ Việt Nam).
function hhmm(v: string | null): string | null {
  if (!v) return null;
  if (/^\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t + VN_OFFSET_MS).toISOString().slice(11, 16);
}

/** Tuần làm mặc định khi chưa biết tuần của người đó: thứ Hai – thứ Bảy (Chủ nhật nghỉ). */
export const DEFAULT_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

const explanationOf = (v: string | undefined): ExplanationState => {
  const x = String(v ?? 'NONE').toLowerCase();
  return x === 'pending' || x === 'approved' || x === 'rejected' ? x : 'none';
};

/** Một ngày công của chính mình, đọc từ dòng ngày (bảng spec 8.2).
 *  `weekdays` là các thứ (0 = Chủ nhật … 6 = thứ Bảy) trong tuần làm của người đó ở tháng của ngày này: chỉ dùng khi
 *  ngày chưa có dòng, thứ không thuộc tuần là "off", không phải "absent". */
export function daySummaryOf(
  ts: TimesheetLike | undefined,
  date: string,
  today: string,
  weekdays: readonly number[] = DEFAULT_WEEKDAYS
): DaySummary {
  const base = { date, in: null, out: null, lateMinutes: 0, explanationStatus: 'none' as ExplanationState, cases: [] as DayCase[] };
  if (!ts) {
    if (!weekdays.includes(dow(date))) return { ...base, kind: 'off' };
    return { ...base, kind: date > today ? 'future' : 'absent' };
  }
  const cases = ts.cases ?? [];
  const explanationStatus = explanationOf(ts.explanationStatus);
  const shown = { date, in: hhmm(ts.actualCheckIn), out: hhmm(ts.actualCheckOut), lateMinutes: ts.metrics?.lateMinutes || 0, explanationStatus, cases };
  const leave = LEAVE_OF[ts.status];
  if (leave) return { ...base, kind: 'leave', leave, explanationStatus, cases };
  switch (ts.status) {
    case 'OUTSIDE':
      return { ...base, kind: 'outside', explanationStatus, cases };
    case 'REST':
      return { ...shown, kind: 'off' };
    case 'EXTRA':
      return { ...shown, kind: 'extra' };
    case 'PENDING':
      return { ...shown, kind: date > today ? 'future' : 'work' };
    case 'ABSENT':
      return { ...shown, kind: 'absent' };
    case 'PRESENT': {
      // Có mã ảnh hưởng tiền mà chưa được duyệt thì còn việc phải giải trình.
      if (cases.some(c => c.affectsPay) && explanationStatus !== 'approved') return { ...shown, kind: 'todo' };
      return { ...shown, kind: (ts.deductionMinutes ?? 0) > 0 ? 'late' : 'work' };
    }
    default:
      return { ...shown, kind: 'off' };
  }
}

/** Công cả tháng: một ô mỗi ngày và số đếm (workDays = số dòng tính là ngày công, ngày công chuẩn = các ngày của tháng có thứ thuộc `weekdays`; controller
 *  thay bằng số chuẩn của cài đặt).
 *  Kỳ công "locked" khi Admin đã Chốt công tháng đó (periodStatus của payroll_periods khác 'open') hoặc tháng có dòng
 *  công đã khoá (cờ chặn chấm công). */
export function monthOf(
  timesheets: TimesheetLike[],
  month: string,
  today: string,
  periodStatus?: string | null,
  weekdays: readonly number[] = DEFAULT_WEEKDAYS
) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const by = new Map(timesheets.map(t => [t.workDate, t]));
  const days = Array.from({ length: last }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return daySummaryOf(by.get(date), date, today, weekdays);
  });
  const inMonth = timesheets.filter(t => t.workDate.startsWith(month));
  return {
    month,
    periodState: (periodStatus && periodStatus !== 'open') || inMonth.some(t => t.isLocked) ? ('locked' as const) : ('open' as const),
    totals: {
      workDays: inMonth.filter(t => t.countsAsWorkday).length,
      standardDays: days.filter(d => weekdays.includes(dow(d.date))).length,
      lateCount: days.filter(d => d.kind === 'late').length,
      // R11: nghỉ hưởng lương gồm phép có lương, lễ có lương và iSAT có lương (payUnits = 1).
      paidLeaveDays: inMonth.filter(t => PAID_LEAVE_STATUSES.has(t.status) && t.payUnits === 1).length
    },
    days
  };
}

/** Các tháng nhân viên được xem: từ tháng vào làm tới tháng hiện tại. Chưa có ngày vào làm (hoặc vào làm sau hôm nay)
 *  thì chỉ tháng hiện tại. */
export function monthRangeOf(startDate: string | null | undefined, today: string): { from: string; to: string } {
  const to = today.slice(0, 7);
  const start = startDate && /^\d{4}-(0[1-9]|1[0-2])/.test(startDate) ? startDate.slice(0, 7) : to;
  return { from: start < to ? start : to, to };
}

/** Tháng 'YYYY-MM' lùi (n âm) hoặc tiến (n dương) n tháng. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Số tháng lùi tối đa khi quét ngày còn cần giải trình trên trang chủ (D9). */
export const ALERT_MONTHS_BACK = 12;

export type RequestStep = { label: string; at: string | null; state: 'done' | 'pend' | 'rej' };

/** Các bước của một đơn: Đã gửi → Chờ duyệt / Đã duyệt / Đã từ chối / Đã huỷ. */
export function stepsOf(r: { status: string; createdAt: string; reviewedAt: string | null; updatedAt?: string }): RequestStep[] {
  const sent: RequestStep = { label: 'Đã gửi', at: r.createdAt, state: 'done' };
  switch (r.status) {
    case 'APPROVED':
      return [sent, { label: 'Đã duyệt', at: r.reviewedAt, state: 'done' }];
    case 'REJECTED':
      return [sent, { label: 'Đã từ chối', at: r.reviewedAt, state: 'rej' }];
    case 'CANCELLED':
      return [sent, { label: 'Đã huỷ', at: r.updatedAt ?? null, state: 'rej' }];
    default:
      return [sent, { label: 'Chờ duyệt', at: null, state: 'pend' }];
  }
}
