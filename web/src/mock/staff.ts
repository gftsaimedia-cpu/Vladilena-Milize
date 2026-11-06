// Dữ liệu Nhân sự giả (bảng I và ngăn kéo I2 của concept): 10 hồ sơ trang đầu, 4 thẻ chỉ số và tổng 131 là hằng số.
// Chỉ đọc; người dùng thật của máy chủ không đi qua đây.
import { dmy, initials, tenure } from '../utils/format';
export { tenure };
import { staffStatsFromSummary, type StaffSummaryDTO } from '../builders/api/staff-stats';
import { MOCK_TODAY } from './clock';
import { MOCK_HEADCOUNT } from './positions';

export type StaffStatus = 'ok' | 'try' | 'off' | 'out';

export type StaffRow = {
  id: string;
  name: string;
  initials: string;
  code: string;
  email: string;
  activated: boolean;
  dept: string;
  title: string;
  status: StaffStatus;
  statusLabel: string;
  joined: string;
};

export type StaffStat = {
  key: 'active' | 'joined' | 'left' | 'tenure';
  label: string;
  value: string;
  unit: string;
  delta: { dir: 'up' | 'down'; text: string };
  note: string;
  dark: boolean;
};

export type StaffListView = { stats: StaffStat[]; total: number; rows: StaffRow[] };

export type StaffFact = { label: string; value: string };

export type StaffProfile = {
  id: string;
  name: string;
  initials: string;
  code: string;
  title: string;
  status: StaffStatus;
  statusLabel: string;
  note: { title: string; text: string } | null;
  groups: { title: 'Công việc' | 'Hợp đồng' | 'Tài khoản'; facts: StaffFact[] }[];
};

export const STATUS_LABEL: Record<StaffStatus, string> = {
  ok: 'Chính thức',
  try: 'Thử việc',
  off: 'Tạm nghỉ',
  out: 'Đã nghỉ việc'
};

const NONE = '—';


// [id, họ tên, mã, email, đã kích hoạt, phòng ban, chức danh, trạng thái, ngày vào làm]
const PEOPLE: [string, string, string, string, boolean, string, string, StaffStatus, string][] = [
  ['nguyen-thu-ha', 'Nguyễn Thu Hà', 'GFT-0108', 'thuha.nguyen@gft.vn', true, 'Tài chính', 'Kế toán tổng hợp', 'ok', '2021-03-12'],
  ['tran-minh-quan', 'Trần Minh Quân', 'GFT-0087', 'quan.tran@gft.vn', true, 'Kỹ thuật', 'Kỹ sư phần mềm', 'ok', '2020-08-05'],
  ['le-hoang-nam', 'Lê Hoàng Nam', 'GFT-0142', 'nam.le@gft.vn', true, 'Kinh doanh', 'Nhân viên kinh doanh', 'ok', '2024-03-04'],
  ['pham-ngoc-anh', 'Phạm Ngọc Anh', 'GFT-0131', 'anh.pham@gft.vn', true, 'Nhân sự', 'Chuyên viên nhân sự', 'ok', '2023-09-15'],
  ['vo-duc-thinh', 'Võ Đức Thịnh', 'GFT-0095', 'thinh.vo@gft.vn', true, 'Kỹ thuật', 'Trưởng nhóm QA', 'ok', '2021-01-10'],
  ['do-mai-linh', 'Đỗ Mai Linh', 'GFT-0201', 'linh.do@gft.vn', false, 'Marketing', 'Thiết kế đồ hoạ', 'try', '2026-09-01'],
  ['bui-quoc-huy', 'Bùi Quốc Huy', 'GFT-0064', 'huy.bui@gft.vn', true, 'Sản xuất', 'Tổ trưởng', 'ok', '2019-06-20'],
  ['hoang-thi-mai', 'Hoàng Thị Mai', 'GFT-0118', 'mai.hoang@gft.vn', true, 'Tài chính', 'Kế toán viên', 'off', '2022-05-02'],
  ['phan-minh-khoa', 'Phan Minh Khoa', 'GFT-0214', 'khoa.phan@gft.vn', false, 'Sản xuất', 'Công nhân vận hành', 'try', '2026-10-26'],
  ['dang-van-phuc', 'Đặng Văn Phúc', 'GFT-0072', 'phuc.dang@gft.vn', true, 'Sản xuất', 'Công nhân vận hành', 'out', '2019-11-11']
];

const ROWS: StaffRow[] = PEOPLE.map(([id, name, code, email, activated, dept, title, status, joined]) => ({
  id,
  name,
  initials: initials(name),
  code,
  email,
  activated,
  dept,
  title,
  status,
  statusLabel: STATUS_LABEL[status],
  joined
}));

// Cùng dạng `summary` của GET /api/v2/employees (test hợp đồng web/tests/staff-contract.spec.ts); thẻ chỉ số dựng từ đây.
const SUMMARY: StaffSummaryDTO = {
  month: '2026-10',
  asOf: '2026-10-26',
  prevMonth: '2026-09',
  compareYear: 2025,
  total: 131,
  active: { value: 128, prev: 124, delta: { dir: 'up', value: 4 } },
  joined: { value: 6, prev: 4, delta: { dir: 'up', value: 2 } },
  left: { value: 2, prev: 3, delta: { dir: 'down', value: 1 } },
  tenure: { value: 3.2, prev: 2.9, delta: { dir: 'up', value: 0.3 } },
  inactiveAccounts: 2,
  byType: MOCK_HEADCOUNT,
  byLevel: { nv: { '1': 5, '2': 7 }, ctv: { '1': 3 }, tts: { '1': 4 } },
  byTerm: { long: 15, short: 2, unset: 2 },
  byStatus: { ok: 17, try: 2, off: 0, out: 0 }
};
const STATS: StaffStat[] = staffStatsFromSummary(SUMMARY);

const HC = 'Hành chính · 08:00–17:00';
const FIXED = 'HĐLĐ từ 3 tháng';

// [loại · bậc, quản lý trực tiếp, ca làm, loại hợp đồng, đóng bảo hiểm, người phụ thuộc]; người chưa có nguồn là "—"
const JOB: Record<string, [string, string, string, string, string, string]> = {
  'nguyen-thu-ha': ['NV · Bậc 3', NONE, HC, FIXED, 'Có', '1'],
  'tran-minh-quan': ['NV · Bậc 4', NONE, HC, FIXED, 'Có', '2'],
  'le-hoang-nam': ['NV · Bậc 2', NONE, HC, FIXED, 'Có', '0'],
  'pham-ngoc-anh': ['NV · Bậc 2', NONE, HC, FIXED, 'Có', '1'],
  'vo-duc-thinh': ['NV · Bậc 3', NONE, HC, FIXED, 'Có', '1'],
  'do-mai-linh': ['NV · Bậc 2', NONE, HC, FIXED, 'Có', '0'],
  'bui-quoc-huy': ['NV · Bậc 2', NONE, HC, FIXED, 'Có', '2'],
  'hoang-thi-mai': ['NV · Bậc 2', 'Nguyễn Thu Hà', HC, 'HĐLĐ không xác định thời hạn', 'Có', '1']
};
const NO_JOB: [string, string, string, string, string, string] = [NONE, NONE, NONE, NONE, NONE, NONE];

const NOTES: Record<string, { title: string; text: string }> = {
  'hoang-thi-mai': { title: 'Nghỉ thai sản', text: '15/09/2026 – 15/03/2027 · đi làm lại 16/03/2027' }
};

/** Phản hồi giả của GET /api/v2/employees (đúng khoá của BE) cho 10 hồ sơ trang đầu. */
export function staffListDto() {
  return {
    employees: ROWS.map(r => ({
      profile: { uuid: `u-${r.id}`, familyName: '', givenName: '', fullName: r.name, birthday: null, dependants: 0 },
      account: {
        username: r.id,
        roles: ['staff'],
        primaryRole: 'staff',
        isLocked: !r.activated,
        lockedAt: null,
        lockedBy: null,
        createdAt: '2026-01-01T00:00:00Z'
      },
      contract: {
        position: { type: 'nv', level: 2, jobTitle: r.title },
        shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0, isOvernight: false },
        leave: { totalDays: 12, usedDays: 0, remainingDays: 12 },
        status: 'nv',
        term: 'long' as 'long' | 'short' | null,
        effectiveFrom: r.joined,
        resignedOn: null as string | null,
        hasInsurance: null as boolean | null,
        isUnionMember: false,
        hasTax: true,
        canAdvance: true,
        isDormResident: false
      },
      work: { active: r.status !== 'out', status: r.status, statusLabel: r.statusLabel, joinedOn: r.joined, tenure: '' }
    })),
    total: SUMMARY.total,
    summary: SUMMARY
  };
}

export function staffListView(): StaffListView {
  return { stats: STATS, total: 131, rows: ROWS };
}

export function staffProfile(id: string): StaffProfile | null {
  const p = ROWS.find(r => r.id === id);
  if (!p) return null;
  const [level, manager, shift, contract, insurance, dependents] = JOB[id] ?? NO_JOB;
  const span = p.status === 'out' ? '' : tenure(p.joined, MOCK_TODAY);
  const since = span ? `${dmy(p.joined)} · ${span}` : dmy(p.joined);
  return {
    id: p.id,
    name: p.name,
    initials: p.initials,
    code: p.code,
    title: p.title,
    status: p.status,
    statusLabel: p.statusLabel,
    note: NOTES[id] ?? null,
    groups: [
      {
        title: 'Công việc',
        facts: [
          { label: 'Phòng ban', value: p.dept },
          { label: 'Chức danh', value: p.title },
          { label: 'Loại · bậc', value: level },
          { label: 'Quản lý trực tiếp', value: manager },
          { label: 'Ca làm', value: shift },
          { label: 'Ngày vào làm', value: since }
        ]
      },
      {
        title: 'Hợp đồng',
        facts: [
          { label: 'Loại hợp đồng', value: contract },
          { label: 'Đóng bảo hiểm', value: insurance },
          { label: 'Người phụ thuộc', value: dependents }
        ]
      },
      {
        title: 'Tài khoản',
        facts: [
          { label: 'Email', value: p.email },
          { label: 'Kích hoạt', value: p.activated ? 'Đã kích hoạt' : 'Chưa kích hoạt' }
        ]
      }
    ]
  };
}
