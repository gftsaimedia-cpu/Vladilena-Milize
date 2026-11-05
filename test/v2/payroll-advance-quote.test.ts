import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { advanceQuoteOf, type DailyAttendanceLineProps } from '../../src/modules/payroll/domain';

const DAY_SALARY = 6_000_000 / 26;

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
    assert.deepEqual(advanceQuoteOf(lines(), '2026-11'), {
      amount: 2_215_385,
      workDays: 12,
      from: '2026-11-01',
      to: '2026-11-15'
    });
  });

  it('deductions reduce the quote', () => {
    assert.equal(advanceQuoteOf(lines({ deductionAmount: 7212 }), '2026-11').amount, 2_209_615);
  });
});
