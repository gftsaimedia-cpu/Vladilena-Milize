import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import type { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import type { ShiftFacts } from '../../src/modules/attendance/domain/attendance-day';
import { FakeDays, dayRow, nvMonthData, punched, type MonthFixture } from './payroll-fixtures';

/**
 * D13 (06/11, người dùng chốt): giờ làm bù chỉ trả đơn giá giờ x1. Không phụ cấp Flex/đêm trên giờ làm bù, không tiền nghỉ
 * giữa ca đêm, và ngày làm bù không cộng vào số ngày tính phụ cấp đi lại/chuyên cần. Ghi đè R10. Bình: 6.000.000 / 26,
 * giờ = 28.846,15; NV: Flex 20%, đêm 40%, đi lại 15%, chuyên cần 25%.
 *
 * Giờ ca của một dòng = workHours - makeupMinutes / 60 (khung bù nằm ngoài giờ ca, nhưng workHours đếm cả chúng).
 */

function slipOf(days: AttendanceDayRecord[]) {
  const fixture: MonthFixture = { ...nvMonthData(), days, requests: [] };
  const repo = { getMonthlyData: async () => fixture } as unknown as PayrollRepository;
  return new PayrollService(repo, undefined, new FakeDays(() => fixture.days)).generateMonthlyPayslip(
    'u1',
    '2026-10'
  );
}

const oct = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const shiftDay = (date: string, type: ShiftFacts['type'], over: Partial<AttendanceDayRecord> = {}) =>
  dayRow('PRESENT', date, { shift: { type, start: '08:00', end: '17:00', allowancePct: 0 }, ...over });

describe('D13: makeup hours earn no Flex premium', () => {
  it('a FLEX day of 8h shift + 2h makeup after it (workHours 10) gets Flex on 8h, makeup x1 on 2h', async () => {
    const slip = await slipOf([shiftDay(oct(1), 'FLEX', { workHours: 10, makeupMinutes: 120 })]);
    const line = slip.dailyLines[0];
    // premium hours = min(8, max(0, 10 - 120 / 60)) = 8 -> 0,2 x 6.000.000 x 8 / 208 = 46.153,85
    assert.equal(line.flexAllowancePay, 46_154);
    assert.equal(slip.flexAllowanceActual, 46_154);
    // makeup: 6.000.000 x 2 / 208 = 57.692,31
    assert.equal(line.makeupPay, 57_692);
    assert.equal(slip.makeupPay, 57_692);
  });

  it('a FLEX day that arrives 2h late, workHours 8 with 2h makeup, gets Flex on 6h only (was 8h = 46.154)', async () => {
    const slip = await slipOf([
      shiftDay(oct(1), 'FLEX', { workHours: 8, makeupMinutes: 120, lateMinutes: 120, deductionMinutes: 120 })
    ]);
    // premium hours = min(8, 8 - 2) = 6 -> 0,2 x 6.000.000 x 6 / 208 = 34.615,38
    assert.equal(slip.dailyLines[0].flexAllowancePay, 34_615);
    assert.equal(slip.flexAllowanceActual, 34_615);
    assert.equal(slip.makeupPay, 57_692);
    // the 2h deduction is its own item: 6.000.000 x 2 / 208 = 57.692,31
    assert.equal(slip.lateEarlyDeductionAmount, -57_692);
  });

  it('Flex premium hours sum exactly over days, each day min(8, workHours - makeup) (6h + 7h = 13h)', async () => {
    const slip = await slipOf([
      shiftDay(oct(1), 'FLEX', { workHours: 8, makeupMinutes: 120 }),
      shiftDay(oct(2), 'FLEX', { workHours: 8, makeupMinutes: 60 })
    ]);
    // 0,2 x 6.000.000 x (6 + 7) / 208 = 75.000 (the lines show 34.615 + 40.385 = 75.000)
    assert.deepEqual(
      slip.dailyLines.map(l => l.flexAllowancePay),
      [34_615, 40_385]
    );
    assert.equal(slip.flexAllowanceActual, 75_000);
  });

  it('a day whose whole work is makeup (workHours 8, makeup 480) gets no Flex premium', async () => {
    const slip = await slipOf([shiftDay(oct(1), 'FLEX', { workHours: 8, makeupMinutes: 480 })]);
    assert.equal(slip.dailyLines[0].flexAllowancePay, 0);
    assert.equal(slip.flexAllowanceActual, 0);
    // 6.000.000 x 8 / 208 = 230.769,23: it still pays makeup x1
    assert.equal(slip.makeupPay, 230_769);
  });
});

describe('D13: makeup hours earn no night break pay', () => {
  it('a NIGHT day of 8h shift + 2h makeup (workHours 10) keeps the full break: 1.4h = 40.385', async () => {
    const slip = await slipOf([shiftDay(oct(1), 'NIGHT', { workHours: 10, makeupMinutes: 120 })]);
    // shift hours 10 - 2 = 8 >= 8 -> 6.000.000 x 1,4 / 208 = 40.384,62
    assert.equal(slip.dailyLines[0].offPaidPay, 40_385);
    assert.equal(slip.offPaidNightActual, 40_385);
    // the night allowance is paid on the day: 0,4 x 6.000.000 / 26 = 92.307,69
    assert.equal(slip.nightAllowanceActual, 92_308);
  });

  it('a NIGHT day with 6h of shift (workHours 8 includes 2h makeup, 1h deducted) uses shift hours: 1h = 28.846 (was 1.4h = 40.385)', async () => {
    const slip = await slipOf([
      shiftDay(oct(1), 'NIGHT', { workHours: 8, makeupMinutes: 120, lateMinutes: 60, deductionMinutes: 60 })
    ]);
    const line = slip.dailyLines[0];
    // shift hours 6 < 8 -> the shortage 2h is capped at 1h and at the 1h deducted: 6.000.000 x 1 / 208 = 28.846,15
    assert.equal(line.deductionAmount, 28_846);
    assert.equal(line.offPaidPay, 28_846);
    assert.equal(slip.offPaidNightActual, 28_846);
  });

  it('the night tax exemption reads the shift hours: 30% of 6h = 1,8h -> 51.923 (was 30% of 8h = 69.231)', async () => {
    const slip = await slipOf([
      shiftDay(oct(1), 'NIGHT', { workHours: 8, makeupMinutes: 120, lateMinutes: 60, deductionMinutes: 60 })
    ]);
    // min(0,3 x 6, 8 x 0,4 = 3,2) = 1,8h -> 6.000.000 x 1,8 / 208 = 51.923,08
    assert.equal(slip.taxExemptIncome, 51_923);
  });
});

describe('D13: a day whose work is makeup counts no allowance day and no premium', () => {
  it('an EXTRA row with 480 makeup minutes: no travel/attendance day, no premium, makeup x1 = 230.769', async () => {
    const slip = await slipOf([
      ...Array.from({ length: 19 }, (_, i) => dayRow('PRESENT', oct(i + 1))),
      dayRow('EXTRA', oct(25), { ...punched(oct(25), '08:00', '16:00'), workHours: 8, makeupMinutes: 480 })
    ]);
    const extra = slip.dailyLines.find(l => l.date === oct(25));
    assert.equal(slip.actualWorkDays, 19);
    // 0,15 x 6.000.000 x 19 / 26 = 657.692,31 ; 0,25 x 6.000.000 x 19 / 26 = 1.096.153,85
    assert.equal(slip.travelAllowanceActual, 657_692);
    assert.equal(slip.attendanceAllowanceActual, 1_096_154);
    assert.equal(slip.flexAllowanceActual, 0);
    assert.equal(slip.nightAllowanceActual, 0);
    assert.equal(slip.offPaidNightActual, 0);
    assert.deepEqual(
      [extra?.daySalary, extra?.flexAllowancePay, extra?.nightAllowancePay, extra?.offPaidPay],
      [0, 0, 0, 0]
    );
    // 6.000.000 x 8 / 208 = 230.769,23
    assert.equal(extra?.makeupPay, 230_769);
    assert.equal(slip.makeupPay, 230_769);
  });
});
