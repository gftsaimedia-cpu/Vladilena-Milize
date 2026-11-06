// Màn Bảng lương từ GET /api/v2/payroll/:month (phiếu đã tính của lần chạy nháp hoặc chốt). Tiền, tổng cả kỳ và các
// tỉ lệ áp dụng do BE tính; ở đây chỉ ánh xạ và đếm. BE chưa có phòng ban, ngày trả lương, so sánh tháng trước: các ô đó để trống.
import type { DayKind, Payslip, PayrollLine, PayrollScreen, PayrollStatus, SlipCounts, SlipRates } from '../../mock/payroll';
import type { KpiPart } from '../../mock/payroll-calc';
import { KPI_LABELS, employeeTypeLabel, employmentStatusLabel } from '../../constants/labels';
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
  // Lý do Admin ghi khi duyệt / từ chối (null khi không có), người và lúc quyết định.
  note?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  details: {
    fullName: string;
    positionLevelText: string;
    // Ba trường dưới thiếu ở phiếu lưu trước khi BE thêm chúng: hiện "—".
    employeeType?: string | null;
    level?: number;
    employmentStatus?: string | null;
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
export const statusOf = (s: string): PayrollStatus =>
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
    // BE trả tiền trừ giờ là số âm; màn hiện số dương sau dấu "−" (một dấu trừ duy nhất).
    lateCut: Math.abs(d.lateEarlyDeductionAmount),
    gross: r.gross,
    insurance: r.insurance,
    tax: r.tax,
    advance: r.advance,
    net: r.net,
    status: statusOf(r.status)
  };
}

// `totals` của GET /payroll/:month: cộng sẵn cả kỳ (mọi phiếu của lần chạy hiện tại, không theo bộ lọc của màn).
export type PayrollTotalsDTO = {
  baseSalaryActual: number;
  kpiActualPay: number;
  allowance: number;
  otPay: number;
  lateDeduction: number;
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  deductions: number;
  net: number;
  netShare: number;
};

export function payrollScreenFromPayslips(items: PayslipRecordDTO[], month: string, totals: PayrollTotalsDTO): PayrollScreen {
  if (!items.length) return { month, empty: true };
  const lines = items.map(lineOf).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const count = (s: PayrollStatus) => lines.filter(l => l.status === s).length;
  const counts: SlipCounts = { all: lines.length, draft: count('draft'), pending: count('pending'), done: count('done'), rejected: count('rejected') };
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
    totals: {
      gross: totals.gross,
      insurance: totals.insurance,
      tax: totals.tax,
      advance: totals.advance,
      deductions: totals.deductions,
      net: totals.net,
      netShare: totals.netShare,
      workPay: totals.baseSalaryActual,
      kpiPay: totals.kpiActualPay,
      allowance: totals.allowance,
      ot: totals.otPay,
      lateCut: totals.lateDeduction
    }
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
  workPay?: number; // thiếu ở phiếu lưu trước khi BE thêm: lấy tiền ngày công
  lateMinutes?: number; // thiếu ở phiếu lưu trước khi BE thêm
  rates?: SlipRates; // như trên
  calendar?: { date: string; kind: 'work' | 'leave' | 'isat' | 'unpaid' | 'rest' | 'future' }[]; // như trên
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
  remainingAnnualLeaveDays: number | null;
};

// Ô ngày của dải chấm công: BE gán loại cho từng ngày của tháng (calendar). 'rest' (ngày nghỉ tuần) là ô Chủ nhật của dải.
// Phiếu lưu trước khi BE có calendar: không có dải.
const DAY_KIND: Record<string, DayKind> = { work: 'work', leave: 'leave', isat: 'isat', unpaid: 'unpaid', rest: 'sunday', future: 'future' };
const calendarOf = (days: PayslipDetailDTO['calendar']): DayKind[] => (days ?? []).map(d => DAY_KIND[d.kind] ?? 'unpaid');

/** Phiếu lương của ngăn kéo từ phiếu đã lưu (GET /payroll/:month/:username). Mọi số tiền lấy nguyên của BE. */
export function payslipFromRecord(r: PayslipRecordDTO & { details: PayslipDetailDTO }): Payslip {
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
  return {
    id: line.id,
    name: line.name,
    initials: line.initials,
    dept: line.dept,
    title: line.title,
    kind: employeeTypeLabel(d.employeeType),
    level: d.level ?? null,
    employmentStatus: employmentStatusLabel(d.employmentStatus),
    contract: d.contractStatusText || NONE,
    payday: NONE,
    note: `Công chuẩn: ${d.standardWorkdays} ngày`,
    status: line.status,
    decisionNote: r.note ?? null,
    base: d.baseSalaryPolicy,
    dependants: d.dependants,
    days: {
      work: d.actualWorkDays,
      leave: d.paidLeaveDays,
      isat: d.isatDays,
      pending: 0,
      unpaid: d.unpaidLeaveDays,
      standard: d.standardWorkdays
    },
    calendar: calendarOf(d.calendar),
    pendingDates: [],
    leavePay: d.paidLeavePay,
    isatPay: d.isatPay,
    settlementPay: d.leaveSettlementPay,
    holiday: { days: d.holidayPaidDays, pay: d.holidayPay },
    allowances,
    ot: { hours: [d.ot15Hours, d.ot20Hours, d.ot30Hours], pay: d.otPayTotal },
    late: { minutes: d.lateMinutes ?? 0, hours: d.lateEarlyHours, cut: line.lateCut },
    rates: d.rates ?? null,
    exempt: d.taxExemptIncome,
    advance: d.advanceDeduction,
    leaveLeft: d.remainingAnnualLeaveDays ?? null,
    kpiApplicable: d.kpiApplicable,
    kpi: {
      scores: Object.fromEntries(parts.map(p => [p, d.kpiScores?.[p] ?? null])) as Record<KpiPart, number | null>,
      proposal: d.kpiProposedAmount ?? d.kpiMaxSalary,
      history: []
    },
    calc: {
      baseActual: d.baseSalaryActual,
      workPay: d.workPay ?? d.baseSalaryActual,
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
