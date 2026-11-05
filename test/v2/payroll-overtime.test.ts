import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OT_MULTIPLIERS,
  measureOvertime,
  otLinePayByRate,
  otLinePayOf,
  otMultiplierOf,
  otPayOf,
  vnInstant,
  type OtWindow,
  type PresenceSpan
} from '../../src/modules/payroll/domain';

// Shift 08:00-17:00, hourly rate = 6,000,000 / 26 / 8.
const HOUR_RATE = 6_000_000 / 26 / 8;
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

const window = (date: string, start = '18:00', end = '20:00'): OtWindow => ({ date, start, end });
const span = (workDate: string, from: string, to: string, toDate = workDate): PresenceSpan => ({
  workDate,
  start: vnInstant(workDate, from),
  end: vnInstant(toDate, to)
});

describe('OT multiplier of a day', () => {
  it('keeps the multipliers in one table', () => {
    assert.deepEqual(OT_MULTIPLIERS, { weekday: 1.5, weekend: 2, holiday: 3 });
  });

  it('is 1.5 on a weekday, 2 on Saturday and Sunday, 3 on a company holiday', () => {
    assert.equal(otMultiplierOf('2026-10-07', NO_HOLIDAYS), 1.5); // Wednesday
    assert.equal(otMultiplierOf('2026-10-10', NO_HOLIDAYS), 2); // Saturday
    assert.equal(otMultiplierOf('2026-10-11', NO_HOLIDAYS), 2); // Sunday
    assert.equal(otMultiplierOf('2026-10-07', new Set(['2026-10-07'])), 3);
  });

  it('lets a holiday win over the weekend', () => {
    assert.equal(otMultiplierOf('2026-10-10', new Set(['2026-10-10'])), 3);
  });
});

describe('OT measured from the approved window and the real presence', () => {
  const measureOne = (date: string, checkOut: string, holidays: ReadonlySet<string> = NO_HOLIDAYS) =>
    measureOvertime([window(date)], [span(date, '08:00', checkOut)], holidays);

  it('pays the minutes inside the window on a weekday (80 minutes at x1.5)', () => {
    const shares = measureOne('2026-10-07', '19:20');
    assert.deepEqual(shares, [{ lineDate: '2026-10-07', otDate: '2026-10-07', hours: 80 / 60, multiplier: 1.5 }]);
    assert.equal(otPayOf(shares[0].hours, HOUR_RATE, shares[0].multiplier), 57_692);
  });

  it('caps the hours at the window when the employee stays longer', () => {
    const [share] = measureOne('2026-10-07', '20:30');
    assert.equal(share.hours, 2);
    assert.equal(share.multiplier, 1.5);
    assert.equal(otPayOf(share.hours, HOUR_RATE, share.multiplier), 86_538);
  });

  it('pays x2 on Saturday', () => {
    const [share] = measureOne('2026-10-10', '20:30');
    assert.equal(share.hours, 2);
    assert.equal(share.multiplier, 2);
    assert.equal(otPayOf(share.hours, HOUR_RATE, share.multiplier), 115_385);
  });

  it('pays x3 on a company holiday, which wins over Saturday', () => {
    const [share] = measureOne('2026-10-10', '20:30', new Set(['2026-10-10']));
    assert.equal(share.multiplier, 3);
    assert.equal(otPayOf(share.hours, HOUR_RATE, share.multiplier), 173_077);
  });

  it('gives no share when the employee left before the window', () => {
    assert.deepEqual(measureOne('2026-10-07', '17:30'), []);
  });

  it('counts whole minutes only', () => {
    // Present until 19:00:59.999: the 59 seconds do not make a minute.
    const end = new Date(vnInstant('2026-10-07', '19:00').getTime() + 59_999);
    const spans = [{ workDate: '2026-10-07', start: vnInstant('2026-10-07', '08:00'), end }];
    const [share] = measureOvertime([window('2026-10-07')], spans, NO_HOLIDAYS);
    assert.equal(share.hours, 1);
  });

  it('gives two shares on the same line for two windows of one day', () => {
    const shares = measureOvertime(
      [window('2026-10-07', '06:00', '07:00'), window('2026-10-07', '18:00', '19:00')],
      [span('2026-10-07', '06:00', '19:00')],
      NO_HOLIDAYS
    );
    assert.equal(shares.length, 2);
    assert.deepEqual(
      shares.map(s => s.lineDate),
      ['2026-10-07', '2026-10-07']
    );
    assert.equal(shares[0].hours + shares[1].hours, 2);
  });

  it('puts a window on the line of the night shift whose presence reaches into it', () => {
    // Night shift of 05/10 22:00 to 06/10 06:30; the window is dated 06/10 and no span has that work date.
    const shares = measureOvertime(
      [window('2026-10-06', '05:00', '07:00')],
      [span('2026-10-05', '22:00', '06:30', '2026-10-06')],
      NO_HOLIDAYS
    );
    assert.deepEqual(shares, [{ lineDate: '2026-10-05', otDate: '2026-10-06', hours: 1.5, multiplier: 1.5 }]);
  });

  it('counts the minutes of the union of presence, not span by span, when two spans overlap', () => {
    // A check-out typed as 07:30 on a day shift moves to the next day: 07/10 08:12 -> 08/10 07:30. The real presence
    // of 08/10 06:00-17:00 overlaps it. The 1-hour window 06:00-07:00 on 08/10 (a Thursday) pays 1 hour, not 2.
    const shares = measureOvertime(
      [window('2026-10-08', '06:00', '07:00')],
      [span('2026-10-07', '08:12', '07:30', '2026-10-08'), span('2026-10-08', '06:00', '17:00')],
      NO_HOLIDAYS
    );
    assert.deepEqual(shares, [{ lineDate: '2026-10-08', otDate: '2026-10-08', hours: 1, multiplier: 1.5 }]);
  });

  it('merges two spans that partly overlap inside one window', () => {
    // 18:00-19:30 and 19:00-20:30 inside the window 18:00-21:00 cover 18:00-20:30 = 2.5 hours, not 3.
    const shares = measureOvertime(
      [window('2026-10-07', '18:00', '21:00')],
      [span('2026-10-07', '18:00', '19:30'), span('2026-10-07', '19:00', '20:30')],
      NO_HOLIDAYS
    );
    assert.equal(shares.length, 1);
    assert.equal(shares[0].hours, 2.5);
  });

  it('counts a span that lies inside another span once', () => {
    const shares = measureOvertime(
      [window('2026-10-07', '18:00', '21:00')],
      [span('2026-10-07', '17:00', '20:00'), span('2026-10-07', '18:30', '19:00')],
      NO_HOLIDAYS
    );
    assert.equal(shares[0].hours, 2);
  });

  it('gives nothing when no span overlaps the window', () => {
    assert.deepEqual(measureOvertime([window('2026-10-07')], [span('2026-10-08', '08:00', '20:00')], NO_HOLIDAYS), []);
    assert.deepEqual(measureOvertime([window('2026-10-07')], [], NO_HOLIDAYS), []);
  });

  it('ignores a window whose end is not after its start or whose time is malformed', () => {
    const spans = [span('2026-10-07', '08:00', '21:00')];
    assert.deepEqual(measureOvertime([window('2026-10-07', '20:00', '18:00')], spans, NO_HOLIDAYS), []);
    assert.deepEqual(measureOvertime([window('2026-10-07', '18:00', '18:00')], spans, NO_HOLIDAYS), []);
    assert.deepEqual(measureOvertime([window('2026-10-07', 'xx:yy', '20:00')], spans, NO_HOLIDAYS), []);
    assert.deepEqual(measureOvertime([window('2026-10-07', '18:00', '25:00')], spans, NO_HOLIDAYS), []);
  });
});

describe('OT pay of one day line', () => {
  const share = (hours: number, multiplier: 1.5 | 2 | 3) => ({ lineDate: 'd', otDate: 'd', hours, multiplier });

  it('rounds the summed hours of one multiplier once', () => {
    assert.equal(otPayOf(50 / 60, HOUR_RATE, 1.5) + otPayOf(70 / 60, HOUR_RATE, 1.5), 86_539);
    assert.equal(otLinePayOf([share(50 / 60, 1.5), share(70 / 60, 1.5)], HOUR_RATE), 86_538);
  });

  it('rounds each multiplier separately and gives 0 without shares', () => {
    assert.equal(otLinePayOf([share(119 / 60, 1.5), share(1, 2)], HOUR_RATE), 85_817 + 57_692);
    assert.equal(otLinePayOf([], HOUR_RATE), 0);
  });

  it('splits the line pay by multiplier, each rounded once, and the line pay is their sum', () => {
    assert.deepEqual(otLinePayByRate([share(50 / 60, 1.5), share(70 / 60, 1.5)], HOUR_RATE), {
      x15: 86_538,
      x20: 0,
      x30: 0
    });
    const mixed = [share(119 / 60, 1.5), share(1, 2), share(2, 3)];
    const byRate = otLinePayByRate(mixed, HOUR_RATE);
    assert.deepEqual(byRate, { x15: 85_817, x20: 57_692, x30: 173_077 });
    assert.equal(otLinePayOf(mixed, HOUR_RATE), byRate.x15 + byRate.x20 + byRate.x30);
    assert.deepEqual(otLinePayByRate([], HOUR_RATE), { x15: 0, x20: 0, x30: 0 });
  });
});

describe('OT pay', () => {
  it('rounds hours x hourly rate x multiplier once', () => {
    assert.equal(otPayOf(2, HOUR_RATE, 2), 115_385);
    assert.equal(otPayOf(0, HOUR_RATE, 3), 0);
  });
});
