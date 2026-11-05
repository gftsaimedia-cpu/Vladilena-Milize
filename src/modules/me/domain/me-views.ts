// Hàm thuần dựng dữ liệu "của tôi" từ bảng công và đơn từ: ngày theo giờ Việt Nam, tuần thứ Hai – Chủ nhật,
// một ô ngày công, công cả tháng và các bước của một đơn.

export type DayKind = 'work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'future';
export type DaySummary = { date: string; kind: DayKind; in: string | null; out: string | null; lateMinutes: number };

export type TimesheetLike = {
  workDate: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  status: string;
  checkInStatus: string;
  checkOutStatus: string;
  metrics?: { lateMinutes?: number };
};

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

/** Một ngày công của chính mình. Thiếu giờ vào hoặc ra ở ngày đã qua là "todo" (cần giải trình). */
export function daySummaryOf(ts: TimesheetLike | undefined, date: string, today: string): DaySummary {
  const empty = { date, in: null, out: null, lateMinutes: 0 };
  if (!ts) {
    if (dow(date) === 0) return { ...empty, kind: 'off' };
    return { ...empty, kind: date > today ? 'future' : 'absent' };
  }
  if (ts.status === 'LEAVE_PAID' || ts.status === 'LEAVE_UNPAID' || ts.status === 'HOLIDAY') return { ...empty, kind: 'leave' };
  const cin = hhmm(ts.actualCheckIn);
  const cout = hhmm(ts.actualCheckOut);
  const lateMinutes = ts.metrics?.lateMinutes || 0;
  let kind: DayKind;
  if (!cin && !cout) kind = date > today ? 'future' : 'absent';
  else if (!cin || !cout) kind = date === today ? 'work' : 'todo';
  else kind = ts.checkInStatus === 'LATE' || ts.checkOutStatus === 'EARLY' ? 'late' : 'work';
  return { date, kind, in: cin, out: cout, lateMinutes };
}

/** Công cả tháng: một ô mỗi ngày và số đếm (ngày công chuẩn = các ngày thứ Hai – thứ Bảy của tháng). */
export function monthOf(timesheets: TimesheetLike[], month: string, today: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const by = new Map(timesheets.map(t => [t.workDate, t]));
  const days = Array.from({ length: last }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return daySummaryOf(by.get(date), date, today);
  });
  return {
    month,
    totals: {
      workDays: days.filter(d => d.kind === 'work' || d.kind === 'late').length,
      standardDays: days.filter(d => dow(d.date) !== 0).length,
      lateCount: days.filter(d => d.kind === 'late').length,
      paidLeaveDays: timesheets.filter(t => t.workDate.startsWith(month) && (t.status === 'LEAVE_PAID' || t.status === 'HOLIDAY')).length
    },
    days
  };
}

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
