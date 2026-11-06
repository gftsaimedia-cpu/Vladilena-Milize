import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inOutText, presenceOf, vnClock, vnInstant } from '../../src/modules/payroll/domain';

describe('presence: real check-in and check-out of a day', () => {
  it('formats a punch in Vietnam time', () => {
    assert.equal(vnClock('2026-10-07T01:12:00.000Z'), '08:12');
    assert.equal(vnClock(new Date('2026-10-07T23:58:00.000Z')), '06:58');
  });

  it('builds the instant of a Vietnam clock time on a date', () => {
    assert.equal(vnInstant('2026-10-07', '19:20').toISOString(), '2026-10-07T12:20:00.000Z');
  });

  it('shows both punches', () => {
    const p = presenceOf('2026-10-07', '2026-10-07T01:12:00.000Z', '2026-10-07T10:05:00.000Z');
    assert.equal(inOutText(p), '08:12–17:05');
    assert.equal(p.start?.toISOString(), '2026-10-07T01:12:00.000Z');
    assert.equal(p.end?.toISOString(), '2026-10-07T10:05:00.000Z');
  });

  // A day row carries its punches as Date instants (timestamptz), a missing side as null.
  it('reads the punches of a day row given as Date instants and keeps a null punch empty', () => {
    const p = presenceOf('2026-10-05', new Date('2026-10-05T01:00:00.000Z'), null);
    assert.deepEqual([p.checkIn, p.checkOut], ['08:00', null]);
    assert.equal(p.start?.toISOString(), '2026-10-05T01:00:00.000Z');
    assert.equal(p.end, null);
  });

  it('leaves a missing punch empty', () => {
    const p = presenceOf('2026-10-07', '2026-10-07T01:12:00.000Z', null);
    assert.equal(inOutText(p), '08:12–—');
    assert.equal(p.end, null);
    assert.equal(inOutText(presenceOf('2026-10-07', undefined, undefined)), '—–—');
  });

  it('fills a missing punch from the explanation', () => {
    const p = presenceOf('2026-10-07', '2026-10-07T01:12:00.000Z', null, { checkOut: '19:20' });
    assert.equal(p.checkOut, '19:20');
    assert.equal(p.end?.toISOString(), '2026-10-07T12:20:00.000Z');
  });

  it('prefers the punch over the explanation', () => {
    const p = presenceOf('2026-10-07', '2026-10-07T01:12:00.000Z', '2026-10-07T10:05:00.000Z', { checkOut: '19:20' });
    assert.equal(p.checkOut, '17:05');
  });

  it('reads a night shift across midnight', () => {
    const p = presenceOf('2026-10-05', '2026-10-05T15:03:00.000Z', '2026-10-05T23:58:00.000Z');
    assert.equal(inOutText(p), '22:03–06:58');
  });

  it('moves an explained check-out that is not after the check-in to the next day', () => {
    const p = presenceOf('2026-10-05', null, null, { checkIn: '22:00', checkOut: '06:30' });
    assert.equal(p.start?.toISOString(), '2026-10-05T15:00:00.000Z');
    assert.equal(p.end?.toISOString(), '2026-10-05T23:30:00.000Z');
  });

  it('treats empty explanation times as missing', () => {
    const p = presenceOf('2026-10-07', null, null, { checkIn: '', checkOut: null });
    assert.equal(inOutText(p), '—–—');
    assert.equal(p.start, null);
  });
});
