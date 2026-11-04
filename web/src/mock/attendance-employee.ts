// Hồ sơ chấm công giả của một nhân viên trong tháng 10/2026: chỉ số, dải 31 ngày, lịch sử có trục giờ.
// Dựng mỗi lần gọi từ ô chấm công (mock/attendance.ts) và các việc còn chờ (mock/inbox.ts); xử lý một việc chỉ đưa ô
// về ghi nhận gốc, không đổi công, trễ, OT hay lương (spec mục 1.3 và 5).
import { dm, dowShort, weekdayName } from '@/utils/format';
import { GROUPS, ROSTER, STANDARD_DAYS, cellOf, type Cell, type CellKind, type GroupKey, type Person } from './attendance';
import { MOCK_MONTH, MOCK_NOW, MOCK_TODAY } from './clock';
import { pendingInbox, type InboxGroup, type InboxItem } from './inbox';

export type StatTile = { label: string; value: string; note: string };
export type StripDay = { date: string; dow: string; day: string; kind: CellKind; today: boolean; aria: string };
export type TrackPart = {
  type: 'shift' | 'bar' | 'lunch' | 'late' | 'miss' | 'tick' | 'now' | 'leave';
  from: number;
  to?: number;
  label?: string;
};
export type HistoryRow = {
  date: string;
  dayLabel: string;
  kind: CellKind;
  range: string;
  sub: string;
  status: string;
  tone: GroupKey | 'nocheck';
  inText: string;
  outText: string;
  parts: TrackPart[];
};
export type HistoryEntry = { type: 'row'; row: HistoryRow } | { type: 'fold'; label: string; rows: HistoryRow[] };
export type EmployeeMonth = {
  pending: { count: number; date: string; text: string } | null;
  stats: StatTile[];
  chips: Record<GroupKey, number>;
  strip: StripDay[];
  history: HistoryEntry[];
};
export type EmployeeView = {
  person: Person;
  month: string;
  index: number; // tính từ 1
  total: number;
  prevId: string | null;
  nextId: string | null;
  data: EmployeeMonth | null;
};

const SHIFT_IN = '08:00';
const SHIFT_OUT = '17:00';
const NOON = '12:00';
const AFTERNOON = '13:00';
const KEEP_ROWS = 5; // 5 dòng đầu của lịch sử luôn hiện
const MIN_FOLD = 3; // từ 3 ngày đi làm liền nhau trở lên thì gộp

// Giờ VN của đồng hồ giả ('09:40').
const NOW = new Date(Date.parse(MOCK_NOW) + 7 * 3600 * 1000).toISOString().slice(11, 16);

/** Trạng thái chờ duyệt theo nhóm việc. */
const WAITING: Record<InboxGroup, string> = {
  att: 'Chưa giải trình',
  leave: 'Chờ duyệt đơn nghỉ',
  ot: 'Chờ duyệt',
  exp: 'Chờ duyệt giải trình',
  adv: 'Chờ duyệt'
};

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const duration = (from: number, to: number) => `${Math.floor((to - from) / 60)}g ${String((to - from) % 60).padStart(2, '0')}p`;

/** Vị trí (phần trăm) của một giờ 'HH:MM' trên trục 06:00–20:00, làm tròn 2 chữ số. */
export function pct(t: string): number {
  return Math.round(((mins(t) / 60 - 6) / 15) * 10000) / 100;
}

// ---- Dòng lịch sử ----

function trackOf(cell: Cell, item: InboxItem | null): TrackPart[] {
  const parts: TrackPart[] = [{ type: 'shift', from: pct(SHIFT_IN), to: pct(SHIFT_OUT) }];
  if (cell.base === 'leave') {
    parts.push({ type: 'leave', from: pct(SHIFT_IN), to: pct(SHIFT_OUT), label: cell.text });
    return parts;
  }
  if (cell.base !== 'work' && cell.base !== 'late') return parts;

  const end = cell.live ? NOW : cell.out;
  if (cell.base === 'late' && cell.in && mins(cell.in) > mins(SHIFT_IN)) {
    parts.push({ type: 'late', from: pct(SHIFT_IN), to: pct(cell.in) });
  }
  if (cell.in && end) {
    parts.push({ type: 'bar', from: pct(cell.in), to: pct(end) });
    if (mins(cell.in) <= mins(NOON) && mins(end) >= mins(AFTERNOON)) {
      parts.push({ type: 'lunch', from: pct(NOON), to: pct(AFTERNOON) });
    }
  } else if (!cell.live) {
    const known = cell.in ?? cell.out;
    if (known) parts.push({ type: 'tick', from: pct(known) });
  }
  if (cell.kind === 'todo' && item?.declared) {
    parts.push({ type: 'miss', from: pct(item.declared.from), to: pct(item.declared.to) });
  }
  if (cell.live) parts.push({ type: 'now', from: pct(NOW) });
  return parts;
}

/** Dòng phụ của ô đi làm hoặc đi muộn. */
function presence(cell: Cell): string {
  const { in: i, out: o } = cell;
  if (cell.live && i) return `Đang làm · ${duration(mins(i), mins(NOW))}`;
  if (cell.base === 'late') {
    const head =
      i && mins(i) > mins(SHIFT_IN)
        ? `Trễ ${mins(i) - mins(SHIFT_IN)} phút`
        : o && mins(o) < mins(SHIFT_OUT)
          ? `Về sớm ${mins(SHIFT_OUT) - mins(o)} phút`
          : cell.label;
    if (!o) return `${head} · chưa có giờ ra`;
    return i ? `${head} · Có mặt ${duration(mins(i), mins(o))}` : head;
  }
  if (i && o) return `Có mặt ${duration(mins(i), mins(o))}`;
  return o ? 'Chưa có giờ vào' : 'Chưa có giờ ra';
}

function rowOf(cell: Cell, item: InboxItem | null): HistoryRow {
  const timed = cell.base === 'work' || cell.base === 'late';
  let range = 'Cả ngày';
  let sub = cell.text;
  if (timed) {
    range = `${cell.in ?? '?'} – ${cell.live ? '…' : (cell.out ?? '?')}`;
    sub = presence(cell);
  } else if (cell.base === 'absent') {
    sub = 'Vắng';
  } else if (cell.base === 'nocheck') {
    range = 'Chưa vào';
    sub = 'Chưa Check-in';
  }
  return {
    date: cell.date,
    dayLabel: `${weekdayName(cell.date)} ${dm(cell.date)}`,
    kind: cell.kind,
    range,
    sub,
    status: cell.kind === 'todo' && item ? WAITING[item.group] : cell.label,
    tone: cell.kind as HistoryRow['tone'],
    inText: timed ? (cell.in ?? 'Chưa có') : '—',
    outText: timed ? (cell.live ? 'Đang làm' : (cell.out ?? 'Chưa có')) : '—',
    parts: trackOf(cell, item)
  };
}

/** 5 dòng đầu giữ nguyên; sau đó mỗi chuỗi liền nhau từ 3 ngày đi làm bình thường trở lên gộp thành một nút. */
function foldHistory(rows: { row: HistoryRow; plain: boolean }[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let run: HistoryRow[] = [];
  const flush = () => {
    if (run.length >= MIN_FOLD) {
      const label = `${run.length} ngày đi làm · ${dm(run[run.length - 1].date)} – ${dm(run[0].date)}`;
      out.push({ type: 'fold', label, rows: run });
    } else {
      for (const row of run) out.push({ type: 'row', row });
    }
    run = [];
  };
  rows.forEach(({ row, plain }, k) => {
    if (k < KEEP_ROWS || !plain) {
      flush();
      out.push({ type: 'row', row });
    } else {
      run.push(row);
    }
  });
  flush();
  return out;
}

// ---- Tháng ----

function monthOf(person: Person, month: string): EmployeeMonth {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const dates = Array.from({ length: last }, (_, k) => `${month}-${String(k + 1).padStart(2, '0')}`);
  const cells = dates.map(date => cellOf(person.id, date) as Cell);
  const items = new Map(pendingInbox().map(item => [item.id, item]));
  const itemOf = (cell: Cell) => (cell.itemId ? (items.get(cell.itemId) ?? null) : null);

  const chips = Object.fromEntries(GROUPS.map(g => [g.key, 0])) as Record<GroupKey, number>;
  for (const cell of cells) if (cell.kind in chips) chips[cell.kind as GroupKey]++;

  const todo = cells.filter(cell => cell.kind === 'todo');
  const head = todo[0];
  const headItem = head ? itemOf(head) : null;
  const pending =
    head && headItem
      ? {
          count: todo.length,
          date: head.date,
          text: `${todo.length} ngày cần xử lý · ${dm(head.date)} ${headItem.what.toLowerCase()}, ${WAITING[headItem.group].toLowerCase()}`
        }
      : null;

  const history = cells
    .filter(cell => cell.date <= MOCK_TODAY && cell.base !== 'off')
    .reverse()
    .map(cell => ({ row: rowOf(cell, itemOf(cell)), plain: cell.kind === 'work' && !cell.live }));

  return {
    pending,
    stats: [
      { label: 'Ngày công', value: `${person.period.worked} / ${STANDARD_DAYS}`, note: 'cả kỳ 01–31/10' },
      { label: 'Đi muộn', value: `${person.lateCount} lần`, note: `tổng ${person.sums.late} phút` },
      { label: 'Giờ vào trung bình', value: person.avgIn, note: `ca bắt đầu ${SHIFT_IN}` },
      { label: 'Giờ ra trung bình', value: person.avgOut, note: `ca kết thúc ${SHIFT_OUT}` }
    ],
    chips,
    strip: cells.map(cell => ({
      date: cell.date,
      dow: dowShort(cell.date),
      day: String(Number(cell.date.slice(8))),
      kind: cell.kind,
      today: cell.date === MOCK_TODAY,
      aria: `${weekdayName(cell.date)} ${dm(cell.date)}: ${cell.aria}`
    })),
    history: foldHistory(history)
  };
}

/** Hồ sơ chấm công của một người trong một tháng; null khi không có người, `data` null khi tháng không có dữ liệu giả. */
export function employeeView(personId: string, month: string): EmployeeView | null {
  const at = ROSTER.findIndex(p => p.id === personId);
  if (at < 0) return null;
  const person = ROSTER[at];
  return {
    person,
    month,
    index: at + 1,
    total: ROSTER.length,
    prevId: ROSTER[at - 1]?.id ?? null,
    nextId: ROSTER[at + 1]?.id ?? null,
    data: month === MOCK_MONTH ? monthOf(person, month) : null
  };
}
