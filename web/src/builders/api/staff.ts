// Màn Nhân sự từ GET /api/v2/employees (EmployeeDTO của BE). BE chưa có phòng ban, mã nhân viên, email, quản lý trực
// tiếp: các ô đó hiện "—", mã là tên đăng nhập. Import tương đối để chạy được bằng node:test.
import type { StaffListView, StaffProfile, StaffRow, StaffStat, StaffStatus } from '../../mock/staff';
import { dmy, initials, tenure } from '../../utils/format';

export type EmployeeDTO = {
  profile: { uuid: string; fullName: string; birthday: string | null; dependants: number };
  account: { username: string; roles: string[]; isLocked: boolean; lockedAt: string | null; createdAt: string };
  contract: {
    position: { type: string; level: number; jobTitle: string | null };
    shift: { type: string; startTime: string; endTime: string };
    leave: { totalDays: number; usedDays: number; remainingDays: number };
    status: 'tts' | 'ctv' | 'thuviec' | 'nv' | 'nghiviec';
    term: 'long' | 'short' | null;
    effectiveFrom: string | null;
    resignedOn: string | null;
    hasInsurance: boolean | null;
  };
};

const NONE = '—';
const STATUS_LABEL: Record<StaffStatus, string> = { ok: 'Chính thức', try: 'Thử việc', off: 'Tạm nghỉ', out: 'Đã nghỉ việc' };
const TYPE_LABEL: Record<string, string> = { tts: 'TTS', ctv: 'CTV', nv: 'NV', ql: 'QL' };
const TERM_LABEL: Record<string, string> = { long: 'HĐLĐ từ 3 tháng', short: 'HĐLĐ dưới 3 tháng' };
const SHIFT_LABEL: Record<string, string> = { NORMAL: 'Hành chính', FLEX: 'Linh hoạt', NIGHT: 'Ca đêm' };

const joinedOf = (e: EmployeeDTO) => e.contract.effectiveFrom || e.account.createdAt.slice(0, 10);

function statusOf(e: EmployeeDTO): StaffStatus {
  if (e.contract.status === 'nghiviec') return 'out';
  if (e.account.isLocked) return 'off';
  return e.contract.status === 'thuviec' ? 'try' : 'ok';
}

// Đang làm vào ngày `date`: đã vào làm và chưa nghỉ việc (nghỉ việc không ghi ngày thì coi như đã nghỉ).
function activeOn(e: EmployeeDTO, date: string): boolean {
  if (joinedOf(e) > date) return false;
  if (e.contract.resignedOn) return e.contract.resignedOn > date;
  return e.contract.status !== 'nghiviec';
}

export function staffRowFromEmployee(e: EmployeeDTO): StaffRow {
  const name = e.profile.fullName || e.account.username;
  const status = statusOf(e);
  return {
    id: e.account.username,
    name,
    initials: initials(name),
    code: e.account.username,
    email: NONE,
    activated: !e.account.isLocked,
    dept: NONE,
    title: e.contract.position.jobTitle || NONE,
    status,
    statusLabel: STATUS_LABEL[status],
    joined: joinedOf(e)
  };
}

const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const yearsBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (365.25 * 86400000);
const oneDecimal = (n: number) => n.toFixed(1).replace('.', ',');

function delta(now: number, before: number, fmt = (n: number) => String(n)) {
  return { dir: (now >= before ? 'up' : 'down') as 'up' | 'down', text: fmt(Math.abs(now - before)) };
}

function avgTenure(list: EmployeeDTO[], date: string): number {
  const active = list.filter(e => activeOn(e, date));
  if (!active.length) return 0;
  return active.reduce((n, e) => n + yearsBetween(joinedOf(e), date), 0) / active.length;
}

/** Bốn thẻ chỉ số và toàn bộ danh sách; `today` là ngày hôm nay (ISO, giờ Việt Nam). */
export function staffListFromEmployees(list: EmployeeDTO[], today: string): StaffListView {
  const month = today.slice(0, 7);
  const prev = prevMonth(month);
  const monthNo = Number(month.slice(5, 7));
  const prevNo = Number(prev.slice(5, 7));
  const lastYearEnd = `${Number(month.slice(0, 4)) - 1}-12-31`;
  const inMonth = (d: string | null, ym: string) => !!d && d.startsWith(ym);

  const activeNow = list.filter(e => activeOn(e, today)).length;
  const activePrev = list.filter(e => activeOn(e, monthEnd(prev))).length;
  const joined = (ym: string) => list.filter(e => inMonth(joinedOf(e), ym)).length;
  const left = (ym: string) => list.filter(e => inMonth(e.contract.resignedOn, ym)).length;
  const tenureNow = avgTenure(list, today);
  const tenureThen = avgTenure(list, lastYearEnd);
  const note = `so với tháng ${prevNo}`;

  const stats: StaffStat[] = [
    { key: 'active', label: 'Nhân sự đang làm', value: String(activeNow), unit: 'người', delta: delta(activeNow, activePrev), note, dark: true },
    { key: 'joined', label: `Vào làm tháng ${monthNo}`, value: String(joined(month)), unit: 'người', delta: delta(joined(month), joined(prev)), note, dark: false },
    { key: 'left', label: `Nghỉ việc tháng ${monthNo}`, value: String(left(month)), unit: 'người', delta: delta(left(month), left(prev)), note, dark: false },
    {
      key: 'tenure',
      label: 'Thâm niên trung bình',
      value: oneDecimal(tenureNow),
      unit: 'năm',
      delta: delta(tenureNow, tenureThen, n => `${oneDecimal(n)} năm`),
      note: `so với năm ${lastYearEnd.slice(0, 4)}`,
      dark: false
    }
  ];
  const rows = list.map(staffRowFromEmployee).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return { stats, total: rows.length, rows };
}

/** Ngăn kéo hồ sơ của một người. */
export function staffProfileFromEmployee(e: EmployeeDTO, today: string): StaffProfile {
  const row = staffRowFromEmployee(e);
  const { position, shift, term, hasInsurance } = e.contract;
  const span = row.status === 'out' ? '' : tenure(row.joined, today);
  const insurance = hasInsurance === null || hasInsurance === undefined ? NONE : hasInsurance ? 'Có' : 'Không';
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    code: row.code,
    title: row.title,
    status: row.status,
    statusLabel: row.statusLabel,
    note: e.account.isLocked
      ? { title: 'Tài khoản đang bị khoá', text: e.account.lockedAt ? `Từ ${dmy(e.account.lockedAt.slice(0, 10))}` : 'Không đăng nhập được' }
      : null,
    groups: [
      {
        title: 'Công việc',
        facts: [
          { label: 'Phòng ban', value: NONE },
          { label: 'Chức danh', value: row.title },
          { label: 'Loại · bậc', value: `${TYPE_LABEL[position.type] ?? position.type.toUpperCase()} · Bậc ${position.level}` },
          { label: 'Quản lý trực tiếp', value: NONE },
          { label: 'Ca làm', value: `${SHIFT_LABEL[shift.type] ?? shift.type} · ${shift.startTime}–${shift.endTime}` },
          { label: 'Ngày vào làm', value: span ? `${dmy(row.joined)} · ${span}` : dmy(row.joined) }
        ]
      },
      {
        title: 'Hợp đồng',
        facts: [
          { label: 'Loại hợp đồng', value: (term && TERM_LABEL[term]) || NONE },
          { label: 'Đóng bảo hiểm', value: insurance },
          { label: 'Người phụ thuộc', value: String(e.profile.dependants ?? 0) }
        ]
      },
      {
        title: 'Tài khoản',
        facts: [
          { label: 'Tên đăng nhập', value: e.account.username },
          { label: 'Kích hoạt', value: row.activated ? 'Đã kích hoạt' : 'Chưa kích hoạt' }
        ]
      }
    ]
  };
}
