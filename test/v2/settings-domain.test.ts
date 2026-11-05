import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkPunchLocation,
  distanceM,
  validateZone
} from '../../src/modules/settings/domain/attendance-zone';
import { minMonthFrom } from '../../src/modules/settings/domain/min-month';
import { payDateOf } from '../../src/modules/settings/domain/pay-days';
import {
  parseEffectiveMonth,
  parseMonth,
  parseReason,
  parseStamp
} from '../../src/modules/settings/domain/settings-input';
import { isWorkday, standardWorkdaysForWeek, validateWeekdays } from '../../src/modules/settings/domain/work-week';

const NOW = new Date('2026-11-05T03:00:00Z');
const ZONE = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
const FAR = { lat: 10.78229593, lng: 106.7009 }; // 600 m về phía bắc

describe('settings pure helpers', () => {
  it('standard workdays follow days × 52 ÷ 12', () =>
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(standardWorkdaysForWeek), [4, 9, 13, 17, 22, 26]));
  it('weekdays', () => {
    assert.deepEqual(validateWeekdays([5, 1, 3]), [1, 3, 5]);
    for (const v of [[], [0], [7], [1, 1], [1.5], 'x', null]) {
      assert.throws(() => validateWeekdays(v), (e: any) => e.field === 'weekdays');
    }
    assert.equal(isWorkday([1, 2, 3, 4, 5], '2026-12-12'), false); // thứ Bảy
    assert.equal(isWorkday([1, 2, 3, 4, 5], '2026-12-11'), true); // thứ Sáu
    assert.equal(isWorkday([1, 2, 3, 4, 5, 6], '2026-12-13'), false); // Chủ nhật
  });
  it('zone distance and punch check', () => {
    assert.equal(distanceM(ZONE, ZONE), 0);
    assert.equal(distanceM(ZONE, FAR), 600);
    assert.deepEqual(checkPunchLocation(null, {}), { kind: 'ok', distanceM: null });
    assert.deepEqual(checkPunchLocation(ZONE, FAR), { kind: 'outside', distanceM: 600 });
    assert.deepEqual(checkPunchLocation(ZONE, { lat: ZONE.lat, lng: ZONE.lng }), { kind: 'ok', distanceM: 0 });
    assert.deepEqual(checkPunchLocation(ZONE, { lat: 10.7769 }), { kind: 'no-location' });
    assert.deepEqual(checkPunchLocation(ZONE, { lat: null, lng: null }), { kind: 'no-location' });
    assert.equal(checkPunchLocation(ZONE, { lat: 0, lng: 0 }).kind, 'outside');
    assert.deepEqual(validateZone({ lat: 10.7769, lng: 106.7009, radiusM: 150 }), ZONE);
    for (const [v, f] of [
      [{ ...ZONE, radiusM: 19 }, 'radiusM'],
      [{ ...ZONE, radiusM: 5001 }, 'radiusM'],
      [{ ...ZONE, radiusM: 150.5 }, 'radiusM'],
      [{ ...ZONE, lat: 91 }, 'lat'],
      [{ ...ZONE, lng: '106' }, 'lng']
    ] as const) {
      assert.throws(() => validateZone(v), (e: any) => e.field === f);
    }
  });
  it('pay date is payDay of the next month, kept on Sundays', () => {
    assert.equal(payDateOf('2026-11', 10), '2026-12-10');
    assert.equal(payDateOf('2026-12', 10), '2027-01-10'); // Chủ nhật, giữ nguyên
    assert.equal(payDateOf('2026-11', 5), '2026-12-05');
    assert.equal(payDateOf('2027-01', 28), '2027-02-28');
  });
  it('min month', () => {
    assert.equal(minMonthFrom(null, NOW), '2026-11');
    assert.equal(minMonthFrom('2026-10', NOW), '2026-11');
    assert.equal(minMonthFrom('2026-08', NOW), '2026-09');
    assert.equal(minMonthFrom('2026-12', NOW), '2027-01');
  });
  it('input pieces', () => {
    assert.equal(parseReason('  Theo QĐ  '), 'Theo QĐ');
    assert.equal(parseReason('   '), null);
    assert.equal(parseReason(undefined), null);
    assert.equal(parseReason(null), null);
    assert.throws(() => parseReason('x'.repeat(301)), (e: any) => e.field === 'reason');
    assert.throws(() => parseReason(5), (e: any) => e.field === 'reason');
    assert.equal(parseStamp(0), 0);
    for (const v of [-1, 1.5, '0', undefined]) assert.throws(() => parseStamp(v), (e: any) => e.field === 'stamp');
    assert.equal(parseEffectiveMonth('2026-11', '2026-11'), '2026-11');
    assert.throws(() => parseEffectiveMonth('2026-10', '2026-11'), (e: any) => e.field === 'effectiveMonth');
    assert.throws(() => parseEffectiveMonth('2026-10', '2026-11'), /từ 11\/2026 trở đi/);
    assert.throws(() => parseMonth('2026-13', 'month'), (e: any) => e.field === 'month');
    assert.equal(parseMonth('2026-12', 'month'), '2026-12');
  });
});
