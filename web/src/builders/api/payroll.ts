// Màn Bảng lương từ GET /api/v2/payroll/:month (phiếu đã tính của lần chạy nháp hoặc chốt). Tiền do BE tính; ở đây chỉ
// gom và đếm. BE chưa có phòng ban, ngày trả lương, so sánh tháng trước: các ô đó để trống.
import type { DayKind, Payslip, PayrollLine, PayrollScreen, PayrollStatus, SlipCounts } from '../../mock/payroll';
import type { KpiPart } from '../../mock/payroll-calc';
import { KPI_LABELS } from '../../constants/labels';
import { initials } from '../../utils/format';

export type PayslipRecordDTO = {
  id: number;
  username: string;
  status: string;
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  net: number;
  details: {
    fullName: string;
    positionLevelText: string;
    standardWorkdays: number;
    actualWorkDays: number;
    baseSalaryPolicy: number;
    baseSalaryActual: number;
    kpiApplicable: boolean;
    kpiScores: Record<KpiPart, number | null>;
    kpiActualPay: number;
    totalAllowanceActual: number;
    otPayTotal: number;
    lateEarlyDeductionAmount: number;
  };
};

const NONE = '—';
// Trạng thái phiếu của BE: nháp → nháp; Admin đã duyệt hoặc kỳ đã chốt → xong; Admin từ chối → bị từ chối.
const statusOf = (s: string): PayrollStatus =>
  s === 'final' || s === 'approved' ? 'done' : s === 'rejected' ? 'rejected' : 'draft';

function lineOf(r: PayslipRecordDTO): PayrollLine {
  const d = r.details;
  const name = d.fullName || r.username;
  const missing = d.kpiApplicable
    ? (Object.keys(KPI_LABELS) as KpiPart[]).filter(p => d.kpiScores?.[p] == null).map(p => KPI_LABELS[p])
    : [];
  return {
    id: r.username,
    name,
    initials: initials(name),
    dept: NONE,
    title: d.positionLevelText || NONE,
    base: d.baseSalaryPolicy,
    days: d.actualWorkDays,
    standard: d.standardWorkdays,
    workPay: d.baseSalaryActual,
    kpiPay: d.kpiActualPay,
    kpiMissing: missing,
    allowance: d.totalAllowanceActual,
    ot: d.otPayTotal,
    lateCut: d.lateEarlyDeductionAmount,
    gross: r.gross,
    insurance: r.insurance,
    tax: r.tax,
    advance: r.advance,
    net: r.net,
    status: statusOf(r.status)
  };
}

export function payrollScreenFromPayslips(items: PayslipRecordDTO[], month: string): PayrollScreen {
  if (!items.length) return { month, empty: true };
  const lines = items.map(lineOf).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const count = (s: PayrollStatus) => lines.filter(l => l.status === s).length;
  const counts: SlipCounts = { all: lines.length, draft: count('draft'), pending: count('pending'), done: count('done'), rejected: count('rejected') };
  const sum = (k: 'gross' | 'insurance' | 'tax' | 'advance' | 'net') => lines.reduce((a, l) => a + (Number(l[k]) || 0), 0);
  const gross = sum('gross');
  const insurance = sum('insurance');
  const tax = sum('tax');
  const advance = sum('advance');
  const net = sum('net');
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    month,
    empty: false,
    range: `01–${lastDay}/${String(m).padStart(2, '0')}`,
    payday: NONE,
    growth: '',
    lines,
    counts,
    depts: [],
    totals: { gross, insurance, tax, advance, deductions: insurance + tax + advance, net, netShare: gross ? Math.round((net / gross) * 100) : 0 }
  };
}

// ---------- Phiếu lương chi tiết (ngăn kéo) ----------

export type PayslipDetailDTO = PayslipRecordDTO['details'] & {
  contractStatusText: string;
  month: string;
  paidLeaveDays: number;
  holidayPaidDays: number;
  isatDays: number;
  unpaidLeaveDays: number;
  paidLeavePay: number;
  holidayPay: number;
  leaveSettlementPay: number;
  isatPay: number;
  ot15Hours: number;
  ot20Hours: number;
  ot30Hours: number;
  lateEarlyHours: number;
  attendanceAllowancePolicy: number;
  attendanceAllowanceActual: number;
  travelAllowancePolicy: number;
  travelAllowanceActual: number;
  flexAllowancePolicy: number;
  flexAllowanceActual: number;
  offPaidNightPolicy: number;
  offPaidNightActual: number;
  nightAllowancePolicy: number;
  nightAllowanceActual: number;
  kpiTotalScorePct: number;
  kpiProposedAmount: number | null;
  kpiMaxSalary: number;
  grossIncome: number;
  taxExemptIncome: number;
  taxableIncome: number;
  insuranceDeduction: number;
  incomeAfterInsurance: number;
  personalIncomeTax: number;
  advanceDeduction: number;
  netIncome: number;
  dependants: number;
  remainingAnnualLeaveDays: number;
  dailyLines: { date: string; shiftCode: string; workHours: number }[];
};

const DAY_OF_SHIFT: Record<string, DayKind> = { LEAVE: 'leave', ISAT: 'isat', UNPAID: 'unpaid' };

// Một ô mỗi ngày của tháng: theo dòng công của ngày đó; Chủ nhật không có dòng là "sunday"; sau hôm nay là "future";
// ngày thường đã qua mà không có dòng công là "unpaid".
function calendarOf(month: string, lines: PayslipDetailDTO['dailyLines'], today: string): DayKind[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDate = new Map(lines.map(l => [l.date, l]));
  const out: DayKind[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const line = byDate.get(date);
    if (line) out.push(DAY_OF_SHIFT[line.shiftCode] ?? (line.workHours > 0 ? 'work' : 'unpaid'));
    else if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) out.push('sunday');
    else out.push(date > today ? 'future' : 'unpaid');
  }
  return out;
}

/** Phiếu lương của ngăn kéo từ phiếu đã lưu (GET /payroll/:month/:username). Mọi số tiền lấy nguyên của BE. */
export function payslipFromRecord(r: PayslipRecordDTO & { details: PayslipDetailDTO }, today: string): Payslip {
  const d = r.details;
  const line = lineOf(r);
  const parts = Object.keys(KPI_LABELS) as KpiPart[];
  const allowances = [
    { label: 'Chuyên cần', rule: d.attendanceAllowancePolicy, actual: d.attendanceAllowanceActual },
    { label: 'Đi lại', rule: d.travelAllowancePolicy, actual: d.travelAllowanceActual },
    { label: 'Linh hoạt (ca Flex)', rule: d.flexAllowancePolicy, actual: d.flexAllowanceActual },
    { label: 'Off Paid (ca đêm)', rule: d.offPaidNightPolicy, actual: d.offPaidNightActual },
    { label: 'Thưởng ca đêm', rule: d.nightAllowancePolicy, actual: d.nightAllowanceActual }
  ];
  const leavePay = d.paidLeavePay + d.holidayPay + d.leaveSettlementPay;
  return {
    id: line.id,
    name: line.name,
    initials: line.initials,
    dept: line.dept,
    title: line.title,
    kind: 'NV',
    level: 0,
    contract: d.contractStatusText || NONE,
    payday: NONE,
    note: `Công chuẩn: ${d.standardWorkdays} ngày`,
    status: line.status,
    base: d.baseSalaryPolicy,
    dependants: d.dependants,
    days: {
      work: d.actualWorkDays,
      leave: d.paidLeaveDays + d.holidayPaidDays,
      isat: d.isatDays,
      pending: 0,
      unpaid: d.unpaidLeaveDays,
      standard: d.standardWorkdays
    },
    calendar: calendarOf(d.month, d.dailyLines || [], today),
    pendingDates: [],
    leavePay,
    isatPay: d.isatPay,
    allowances,
    ot: { hours: [d.ot15Hours, d.ot20Hours, d.ot30Hours], pay: d.otPayTotal },
    late: { minutes: [], hours: d.lateEarlyHours, cut: d.lateEarlyDeductionAmount },
    exempt: d.taxExemptIncome,
    advance: d.advanceDeduction,
    leaveLeft: d.remainingAnnualLeaveDays,
    kpi: {
      scores: Object.fromEntries(parts.map(p => [p, d.kpiScores?.[p] ?? null])) as Record<KpiPart, number | null>,
      proposal: d.kpiProposedAmount ?? d.kpiMaxSalary,
      history: []
    },
    calc: {
      baseActual: d.baseSalaryActual,
      workPay: d.baseSalaryActual + leavePay + d.isatPay,
      kpiPercent: d.kpiTotalScorePct,
      kpiMissing: d.kpiApplicable ? parts.filter(p => d.kpiScores?.[p] == null) : [],
      kpiPay: d.kpiActualPay,
      allowanceTotal: d.totalAllowanceActual,
      gross: d.grossIncome,
      taxable: d.taxableIncome,
      insurance: d.insuranceDeduction,
      afterInsurance: d.incomeAfterInsurance,
      tax: d.personalIncomeTax,
      net: d.netIncome
    }
  };
}
