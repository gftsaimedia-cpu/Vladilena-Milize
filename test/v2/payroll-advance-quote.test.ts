import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { advanceQuoteOf, type DailyAttendanceLineProps } from '../../src/modules/payroll/domain';

const BASE = 6_000_000;
const STD = 26;
const DAY_SALARY = BASE / STD;

function line(date: string, over: Partial<DailyAttendanceLineProps> = {}): DailyAttendanceLineProps {
  return {
    date,
    dayOfWeekText: '',
    shiftCode: 'NORMAL',
    shiftLabel: 'Normal',
    inOutText: '08:00–17:00',
    workHours: 8,
    daySalary: DAY_SALARY,
    flexAllowancePay: 0,
    nightAllowancePay: 0,
    offPaidPay: 0,
    otHours: 0,
    otPay: 0,
    deductionHours: 0,
    deductionMinutes: 0,
    deductionAmount: 0,
    dailyTotal: DAY_SALARY,
    kind: 'PRESENT',
    payUnits: 1,
    countsAsWorkday: true,
    countsAsDayOff: false,
    makeupMinutes: 0,
    makeupPay: 0,
    ...over
  };
}

/** 12 ngày NORMAL 02–14/11 (bỏ ngày 08) cùng các dòng không được tính. */
function lines(firstOver: Partial<DailyAttendanceLineProps> = {}): DailyAttendanceLineProps[] {
  const worked: DailyAttendanceLineProps[] = [];
  for (let day = 2; day <= 14; day++) {
    if (day === 8) continue;
    const over = worked.length === 0 ? firstOver : {};
    worked.push(line(`2026-11-${String(day).padStart(2, '0')}`, over));
  }
  return [
    ...worked,
    line('2026-11-09', {
      shiftCode: 'LEAVE',
      shiftLabel: 'Nghỉ phép',
      kind: 'LEAVE_PAID',
      countsAsWorkday: false,
      countsAsDayOff: true
    }),
    line('2026-11-16'),
    line('2026-11-10', { daySalary: 0, payUnits: 0, countsAsWorkday: false })
  ];
}

describe('Số tiền tạm ứng (80% lương ngày công 01–15)', () => {
  it('quote sums work days 01–15', () => {
    assert.deepEqual(advanceQuoteOf(lines(), '2026-11', BASE, STD), {
      amount: 2_215_385,
      workDays: 12,
      from: '2026-11-01',
      to: '2026-11-15'
    });
  });

  it('deductions reduce the quote', () => {
    assert.equal(advanceQuoteOf(lines({ deductionMinutes: 15, deductionAmount: 7212 }), '2026-11', BASE, STD).amount, 2_209_615);
  });

  it('D2: reads pay units and minutes, never the rounded day amounts of the lines', () => {
    // Ten work days as the payslip shows them (daySalary rounded to 230.769, one 30-minute deduction shown as 14.423).
    const shown = Array.from({ length: 10 }, (_, i) =>
      line(`2026-11-${String(i + 2).padStart(2, '0')}`, { daySalary: 230_769, dailyTotal: 230_769 })
    );
    // 0,8 x 6.000.000 x 10 / 26 = 1.846.153,85 -> 1.846.154 (summing the shown amounts gave 0,8 x 2.307.690 = 1.846.152).
    assert.equal(advanceQuoteOf(shown, '2026-11', BASE, STD).amount, 1_846_154);
    shown[1] = { ...shown[1], deductionMinutes: 30, deductionHours: 0.5, deductionAmount: 14_423 };
    // 0,8 x 6.000.000 x (10 - 30/480) / 26 = 1.834.615,38 (the shown amounts gave 1.834.614).
    assert.equal(advanceQuoteOf(shown, '2026-11', BASE, STD).amount, 1_834_615);
  });

  it('dòng payUnits 0.5 vào Σ payUnits (5 ngày 1 + 1 ngày 0.5 = 5.5 ngày)', () => {
    // 5 ngày công thường 1 công và 1 ngày nửa công 0.5
    const fiveAndHalf = [
      line('2026-11-02'),
      line('2026-11-03'),
      line('2026-11-04'),
      line('2026-11-05'),
      line('2026-11-06'),
      line('2026-11-07', { payUnits: 0.5, daySalary: 115_385 })
    ];
    // 0,8 x 6.000.000 x 5,5 / 26 = 1.015.384,61... -> 1.015.385
    assert.equal(advanceQuoteOf(fiveAndHalf, '2026-11', BASE, STD).amount, 1_015_385);
  });
});
