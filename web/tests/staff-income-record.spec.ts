// Màn Thu nhập của app nhân viên dựng từ GET /api/v2/me/income (builders/api/staff-phone.ts incomeViewOf): chạy trong Node.
// BUG-payroll-13 (docs/demo-db/payroll.md trên claude/demo-db): các khoản phải cộng ra đúng Thực nhận, kể cả khi tháng có OT,
// trừ giờ, quyết toán phép dư, ngày lễ và tạm ứng. Phiếu chính thức có thêm bảo hiểm và thuế; tạm tính thì không (luật 05/11).
import { expect, test } from '@playwright/test';
import { incomeViewOf } from '../src/builders/api/staff-phone';

// Lương Thị Chi, tháng 10/2026: OT ngày thường, trừ giờ, 2 ngày phép năm, quyết toán phép dư, 1 ngày lễ, tạm ứng đã duyệt.
const payslip = (over: Record<string, unknown> = {}) => ({
  baseSalaryActual: 6461538,
  paidLeavePay: 538462,
  leaveSettlementPay: 100000,
  isatPay: 0,
  holidayPay: 269231,
  otPayTotal: 201923,
  totalAllowanceActual: 1500000,
  kpiActualPay: 2000000,
  lateEarlyDeductionAmount: -16827,
  grossIncome: 11054327,
  insuranceDeduction: 735000,
  personalIncomeTax: 0,
  advanceDeduction: 2153846,
  netIncome: 8165481,
  kpiTotalScorePct: 80,
  kpiProposedAmount: 2500000,
  kpiMaxSalary: 3000000,
  kpiScores: { wework: 80, user: 80, peer: 80, manager: 80, self: 80 },
  ...over
});
// "−735.000" / "6.461.538" / "0" → số.
const amount = (text: string) => Number(text.replace('−', '-').replace(/\./g, '')) || 0;
const lines = (state: 'official' | 'estimate', p: Record<string, unknown>) =>
  incomeViewOf({ month: '2026-10', state, payslip: p, range: { from: '2026-08', to: '2026-11' } }).lines;

test('BUG-payroll-13: an official month lists OT, the late cut and the advance, and the lines add up to Thực nhận', () => {
  const ls = lines('official', payslip());
  expect(ls.map(l => [l.label, l.value])).toEqual([
    ['Lương ngày công', '6.461.538'],
    ['Nghỉ phép, iSAT', '907.693'],
    ['Làm thêm giờ', '201.923'],
    ['Phụ cấp', '1.500.000'],
    ['Lương KPI', '2.000.000'],
    ['Trừ đi muộn, về sớm', '−16.827'],
    ['Bảo hiểm bắt buộc', '−735.000'],
    ['Thuế TNCN', '0'],
    ['Tạm ứng', '−2.153.846']
  ]);
  expect(ls.reduce((a, l) => a + amount(l.value), 0)).toBe(8165481);
});

test('an estimate has no insurance or tax line, keeps the advance, and still adds up to Thực nhận', () => {
  // Tạm tính của BE: Thực nhận = tổng thu nhập − tạm ứng (không trừ bảo hiểm, thuế).
  const p = payslip({ insuranceDeduction: 0, personalIncomeTax: 0, netIncome: 11054327 - 2153846 });
  const ls = lines('estimate', p);
  expect(ls.map(l => l.label)).toEqual([
    'Lương ngày công', 'Nghỉ phép, iSAT', 'Làm thêm giờ', 'Phụ cấp', 'Lương KPI', 'Trừ đi muộn, về sớm', 'Tạm ứng'
  ]);
  expect(ls.reduce((a, l) => a + amount(l.value), 0)).toBe(11054327 - 2153846);
});

test('a month with no OT, no late cut and no advance keeps the short list', () => {
  const p = payslip({
    otPayTotal: 0, lateEarlyDeductionAmount: 0, advanceDeduction: 0, leaveSettlementPay: 0, holidayPay: 0,
    grossIncome: 10500000, netIncome: 9765000
  });
  const ls = lines('official', p);
  expect(ls.map(l => l.label)).toEqual([
    'Lương ngày công', 'Nghỉ phép, iSAT', 'Phụ cấp', 'Lương KPI', 'Bảo hiểm bắt buộc', 'Thuế TNCN'
  ]);
  expect(ls.reduce((a, l) => a + amount(l.value), 0)).toBe(9765000);
});
