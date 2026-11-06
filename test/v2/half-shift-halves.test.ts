import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  halvesOf,
  leaveWindowOf,
  HALF_SHIFT_OWED_MINUTES,
} from '../../src/common/half-shift.js';

describe('half-shift halves and leave window', () => {
  it('defines 240 minutes of debt per request', () => {
    assert.equal(HALF_SHIFT_OWED_MINUTES, 240);
  });

  it('splits the six 9-hour catalog shifts into FIRST and SECOND halves correctly', () => {
    // Normal1 08-17
    assert.deepEqual(halvesOf({ start: '08:00', end: '17:00' }), {
      FIRST: {
        work: { start: '08:00', end: '12:00' },
        leave: { start: '13:00', end: '17:00' },
      },
      SECOND: {
        work: { start: '13:00', end: '17:00' },
        leave: { start: '08:00', end: '12:00' },
      },
    });

    // Normal2 10-19
    assert.deepEqual(halvesOf({ start: '10:00', end: '19:00' }), {
      FIRST: {
        work: { start: '10:00', end: '14:00' },
        leave: { start: '15:00', end: '19:00' },
      },
      SECOND: {
        work: { start: '15:00', end: '19:00' },
        leave: { start: '10:00', end: '14:00' },
      },
    });

    // Flex1 06-15
    assert.deepEqual(halvesOf({ start: '06:00', end: '15:00' }), {
      FIRST: {
        work: { start: '06:00', end: '10:00' },
        leave: { start: '11:00', end: '15:00' },
      },
      SECOND: {
        work: { start: '11:00', end: '15:00' },
        leave: { start: '06:00', end: '10:00' },
      },
    });

    // Flex2 13-22
    assert.deepEqual(halvesOf({ start: '13:00', end: '22:00' }), {
      FIRST: {
        work: { start: '13:00', end: '17:00' },
        leave: { start: '18:00', end: '22:00' },
      },
      SECOND: {
        work: { start: '18:00', end: '22:00' },
        leave: { start: '13:00', end: '17:00' },
      },
    });

    // Night1 22-07
    assert.deepEqual(halvesOf({ start: '22:00', end: '07:00' }), {
      FIRST: {
        work: { start: '22:00', end: '02:00' },
        leave: { start: '03:00', end: '07:00' },
      },
      SECOND: {
        work: { start: '03:00', end: '07:00' },
        leave: { start: '22:00', end: '02:00' },
      },
    });

    // Night2 21-06
    assert.deepEqual(halvesOf({ start: '21:00', end: '06:00' }), {
      FIRST: {
        work: { start: '21:00', end: '01:00' },
        leave: { start: '02:00', end: '06:00' },
      },
      SECOND: {
        work: { start: '02:00', end: '06:00' },
        leave: { start: '21:00', end: '01:00' },
      },
    });
  });

  it('returns null for shifts not exactly 9 hours (540 minutes)', () => {
    assert.equal(halvesOf({ start: '08:00', end: '16:00' }), null);
    assert.equal(halvesOf({ start: '08:00', end: '18:00' }), null);
    assert.equal(halvesOf({ start: '22:00', end: '06:00' }), null);
  });

  it('derives leave window from the captured work half', () => {
    assert.deepEqual(
      leaveWindowOf('FIRST', { start: '08:00', end: '12:00' }),
      { start: '13:00', end: '17:00' }
    );
    assert.deepEqual(
      leaveWindowOf('SECOND', { start: '13:00', end: '17:00' }),
      { start: '08:00', end: '12:00' }
    );
    assert.deepEqual(
      leaveWindowOf('FIRST', { start: '22:00', end: '02:00' }),
      { start: '03:00', end: '07:00' }
    );
  });
});
