import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDaysText,
  datesOfMonth,
  monthOfDate,
  monthsBetween,
  vnInstant,
  weekdayOf
} from '../../src/modules/attendance/domain/calendar';
import {
  detectCases,
  expectedBounds,
  type DetectInput,
  type TimeWindow
} from '../../src/modules/attendance/domain/explanation-detect';

const DATE = '2026-11-03';
const at = (hm: string): Date => vnInstant(DATE, hm);
const next = (hm: string): Date => vnInstant('2026-11-04', hm);

function run(over: Partial<DetectInput>) {
  const input: DetectInput = {
    date: DATE,
    shift: { start: '08:00', end: '17:00' },
    windows: [],
    checkIn: at('08:00'),
    checkOut: at('17:00'),
    firstOutInShift: null,
    graceMinutes: 15,
    evaluated: true,
    ...over
  };
  return detectCases(input);
}

const MAKEUP: TimeWindow = { kind: 'MAKEUP', start: '18:00', end: '22:00' };
const OT_BEFORE: TimeWindow = { kind: 'OT', start: '06:00', end: '08:00' };

describe('calendar helpers', () => {
  it('vnInstant reads the text as Vietnam time (UTC+7)', () => {
    assert.equal(vnInstant('2026-11-03', '08:00').toISOString(), '2026-11-03T01:00:00.000Z');
    assert.equal(vnInstant('2026-11-03', '00:30').toISOString(), '2026-11-02T17:30:00.000Z');
  });

  it('addDaysText / weekdayOf / month helpers', () => {
    assert.equal(addDaysText('2026-11-30', 1), '2026-12-01');
    assert.equal(addDaysText('2026-03-01', -1), '2026-02-28');
    assert.equal(weekdayOf('2026-11-03'), 2);
    assert.equal(weekdayOf('2026-11-01'), 0);
    assert.equal(weekdayOf('2026-11-07'), 6);
    assert.equal(monthOfDate('2026-11-03'), '2026-11');
    assert.equal(datesOfMonth('2024-02').length, 29);
    assert.deepEqual(datesOfMonth('2026-11').slice(0, 2), ['2026-11-01', '2026-11-02']);
    assert.equal(datesOfMonth('2026-11').at(-1), '2026-11-30');
    assert.deepEqual(monthsBetween('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
    assert.deepEqual(monthsBetween('2026-11', '2026-11'), ['2026-11']);
  });
});

describe('detectCases', () => {
  it('on time', () => {
    const r = run({ checkIn: at('08:05'), checkOut: at('17:10') });
    assert.deepEqual(r.cases, []);
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.earlyMinutes, 0);
  });

  it('late in after grace', () => {
    const r = run({ checkIn: at('08:16') });
    assert.deepEqual(r.cases, [{ code: 'LATE_CHECK_IN', minutes: 16, affectsPay: true }]);
    assert.equal(r.lateMinutes, 16);
    assert.deepEqual(run({ checkIn: at('08:15') }).cases, []);
  });

  it('grace 10', () => {
    const r = run({ checkIn: at('08:11'), graceMinutes: 10 });
    assert.deepEqual(r.cases, [{ code: 'LATE_CHECK_IN', minutes: 11, affectsPay: true }]);
    assert.deepEqual(run({ checkIn: at('08:10'), graceMinutes: 10 }).cases, []);
  });

  it('early out even 1 minute', () => {
    const r = run({ firstOutInShift: at('16:59'), checkOut: at('16:59') });
    assert.deepEqual(r.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 1, affectsPay: true }]);
    assert.equal(r.earlyMinutes, 1);
    const half = vnInstant(DATE, '16:59');
    half.setUTCSeconds(30);
    assert.deepEqual(run({ firstOutInShift: half, checkOut: half }).cases, []);
  });

  it('early in', () => {
    assert.deepEqual(run({ checkIn: at('07:44') }).cases, [
      { code: 'EARLY_CHECK_IN', minutes: 16, affectsPay: true }
    ]);
    assert.deepEqual(run({ checkIn: at('07:45') }).cases, []);
  });

  it('late out / forgot', () => {
    assert.deepEqual(run({ checkOut: at('17:15') }).cases, []);
    assert.deepEqual(run({ checkOut: at('17:16') }).cases, [
      { code: 'LATE_CHECK_OUT', minutes: 16, affectsPay: true }
    ]);
    assert.deepEqual(run({ checkOut: at('17:30') }).cases, [
      { code: 'LATE_CHECK_OUT', minutes: 30, affectsPay: true }
    ]);
    assert.deepEqual(run({ checkOut: at('17:31') }).cases, [
      { code: 'FORGOT_CHECK_OUT', minutes: 31, affectsPay: true }
    ]);
  });

  it('missing', () => {
    assert.deepEqual(run({ checkIn: null, checkOut: at('17:00') }).cases, [
      { code: 'MISSING_CHECK_IN', minutes: 0, affectsPay: true }
    ]);
    assert.deepEqual(run({ checkIn: null, checkOut: null, evaluated: false }).cases, []);
    assert.deepEqual(run({ checkIn: null, checkOut: null, evaluated: true }).cases, [
      { code: 'MISSING_CHECK_IN', minutes: 0, affectsPay: true },
      { code: 'MISSING_CHECK_OUT', minutes: 0, affectsPay: true }
    ]);
    assert.deepEqual(run({ checkIn: at('08:00'), checkOut: null, evaluated: false }).cases, []);
    assert.deepEqual(run({ checkIn: at('08:00'), checkOut: null, evaluated: true }).cases, [
      { code: 'MISSING_CHECK_OUT', minutes: 0, affectsPay: true }
    ]);
  });

  it('mid-shift out is early (L7)', () => {
    const r = run({ firstOutInShift: at('12:00'), checkOut: at('17:05') });
    assert.deepEqual(r.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 300, affectsPay: true }]);
    assert.equal(r.earlyMinutes, 300);
  });

  it('makeup window after shift', () => {
    const windows = [MAKEUP];
    const early = run({ windows, checkOut: at('21:00') });
    assert.deepEqual(early.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 60, affectsPay: false }]);
    assert.equal(early.earlyMinutes, 0);
    assert.deepEqual(run({ windows, checkOut: at('22:20') }).cases, [
      { code: 'LATE_CHECK_OUT', minutes: 20, affectsPay: false }
    ]);
    assert.deepEqual(run({ windows, checkOut: at('22:31') }).cases, [
      { code: 'FORGOT_CHECK_OUT', minutes: 31, affectsPay: false }
    ]);
  });

  it('window before shift', () => {
    const windows = [OT_BEFORE];
    const late = run({ windows, checkIn: at('06:20') });
    assert.deepEqual(late.cases, [{ code: 'LATE_CHECK_IN', minutes: 20, affectsPay: false }]);
    assert.equal(late.lateMinutes, 0);
    const early = run({ windows, checkIn: at('05:40') });
    assert.deepEqual(early.cases, [{ code: 'EARLY_CHECK_IN', minutes: 20, affectsPay: false }]);
  });

  it('no shift (EXTRA)', () => {
    const base = { shift: null, windows: [{ kind: 'OT', start: '08:00', end: '12:00' } as TimeWindow] };
    const r = run({ ...base, checkIn: at('08:40'), checkOut: at('11:00') });
    assert.deepEqual(r.cases, [
      { code: 'LATE_CHECK_IN', minutes: 40, affectsPay: false },
      { code: 'EARLY_CHECK_OUT', minutes: 60, affectsPay: false }
    ]);
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.earlyMinutes, 0);
    assert.deepEqual(run({ ...base, checkIn: at('08:00'), checkOut: null }).cases, [
      { code: 'MISSING_CHECK_OUT', minutes: 0, affectsPay: false }
    ]);
  });

  it('no shift and no window has nothing to compare', () => {
    assert.deepEqual(run({ shift: null, checkIn: null, checkOut: null }).cases, []);
  });

  it('night shift', () => {
    const shift = { start: '22:00', end: '06:00' };
    assert.deepEqual(run({ shift, checkIn: at('22:20'), checkOut: next('06:00') }).cases, [
      { code: 'LATE_CHECK_IN', minutes: 20, affectsPay: true }
    ]);
    const early = run({ shift, checkIn: at('22:00'), firstOutInShift: next('05:50'), checkOut: next('05:50') });
    assert.deepEqual(early.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 10, affectsPay: true }]);
  });

  it('one entry per code, pay wins', () => {
    const r = run({ windows: [MAKEUP], firstOutInShift: at('16:00'), checkOut: at('21:00') });
    assert.deepEqual(r.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 60, affectsPay: true }]);
    assert.equal(r.earlyMinutes, 60);
  });

  it('orders cases LATE_IN, EARLY_IN, EARLY_OUT, LATE_OUT, FORGOT, MISSING_IN, MISSING_OUT', () => {
    const r = run({ checkIn: at('08:30'), firstOutInShift: at('12:00'), checkOut: at('17:40') });
    assert.deepEqual(
      r.cases.map(c => c.code),
      ['LATE_CHECK_IN', 'EARLY_CHECK_OUT', 'FORGOT_CHECK_OUT']
    );
  });
});

describe('expectedBounds', () => {
  it('shift plus window after shift ends at the window end', () => {
    const b = expectedBounds(DATE, { start: '08:00', end: '17:00' }, [MAKEUP]);
    assert.equal(b?.start.getTime(), at('08:00').getTime());
    assert.equal(b?.end.getTime(), at('22:00').getTime());
  });

  it('window before shift moves the start', () => {
    const b = expectedBounds(DATE, { start: '08:00', end: '17:00' }, [OT_BEFORE]);
    assert.equal(b?.start.getTime(), at('06:00').getTime());
    assert.equal(b?.end.getTime(), at('17:00').getTime());
  });

  it('night shift ends next day', () => {
    const b = expectedBounds(DATE, { start: '22:00', end: '06:00' }, []);
    assert.equal(b?.start.getTime(), at('22:00').getTime());
    assert.equal(b?.end.getTime(), next('06:00').getTime());
  });

  it('no shift and no window is null', () => {
    assert.equal(expectedBounds(DATE, null, []), null);
  });

  it('no shift uses the windows alone', () => {
    const b = expectedBounds(DATE, null, [{ kind: 'OT', start: '08:00', end: '12:00' }]);
    assert.equal(b?.start.getTime(), at('08:00').getTime());
    assert.equal(b?.end.getTime(), at('12:00').getTime());
  });
});
