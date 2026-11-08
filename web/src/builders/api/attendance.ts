// Màn Chấm công Admin từ GET /api/v2/attendance/week (lưới) và GET /api/v2/attendance/employees/:username (hồ sơ).
// BE tính hết (ô ngày, tổng, thẻ số, chip, người trước/sau, việc cần xử lý, lịch sử ngày); builder chỉ ÁNH XẠ DTO sang dữ liệu
// view, không cộng trừ, không suy ô, không lọc hay sắp xếp. Chữ đầu/phụ/dòng chi tiết của việc lấy từ /requests (inbox) theo id.
import type { PersonStatus } from '../../components/staff-scope/staffScope';
import type { InboxGroup, InboxItem } from '../../mock/inbox';
import type { DayTag } from './day-tag';
import { dm, dmy, num, weekdayName } from '../../utils/format';

export type CellKind = 'work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'fu' | 'nocheck';
export type GroupKey = 'work' | 'late' | 'leave' | 'absent' | 'todo';

// ---- DTO của máy chủ ----

export type DayCellDTO = {
  date: string;
  dow: string;
  day: string;
  today: boolean;
  kind: CellKind;
  base: CellKind;
  text: string;
  in: string | null;
  out: string | null;
  live: boolean;
  lateMinutes: number;
  explanationStatus: string;
  cases: { code: string; minutes: number; affectsPay: boolean }[];
  itemId: string | null;
  label: string;
  aria: string;
  /** Ngày nghỉ giữa ca (BE): nửa nhân viên làm. */
  halfShift?: 'FIRST' | 'SECOND' | null;
  /** Nhãn ngày dùng chung với lịch nhân viên; chỉ có ở hồ sơ một người (lưới tuần không dựng lịch tháng). */
  tag?: DayTag;
};

export type StaffStatusDTO = 'working' | 'probation' | 'on_leave' | 'resigned';
const PS_OF: Record<StaffStatusDTO, PersonStatus> = { working: 'ok', probation: 'try', on_leave: 'off', resigned: 'out' };
/** Trạng thái hiện trên màn từ trạng thái của BE; thiếu thì coi là đang làm chính thức. */
export const personStatusFrom = (s?: StaffStatusDTO): PersonStatus | undefined => (s ? PS_OF[s] : undefined);
/** Tên phòng ban hiện trên màn: BE trả departmentName (null = chưa xếp phòng, hiện "—"); phản hồi cũ không có thì lấy `group`. */
export const deptNameOf = (p: { departmentName?: string | null; group?: string }): string =>
  p.departmentName === undefined ? (p.group ?? '') : (p.departmentName ?? '—');

export type PersonDTO = {
  username: string;
  name: string;
  initials: string;
  group: string;
  /** Phòng ban và trạng thái nhân sự do BE tính; phản hồi cũ không có thì coi là đang làm chính thức, phòng theo `group`. */
  departmentId?: number | null;
  departmentName?: string | null;
  staffStatus?: StaffStatusDTO;
  title: string | null;
  code: string;
  startDate: string | null;
  contract: string;
  position: { type: string; level: number | null; jobTitle: string | null };
  shift: { type: string; startTime: string; endTime: string; allowancePct: number; isOvernight: boolean };
  shiftText: string;
  leaveLeftDays: number;
  joinedMonth?: string;
};

export type TileDTO = { key: 'todo' | 'present' | 'late' | 'leave' | 'absent' | 'ot'; label: string; value: number; of?: number; unit?: string; note: string };
export type PendingDTO = {
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
  date: string;
  departmentId?: number | null;
  departmentName?: string | null;
  staffStatus?: StaffStatusDTO;
};
export type DayHeadDTO = { iso: string; dow: string; dm: string; scheduled: boolean; today: boolean; monday: boolean; periodStart: boolean };
export type WeekDTO = {
  today: string;
  month: string;
  periodState: string;
  subtitle: string;
  tiles: TileDTO[];
  days: DayHeadDTO[];
  groups: { key: string; count: number }[];
  rows: (PersonDTO & { days: DayCellDTO[]; totals: { workDays: number; lateMinutes: number; otHours: number }; needsAction: number })[];
  pending: PendingDTO[];
  total: number;
  matched: number;
};
export type StatDTO = { key: string; label: string; value: number; unit?: string; note: string };
export type DayHistoryDTO = {
  date: string;
  dayLabel: string;
  kind: CellKind;
  tone: string;
  text: string;
  status: string;
  shift: string;
  in: string | null;
  out: string | null;
  itemId: string | null;
  /** Ngày nghỉ giữa ca: `shift` là nửa ca làm. */
  halfShift?: 'FIRST' | 'SECOND' | null;
};
export type EmployeeMonthDTO = {
  person: PersonDTO;
  month: string;
  periodState: string;
  locked: boolean;
  index: number;
  total: number;
  prev: string | null;
  next: string | null;
  pending: { count: number; date: string; itemId: string | null; group: string; text: string } | null;
  stats: StatDTO[];
  totals: { workDays: number; standardDays: number; lateCount: number; paidLeaveDays: number; lateMinutes: number; otHours: number; absentDays: number };
  chips: Record<GroupKey, number>;
  days: DayCellDTO[];
  dayHistory: DayHistoryDTO[];
  history: { at: string; actor: string; text: string }[];
};

// ---- Dữ liệu view ----

export type Cell = {
  date: string;
  kind: CellKind; // sau lớp "cần xử lý"
  base: CellKind; // ghi nhận gốc
  text: string;
  in: string | null;
  out: string | null;
  live: boolean;
  itemId: string | null;
  label: string;
  aria: string;
  tag?: DayTag;
};
export type PersonRef = { id: string; name: string; initials: string };
export type Person = PersonRef & {
  group: string;
  title: string;
  code: string;
  joined: string;
  contract: string;
  shift: string;
  leaveLeft: string;
};
export type AttendanceDay = DayHeadDTO;
// dept, ps: để lọc theo cặp bộ lọc nhân sự phía máy khách (06/11).
export type AttendanceRow = {
  person: PersonRef;
  dept: string;
  ps?: PersonStatus;
  cells: Cell[];
  totals: { workDays: number; lateMinutes: number; otHours: number };
  /** Ngày công để hiện (có thể lẻ: "12,5"). */
  workText: string;
  needsAction: number;
};
export type Tile = { key: TileDTO['key']; label: string; value: string; note: string };
export type PendingDay = { item: InboxItem; person: PersonRef; date: string; dept: string; ps?: PersonStatus };
export type AttendanceView = {
  month: string;
  today: string;
  subtitle: string;
  tiles: Tile[];
  days: AttendanceDay[];
  groups: { key: string; count: number }[];
  rows: AttendanceRow[];
  pending: PendingDay[];
  total: number;
  matched: number;
};
export type DayDetail = { person: PersonRef; date: string; title: string; sub: string; cell: Cell; item: InboxItem | null };

export type StatTile = { label: string; value: string; note: string };
export type StripDay = { date: string; dow: string; day: string; kind: CellKind; today: boolean; aria: string; tag?: DayTag };
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
  inTime: string | null;
  outTime: string | null;
};
export type EmployeeMonth = {
  pending: { count: number; date: string; text: string } | null;
  stats: StatTile[];
  chips: Record<GroupKey, number>;
  strip: StripDay[];
  history: HistoryRow[];
  audit: { at: string; actor: string; text: string }[];
};
export type EmployeeView = {
  person: Person;
  month: string;
  locked: boolean;
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
  data: EmployeeMonth;
};

const NONE = '—';

// ---- Ánh xạ ----

/** "12 ngày" / "26 ngày" ... chữ đơn vị đi sau số của thẻ. */
// Số có thể lẻ (ngày công 12,5): viết dấu phẩy kiểu Việt Nam.
const numText = (value: number, of?: number, unit?: string) =>
  of !== undefined ? `${num(value)} / ${num(of)}` : unit ? `${num(value)} ${unit}` : num(value);
/** Ca của một ngày; ngày nghỉ giữa ca ghi "Nửa ca" trước nửa ca làm. */
const shiftOf = (shift: string, half?: string | null) => (half ? `Nửa ca ${shift}` : shift);

const cellFrom = (c: DayCellDTO): Cell => ({
  date: c.date,
  kind: c.kind,
  base: c.base,
  text: c.text,
  in: c.in,
  out: c.out,
  live: c.live,
  itemId: c.itemId,
  label: c.label,
  aria: c.halfShift ? `${c.aria}, nửa ca` : c.aria,
  tag: c.tag
});

const personRef = (p: { username: string; name: string; initials: string }): PersonRef => ({ id: p.username, name: p.name, initials: p.initials });

function personFrom(p: PersonDTO): Person {
  return {
    ...personRef(p),
    group: p.group,
    title: p.title || NONE,
    code: p.code,
    joined: p.joinedMonth ? `${p.joinedMonth.slice(5, 7)}/${p.joinedMonth.slice(0, 4)}` : NONE,
    contract: p.contract,
    shift: p.shiftText,
    leaveLeft: `${p.leaveLeftDays} ngày`
  };
}

/** Việc chờ: chữ đầu, phụ, dòng chi tiết lấy từ /requests khớp theo id; không có thì dựng tối thiểu từ DTO. */
function itemFrom(p: PendingDTO, inbox: InboxItem[]): InboxItem {
  const hit = inbox.find(i => i.id === p.id);
  if (hit) return hit;
  return {
    id: p.id,
    group: p.group,
    groupLabel: p.groupLabel,
    action: p.action,
    personId: p.username,
    name: p.name,
    initials: p.initials,
    role: p.title || '',
    what: p.what,
    when: p.when,
    age: p.age,
    head: p.what,
    sub: p.when,
    facts: [],
    days: p.days
  };
}

/** Lưới tuần: ánh xạ GET /attendance/week. `inbox` là việc chờ từ /requests. */
export function attendanceFromWeek(dto: WeekDTO, inbox: InboxItem[]): AttendanceView {
  return {
    month: dto.month,
    today: dto.today,
    subtitle: dto.subtitle,
    tiles: dto.tiles.map(t => ({ key: t.key, label: t.label, value: numText(t.value, t.of, t.unit), note: t.note })),
    days: dto.days,
    groups: dto.groups,
    rows: dto.rows.map(r => ({
      person: personRef(r),
      dept: deptNameOf(r),
      ps: personStatusFrom(r.staffStatus),
      cells: r.days.map(cellFrom),
      totals: r.totals,
      workText: num(r.totals.workDays),
      needsAction: r.needsAction
    })),
    // Việc chờ không mang phòng ban / trạng thái riêng: lấy theo dòng của cùng người (BE trả việc của đúng những người đã lọc).
    pending: dto.pending.map(p => {
      const row = dto.rows.find(r => r.username === p.username);
      const who = p.departmentName !== undefined || p.staffStatus ? p : row;
      return { item: itemFrom(p, inbox), person: personRef(p), date: p.date, dept: who ? deptNameOf(who) : '', ps: personStatusFrom(who?.staffStatus) };
    }),
    total: dto.total,
    matched: dto.matched
  };
}

/** Hồ sơ chấm công một người: ánh xạ GET /attendance/employees/:username. */
export function employeeFromDto(dto: EmployeeMonthDTO): EmployeeView {
  const strip: StripDay[] = dto.days.map(c => ({
    date: c.date,
    dow: c.dow,
    day: c.day,
    kind: c.kind,
    today: c.today,
    aria: `${weekdayName(c.date)} ${dm(c.date)}: ${c.aria}${c.tag ? ` · ${c.tag.text}` : ''}`,
    tag: c.tag
  }));
  const history: HistoryRow[] = dto.dayHistory.map(h => ({
    date: h.date,
    dayLabel: h.dayLabel,
    kind: h.kind,
    range: h.text,
    sub: shiftOf(h.shift, h.halfShift),
    status: h.status,
    tone: h.tone as HistoryRow['tone'],
    inText: h.in ?? NONE,
    outText: h.out ?? NONE,
    inTime: h.in,
    outTime: h.out
  }));
  return {
    person: personFrom(dto.person),
    month: dto.month,
    locked: dto.locked,
    index: dto.index,
    total: dto.total,
    prevId: dto.prev,
    nextId: dto.next,
    data: {
      pending: dto.pending ? { count: dto.pending.count, date: dto.pending.date, text: dto.pending.text } : null,
      stats: dto.stats.map(s => ({ label: s.label, value: numText(s.value, undefined, s.unit), note: s.note })),
      chips: dto.chips,
      strip,
      history,
      audit: dto.history
    }
  };
}

/** Hộp chi tiết một ngày: ô lấy nguyên từ hồ sơ tháng của BE; null khi ngày không nằm trong tháng đó. */
export function dayDetailFromDto(dto: EmployeeMonthDTO, date: string, inbox: InboxItem[]): DayDetail | null {
  const cell = dto.days.find(c => c.date === date);
  if (!cell) return null;
  const hist = dto.dayHistory.find(h => h.date === date);
  return {
    person: personRef(dto.person),
    date,
    title: `${dto.person.name} · ${weekdayName(date)} ${dmy(date)}`,
    sub: `${dto.person.group} · ${dto.person.title || NONE} · ${hist?.halfShift ? shiftOf(hist.shift, hist.halfShift) : `Ca ${hist?.shift ?? dto.person.shiftText}`}`,
    cell: cellFrom(cell),
    item: (cell.itemId && inbox.find(i => i.id === cell.itemId)) || null
  };
}
