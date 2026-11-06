// Màn Nhân sự từ GET /api/v2/employees (EmployeeDTO của BE). BE chưa có phòng ban, mã nhân viên, email, quản lý trực
// tiếp: các ô đó hiện "—", mã là tên đăng nhập. Trạng thái, ngày vào làm, thâm niên (`work`) và các thẻ chỉ số
// (`summary`) do BE tính; ở đây chỉ ánh xạ. Import tương đối để chạy được bằng node:test.
import type { StaffListView, StaffProfile, StaffRow, StaffStatus } from '../../mock/staff';
import { dmy, initials } from '../../utils/format';
import { staffStatsFromSummary, type StaffSummaryDTO } from './staff-stats';

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

/** Số liệu làm việc của một người do BE tính (GET /employees và GET /employees/:username). */
export type WorkDTO = { active: boolean; status: StaffStatus; statusLabel: string; joinedOn: string; tenure: string };
export type EmployeeWithWork = EmployeeDTO & { work: WorkDTO };
export type EmployeesResponse = { employees: EmployeeWithWork[]; total: number; summary: StaffSummaryDTO };

const NONE = '—';

/** Tóm tắt một nhân sự cho màn Yêu cầu và chuông: họ tên, chức danh, loại (mã thường) và bậc. */
export type PersonCard = { name: string; title: string; type: string; levelName: string };

/** Tra hồ sơ theo cả tên đăng nhập lẫn uuid: đơn mới lưu theo uuid, đơn cũ có thể còn lưu theo tên đăng nhập. */
export function peopleOf(employees: EmployeeDTO[]): Map<string, PersonCard> {
  const map = new Map<string, PersonCard>();
  for (const e of employees) {
    const card: PersonCard = {
      name: e.profile.fullName || e.account.username,
      title: e.contract.position.jobTitle || NONE,
      type: e.contract.position.type,
      levelName: `Bậc ${e.contract.position.level}`
    };
    map.set(e.account.username, card);
    if (e.profile.uuid) map.set(e.profile.uuid, card);
  }
  return map;
}

const TYPE_LABEL: Record<string, string> = { tts: 'TTS', ctv: 'CTV', nv: 'NV', ql: 'QL' };
const TERM_LABEL: Record<string, string> = { long: 'HĐLĐ từ 3 tháng', short: 'HĐLĐ dưới 3 tháng' };
const SHIFT_LABEL: Record<string, string> = { NORMAL: 'Hành chính', FLEX: 'Linh hoạt', NIGHT: 'Ca đêm' };

export function staffRowFromEmployee(e: EmployeeWithWork): StaffRow {
  const name = e.profile.fullName || e.account.username;
  return {
    id: e.account.username,
    name,
    initials: initials(name),
    code: e.account.username,
    email: NONE,
    activated: !e.account.isLocked,
    dept: NONE,
    title: e.contract.position.jobTitle || NONE,
    status: e.work.status,
    statusLabel: e.work.statusLabel,
    joined: e.work.joinedOn
  };
}

/** Bốn thẻ chỉ số và toàn bộ danh sách, đều lấy từ phản hồi của BE. */
export function staffListFromEmployees(res: EmployeesResponse): StaffListView {
  const rows = res.employees.map(staffRowFromEmployee).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return { stats: staffStatsFromSummary(res.summary), total: res.summary.total, rows };
}

/** Ngăn kéo hồ sơ của một người. */
export function staffProfileFromEmployee(e: EmployeeWithWork): StaffProfile {
  const row = staffRowFromEmployee(e);
  const { position, shift, term, hasInsurance } = e.contract;
  const span = e.work.tenure;
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
