// Bảng lương giả của tháng 10/2026: 10 phiếu mẫu có số liệu đầy đủ, 118 phiếu còn lại chỉ là số cộng chung.
// Trạng thái phiếu, điểm KPI và lịch sử sửa điểm giữ trong bộ nhớ (mất khi tải lại trang).
import { dm, initials } from '../utils/format';
import { mockAccount, readSessionName } from './accounts';
import { MOCK_MONTH, MOCK_TODAY } from './clock';
import { normalizeScore, recomputeSlip, type KpiPart, type KpiScores, type SlipCalc, type SlipInput } from './payroll-calc';

export type PayrollStatus = 'draft' | 'pending' | 'done' | 'rejected';
export type DayKind = 'work' | 'leave' | 'isat' | 'pending' | 'unpaid' | 'sunday' | 'future';
export type KpiEdit = { date: string; text: string; by: string };

import { KPI_LABELS } from '../constants/labels';
export { KPI_LABELS };
const PARTS = Object.keys(KPI_LABELS) as KpiPart[];

export type Payslip = SlipInput & {
  id: string;
  name: string;
  initials: string;
  dept: string;
  title: string;
  kind: 'NV';
  level: number;
  contract: string;
  payday: string;
  note: string;
  status: PayrollStatus;
  days: { work: number; leave: number; isat: number; pending: number; unpaid: number; standard: number };
  calendar: DayKind[];
  pendingDates: string[];
  allowances: { label: string; rule: number; actual: number }[];
  ot: { hours: [number, number, number]; pay: number };
  late: { minutes: number[]; hours: number; cut: number };
  leaveLeft: number;
  kpi: { scores: KpiScores; proposal: number; history: KpiEdit[] };
  calc: SlipCalc;
};

export type PayrollLine = {
  id: string;
  name: string;
  initials: string;
  dept: string;
  title: string;
  base: number;
  days: number;
  standard: number;
  workPay: number;
  kpiPay: number;
  kpiMissing: string[];
  allowance: number;
  ot: number;
  lateCut: number;
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  net: number;
  status: PayrollStatus;
};

export type SlipCounts = { all: number; draft: number; pending: number; done: number; rejected: number };

export type PayrollScreen =
  | { month: string; empty: true }
  | {
      month: string;
      empty: false;
      range: string;
      payday: string;
      growth: string;
      lines: PayrollLine[];
      counts: SlipCounts;
      depts: string[];
      totals: {
        gross: number;
        insurance: number;
        tax: number;
        advance: number;
        deductions: number;
        net: number;
        netShare: number;
      };
    };

const STANDARD = 26;
const ALLOWANCE_LABELS = ['Chuyên cần', 'Đi lại', 'Linh hoạt (ca Flex)', 'Off Paid (ca đêm)', 'Thưởng ca đêm'];
const NOTE = 'Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 28/10 · công chuẩn theo quy chế: 26 ngày';

type Scores5 = [number | null, number | null, number | null, number | null, number | null];
type Raw = {
  id: string;
  name: string;
  dept: string;
  title: string;
  level: number;
  dependants: number;
  base: number;
  // Ngày trong tháng 10 theo từng loại nghỉ
  leave: number[];
  isat: number[];
  pending: number[];
  unpaid: number[];
  leaveLeft: number;
  status: PayrollStatus;
  // Số lưu sẵn (khoản chưa chốt luật)
  leavePay: number;
  isatPay: number;
  // [theo quy chế, thực tế] theo thứ tự ALLOWANCE_LABELS
  allowances: [number, number][];
  otHours: [number, number, number];
  otPay: number;
  exempt: number;
  lateMinutes: number[];
  lateHours: number;
  lateCut: number;
  advance: number;
  // Base Wework, Người dùng, Đồng nghiệp, Quản lý, Tự đánh giá
  scores: Scores5;
  proposal: number;
  history?: KpiEdit[];
};

/* prettier-ignore */
const RAW: Raw[] = [
  {
    id: 'GFT-0101', name: 'Nguyễn Thu Hà', dept: 'Tài chính', title: 'Kế toán tổng hợp', level: 3, dependants: 1, base: 16000000,
    leave: [], isat: [10], pending: [], unpaid: [], leaveLeft: 12, status: 'done',
    leavePay: 0, isatPay: 615385,
    allowances: [[2000000, 2000000], [800000, 800000], [3200000, 0], [975000, 0], [6400000, 0]],
    otHours: [4, 0, 0], otPay: 461538, exempt: 153846, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 0,
    scores: [90, 85, 80, 88, 90], proposal: 3000000
  },
  {
    id: 'GFT-0108', name: 'Trần Minh Quân', dept: 'Kỹ thuật', title: 'Kỹ sư phần mềm', level: 4, dependants: 2, base: 24000000,
    leave: [15], isat: [24], pending: [], unpaid: [], leaveLeft: 9, status: 'done',
    leavePay: 923077, isatPay: 923077,
    allowances: [[2500000, 2403846], [1000000, 961538], [4800000, 0], [975000, 0], [9600000, 0]],
    otHours: [6, 4, 0], otPay: 1961538, exempt: 807692, lateMinutes: [18], lateHours: 0.5, lateCut: 57692, advance: 0,
    scores: [88, 92, 85, 90, 95], proposal: 5000000
  },
  {
    id: 'GFT-0142', name: 'Lê Hoàng Nam', dept: 'Kinh doanh', title: 'Nhân viên kinh doanh', level: 2, dependants: 0, base: 12000000,
    leave: [12], isat: [17], pending: [27], unpaid: [], leaveLeft: 11, status: 'pending',
    leavePay: 461538, isatPay: 461538,
    allowances: [[1500000, 1384615], [900000, 830769], [2400000, 0], [975000, 0], [4800000, 0]],
    otHours: [0, 0, 0], otPay: 0, exempt: 0, lateMinutes: [12], lateHours: 0, lateCut: 0, advance: 0,
    scores: [62, 70, 68, 65, 75], proposal: 2000000,
    history: [
      { date: '27/10', text: 'Quản lý trực tiếp 60 → 65', by: 'Trưởng phòng Kinh doanh' },
      { date: '25/10', text: 'Đồng nghiệp 72 → 68', by: 'Quản trị viên' },
      { date: '20/10', text: 'Base Wework nhập 62', by: 'Quản trị viên' }
    ]
  },
  {
    id: 'GFT-0117', name: 'Phạm Ngọc Anh', dept: 'Nhân sự', title: 'Chuyên viên nhân sự', level: 2, dependants: 1, base: 14000000,
    leave: [], isat: [3], pending: [], unpaid: [], leaveLeft: 12, status: 'pending',
    leavePay: 0, isatPay: 538462,
    allowances: [[1500000, 1500000], [700000, 700000], [2800000, 0], [975000, 0], [5600000, 0]],
    otHours: [0, 0, 0], otPay: 0, exempt: 0, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 0,
    scores: [80, 82, 78, 85, 80], proposal: 2500000
  },
  {
    id: 'GFT-0123', name: 'Võ Đức Thịnh', dept: 'Kỹ thuật', title: 'Trưởng nhóm QA', level: 3, dependants: 1, base: 20000000,
    leave: [20, 21], isat: [10], pending: [], unpaid: [23], leaveLeft: 8, status: 'draft',
    leavePay: 1538462, isatPay: 769231,
    allowances: [[2000000, 1769231], [1000000, 884615], [4000000, 461538], [975000, 0], [8000000, 0]],
    otHours: [0, 0, 0], otPay: 0, exempt: 0, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 0,
    scores: [85, 80, 82, 88, 85], proposal: 4000000
  },
  {
    id: 'GFT-0156', name: 'Đỗ Mai Linh', dept: 'Marketing', title: 'Thiết kế đồ hoạ', level: 2, dependants: 0, base: 13000000,
    leave: [6], isat: [17], pending: [], unpaid: [13, 14, 15], leaveLeft: 10, status: 'rejected',
    leavePay: 500000, isatPay: 500000,
    allowances: [[1300000, 1100000], [700000, 592308], [2600000, 0], [975000, 0], [5200000, 0]],
    otHours: [0, 0, 0], otPay: 0, exempt: 0, lateMinutes: [45, 30, 24], lateHours: 2, lateCut: 125000, advance: 0,
    scores: [70, 75, 72, 70, 80], proposal: 2000000
  },
  {
    id: 'GFT-0063', name: 'Bùi Quốc Huy', dept: 'Sản xuất', title: 'Tổ trưởng', level: 2, dependants: 2, base: 11000000,
    leave: [], isat: [24], pending: [], unpaid: [8, 9], leaveLeft: 12, status: 'draft',
    leavePay: 0, isatPay: 423077,
    allowances: [[1000000, 923077], [600000, 553846], [2200000, 0], [975000, 225000], [4400000, 1015385]],
    otHours: [8, 0, 0], otPay: 634615, exempt: 1226923, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 2000000,
    scores: [80, 78, 75, 82, null], proposal: 2000000
  },
  {
    id: 'GFT-0171', name: 'Trịnh Văn Long', dept: 'Sản xuất', title: 'Công nhân vận hành', level: 1, dependants: 1, base: 9500000,
    leave: [], isat: [3], pending: [22], unpaid: [], leaveLeft: 12, status: 'pending',
    leavePay: 0, isatPay: 365385,
    allowances: [[900000, 865385], [500000, 480769], [1900000, 0], [975000, 300000], [3800000, 1169231]],
    otHours: [6, 0, 0], otPay: 411058, exempt: 1306250, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 0,
    scores: [78, 75, 80, 76, 85], proposal: 1500000
  },
  {
    id: 'GFT-0172', name: 'Lý Thanh Tâm', dept: 'Sản xuất', title: 'Công nhân vận hành', level: 1, dependants: 0, base: 9500000,
    leave: [], isat: [10], pending: [], unpaid: [], leaveLeft: 12, status: 'draft',
    leavePay: 0, isatPay: 365385,
    allowances: [[900000, 900000], [500000, 500000], [1900000, 292308], [975000, 0], [3800000, 0]],
    otHours: [0, 4, 0], otPay: 365385, exempt: 182692, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 0,
    scores: [82, 80, 78, 80, 85], proposal: 1500000
  },
  {
    id: 'GFT-0175', name: 'Ngô Gia Bảo', dept: 'Sản xuất', title: 'Công nhân vận hành', level: 1, dependants: 0, base: 9500000,
    leave: [16], isat: [24], pending: [], unpaid: [], leaveLeft: 11, status: 'pending',
    leavePay: 365385, isatPay: 365385,
    allowances: [[900000, 865385], [500000, 480769], [1900000, 0], [975000, 187500], [3800000, 730769]],
    otHours: [3, 0, 0], otPay: 205529, exempt: 799279, lateMinutes: [], lateHours: 0, lateCut: 0, advance: 0,
    scores: [75, 78, 72, 80, 80], proposal: 1500000
  }
];

// 118 phiếu không có trong 10 dòng mẫu: chỉ có số đếm và số tiền cộng chung.
const REST_SLIPS = 118;
const REST = {
  counts: { draft: 9, pending: 25, done: 84, rejected: 0 },
  gross: 2292000000,
  insurance: 245500000,
  tax: 89700000,
  advance: 18000000
};

// Trạng thái đang sửa, theo mã. Điểm và lịch sử là bản sao để không sửa nhầm hằng RAW.
const state = new Map(
  RAW.map(r => [
    r.id,
    {
      status: r.status,
      scores: Object.fromEntries(PARTS.map((p, i) => [p, r.scores[i]])) as KpiScores,
      history: (r.history ?? []).map(h => ({ ...h }))
    }
  ])
);

const pad2 = (n: number) => String(n).padStart(2, '0');

function buildSlip(r: Raw): Payslip {
  const s = state.get(r.id)!;
  const kinds = new Map<number, DayKind>();
  const mark = (days: number[], kind: DayKind) => days.forEach(d => kinds.set(d, kind));
  mark(r.leave, 'leave');
  mark(r.isat, 'isat');
  mark(r.pending, 'pending');
  mark(r.unpaid, 'unpaid');
  // Chủ nhật 4, 11, 18, 25/10 không có lịch; từ 29/10 là ngày tới.
  const calendar: DayKind[] = Array.from({ length: 31 }, (_, i) => {
    const d = i + 1;
    return kinds.get(d) ?? ([4, 11, 18, 25].includes(d) ? 'sunday' : d >= 29 ? 'future' : 'work');
  });
  const off = r.leave.length + r.isat.length + r.pending.length + r.unpaid.length;
  const slip: Omit<Payslip, 'calc'> = {
    id: r.id,
    name: r.name,
    initials: initials(r.name),
    dept: r.dept,
    title: r.title,
    kind: 'NV',
    level: r.level,
    contract: 'HĐLĐ từ 3 tháng',
    payday: '05/11/2026',
    note: NOTE,
    status: s.status,
    base: r.base,
    dependants: r.dependants,
    days: {
      work: 27 - off,
      leave: r.leave.length,
      isat: r.isat.length,
      pending: r.pending.length,
      unpaid: r.unpaid.length,
      standard: STANDARD
    },
    calendar,
    pendingDates: r.pending.map(d => `${pad2(d)}/10`),
    leavePay: r.leavePay,
    isatPay: r.isatPay,
    allowances: r.allowances.map(([rule, actual], i) => ({ label: ALLOWANCE_LABELS[i], rule, actual })),
    ot: { hours: [...r.otHours], pay: r.otPay },
    late: { minutes: [...r.lateMinutes], hours: r.lateHours, cut: r.lateCut },
    exempt: r.exempt,
    advance: r.advance,
    leaveLeft: r.leaveLeft,
    kpi: { scores: { ...s.scores }, proposal: r.proposal, history: s.history.map(h => ({ ...h })) }
  };
  return recomputeSlip(slip);
}

export function payrollView(month: string): PayrollScreen {
  if (month !== MOCK_MONTH) return { month, empty: true };
  const lines: PayrollLine[] = RAW.map(buildSlip).map(s => ({
    id: s.id,
    name: s.name,
    initials: s.initials,
    dept: s.dept,
    title: s.title,
    base: s.base,
    days: s.days.work,
    standard: s.days.standard,
    workPay: s.calc.workPay,
    kpiPay: s.calc.kpiPay,
    kpiMissing: s.calc.kpiMissing.map(p => KPI_LABELS[p]),
    allowance: s.calc.allowanceTotal,
    ot: s.ot.pay,
    lateCut: s.late.cut,
    gross: s.calc.gross,
    insurance: s.calc.insurance,
    tax: s.calc.tax,
    advance: s.advance,
    net: s.calc.net,
    status: s.status
  }));
  const count = (status: PayrollStatus) => REST.counts[status] + lines.filter(l => l.status === status).length;
  const counts: SlipCounts = {
    all: lines.length + REST_SLIPS,
    draft: count('draft'),
    pending: count('pending'),
    done: count('done'),
    rejected: count('rejected')
  };
  const sum = (key: 'gross' | 'insurance' | 'tax' | 'advance') => lines.reduce((a, l) => a + l[key], 0);
  const gross = REST.gross + sum('gross');
  const insurance = REST.insurance + sum('insurance');
  const tax = REST.tax + sum('tax');
  const advance = REST.advance + sum('advance');
  const deductions = insurance + tax + advance;
  const net = gross - deductions;
  return {
    month,
    empty: false,
    range: '01–31/10',
    payday: '05/11/2026',
    growth: '▲ 3,2% so với tháng 9',
    lines,
    counts,
    depts: [...new Set(lines.map(l => l.dept))],
    totals: { gross, insurance, tax, advance, deductions, net, netShare: Math.round((net / gross) * 100) }
  };
}

export function payslipView(month: string, id: string): Payslip | null {
  const raw = month === MOCK_MONTH ? RAW.find(r => r.id === id) : undefined;
  return raw ? buildSlip(raw) : null;
}

export function setKpiScore(month: string, id: string, part: KpiPart, value: number | null): Payslip | null {
  const s = month === MOCK_MONTH ? state.get(id) : undefined;
  if (!s) return null;
  const old = s.scores[part];
  value = normalizeScore(value);
  if (old !== value) {
    const label = KPI_LABELS[part];
    const text =
      old == null ? `${label} nhập ${value}` : value == null ? `${label} xoá điểm ${old}` : `${label} ${old} → ${value}`;
    const by = mockAccount(readSessionName() ?? 'admin').user.name;
    s.history.unshift({ date: dm(MOCK_TODAY), text, by });
    s.scores[part] = value;
  }
  return payslipView(month, id);
}

export function decidePayslip(month: string, id: string, decision: 'approve' | 'reject'): Payslip | null {
  const s = month === MOCK_MONTH ? state.get(id) : undefined;
  if (!s) return null;
  s.status = decision === 'approve' ? 'done' : 'rejected';
  return payslipView(month, id);
}
