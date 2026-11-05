// Màn Chấm công Admin từ GET /api/v2/attendance/timesheets (bảng công theo ngày, employeeId là uuid), hồ sơ nhân sự
// (GET /employees) và việc chờ duyệt (builders/api/inbox). Ô có việc đang chờ thành "cần xử lý".
// BE chưa có phòng ban, giờ vào/ra trung bình, lịch sử sửa giờ: các ô đó là "—" hoặc rỗng.
import type { AttendanceDay, AttendanceView, Cell, CellKind, DayDetail, GroupKey, PendingDay, Person, Tile } from '../../mock/attendance';
import type { EmployeeView, HistoryEntry, StripDay } from '../../mock/attendance-employee';
import type { InboxItem } from '../../mock/inbox';
import { dm, dowShort, initials, weekdayName } from '../../utils/format';
import type { EmployeeDTO } from './staff';

export type TimesheetDTO = {
  employeeId: string;
  workDate: string;
  shiftType: string;
  shiftStartTime: string;
  shiftEndTime: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  status: 'PRESENT' | 'LEAVE_PAID' | 'LEAVE_UNPAID' | 'ABSENT' | 'HOLIDAY';
  checkInStatus: string;
  checkOutStatus: string;
  metrics: { lateMinutes?: number; earlyLeaveMinutes?: number; otHours?: number; workHours?: number };
};

const NONE = '—';
const GRID_DAYS = 28;
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
const STATUS_TEXT: Record<string, string> = { tts: 'Thực tập sinh', ctv: 'Cộng tác viên', thuviec: 'Thử việc', nv: 'Nhân viên chính thức', nghiviec: 'Đã nghỉ việc' };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const isSunday = (iso: string) => dow(iso) === 0;

// Giờ "HH:mm" từ "HH:mm[:ss]" hoặc thời điểm ISO (đổi sang giờ Việt Nam).
function hhmm(v: string | null): string | null {
  if (!v) return null;
  if (/^\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t + 7 * 3600000).toISOString().slice(11, 16);
}

/** Ngày đầu lưới: thứ Hai của tuần cách hôm nay 14 ngày (lưới 4 tuần, hôm nay ở tuần thứ ba). */
export function gridFromOf(today: string): string {
  const back = addDays(today, -14);
  return addDays(back, -((dow(back) + 6) % 7));
}

function baseCell(ts: TimesheetDTO | undefined, date: string, today: string, shift: string) {
  const none = { in: null as string | null, out: null as string | null, live: false };
  if (!ts) {
    if (isSunday(date)) return { kind: 'off' as CellKind, text: '', ...none };
    if (date > today) return { kind: 'fu' as CellKind, text: shift, ...none };
    if (date === today) return { kind: 'nocheck' as CellKind, text: shift, ...none };
    return { kind: 'absent' as CellKind, text: NONE, ...none };
  }
  if (ts.status === 'LEAVE_PAID' || ts.status === 'LEAVE_UNPAID' || ts.status === 'HOLIDAY') {
    return { kind: 'leave' as CellKind, text: ts.status === 'HOLIDAY' ? 'Nghỉ lễ' : 'Nghỉ', ...none };
  }
  const cin = hhmm(ts.actualCheckIn);
  const cout = hhmm(ts.actualCheckOut);
  if (!cin && !cout) return { kind: (date === today ? 'nocheck' : 'absent') as CellKind, text: NONE, ...none };
  const late = ts.checkInStatus === 'LATE' || ts.checkOutStatus === 'EARLY';
  const live = !!cin && !cout && date === today;
  return { kind: (late ? 'late' : 'work') as CellKind, text: `${cin ?? '?'}–${cout ?? (live ? '…' : '?')}`, in: cin, out: cout, live };
}

function cellOf(ts: TimesheetDTO | undefined, date: string, today: string, shift: string, item: InboxItem | null): Cell {
  const base = baseCell(ts, date, today, shift);
  const kind: CellKind = item ? 'todo' : base.kind;
  return {
    date,
    kind,
    base: base.kind,
    text: base.text,
    in: base.in,
    out: base.out,
    live: base.live,
    itemId: item?.id ?? null,
    label: LABELS[kind],
    aria: item ? `Cần xử lý, ${item.what}` : `${LABELS[base.kind]}${base.text ? `, ${base.text}` : ''}${base.live ? ', đang làm' : ''}`
  };
}

function personOf(e: EmployeeDTO, monthTs: TimesheetDTO[]): Person {
  const name = e.profile.fullName || e.account.username;
  const { shift, leave, position, status, effectiveFrom } = e.contract as any;
  const present = monthTs.filter(t => t.status === 'PRESENT');
  const lateRows = monthTs.filter(t => t.checkInStatus === 'LATE');
  return {
    id: e.account.username,
    name,
    initials: initials(name),
    dept: NONE,
    title: position.jobTitle || NONE,
    code: e.account.username,
    joined: effectiveFrom ? `${effectiveFrom.slice(5, 7)}/${effectiveFrom.slice(0, 4)}` : NONE,
    contract: STATUS_TEXT[status] || NONE,
    shift: `${shift.type === 'NORMAL' ? 'HC' : shift.type} ${shift.startTime}–${shift.endTime}`,
    leaveLeft: `${leave?.remainingDays ?? 0} ngày`,
    lateCount: lateRows.length,
    avgIn: NONE,
    avgOut: NONE,
    sums: {
      late: monthTs.reduce((n, t) => n + (t.metrics?.lateMinutes || 0), 0),
      ot: monthTs.reduce((n, t) => n + (t.metrics?.otHours || 0), 0)
    },
    period: {
      worked: present.length,
      leave: monthTs.filter(t => t.status === 'LEAVE_PAID' || t.status === 'HOLIDAY').length,
      isat: 0,
      pending: 0,
      unpaid: monthTs.filter(t => t.status === 'LEAVE_UNPAID' || t.status === 'ABSENT').length
    }
  };
}

export type AttendanceInput = {
  month: string;
  today: string;
  employees: EmployeeDTO[];
  timesheets: TimesheetDTO[];
  pending: InboxItem[];
};

type Index = { byKey: Map<string, TimesheetDTO>; uuidOf: Map<string, string>; overlay: Map<string, InboxItem> };

function indexOf({ employees, timesheets, pending }: AttendanceInput): Index {
  const uuidOf = new Map(employees.map(e => [e.account.username, e.profile.uuid || e.account.username]));
  const byKey = new Map(timesheets.map(t => [`${t.employeeId}|${t.workDate}`, t]));
  const overlay = new Map<string, InboxItem>();
  for (const item of pending) for (const d of item.days) overlay.set(`${item.personId}|${d}`, item);
  return { byKey, uuidOf, overlay };
}

const tsOf = (ix: Index, username: string, date: string) =>
  ix.byKey.get(`${ix.uuidOf.get(username)}|${date}`) ?? ix.byKey.get(`${username}|${date}`);

const monthTsOf = (input: AttendanceInput, ix: Index, username: string) =>
  input.timesheets.filter(
    t => (t.employeeId === ix.uuidOf.get(username) || t.employeeId === username) && t.workDate.startsWith(input.month)
  );

const activeEmployees = (list: EmployeeDTO[]) => list.filter(e => e.contract.status !== 'nghiviec');

/** Màn tuần (lưới 4 tuần, thẻ số, danh sách cần xử lý). */
export function attendanceFromTimesheets(input: AttendanceInput): AttendanceView {
  const { month, today, pending } = input;
  const ix = indexOf(input);
  const from = gridFromOf(today);
  const days: AttendanceDay[] = Array.from({ length: GRID_DAYS }, (_, k) => {
    const iso = addDays(from, k);
    return { iso, dow: dowShort(iso), dm: dm(iso), scheduled: !isSunday(iso), today: iso === today, monday: dow(iso) === 1, periodStart: iso.endsWith('-01') };
  });
  const people = activeEmployees(input.employees).sort((a, b) => (a.profile.fullName || '').localeCompare(b.profile.fullName || '', 'vi'));
  const rows = people.map(e => {
    const person = personOf(e, monthTsOf(input, ix, e.account.username));
    const shift = person.shift;
    return {
      person,
      cells: days.map(d => cellOf(tsOf(ix, person.id, d.iso), d.iso, today, shift, ix.overlay.get(`${person.id}|${d.iso}`) ?? null))
    };
  });
  const byId = new Map(rows.map(r => [r.person.id, r.person]));
  const pendingDays: PendingDay[] = pending
    .filter(i => i.days.length > 0 && byId.has(i.personId))
    .map(item => ({ item, person: byId.get(item.personId) as Person, date: item.days[0] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayCells = rows.map(r => r.cells.find(c => c.date === today)).filter(Boolean) as Cell[];
  const present = todayCells.filter(c => c.base === 'work' || c.base === 'late').length;
  const lateToday = todayCells.filter(c => c.base === 'late');
  const monthTs = input.timesheets.filter(t => t.workDate.startsWith(month));
  const count = (g: InboxItem['group']) => pending.filter(i => i.group === g).length;
  const tiles: Tile[] = [
    { key: 'todo', label: 'Cần xử lý', value: String(pendingDays.length), note: `${pendingDays.length} yêu cầu chờ duyệt` },
    { key: 'present', label: 'Có mặt hôm nay', value: `${present} / ${rows.length}`, note: `${rows.length - present} người chưa Check-in` },
    { key: 'late', label: 'Đi muộn hôm nay', value: String(lateToday.length), note: '' },
    { key: 'leave', label: 'Nghỉ có phép', value: String(todayCells.filter(c => c.base === 'leave').length), note: `${count('leave')} đơn chờ duyệt` },
    { key: 'absent', label: 'Vắng không phép', value: String(monthTs.filter(t => t.status === 'ABSENT').length), note: `trong tháng ${Number(month.slice(5, 7))}` },
    {
      key: 'ot',
      label: 'Làm thêm tháng này',
      value: `${Math.round(monthTs.reduce((n, t) => n + (t.metrics?.otHours || 0), 0) * 10) / 10} giờ`,
      note: `${count('ot')} yêu cầu chờ duyệt`
    }
  ];
  const [y, m] = month.split('-');
  const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return {
    month,
    subtitle: `Kỳ công 01–${last}/${m}/${y} · hôm nay ${weekdayName(today)} ${dm(today)}`,
    tiles,
    days,
    rows,
    pending: pendingDays,
    total: rows.length
  };
}

/** Hộp chi tiết một ngày của một người; null khi không có người này. */
export function dayDetailFrom(input: AttendanceInput, personId: string, date: string): DayDetail | null {
  const ix = indexOf(input);
  const e = input.employees.find(x => x.account.username === personId);
  if (!e) return null;
  const person = personOf(e, monthTsOf(input, ix, personId));
  const item = ix.overlay.get(`${personId}|${date}`) ?? null;
  const cell = cellOf(tsOf(ix, personId, date), date, input.today, person.shift, item);
  return { person, date, title: `${weekdayName(date)} ${dm(date)}`, sub: person.shift, cell, item };
}

/** Hồ sơ chấm công một người trong tháng: thẻ số, đếm theo nhóm, dải ngày và lịch sử từng ngày (mới nhất trước). */
export function employeeViewFrom(input: AttendanceInput, personId: string): EmployeeView | null {
  const people = activeEmployees(input.employees).sort((a, b) => (a.profile.fullName || '').localeCompare(b.profile.fullName || '', 'vi'));
  const index = people.findIndex(e => e.account.username === personId);
  if (index < 0) return null;
  const ix = indexOf(input);
  const person = personOf(people[index], monthTsOf(input, ix, personId));
  const [y, m] = input.month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: last }, (_, k) => {
    const date = `${input.month}-${String(k + 1).padStart(2, '0')}`;
    return cellOf(tsOf(ix, personId, date), date, input.today, person.shift, ix.overlay.get(`${personId}|${date}`) ?? null);
  });
  const strip: StripDay[] = cells.map(c => ({ date: c.date, dow: dowShort(c.date), day: String(Number(c.date.slice(8, 10))), kind: c.kind, today: c.date === input.today, aria: c.aria }));
  const chips: Record<GroupKey, number> = { work: 0, late: 0, leave: 0, absent: 0, todo: 0 };
  for (const c of cells) if (c.kind in chips) chips[c.kind as GroupKey] += 1;
  const history: HistoryEntry[] = cells
    .filter(c => c.date <= input.today && c.kind !== 'off')
    .reverse()
    .map(c => ({
      type: 'row' as const,
      row: {
        date: c.date,
        dayLabel: `${weekdayName(c.date)} ${dm(c.date)}`,
        kind: c.kind,
        range: c.text,
        sub: person.shift,
        status: c.label,
        tone: (c.kind === 'nocheck' || c.kind === 'fu' ? 'nocheck' : c.kind) as GroupKey | 'nocheck',
        inText: c.in ?? NONE,
        outText: c.out ?? NONE,
        parts: []
      }
    }));
  const waiting = input.pending.filter(i => i.personId === personId && i.days.length);
  return {
    person,
    month: input.month,
    index: index + 1,
    total: people.length,
    prevId: index > 0 ? people[index - 1].account.username : null,
    nextId: index < people.length - 1 ? people[index + 1].account.username : null,
    data: {
      pending: waiting.length ? { count: waiting.length, date: waiting[0].days[0], text: waiting[0].what } : null,
      stats: [
        { label: 'Ngày đi làm', value: String(person.period.worked), note: `trong tháng ${m}` },
        { label: 'Lần đi muộn', value: String(person.lateCount), note: `${person.sums.late} phút` },
        { label: 'Làm thêm', value: `${person.sums.ot} giờ`, note: '' },
        { label: 'Phép năm còn', value: person.leaveLeft, note: '' }
      ],
      chips,
      strip,
      history
    }
  };
}
