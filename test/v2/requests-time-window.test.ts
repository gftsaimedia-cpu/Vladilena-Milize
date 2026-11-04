import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayCapError,
  formatHours,
  windowError,
  workMinutes,
  type WindowKind
} from '../../src/modules/requests/domain';

const w = (date: string, s: string, e: string, kind: WindowKind = 'OT') => ({ date, startTime: s, endTime: e, kind });
const day = [{ startDate: '2026-11-12', startTime: '08:00', endTime: '17:00' }];

describe('Khung giờ OT/làm bù - domain', () => {
  it('workMinutes: 4h work then 1h break', () => {
    for (const [s, e, m] of [['18:00', '22:00', 240], ['06:00', '07:00', 60], ['08:00', '17:00', 480],
      ['08:00', '20:00', 600], ['06:00', '20:00', 720], ['06:00', '21:00', 720], ['06:00', '22:00', 780]] as const)
      assert.equal(workMinutes(s, e), m, `${s}-${e}`);
  });

  it('windowError on shift 08–17', () => {
    assert.equal(windowError(w('2026-11-12', '06:00', '07:00'), day, []), null);
    assert.equal(windowError(w('2026-11-12', '18:00', '22:00'), day, []), null);
    assert.match(windowError(w('2026-11-12', '17:00', '19:00'), day, [])!, /phải cách ca 08:00–17:00 ít nhất 1 giờ/);
    assert.match(windowError(w('2026-11-12', '07:30', '08:00'), day, [])!, /ít nhất 1 giờ/);
    assert.match(windowError(w('2026-11-12', '21:00', '23:00'), day, [])!, /phải nằm trong 06:00–22:00/);
    assert.match(windowError(w('2026-11-12', '05:00', '06:00'), [], [])!, /06:00–22:00/);
    assert.match(windowError(w('2026-11-12', '19:00', '18:00'), [], [])!, /Giờ khung không hợp lệ: 19:00–18:00/);
    assert.match(windowError(w('2026-11-12', '6:00', '07:00'), [], [])!, /Giờ khung không hợp lệ/);
  });

  it('windowError returns the exact message for each rule', () => {
    assert.equal(windowError(w('2026-11-12', '19:00', '18:00'), [], []), 'Giờ khung không hợp lệ: 19:00–18:00');
    assert.equal(windowError(w('2026-11-12', '18:00', '18:00'), [], []), 'Giờ khung không hợp lệ: 18:00–18:00');
    assert.equal(windowError(w('2026-11-12', '24:00', '25:00'), [], []), 'Giờ khung không hợp lệ: 24:00–25:00');
    assert.equal(windowError(w('2026-11-12', '21:00', '23:00'), [], []),
      'Khung 21:00–23:00 ngày 12/11 phải nằm trong 06:00–22:00');
    assert.equal(windowError(w('2026-11-12', '17:00', '19:00'), day, []),
      'Khung 17:00–19:00 ngày 12/11 phải cách ca 08:00–17:00 ít nhất 1 giờ');
    assert.equal(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-12', '19:00', '22:00', 'MAKEUP')]),
      'Khung 18:00–20:00 ngày 12/11 chồng lên khung 19:00–22:00');
  });

  it('windowError reports the first failing rule in order', () => {
    // sai định dạng thắng khung ngoài 06–22
    assert.match(windowError(w('2026-11-12', '23:00', '23:00'), day, [])!, /^Giờ khung không hợp lệ/);
    // ngoài 06–22 thắng chạm ca
    assert.match(windowError(w('2026-11-12', '05:00', '08:30'), day, [])!, /phải nằm trong 06:00–22:00/);
    // chạm ca thắng chồng khung
    assert.match(windowError(w('2026-11-12', '17:00', '19:00'), day, [w('2026-11-12', '18:00', '20:00')])!,
      /phải cách ca/);
  });

  it('night shift tail blocks the next morning, across month end too', () => {
    const night = [{ startDate: '2026-11-10', startTime: '22:00', endTime: '07:00' }];
    assert.match(windowError(w('2026-11-11', '07:30', '09:00'), night, [])!, /cách ca 22:00–07:00 ít nhất 1 giờ/);
    assert.equal(windowError(w('2026-11-11', '08:00', '12:00'), night, []), null);
    assert.equal(windowError(w('2026-11-10', '17:00', '21:00'), night, []), null);
    const last = [{ startDate: '2026-11-30', startTime: '22:00', endTime: '07:00' }];
    assert.match(windowError(w('2026-12-01', '07:30', '09:00'), last, [])!, /ít nhất 1 giờ/);
    assert.equal(windowError(w('2026-12-01', '08:00', '12:00'), last, []), null);
  });

  it('the gap to the shift is exactly 60 minutes: 59 fails, 60 passes', () => {
    assert.match(windowError(w('2026-11-12', '06:00', '07:01'), day, [])!, /ít nhất 1 giờ/);
    assert.equal(windowError(w('2026-11-12', '06:00', '07:00'), day, []), null);
    assert.match(windowError(w('2026-11-12', '17:59', '20:00'), day, [])!, /ít nhất 1 giờ/);
    assert.equal(windowError(w('2026-11-12', '18:00', '20:00'), day, []), null);
  });

  it('a shift on another day does not block a window that is 60+ minutes away', () => {
    assert.equal(windowError(w('2026-11-13', '06:00', '10:00'), day, []), null);
    assert.equal(windowError(w('2026-11-11', '18:00', '22:00'), day, []), null);
  });

  it('windows of the same day may not overlap', () => {
    assert.match(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-12', '19:00', '22:00', 'MAKEUP')])!,
      /chồng lên khung 19:00–22:00/);
    assert.equal(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-12', '20:00', '22:00')]), null);
    assert.equal(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-13', '18:00', '20:00')]), null);
  });

  it('dayCapError counts the shift as 8 hours', () => {
    assert.equal(dayCapError('2026-11-12', true, [w('2026-11-12', '18:00', '22:00')]), null);
    assert.equal(dayCapError('2026-11-12', true, [w('2026-11-12', '06:00', '07:00'), w('2026-11-12', '18:00', '22:00')]),
      'Ngày 12/11 vượt 12 giờ (ca + OT + làm bù = 13 giờ)');
    assert.equal(dayCapError('2026-11-15', false, [w('2026-11-15', '06:00', '20:00')]), null);
    assert.equal(dayCapError('2026-11-15', false, [w('2026-11-15', '06:00', '21:00')]), null);
    assert.match(dayCapError('2026-11-15', false, [w('2026-11-15', '06:00', '22:00')])!, /= 13 giờ/);
  });

  it('dayCapError counts only windows of the day under test', () => {
    assert.equal(dayCapError('2026-11-12', true, [w('2026-11-13', '06:00', '22:00')]), null);
    assert.equal(dayCapError('2026-11-12', false, []), null);
  });

  it('formatHours', () => {
    assert.deepEqual([formatHours(480), formatHours(450), formatHours(780)], ['8', '7,5', '13']);
  });
});
