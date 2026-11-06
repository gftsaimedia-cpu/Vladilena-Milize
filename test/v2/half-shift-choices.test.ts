import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filingChoices, type DayFacts } from '../../src/modules/requests/domain/filing-choices.js';
import type { FilingMonthState } from '../../src/modules/requests/domain/request-context.js';
import { halvesOf } from '../../src/common/half-shift.js';

describe('filingChoices với ngày có đơn nghỉ giữa ca (HALF_SHIFT)', () => {
  const normalShift = { start: '08:00', end: '17:00' };
  const halves = halvesOf(normalShift);

  const months: FilingMonthState[] = [
    {
      month: '2026-11',
      closed: false,
      otMinutes: 0,
      otCapMinutes: 2400,
      otLeftMinutes: 2400,
      hasOvertime: false,
      hasMakeupLeave: false
    }
  ];

  const standardHours = [
    { start: 18, ends: [{ end: 20, minutes: 120 }] }
  ];

  const days: DayFacts[] = [
    {
      date: '2026-11-10',
      workday: true,
      claim: null,
      hours: standardHours,
      halfShift: halves
    },
    {
      date: '2026-11-11',
      workday: true,
      claim: null,
      hours: standardHours,
      halfShift: halves
    },
    {
      date: '2026-11-12',
      workday: true,
      claim: { status: 'HALF_SHIFT', pending: false },
      hours: standardHours,
      halfShift: null
    },
    {
      date: '2026-11-13',
      workday: true,
      claim: null,
      hours: standardHours,
      halfShift: halves
    },
    {
      date: '2026-11-14',
      workday: true,
      claim: null,
      hours: standardHours,
      halfShift: halves
    }
  ];

  it('dòng HALF_SHIFT không tính là ngày bắt đầu nghỉ và cắt đoạn nghỉ liên tiếp', () => {
    const choices = filingChoices({ days, months, annualLeaveLeft: 12 });

    // 1. Ngày có HALF_SHIFT không có trong leave.starts
    assert.equal(choices.leave.starts.includes('2026-11-12'), false);
    assert.equal(choices.leave.starts.includes('2026-11-10'), true);
    assert.equal(choices.leave.starts.includes('2026-11-11'), true);
    assert.equal(choices.leave.starts.includes('2026-11-13'), true);

    // 2. leaveEnds xuất phát từ 10/11 phải cắt trước 12/11 (chỉ gồm 10/11 và 11/11, không có 13/11 hay 14/11)
    const endsFrom10 = choices.leave.ends['2026-11-10'].map(e => e.date);
    assert.deepEqual(endsFrom10, ['2026-11-10', '2026-11-11']);

    const endsFrom11 = choices.leave.ends['2026-11-11'].map(e => e.date);
    assert.deepEqual(endsFrom11, ['2026-11-11']);

    // 3. Sau ngày cắt, leaveEnds từ 13/11 gồm 13/11 và 14/11
    const endsFrom13 = choices.leave.ends['2026-11-13'].map(e => e.date);
    assert.deepEqual(endsFrom13, ['2026-11-13', '2026-11-14']);

    // 4. choices['half-shift-leave'].dates chỉ gồm các ngày có halfShift khác null
    assert.ok('half-shift-leave' in choices, 'phải có choices["half-shift-leave"]');
    assert.deepEqual((choices as any)['half-shift-leave'].dates, [
      '2026-11-10',
      '2026-11-11',
      '2026-11-13',
      '2026-11-14'
    ]);
  });
});
