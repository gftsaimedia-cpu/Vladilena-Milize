// Hàm thuần của màn Admin gộp: ô ngày chấm công (MỘT định nghĩa cho lưới tuần, hồ sơ tháng và chi tiết ngày),
// đếm, nhãn. FE chỉ định dạng và hiển thị những gì ở đây.
import type { Day } from '../../calendar/domain/day';
import type { DayTag } from '../../calendar/domain/day-tag';
import { daySummaryOf, type DayCase, type DaySummary, type ExplanationState, type TimesheetLike } from '../../me/domain';

/** Loại ô như màn Chấm công: `fu` = ngày làm sắp tới, `nocheck` = hôm nay chưa chấm vào (chưa phải vắng). */
export type CellKind = 'work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'fu' | 'nocheck';

export type Cell = {
  date: string;
  /** Thứ viết tắt ('T2'…'CN') và ngày trong tháng ('5'), để FE khỏi tính. */
  dow: string;
  day: string;
  today: boolean;
  /** Loại sau lớp "cần xử lý" (đơn chờ duyệt hoặc ngày cần giải trình). */
  kind: CellKind;
  /** Loại gốc, trước lớp "cần xử lý". */
  base: CellKind;
  text: string;
  in: string | null;
  out: string | null;
  /** Đang làm: có giờ vào, chưa có giờ ra, và là hôm nay. */
  live: boolean;
  lateMinutes: number;
  explanationStatus: ExplanationState;
  cases: DayCase[];
  /** Id việc phủ lên ô: id đơn chờ duyệt, hoặc `due:<uuid>:<ngày>` của ngày cần giải trình; null khi ô không có việc. */
  itemId: string | null;
  label: string;
  aria: string;
  /** Nhãn dùng chung với lịch nhân viên (ngày là gì, ca, OT/bù, nghỉ, giải trình); vắng khi nơi gọi chưa dựng lịch tháng (lưới tuần). */
  tag?: DayTag;
};

export const CELL_LABELS: Record<CellKind, string> = {
  work: 'Đi làm',
  late: 'Đi muộn',
  leave: 'Nghỉ có phép',
  absent: 'Vắng',
  todo: 'Cần xử lý',
  off: 'Không có ca',
  fu: 'Ca dự kiến',
  nocheck: 'Chưa Check-in'
};

const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DOW_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const dowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const dowShort = (iso: string) => DOW_SHORT[dowOf(iso)];
export const weekdayName = (iso: string) => DOW_LONG[dowOf(iso)];
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const mondayOf = (iso: string) => addDays(iso, -((dowOf(iso) + 6) % 7));
export const initialsOf = (name = '') => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return (w.length >= 2 ? [w[w.length - 2], w[w.length - 1]] : [w[0]]).map(s => s[0].toUpperCase()).join('');
};
/** Bỏ dấu, viết thường, để tìm tên không phân biệt dấu. */
export const foldText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

function baseKindOf(d: DaySummary, ts: TimesheetLike | undefined, date: string, today: string): CellKind {
  switch (d.kind) {
    case 'future': return 'fu';
    case 'outside': return 'off';
    case 'extra': return 'work';
    case 'todo':
    case 'leave':
    case 'off':
    case 'late':
      return d.kind;
    case 'absent':
      return date === today && !d.in ? 'nocheck' : 'absent';
    default: // work
      if (!d.in && date === today) return 'nocheck';
      // Dòng ngày chờ tính mà quá khứ không có lần chấm nào: không phải đi làm.
      if (!d.in && !d.out && ts?.status === 'PENDING') return 'absent';
      return 'work';
  }
}

/**
 * Một ô ngày của một người. `shiftText` ('HC 08:00–17:00') là chữ của ô ngày làm chưa có giờ; `item` là đơn chờ duyệt rơi
 * vào ngày (phủ lên thành `todo`). Ngày hôm nay chưa chấm vào là `nocheck`, không phải `absent`; ngày ngoài tuần làm là `off`.
 */
export function cellOf(
  ts: TimesheetLike | undefined,
  date: string,
  today: string,
  weekdays: readonly number[] | undefined,
  shiftText: string,
  item: { id: string; what: string } | null = null,
  day?: Day
): Cell {
  const d = daySummaryOf(ts, date, today, weekdays, day);
  const base = baseKindOf(d, ts, date, today);
  const kind: CellKind = item ? 'todo' : base;
  const live = !!d.in && !d.out && date === today && (base === 'work' || base === 'late' || base === 'todo');
  let text = '';
  switch (base) {
    case 'work':
    case 'late':
    case 'todo':
      text = `${d.in ?? '?'}–${d.out ?? (live ? '…' : '?')}`;
      break;
    case 'leave':
      text = d.leave === 'holiday' ? 'Nghỉ lễ' : 'Nghỉ';
      break;
    case 'absent':
      text = '—';
      break;
    case 'fu':
    case 'nocheck':
      text = shiftText;
      break;
  }
  const lateOnlyEarly = d.cases.some(c => c.code === 'EARLY_CHECK_OUT') && !d.cases.some(c => c.code === 'LATE_CHECK_IN');
  const label = kind === 'late' && lateOnlyEarly ? 'Về sớm' : CELL_LABELS[kind];
  const aria = item
    ? `Cần xử lý, ${item.what}`
    : `${CELL_LABELS[base]}${text && base !== 'off' ? `, ${text}` : ''}${live ? ', đang làm' : ''}${d.explanationStatus === 'expired' ? ', quá hạn giải trình' : ''}`;
  return {
    date,
    dow: dowShort(date),
    day: String(Number(date.slice(8, 10))),
    today: date === today,
    kind,
    base,
    text,
    in: d.in,
    out: d.out,
    live,
    lateMinutes: d.lateMinutes,
    explanationStatus: d.explanationStatus,
    cases: d.cases,
    itemId: item?.id ?? null,
    label,
    aria,
    ...(d.tag ? { tag: d.tag } : {})
  };
}

/** Có mặt = đã có giờ vào và ô là đi làm / muộn / cần xử lý. */
export const isPresent = (c: Cell) => !!c.in && (c.base === 'work' || c.base === 'late' || c.base === 'todo');

/** Chữ ca: 'HC 08:00–17:00'. */
export const shiftText = (shift: { type: string; startTime: string; endTime: string }) =>
  `${shift.type === 'NORMAL' ? 'HC' : shift.type} ${shift.startTime}–${shift.endTime}`;

const CASE_TEXT: Record<string, string> = {
  LATE_CHECK_IN: 'Vào muộn',
  EARLY_CHECK_IN: 'Vào sớm',
  EARLY_CHECK_OUT: 'Ra sớm',
  FORGOT_CHECK_OUT: 'Quên check-out',
  MISSING_CHECK_IN: 'Thiếu giờ vào',
  MISSING_CHECK_OUT: 'Thiếu giờ ra'
};
/** Chữ các trường hợp giải trình; thiếu cả giờ vào lẫn giờ ra là "Quên chấm công". */
export function caseText(cases: string[]): string {
  const both = cases.includes('MISSING_CHECK_IN') && cases.includes('MISSING_CHECK_OUT');
  const words = cases.filter(c => !(both && c.startsWith('MISSING_'))).map(c => CASE_TEXT[c] ?? c);
  return (both ? ['Quên chấm công', ...words] : words).join(' · ');
}

/** Tuổi của việc: "35 phút", "3 giờ", "2 ngày". */
export function ageText(createdAt: string, nowMs: number): string {
  const min = Math.max(0, Math.floor((nowMs - Date.parse(createdAt)) / 60000));
  if (min < 60) return `${min} phút`;
  if (min < 1440) return `${Math.floor(min / 60)} giờ`;
  return `${Math.floor(min / 1440)} ngày`;
}

export const STATUS_TEXT: Record<string, string> = {
  tts: 'Thực tập sinh',
  ctv: 'Cộng tác viên',
  thuviec: 'Thử việc',
  nv: 'Nhân viên chính thức',
  nghiviec: 'Đã nghỉ việc'
};

export const PERIOD_LABELS: Record<string, string> = {
  open: 'Đang mở',
  attendance_locked: 'Đã chốt công',
  calculated: 'Chờ duyệt',
  approved: 'Đã phê duyệt',
  paid: 'Đã trả lương'
};

export type SlipState = 'done' | 'pending' | 'draft' | 'rejected';
/** Trạng thái phiếu cho màn: đã duyệt / đã chốt → xong; chờ duyệt, từ chối giữ nguyên; còn lại là nháp. */
export const slipStateOf = (s: string): SlipState =>
  s === 'final' || s === 'approved' ? 'done' : s === 'rejected' ? 'rejected' : s === 'pending' ? 'pending' : 'draft';

export type InboxGroup = 'att' | 'leave' | 'ot' | 'exp' | 'adv';
export const GROUP_LABELS: Record<InboxGroup, string> = {
  att: 'Chấm công',
  leave: 'Đơn nghỉ',
  ot: 'Làm thêm, làm bù',
  exp: 'Giải trình',
  adv: 'Tạm ứng'
};
export const GROUP_OF_TYPE: Record<string, InboxGroup> = {
  LEAVE: 'leave',
  LEAVE_WITH_MAKEUP: 'leave',
  ISAT: 'leave',
  HALF_SHIFT_LEAVE: 'leave',
  OVERTIME: 'ot',
  SHIFT_CHANGE: 'ot',
  EXPLANATION: 'exp',
  ADVANCE: 'adv'
};
export const WHAT_OF_TYPE: Record<string, string> = {
  LEAVE: 'Nghỉ phép',
  LEAVE_WITH_MAKEUP: 'Nghỉ có làm bù',
  ISAT: 'iSAT',
  HALF_SHIFT_LEAVE: 'Nghỉ giữa ca',
  OVERTIME: 'Làm thêm',
  SHIFT_CHANGE: 'Đổi ca',
  EXPLANATION: 'Giải trình',
  ADVANCE: 'Tạm ứng'
};

/** Việc cần admin xử lý: đơn chờ duyệt (`decide`) hoặc ngày cần nhắc giải trình (`remind`). */
export type WorkItem = {
  id: string;
  kind: string;
  group: InboxGroup;
  groupLabel: string;
  action: 'decide' | 'remind';
  username: string;
  name: string;
  initials: string;
  title: string | null;
  what: string;
  when: string;
  days: string[];
  age: string;
};
