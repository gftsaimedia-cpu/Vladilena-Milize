import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import type { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { FakeDays, dayRow, nvMonthData, punched, type MonthFixture } from './payroll-fixtures';

// FP6 (user rule 06/11): pay is the minutes present, the chuyên cần debt (L16) reads the credited minutes.
//
// Bình: NV, base 6.000.000, std 26, hour rate 28.846,15. Month 2026-11: 5 PRESENT days 02-06, one leave with makeup 10/11
// (debt 480 minutes), four unpaid leave days 11-14 (one day off each). Chuyên cần is lost from 5 absence days:
//   absence days = 4 day-off rows + makeupShortfallDays(1, credited minutes)
//   credited 480 -> shortfall 0 -> 4 < 5 -> KEPT; credited 450 -> shortfall ceil(30 / 480) = 1 -> 5 -> LOST.
const BINH = 'u1';
const KEPT = 288_462; // 25% x 6.000.000 x 5 work days / 26
const NOW = new Date('2026-12-01T03:00:00Z'); // the month is over: no window is still ahead (D10)

const slipOf = (rows: AttendanceDayRecord[]) => {
  const fixture: MonthFixture = { ...nvMonthData(), days: rows, requests: [] };
  const repo = { getMonthlyData: async () => fixture } as unknown as PayrollRepository;
  const service = new PayrollService(repo, undefined, new FakeDays(() => rows));
  service.now = () => NOW;
  return service.generateMonthlyPayslip(BINH, '2026-11');
};

const base = (): AttendanceDayRecord[] => [
  ...['02', '03', '04', '05', '06'].map(d => dayRow('PRESENT', `2026-11-${d}`)),
  dayRow('LEAVE_MAKEUP', '2026-11-10'),
  ...['11', '12', '13', '14'].map(d => dayRow('LEAVE_UNPAID', `2026-11-${d}`))
];

// Sunday 08/11, window 18:00-22:00; the user's example: in 18:30, "vào trễ" approved -> 210 present, 240 credited.
const lateApproved = (): AttendanceDayRecord =>
  dayRow('EXTRA', '2026-11-08', {
    ...punched('2026-11-08', '18:30', '22:00'),
    workHours: 3.5,
    makeupMinutes: 210,
    makeupCreditMinutes: 240,
    explanationStatus: 'APPROVED',
    cases: [{ code: 'LATE_CHECK_IN', minutes: 30, affectsPay: false }]
  });
const fullWindow = (): AttendanceDayRecord =>
  dayRow('EXTRA', '2026-11-15', { ...punched('2026-11-15', '18:00', '22:00'), workHours: 4, makeupMinutes: 240 });

describe('the leave-with-makeup debt reads the credited minutes (L16)', () => {
  it('approved late arrival: pays 450 minutes, credits 480 -> shortfall 0, chuyên cần kept', async () => {
    const slip = await slipOf([...base(), lateApproved(), fullWindow()]);
    // 6.000.000 x (450 / 60) / 208 = 216.346,15, from the minutes present
    assert.equal(slip.makeupPay, 216_346);
    assert.equal(slip.attendanceAllowanceActual, KEPT);
    assert.equal(slip.dailyLines.find(l => l.date === '2026-11-08')?.makeupCreditMinutes, 240);
  });

  it('the same rows with the explanation not approved: credit 450 -> shortfall 1, chuyên cần lost', async () => {
    const notApproved = dayRow('EXTRA', '2026-11-08', {
      ...punched('2026-11-08', '18:30', '22:00'),
      workHours: 3.5,
      makeupMinutes: 210,
      cases: [{ code: 'LATE_CHECK_IN', minutes: 30, affectsPay: false }]
    });
    const slip = await slipOf([...base(), notApproved, fullWindow()]);
    assert.equal(slip.makeupPay, 216_346); // pay does not change
    assert.equal(slip.attendanceAllowanceActual, 0);
    assert.equal(slip.dailyLines.find(l => l.date === '2026-11-08')?.makeupCreditMinutes, 210);
  });

  it('credit never pays: only the minutes present are in makeupPay', async () => {
    const credited = await slipOf([...base(), lateApproved(), fullWindow()]);
    const present = await slipOf([
      ...base(),
      { ...lateApproved(), makeupCreditMinutes: 210 },
      fullWindow()
    ]);
    assert.equal(credited.makeupPay, present.makeupPay);
    assert.equal(credited.grossIncome - present.grossIncome, KEPT); // only the kept chuyên cần differs
  });
});

describe('no negative day (payslip)', () => {
  it('a shift day with a full deduction and a made-up window nets to the makeup money, never below 0', async () => {
    // PRESENT, 1 day of pay, 480 minutes deducted (the cap), 240 minutes of makeup, explanation approved.
    const row = dayRow('PRESENT', '2026-11-02', {
      ...punched('2026-11-02', '12:00', '22:00'),
      workHours: 10,
      payUnits: 1,
      lateMinutes: 240,
      deductionMinutes: 480,
      makeupMinutes: 240,
      explanationStatus: 'APPROVED'
    });
    const slip = await slipOf([row]);
    const line = slip.dailyLines[0];
    assert.equal(line.daySalary, 230_769);
    assert.equal(line.deductionAmount, 230_769);
    assert.equal(line.daySalary - line.deductionAmount, 0); // the day's own money is 0, not negative
    assert.equal(line.makeupPay, 115_385);
    assert.equal(line.dailyTotal, 115_385);
    assert.ok(slip.baseSalaryActual + slip.lateEarlyDeductionAmount >= 0);
    assert.equal(slip.baseSalaryActual + slip.lateEarlyDeductionAmount, 0);
  });

  it('the EXTRA example row: day salary 0, deduction 0, makeup 100.962', async () => {
    const row = dayRow('EXTRA', '2026-11-08', {
      ...punched('2026-11-08', '18:30', '22:00'),
      workHours: 3.5,
      makeupMinutes: 210,
      makeupCreditMinutes: 240,
      explanationStatus: 'APPROVED'
    });
    const slip = await slipOf([row]);
    const line = slip.dailyLines[0];
    assert.equal(line.daySalary, 0);
    assert.equal(line.deductionAmount, 0);
    assert.equal(line.makeupPay, 100_962); // 6.000.000 x 3,5 / 208
    assert.equal(line.dailyTotal, 100_962);
    assert.ok(line.dailyTotal >= 0);
  });
});
