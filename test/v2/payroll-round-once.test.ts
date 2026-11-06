import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import type { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import type { ShiftFacts } from '../../src/modules/attendance/domain/attendance-day';
import { FakeDays, dayRow, nvMonthData, punched, type MonthFixture } from './payroll-fixtures';

/**
 * D1 + D2 (06/11, người dùng chốt): mọi khoản tiền trên phiếu và tiền tạm ứng là MỘT công thức từ lương cơ bản, tính
 * trên số lượng chưa làm tròn, làm tròn đúng một lần ở kết quả. Tiền từng ngày trên dòng chỉ để xem, không cộng vào
 * tổng. Mỗi test ghi số cũ (cộng từng dòng đã làm tròn) để thấy chỗ khác.
 */

type Overrides = Parameters<typeof nvMonthData>[0];

/** The payslip of `u1` (nv bậc 1, 6.000.000 / 26 unless `overrides` says otherwise) from these day rows. */
function serviceOf(days: AttendanceDayRecord[], requests: MonthFixture['requests'] = [], overrides?: Overrides) {
  const fixture: MonthFixture = { ...nvMonthData(overrides), days, requests };
  const repo = { getMonthlyData: async () => fixture } as unknown as PayrollRepository;
  return new PayrollService(repo, undefined, new FakeDays(() => fixture.days));
}
const slipOf = (days: AttendanceDayRecord[], requests: MonthFixture['requests'] = [], overrides?: Overrides) =>
  serviceOf(days, requests, overrides).generateMonthlyPayslip('u1', '2026-10');

const oct = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const nov = (day: number) => `2026-11-${String(day).padStart(2, '0')}`;
const shiftDay = (date: string, type: ShiftFacts['type'], over: Partial<AttendanceDayRecord> = {}) =>
  dayRow('PRESENT', date, { shift: { type, start: '08:00', end: '17:00', allowancePct: 0 }, ...over });

describe('D1: every payslip money item is one formula, rounded once', () => {
  it('makeup: 8h in two 4h lines is 230.769, each line still shows 115.385 (was 230.770)', async () => {
    const slip = await slipOf([
      dayRow('PRESENT', oct(12), { makeupMinutes: 240 }),
      dayRow('PRESENT', oct(13), { makeupMinutes: 240 }),
      dayRow('LEAVE_MAKEUP', oct(14))
    ]);
    assert.deepEqual(
      slip.dailyLines.filter(l => l.makeupMinutes > 0).map(l => l.makeupPay),
      [115_385, 115_385]
    );
    // 6.000.000 x (480 / 60) / (26 x 8) = 230.769,23
    assert.equal(slip.makeupPay, 230_769);
  });

  it('flex: four 8h FLEX days at 20% is 184.615, each line 46.154 (was 4 x 46.154 = 184.616)', async () => {
    const slip = await slipOf([1, 2, 5, 6].map(d => shiftDay(oct(d), 'FLEX')));
    assert.deepEqual(
      slip.dailyLines.map(l => l.flexAllowancePay),
      [46_154, 46_154, 46_154, 46_154]
    );
    // 0,2 x 6.000.000 x (4 x 8) / 208 = 184.615,38
    assert.equal(slip.flexAllowanceActual, 184_615);
  });

  it('night: two 8h NIGHT days at 40% is 184.615 and their break pay 80.769 (was 184.616 and 80.770)', async () => {
    const slip = await slipOf([1, 2].map(d => shiftDay(oct(d), 'NIGHT')));
    assert.deepEqual(
      slip.dailyLines.map(l => [l.nightAllowancePay, l.offPaidPay]),
      [
        [92_308, 40_385],
        [92_308, 40_385]
      ]
    );
    // 0,4 x 6.000.000 x 2 / 26 = 184.615,38
    assert.equal(slip.nightAllowanceActual, 184_615);
    // 6.000.000 x (2 x 1,4 h) / 208 = 80.769,23
    assert.equal(slip.offPaidNightActual, 80_769);
  });

  it('OT: two weekday lines of 50 minutes at x1.5 is 72.115, each line 36.058 (was 72.116)', async () => {
    const overtime = (id: string, otDate: string) => ({
      id,
      type: 'OVERTIME',
      status: 'APPROVED',
      otDate,
      otStartTime: '18:00',
      otEndTime: '20:00'
    });
    const slip = await slipOf(
      [
        dayRow('PRESENT', oct(7), punched(oct(7), '08:00', '18:50')),
        dayRow('PRESENT', oct(8), punched(oct(8), '08:00', '18:50'))
      ],
      [overtime('ot-1', oct(7)), overtime('ot-2', oct(8))]
    );
    assert.deepEqual(
      slip.dailyLines.map(l => l.otPay),
      [36_058, 36_058]
    );
    // 1,5 x 6.000.000 x (100 / 60) / 208 = 72.115,38
    assert.equal(slip.ot15Pay, 72_115);
    assert.equal(slip.otPayTotal, 72_115);
    assert.equal(slip.ot15Pay + slip.ot20Pay + slip.ot30Pay, slip.otPayTotal);
  });

  it('deduction: 35 minutes is -16.827 by the formula', async () => {
    const slip = await slipOf([dayRow('PRESENT', oct(7), { deductionMinutes: 35 })]);
    // 6.000.000 x (35 / 60) / 208 = 16.826,92
    assert.equal(slip.lateEarlyDeductionAmount, -16_827);
    assert.equal(slip.lateEarlyHours, 0.58);
  });

  it('deduction: 35 minutes on 5.200.000 / 26 is -14.583, not the old fixed -16.827', async () => {
    const slip = await slipOf([dayRow('PRESENT', oct(7), { deductionMinutes: 35 })], [], {
      staff: { baseSalary: 5_200_000 }
    });
    // 5.200.000 x (35 / 60) / 208 = 14.583,33
    assert.equal(slip.lateEarlyDeductionAmount, -14_583);
    assert.equal(slip.dailyLines[0].deductionAmount, 14_583);
  });

  it('travel and attendance: rate x base x days / std, not round(policy) x ratio (was 576.925 and 961.541)', async () => {
    const days = Array.from({ length: 20 }, (_, i) => dayRow('PRESENT', oct(i + 1)));
    const slip = await slipOf(days, [], { staff: { baseSalary: 5_000_010 } });
    // The policy figures stay rounded on their own: 15% and 25% of 5.000.010.
    assert.equal(slip.travelAllowancePolicy, 750_002);
    assert.equal(slip.attendanceAllowancePolicy, 1_250_003);
    // 0,15 x 5.000.010 x 20 / 26 = 576.924,23 (old: round(20/26 x 750.002) = 576.925)
    assert.equal(slip.travelAllowanceActual, 576_924);
    // 0,25 x 5.000.010 x 20 / 26 = 961.540,38 (old: round(20/26 x 1.250.003) = 961.541)
    assert.equal(slip.attendanceAllowanceActual, 961_540);
  });
});

describe('D2: the advance is one formula, rounded once', () => {
  // Bình, 6.000.000 / 26: ten NORMAL days in 01–15/11 (02–13/11 without Sunday 08/11 and Saturday 07/11).
  const tenDays = (over: Record<string, Partial<AttendanceDayRecord>> = {}) =>
    [2, 3, 4, 5, 6, 9, 10, 11, 12, 13].map(d => dayRow('PRESENT', nov(d), over[nov(d)] ?? {}));
  const quoteOf = (days: AttendanceDayRecord[]) => serviceOf(days).advanceQuote('u1', '2026-11');

  it('ten work days give 1.846.154 (was 0,8 x 10 x 230.769 = 1.846.152)', async () => {
    // 0,8 x 6.000.000 x 10 / 26 = 1.846.153,85
    assert.deepEqual(await quoteOf(tenDays()), {
      amount: 1_846_154,
      workDays: 10,
      from: '2026-11-01',
      to: '2026-11-15'
    });
  });

  it('a 30-minute deduction comes off inside the formula: 1.834.615 (was 1.834.614)', async () => {
    const quote = await quoteOf(tenDays({ [nov(3)]: { deductionMinutes: 30 } }));
    // 0,8 x (6.000.000 x 10 / 26 - 6.000.000 x 0,5 / 208) = 1.834.615,38
    assert.equal(quote.amount, 1_834_615);
    assert.equal(quote.workDays, 10);
  });
});
