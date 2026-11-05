import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidDateText } from '../../src/common/date-text';

test('isValidDateText accepts real YYYY-MM-DD calendar days only', () => {
  for (const ok of ['2026-11-04', '2024-02-29', '2026-12-31', '2026-01-01']) {
    assert.equal(isValidDateText(ok), true, ok);
  }
  for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-11-4', '2026-11-04T00:00', ' 2026-11-04', '']) {
    assert.equal(isValidDateText(bad), false, bad);
  }
});

test('isValidDateText refuses values that are not strings', () => {
  for (const bad of [null, undefined, 20261104, new Date('2026-11-04T00:00:00Z'), ['2026-11-04'], { date: '2026-11-04' }]) {
    assert.equal(isValidDateText(bad), false, String(bad));
  }
});
