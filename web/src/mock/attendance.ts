// Chấm công giả: lưới 28 ngày của 11 nhân viên, dựng mỗi lần gọi từ ghi nhận gốc + các việc còn chờ trong mock/inbox.ts.
// Xử lý một việc chỉ làm ô trở về ghi nhận gốc; không đổi công, trễ, OT hay lương (spec mục 1.3 và 4.2).
import { dm, dowShort, initials, weekdayName } from '@/utils/format';
import { MOCK_MONTH, MOCK_TODAY } from './clock';
import { pendingInbox, type InboxItem } from './inbox';

import type { Cell, CellKind, DayCellDTO, DayHeadDTO, PendingDTO, PersonDTO, TileDTO, WeekDTO } from '../builders/api/attendance';
export type { CellKind, GroupKey } from '../builders/api/attendance';

// Người trong danh sách giả (id = tên đăng nhập). Giá trị tĩnh của kỳ 10; không có logic nghiệp vụ.
export type Person = {
  id: string;
  name: string;
  initials: string;
  dept: string;
  title: string;
  code: string;
  joined: string;
  contract: string;
  shift: string;
  leaveLeft: string;
  lateCount: number;
  avgIn: string;
  avgOut: string;
  sums: { late: number; ot: number };
  // Số tĩnh của kỳ 10, dùng chung với bảng lương. Tổng = 27.
  period: { worked: number; leave: number; isat: number; pending: number; unpaid: number };
};

export const SHIFT = 'HC 08:00–17:00';
export const GRID_FROM = '2026-10-12';
export const GRID_DAYS = 28;
export const STANDARD_DAYS = 26;
const DATA_FROM = '2026-10-01';
const TOTAL_STAFF = 128;

import { ATTENDANCE_GROUPS as GROUPS } from '../constants/labels';
export { GROUPS };

// id, tên, phòng ban, chức danh, mã, vào làm, phép năm còn, số lần muộn, vào TB, ra TB, trễ phút, OT giờ,
// kỳ 10 [đi làm, nghỉ có phép, cần xử lý, vắng]. Ai cũng là nhân viên chính thức, `isat` luôn 0 (lưới không có loại ô này).
type Row = [string, string, string, string, string, string, number, number, string, string, number, number, number[]];
const ROWS: Row[] = [
  ['nguyen-thu-ha', 'Nguyễn Thu Hà', 'Tài chính', 'Kế toán tổng hợp', 'GFT-0118', '08/2022', 6, 0, '07:52', '17:06', 0, 0, [25, 0, 2, 0]],
  ['tran-minh-quan', 'Trần Minh Quân', 'Kỹ thuật', 'Kỹ sư phần mềm', 'GFT-0125', '01/2023', 8, 2, '07:58', '17:24', 18, 5, [26, 0, 1, 0]],
  ['le-hoang-nam', 'Lê Hoàng Nam', 'Kinh doanh', 'Nhân viên kinh doanh', 'GFT-0142', '03/2024', 5, 1, '07:59', '17:08', 12, 0, [25, 1, 1, 0]],
  ['pham-ngoc-anh', 'Phạm Ngọc Anh', 'Nhân sự', 'Chuyên viên nhân sự', 'GFT-0131', '06/2023', 9, 1, '07:55', '17:05', 21, 0, [27, 0, 0, 0]],
  ['vo-duc-thinh', 'Võ Đức Thịnh', 'Kỹ thuật', 'Trưởng nhóm QA', 'GFT-0109', '11/2021', 7, 0, '07:54', '17:48', 0, 9, [26, 0, 1, 0]],
  ['do-mai-linh', 'Đỗ Mai Linh', 'Marketing', 'Thiết kế đồ hoạ', 'GFT-0150', '09/2024', 4, 4, '08:09', '17:07', 99, 0, [25, 0, 1, 1]],
  ['bui-quoc-huy', 'Bùi Quốc Huy', 'Sản xuất', 'Tổ trưởng', 'GFT-0087', '02/2020', 10, 0, '07:46', '17:02', 0, 0, [26, 0, 1, 0]],
  ['trinh-van-long', 'Trịnh Văn Long', 'Sản xuất', 'Công nhân vận hành', 'GFT-0163', '05/2025', 3, 0, '07:53', '17:04', 0, 0, [26, 0, 1, 0]],
  ['ly-thanh-tam', 'Lý Thanh Tâm', 'Sản xuất', 'Công nhân vận hành', 'GFT-0170', '07/2025', 2, 0, '07:51', '17:05', 0, 0, [26, 0, 1, 0]],
  ['ngo-gia-bao', 'Ngô Gia Bảo', 'Sản xuất', 'Công nhân vận hành', 'GFT-0158', '01/2025', 4, 0, '07:52', '17:07', 0, 0, [26, 1, 0, 0]],
  ['hoang-minh-duc', 'Hoàng Minh Đức', 'Kinh doanh', 'Trưởng nhóm', 'GFT-0102', '04/2021', 8, 0, '07:57', '17:01', 0, 0, [26, 0, 1, 0]]
];

export const ROSTER: Person[] = ROWS.map(
  ([id, name, dept, title, code, joined, leaveLeft, lateCount, avgIn, avgOut, late, ot, p]) => ({
    id,
    name,
    initials: initials(name),
    dept,
    title,
    code,
    joined,
    contract: 'Nhân viên chính thức',
    shift: SHIFT,
    leaveLeft: `${leaveLeft} ngày`,
    lateCount,
    avgIn,
    avgOut,
    sums: { late, ot },
    period: { worked: p[0], leave: p[1], isat: 0, pending: p[2], unpaid: p[3] }
  })
);

// ---- Lịch ----

const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, k: number) => new Date(dateOf(iso).getTime() + k * 86400000).toISOString().slice(0, 10);
const GRID_TO = addDays(GRID_FROM, GRID_DAYS - 1);

/** Nơi duy nhất biết lịch làm việc: Thứ Hai – Thứ Bảy có ca, Chủ nhật nghỉ. */
export const isScheduled = (date: string): boolean => {
  const day = dateOf(date).getUTCDay();
  return !Number.isNaN(day) && day !== 0;
};

/** Số ngày có lịch trong tháng 'YYYY-MM' ('2026-10' → 27). */
export function scheduledDays(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) if (isScheduled(`${month}-${String(d).padStart(2, '0')}`)) n++;
  return n;
}

const inData = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(dateOf(date).getTime()) &&
  dateOf(date).toISOString().slice(0, 10) === date &&
  date >= DATA_FROM &&
  date <= GRID_TO;

// ---- Ghi nhận gốc ----

type Base = { kind: CellKind; text: string; in: string | null; out: string | null; live: boolean };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const span = (kind: 'work' | 'late', i: string | null, o: string | null, live = false): Base => ({
  kind,
  text: `${i ?? '?'}–${live ? '…' : (o ?? '?')}`,
  in: i,
  out: live ? null : o,
  live
});
const note = (kind: CellKind, text: string): Base => ({ kind, text, in: null, out: null, live: false });

// Ô ghi tay theo bảng E, khoá `<personId>|<ngày>`.
const HAND: Record<string, Base> = {
  'nguyen-thu-ha|2026-10-28': span('work', '07:50', null, true),
  'tran-minh-quan|2026-10-15': span('late', '08:09', '17:00'),
  'tran-minh-quan|2026-10-28': span('work', '08:05', null, true),
  'le-hoang-nam|2026-10-12': note('leave', 'Phép năm'),
  'le-hoang-nam|2026-10-22': span('work', '08:00', '17:15'),
  'le-hoang-nam|2026-10-23': span('work', '07:58', '17:02'),
  'le-hoang-nam|2026-10-26': span('work', '07:56', '17:10'),
  'le-hoang-nam|2026-10-27': span('late', '08:12', null),
  'le-hoang-nam|2026-10-28': span('work', '07:59', null, true),
  'pham-ngoc-anh|2026-10-28': span('late', '08:21', null, true),
  'vo-duc-thinh|2026-10-23': span('work', '07:58', '20:00'),
  'vo-duc-thinh|2026-10-26': span('work', '08:00', '19:30'),
  'vo-duc-thinh|2026-10-28': span('work', '08:02', null, true),
  'do-mai-linh|2026-10-13': note('absent', 'Vắng'),
  'do-mai-linh|2026-10-19': span('late', '08:19', '17:05'),
  'do-mai-linh|2026-10-26': span('late', '08:27', '17:10'),
  'do-mai-linh|2026-10-28': span('late', '08:35', null, true),
  'bui-quoc-huy|2026-10-28': note('nocheck', 'Chưa vào'),
  'trinh-van-long|2026-10-27': span('work', '07:58', null),
  'trinh-van-long|2026-10-28': span('work', '07:55', null, true),
  'ly-thanh-tam|2026-10-26': span('work', null, '17:06'),
  'ly-thanh-tam|2026-10-28': note('nocheck', 'Chưa vào'),
  'ngo-gia-bao|2026-10-19': note('leave', 'Nghỉ, làm bù'),
  'ngo-gia-bao|2026-10-28': span('work', '07:48', null, true),
  'hoang-minh-duc|2026-10-22': span('late', '08:00', '16:30'),
  'hoang-minh-duc|2026-10-28': span('work', '07:56', null, true)
};

function baseOf(person: Person, date: string): Base {
  const hand = HAND[`${person.id}|${date}`];
  if (hand) return hand;
  if (!isScheduled(date)) return note('off', '');
  if (date > MOCK_TODAY) return note('fu', '08:00–17:00');
  const r = ROSTER.indexOf(person);
  const n = Math.round((dateOf(date).getTime() - dateOf(DATA_FROM).getTime()) / 86400000);
  return span('work', hhmm(465 + ((r * 37 + n * 11) % 16)), hhmm(1020 + ((r * 13 + n * 7) % 16)));
}

// ---- Ô sau lớp "cần xử lý" ----

const LABELS: Record<CellKind, string> = {
  work: 'Đi làm',
  late: 'Đi muộn',
  leave: 'Nghỉ có phép',
  absent: 'Vắng',
  todo: 'Cần xử lý',
  off: 'Không có ca',
  fu: 'Ca dự kiến',
  nocheck: 'Chưa Check-in'
};

/** Việc chờ có ngày chấm công, theo `<personId>|<ngày>`; một ngày chỉ nhớ việc đầu tiên (thứ tự chuông). */
function overlayOf(items: InboxItem[]): Map<string, InboxItem> {
  const map = new Map<string, InboxItem>();
  for (const item of items) {
    for (const day of item.days) if (!map.has(`${item.personId}|${day}`)) map.set(`${item.personId}|${day}`, item);
  }
  return map;
}

function buildCell(person: Person, date: string, overlay: Map<string, InboxItem>): Cell {
  const base = baseOf(person, date);
  const item = overlay.get(`${person.id}|${date}`) ?? null;
  const kind: CellKind = item ? 'todo' : base.kind;
  const text = item ? (item.cellLabel ?? base.text) : base.text;
  const live = base.live;
  const lateLabel = base.in && base.in > '08:00' ? 'Đi muộn' : 'Về sớm';
  const label = kind === 'late' ? lateLabel : LABELS[kind];
  const withLive = (head: string) => `${head}, ${text}${live ? ', đang làm' : ''}`;
  const aria: Record<CellKind, string> = {
    work: withLive(label),
    late: withLive(label),
    leave: `${label}, ${text}`,
    absent: 'Vắng',
    todo: `Cần xử lý, ${item?.what ?? ''}`,
    off: 'không có ca',
    fu: `ca dự kiến ${text}`,
    nocheck: 'chưa Check-in'
  };
  return {
    date,
    kind,
    base: base.kind,
    text,
    in: base.in,
    out: base.out,
    live,
    itemId: item?.id ?? null,
    label,
    aria: aria[kind]
  };
}

const personOf = (id: string) => ROSTER.find(p => p.id === id) ?? null;

/** Ô của một người trong một ngày (01/10 – 08/11/2026); null khi người hoặc ngày không có dữ liệu. */
export function cellOf(personId: string, date: string): Cell | null {
  const person = personOf(personId);
  if (!person || !inData(date)) return null;
  return buildCell(person, date, overlayOf(pendingInbox()));
}

// ---- DTO giả: cùng dạng với GET /api/v2/attendance/week và /attendance/employees/:username ----

const foldText = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
const isoDow = (iso: string) => dowShort(iso);

/** Ô sang dạng DTO (thêm thứ, ngày, hôm nay; mock không có phút trễ / trường hợp). */
export function cellDto(cell: Cell): DayCellDTO {
  return {
    date: cell.date,
    dow: isoDow(cell.date),
    day: String(Number(cell.date.slice(8, 10))),
    today: cell.date === MOCK_TODAY,
    kind: cell.kind,
    base: cell.base,
    text: cell.text,
    in: cell.in,
    out: cell.out,
    live: cell.live,
    lateMinutes: 0,
    explanationStatus: 'none',
    cases: [],
    itemId: cell.itemId,
    label: cell.label,
    aria: cell.aria
  };
}

export function personDto(p: Person): PersonDTO {
  const [mm, yyyy] = p.joined.split('/');
  return {
    username: p.id,
    name: p.name,
    initials: p.initials,
    group: p.dept,
    title: p.title,
    code: p.code,
    startDate: `${yyyy}-${mm}-01`,
    contract: p.contract,
    position: { type: 'nv', level: 1, jobTitle: p.title },
    shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0, isOvernight: false },
    shiftText: p.shift,
    leaveLeftDays: Number(p.leaveLeft.split(' ')[0]),
    joinedMonth: `${yyyy}-${mm}`
  };
}

/** Lưới 28 ngày của mọi người, đã lọc theo tên (`q`) và nhóm (`group`); null khi tháng không có dữ liệu giả. */
export function weekDto({ month, q = '', group = '' }: { month: string; q?: string; group?: string }): WeekDTO | null {
  if (month !== MOCK_MONTH) return null;
  const items = pendingInbox();
  const overlay = overlayOf(items);
  const days: DayHeadDTO[] = Array.from({ length: GRID_DAYS }, (_, k) => {
    const iso = addDays(GRID_FROM, k);
    return { iso, dow: dowShort(iso), dm: dm(iso), scheduled: isScheduled(iso), today: iso === MOCK_TODAY, monday: dowShort(iso) === 'T2', periodStart: iso.endsWith('-01') };
  });
  const needle = foldText(q.trim());
  const shown = ROSTER.filter(
    p => (!needle || foldText(p.name).includes(needle) || foldText(p.id).includes(needle)) && (!group || p.dept === group)
  );
  const rows = shown.map(person => {
    const cells = days.map(d => cellDto(buildCell(person, d.iso, overlay)));
    const { joinedMonth: _omit, ...who } = personDto(person); // lưới tuần không mang joinedMonth (chỉ hồ sơ có)
    return {
      ...who,
      days: cells,
      totals: { workDays: person.period.worked, lateMinutes: person.sums.late, otHours: person.sums.ot },
      needsAction: cells.filter(c => c.kind === 'todo').length
    };
  });
  const ids = new Set(shown.map(p => p.id));
  const pending: PendingDTO[] = items
    .filter(item => item.days.length > 0 && ids.has(item.personId))
    .map(item => {
      const p = personOf(item.personId) as Person;
      return {
        id: item.id,
        kind: item.action === 'remind' ? 'explanation-due' : item.group,
        group: item.group,
        groupLabel: item.groupLabel,
        action: item.action,
        username: p.id,
        name: p.name,
        initials: p.initials,
        title: p.title,
        what: item.what,
        when: item.when,
        days: item.days,
        age: item.age,
        date: item.days[0]
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const forgot = pending.filter(i => i.group === 'att').length;
  const count = (g: string) => items.filter(i => i.group === g).length;
  const tiles: TileDTO[] = [
    { key: 'todo', label: 'Cần xử lý', value: pending.length, note: `${forgot} chưa giải trình · ${pending.length - forgot} yêu cầu chờ duyệt` },
    { key: 'present', label: 'Có mặt hôm nay', value: 113, of: TOTAL_STAFF, note: '15 người chưa Check-in' },
    { key: 'late', label: 'Đi muộn hôm nay', value: 7, note: 'trung bình 14 phút' },
    { key: 'leave', label: 'Nghỉ có phép', value: 6, note: `${count('leave')} đơn chờ duyệt` },
    { key: 'absent', label: 'Vắng không phép', value: 1, note: 'trong tháng 10' },
    { key: 'ot', label: 'Làm thêm tháng này', value: 126, unit: 'giờ', note: `${count('ot')} yêu cầu chờ duyệt` }
  ];
  const byDept = new Map<string, number>();
  for (const p of ROSTER) byDept.set(p.dept, (byDept.get(p.dept) ?? 0) + 1);
  return {
    today: MOCK_TODAY,
    month,
    periodState: 'open',
    subtitle: `Kỳ công 01–31/10/2026 · hôm nay ${weekdayName(MOCK_TODAY)} ${dm(MOCK_TODAY)}`,
    tiles,
    days,
    groups: [...byDept].map(([key, n]) => ({ key, count: n })).sort((a, b) => a.key.localeCompare(b.key, 'vi')),
    rows,
    pending,
    total: TOTAL_STAFF,
    matched: rows.length
  };
}
