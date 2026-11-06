// Bảng lương và ngăn kéo phiếu dựng từ phiếu BE v2 (builders/api/payroll.ts): chạy trong Node, không mở trang.
// Lỗi DB demo (docs/demo-db/payroll.md trên claude/demo-db): BUG-payroll-6 (loại · bậc), 7 (dấu trừ của Trừ giờ),
// 8 (tts không có KPI), 9 (lý do từ chối); và phép còn lại null (docs/fe-yeu-cau/phieu-luong-ngan-keo--loai-bac-trang-thai.md).
import { expect, test } from '@playwright/test';
import { payrollScreenFromPayslips, payslipFromRecord } from '../src/builders/api/payroll';

const details = (over: Record<string, unknown> = {}) => ({
  fullName: 'Lương Thị Bình',
  positionLevelText: 'Nhân viên · Bậc 2',
  contractStatusText: 'Dưới 3 tháng',
  employeeType: 'nv',
  level: 2,
  employmentStatus: 'probation',
  month: '2026-10',
  standardWorkdays: 26,
  actualWorkDays: 25,
  baseSalaryPolicy: 6500000,
  baseSalaryActual: 6250000,
  kpiApplicable: true,
  kpiScores: { wework: 80, user: 70, peer: null, manager: null, self: null },
  kpiActualPay: 1000000,
  totalAllowanceActual: 500000,
  otPayTotal: 0,
  lateEarlyDeductionAmount: -41563,
  paidLeaveDays: 0,
  holidayPaidDays: 0,
  isatDays: 0,
  unpaidLeaveDays: 0,
  paidLeavePay: 0,
  holidayPay: 0,
  leaveSettlementPay: 0,
  isatPay: 0,
  ot15Hours: 0,
  ot20Hours: 0,
  ot30Hours: 0,
  lateEarlyHours: 1.33,
  attendanceAllowancePolicy: 1500000,
  attendanceAllowanceActual: 0,
  travelAllowancePolicy: 900000,
  travelAllowanceActual: 500000,
  flexAllowancePolicy: 1200000,
  flexAllowanceActual: 0,
  offPaidNightPolicy: 975000,
  offPaidNightActual: 0,
  nightAllowancePolicy: 2400000,
  nightAllowanceActual: 0,
  kpiTotalScorePct: 48.8,
  kpiProposedAmount: 2000000,
  kpiMaxSalary: 3000000,
  grossIncome: 7708437,
  taxExemptIncome: 0,
  taxableIncome: 7708437,
  insuranceDeduction: 0,
  incomeAfterInsurance: 7708437,
  personalIncomeTax: 770844,
  advanceDeduction: 0,
  netIncome: 6937593,
  dependants: 0,
  remainingAnnualLeaveDays: 4,
  workPay: 6250000,
  ...over
});
const record = (over: Record<string, unknown> = {}, d: Record<string, unknown> = {}) => ({
  id: 3, username: 'lg-binh', status: 'draft', gross: 7708437, insurance: 0, tax: 770844, advance: 0, net: 6937593,
  note: null, decidedBy: null, decidedAt: null,
  details: details(d),
  ...over
});
const slip = (over: Record<string, unknown> = {}, d: Record<string, unknown> = {}) =>
  payslipFromRecord(record(over, d) as any);

// totals của GET /payroll/:month: BE cộng sẵn cả kỳ.
const TOTALS = {
  baseSalaryActual: 6250000, kpiActualPay: 1000000, allowance: 500000, otPay: 0, lateDeduction: 41563,
  gross: 7708437, insurance: 0, tax: 770844, advance: 0, deductions: 770844, net: 6937593, netShare: 90
};

test('BUG-payroll-6: position type and level come from the payslip, not "NV · Bậc 0"', () => {
  expect([slip().kind, slip().level]).toEqual(['NV', 2]);
  expect([slip({}, { employeeType: 'ctv', level: 2 }).kind, slip({}, { employeeType: 'ctv' }).level]).toEqual(['CTV', 2]);
  expect([slip({}, { employeeType: 'tts', level: 1 }).kind, slip({}, { employeeType: 'tts', level: 1 }).level]).toEqual(['TTS', 1]);
  expect(slip({}, { employeeType: null }).kind).toBe('—');
});

test('staff status: Thử việc / Chính thức from the payslip, none when BE has none', () => {
  expect(slip().employmentStatus).toBe('Thử việc');
  expect(slip({}, { employmentStatus: 'official' }).employmentStatus).toBe('Chính thức');
  expect(slip({}, { employmentStatus: null }).employmentStatus).toBeNull();
});

test('a payslip saved before BE had type, level and staff status shows blanks', () => {
  const old = details();
  for (const k of ['employeeType', 'level', 'employmentStatus']) delete (old as any)[k];
  const s = payslipFromRecord({ ...record(), details: old } as any, '2026-11-05');
  expect([s.kind, s.level, s.employmentStatus]).toEqual(['—', null, null]);
});

test('remaining annual leave stays null for a type with no leave account', () => {
  expect(slip().leaveLeft).toBe(4);
  expect(slip({}, { remainingAnnualLeaveDays: null }).leaveLeft).toBeNull();
});

test('BUG-payroll-9: the reason typed when rejecting comes back on the slip', () => {
  expect(slip({ status: 'rejected', note: 'Thiếu giải trình ngày trễ' }).decisionNote).toBe('Thiếu giải trình ngày trễ');
  expect(slip({ status: 'rejected', note: null }).decisionNote).toBeNull();
});

test('BUG-payroll-7: the late cut is a positive amount, so the table and drawer print one minus sign', () => {
  expect(slip().late.cut).toBe(41563);
  const screen = payrollScreenFromPayslips([record() as any], '2026-10', TOTALS);
  if (screen.empty) throw new Error('bảng rỗng');
  expect(screen.lines[0].lateCut).toBe(41563);
  expect(slip({}, { lateEarlyDeductionAmount: 0 }).late.cut).toBe(0);
});

test('BUG-payroll-8: a tts payslip says KPI does not apply', () => {
  expect(slip().kpiApplicable).toBe(true);
  expect(slip({}, { employeeType: 'tts', kpiApplicable: false }).kpiApplicable).toBe(false);
});

test('the board totals are the BE totals, not summed from the lines', () => {
  const screen = payrollScreenFromPayslips([record() as any, record({ username: 'x', gross: 1, net: 1 }) as any], '2026-10', {
    ...TOTALS, gross: 999, net: 888, netShare: 7, deductions: 111
  });
  if (screen.empty) throw new Error('bảng rỗng');
  expect(screen.totals).toEqual({
    gross: 999, insurance: 0, tax: 770844, advance: 0, deductions: 111, net: 888, netShare: 7,
    workPay: 6250000, kpiPay: 1000000, allowance: 500000, ot: 0, lateCut: 41563
  });
});

test('rates, late minutes, settlement, holiday and workPay come from the payslip', () => {
  const rates = {
    kpiWeights: { wework: 50, user: 20, peer: 15, manager: 10, self: 5 },
    insurancePct: { bhxh: 9, bhyt: 2, bhtn: 1, total: 12 },
    otMultipliers: { weekday: 1.8, weekend: 2, holiday: 3 },
    lateGraceMinutes: 10
  };
  const s = slip({}, {
    rates, lateMinutes: 40, workPay: 7000000, leaveSettlementPay: 100000, holidayPay: 269231, holidayPaidDays: 1,
    paidLeaveDays: 2, paidLeavePay: 538462,
    calendar: [{ date: '2026-10-01', kind: 'work' }, { date: '2026-10-04', kind: 'rest' }, { date: '2026-10-30', kind: 'future' }, { date: '2026-10-02', kind: 'isat' }]
  });
  expect(s.rates).toEqual(rates);
  expect(s.late.minutes).toBe(40);
  expect(s.calc.workPay).toBe(7000000);
  expect(s.settlementPay).toBe(100000);
  expect(s.holiday).toEqual({ days: 1, pay: 269231 });
  expect([s.days.leave, s.leavePay]).toEqual([2, 538462]);
  // Dải ngày là loại BE gán; FE không so với ngày máy.
  expect(s.calendar).toEqual(['work', 'sunday', 'future', 'isat']);
});

test('a payslip saved before BE returned rates, late minutes or a calendar shows none of them', () => {
  const s = slip();
  expect([s.rates, s.late.minutes, s.calendar]).toEqual([null, 0, []]);
  expect(s.calc.workPay).toBe(6250000);
});
