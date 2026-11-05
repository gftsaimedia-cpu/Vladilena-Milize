import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explanationCasesOf, type DetectInput } from '../../src/modules/requests/domain';

const vn = (d: string, t: string) => new Date(`${d}T${t}:00+07:00`);
const D = '2026-10-27';
const base: DetectInput = {
  date: D, today: '2026-10-28', shiftStart: '08:00', shiftEnd: '17:00',
  checkIn: null, checkOut: null, hasOt: false
};
const run = (inT: string | null, outT: string | null, over: Partial<DetectInput> = {}) =>
  explanationCasesOf({
    ...base,
    checkIn: inT ? vn(over.date ?? D, inT) : null,
    checkOut: outT ? vn(over.date ?? D, outT) : null,
    ...over
  });

describe('Phát hiện trường hợp giải trình', () => {
  it('late in', () => {
    const r = run('08:40', '17:05');
    assert.deepEqual(r.cases, ['LATE_CHECK_IN']);
    assert.deepEqual(r.needs, { checkIn: false, checkOut: false });
  });

  it('early in', () => {
    assert.deepEqual(run('07:30', '17:00').cases, ['EARLY_CHECK_IN']);
  });

  it('edges are valid', () => {
    assert.deepEqual(run('08:15', '17:30').cases, []);
    assert.deepEqual(run('07:45', '17:00').cases, []);
  });

  it('early out', () => {
    assert.deepEqual(run('08:00', '16:30').cases, ['EARLY_CHECK_OUT']);
  });

  it('late out without OT', () => {
    assert.deepEqual(run('08:00', '17:45').cases, ['FORGOT_CHECK_OUT']);
    assert.deepEqual(run('08:00', '17:45', { hasOt: true }).cases, []);
  });

  it('missing in', () => {
    const r = run(null, '17:00');
    assert.deepEqual(r.cases, ['MISSING_CHECK_IN']);
    assert.deepEqual(r.needs, { checkIn: true, checkOut: false });
  });

  it('missing out on a past day', () => {
    const r = run('08:00', null);
    assert.deepEqual(r.cases, ['MISSING_CHECK_OUT']);
    assert.deepEqual(r.needs, { checkIn: false, checkOut: true });
  });

  it('no punches on a past day', () => {
    const r = run(null, null);
    assert.deepEqual(r.cases, ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']);
    assert.deepEqual(r.needs, { checkIn: true, checkOut: true });
  });

  it('two cases on one day', () => {
    assert.deepEqual(run('08:40', null).cases, ['LATE_CHECK_IN', 'MISSING_CHECK_OUT']);
  });

  it('today only counts certain cases', () => {
    const today = { date: '2026-10-28', today: '2026-10-28' };
    assert.deepEqual(run('08:00', null, today).cases, []);
    assert.deepEqual(run(null, null, today).cases, []);
    assert.deepEqual(run(null, '12:00', today).cases, ['MISSING_CHECK_IN', 'EARLY_CHECK_OUT']);
  });

  it('night shift out next morning', () => {
    const r = explanationCasesOf({
      ...base,
      shiftStart: '22:00',
      shiftEnd: '07:00',
      checkIn: vn('2026-10-27', '22:30'),
      checkOut: vn('2026-10-28', '07:00')
    });
    assert.deepEqual(r.cases, ['LATE_CHECK_IN']);
  });
});
