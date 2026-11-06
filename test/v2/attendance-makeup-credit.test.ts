import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_DEDUCTION_MINUTES,
  buildDay,
  type AttendanceDay,
  type DaySources
} from '../../src/modules/attendance/domain/attendance-day';
import { vnInstant } from '../../src/modules/attendance/domain/calendar';

// FP6 (user rule 06/11): an APPROVED explanation of a late arrival at a makeup window pays the minutes present but
// credits the whole window against the leave-with-makeup debt; and no day goes below 0.

const SUNDAY = '2026-11-08';
const TUESDAY = '2026-11-03';

function src(o: Partial<DaySources> = {}): DaySources {
  return {
    date: SUNDAY,
    schedule: null,
    punches: [],
    otWindows: [],
    makeupWindows: [],
    explanation: null,
    isHoliday: false,
    now: new Date('2026-11-30T12:00:00Z'),
    employment: { startDate: '2026-01-01', resignedOn: null },
    benefits: { paidLeave: true, paidHoliday: true, isat: true },
    workWeek: [1, 2, 3, 4, 5, 6],
    graceMinutes: 15,
    defaultShift: { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 },
    ...o
  };
}

const at = (date: string, hm: string) => vnInstant(date, hm);
const inOut = (date: string, a: string, b: string) => [
  { type: 'IN' as const, at: at(date, a) },
  { type: 'OUT' as const, at: at(date, b) }
];
const explained = (status: 'APPROVED' | 'PENDING' | 'REJECTED') => ({
  requestId: 'req-exp',
  status,
  checkIn: null,
  checkOut: null
});
const day = (o: Partial<DaySources> = {}): AttendanceDay => buildDay('emp-1', src(o));
const EVENING = [{ start: '18:00', end: '22:00' }];

describe('makeupCreditMinutes on a rest day (the user example)', () => {
  const sunday = (explanation: DaySources['explanation']) =>
    day({ punches: inOut(SUNDAY, '18:30', '22:00'), makeupWindows: EVENING, explanation });

  it('late 30 minutes, APPROVED: pays 210 minutes, credits the whole 240', () => {
    const d = sunday(explained('APPROVED'));
    assert.equal(d.status, 'EXTRA');
    assert.equal(d.makeupMinutes, 210);
    assert.equal(d.makeupCreditMinutes, 240);
    assert.deepEqual(d.cases, [{ code: 'LATE_CHECK_IN', minutes: 30, affectsPay: false }]);
  });

  it('no explanation: credit = minutes present', () => {
    const d = sunday(null);
    assert.equal(d.makeupMinutes, 210);
    assert.equal(d.makeupCreditMinutes, 210);
  });

  it('REJECTED: credit = minutes present', () => {
    const d = sunday(explained('REJECTED'));
    assert.equal(d.makeupMinutes, 210);
    assert.equal(d.makeupCreditMinutes, 210);
  });

  it('PENDING: credit = minutes present', () => {
    const d = sunday(explained('PENDING'));
    assert.equal(d.makeupMinutes, 210);
    assert.equal(d.makeupCreditMinutes, 210);
  });

  it('on time, APPROVED explanation of something else: nothing to extend', () => {
    const d = day({
      punches: inOut(SUNDAY, '18:00', '22:00'),
      makeupWindows: EVENING,
      explanation: explained('APPROVED')
    });
    assert.equal(d.makeupMinutes, 240);
    assert.equal(d.makeupCreditMinutes, 240);
  });

  it('an early checkout is not covered (Ruling): 18:00-21:30 APPROVED -> 210 / 210', () => {
    const d = day({
      punches: inOut(SUNDAY, '18:00', '21:30'),
      makeupWindows: EVENING,
      explanation: explained('APPROVED')
    });
    assert.equal(d.makeupMinutes, 210);
    assert.equal(d.makeupCreditMinutes, 210);
  });

  it('late AND early: only the late part is credited (18:30-21:30 -> 180 paid, 210 credited)', () => {
    const d = day({
      punches: inOut(SUNDAY, '18:30', '21:30'),
      makeupWindows: EVENING,
      explanation: explained('APPROVED')
    });
    assert.equal(d.makeupMinutes, 180);
    assert.equal(d.makeupCreditMinutes, 210);
  });

  it('no check-out: credit is 0, as the minutes are', () => {
    const d = day({
      punches: [{ type: 'IN', at: at(SUNDAY, '18:30') }],
      makeupWindows: EVENING,
      explanation: explained('APPROVED')
    });
    assert.equal(d.makeupMinutes, 0);
    assert.equal(d.makeupCreditMinutes, 0);
  });

  it('no makeup window: credit is 0 on every status', () => {
    const d = day({ punches: inOut(SUNDAY, '18:30', '22:00'), otWindows: EVENING, explanation: explained('APPROVED') });
    assert.equal(d.makeupMinutes, 0);
    assert.equal(d.makeupCreditMinutes, 0);
  });

  it('a window the person reached only after it ended gets no credit', () => {
    // windows 08:00-10:00 and 18:00-22:00, in at 18:30: the morning window was never worked, the late case is about
    // the evening one only.
    const d = day({
      punches: inOut(SUNDAY, '18:30', '22:00'),
      makeupWindows: [{ start: '08:00', end: '10:00' }, ...EVENING],
      explanation: explained('APPROVED')
    });
    assert.equal(d.makeupMinutes, 210);
    assert.equal(d.makeupCreditMinutes, 240);
  });
});

describe('makeupCreditMinutes on a work day', () => {
  it('08:00-17:00 then 18:00-22:00: credit = makeup = 240 (unchanged)', () => {
    const d = day({
      date: TUESDAY,
      punches: [
        { type: 'IN', at: at(TUESDAY, '08:00') },
        { type: 'OUT', at: at(TUESDAY, '17:00') },
        { type: 'IN', at: at(TUESDAY, '18:00') },
        { type: 'OUT', at: at(TUESDAY, '22:00') }
      ],
      makeupWindows: EVENING
    });
    assert.equal(d.makeupMinutes, 240);
    assert.equal(d.makeupCreditMinutes, 240);
  });

  it('shift lateness never extends the credit: in 08:40 against shift 08-17 with window 06-08 -> 0 / 0', () => {
    const d = day({
      date: TUESDAY,
      punches: inOut(TUESDAY, '08:40', '17:00'),
      makeupWindows: [{ start: '06:00', end: '08:00' }],
      explanation: explained('APPROVED')
    });
    assert.deepEqual(d.cases, [{ code: 'LATE_CHECK_IN', minutes: 40, affectsPay: true }]);
    assert.equal(d.makeupMinutes, 0);
    assert.equal(d.makeupCreditMinutes, 0);
  });

  it('late against the window only: in 07:30 with window 06-08 -> 30 paid, 120 credited', () => {
    const d = day({
      date: TUESDAY,
      punches: inOut(TUESDAY, '07:30', '17:00'),
      makeupWindows: [{ start: '06:00', end: '08:00' }],
      explanation: explained('APPROVED')
    });
    assert.deepEqual(d.cases, [{ code: 'LATE_CHECK_IN', minutes: 90, affectsPay: false }]);
    assert.equal(d.makeupMinutes, 30);
    assert.equal(d.makeupCreditMinutes, 120);
  });

  it('the same row with the explanation not approved -> 30 / 30', () => {
    for (const status of ['PENDING', 'REJECTED'] as const) {
      const d = day({
        date: TUESDAY,
        punches: inOut(TUESDAY, '07:30', '17:00'),
        makeupWindows: [{ start: '06:00', end: '08:00' }],
        explanation: explained(status)
      });
      assert.equal(d.makeupMinutes, 30);
      assert.equal(d.makeupCreditMinutes, 30);
    }
  });
});

describe('credit is never below the minutes present nor above the windows', () => {
  it('holds for every row of a sweep of arrival and leaving times', () => {
    const times = ['05:00', '06:00', '06:30', '07:30', '08:00', '08:40', '09:30', '12:00', '17:00', '18:00', '18:30', '21:00', '22:00', '23:00'];
    const windows = [{ start: '06:00', end: '08:00' }, ...EVENING];
    const total = 120 + 240;
    for (const date of [SUNDAY, TUESDAY]) {
      for (const a of times) {
        for (const b of times) {
          if (b < a) continue;
          for (const status of ['APPROVED', 'PENDING', 'REJECTED'] as const) {
            const d = day({
              date,
              punches: inOut(date, a, b),
              makeupWindows: windows,
              explanation: explained(status)
            });
            const label = `${date} ${a}-${b} ${status}`;
            assert.ok(d.makeupCreditMinutes >= d.makeupMinutes, label);
            assert.ok(d.makeupCreditMinutes <= total, label);
            assert.ok(d.payUnits >= 0, label);
            assert.ok(d.deductionMinutes >= 0 && d.deductionMinutes <= MAX_DEDUCTION_MINUTES, label);
            if (status !== 'APPROVED') assert.equal(d.makeupCreditMinutes, d.makeupMinutes, label);
          }
        }
      }
    }
  });
});

describe('no negative day (buildDay)', () => {
  it('no input gives payUnits below 0 or a deduction above 480 minutes', () => {
    const times = ['00:30', '06:00', '08:00', '08:20', '09:30', '12:00', '16:00', '17:00', '19:00', '22:00', '23:30'];
    for (const a of times) {
      for (const b of times) {
        if (b < a) continue;
        for (const status of ['APPROVED', 'PENDING', 'REJECTED', null] as const) {
          for (const makeupWindows of [[], EVENING, [{ start: '06:00', end: '08:00' }]]) {
            const d = day({
              date: TUESDAY,
              punches: inOut(TUESDAY, a, b),
              makeupWindows,
              explanation: status ? explained(status) : null
            });
            const label = `${a}-${b} ${status} ${JSON.stringify(makeupWindows)}`;
            assert.ok(d.payUnits === 0 || d.payUnits === 1, label);
            assert.ok(d.deductionMinutes >= 0 && d.deductionMinutes <= MAX_DEDUCTION_MINUTES, label);
            assert.ok(d.makeupMinutes >= 0, label);
          }
        }
      }
    }
  });

  it('a day with a makeup window and an approved lateness deduction keeps pay 1 and deduction <= 480', () => {
    // shift 08-17, in 12:00 (late 240 -> block 240), out 22:00, window 18-22 made up in full
    const d = day({
      date: TUESDAY,
      punches: inOut(TUESDAY, '12:00', '22:00'),
      makeupWindows: EVENING,
      explanation: explained('APPROVED')
    });
    assert.equal(d.payUnits, 1);
    assert.ok(d.deductionMinutes <= MAX_DEDUCTION_MINUTES);
    assert.equal(d.makeupMinutes, 240);
  });
});
