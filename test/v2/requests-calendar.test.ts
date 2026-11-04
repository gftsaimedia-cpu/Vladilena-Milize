import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  eachDate,
  EXPLANATION_CASES,
  findShiftFrame,
  formatDayMonth,
  isExplanationCase,
  isLeaveType,
  lastDayOfMonth,
  LEAVE_TYPES,
  monthOf,
  SHIFT_FRAMES,
  vietnamToday,
  weekday,
  workingDays
} from '../../src/modules/requests/domain';

describe('Danh mục và ngày làm việc - domain', () => {
  it('LEAVE_TYPES are the six PDF groups', () => {
    assert.deepEqual(LEAVE_TYPES.map(t => [t.code, t.label, t.payGroup]), [
      ['ANNUAL', 'Phép năm', 'PAID'], ['PERSONAL_PAID', 'Việc riêng có lương', 'PAID'],
      ['PERSONAL_UNPAID', 'Việc riêng không lương', 'UNPAID'], ['SOCIAL_INSURANCE', 'Chế độ BHXH', 'SOCIAL_INSURANCE'],
      ['WELFARE', 'Phúc lợi nội bộ', 'PAID'], ['UNPAID', 'Không lương', 'UNPAID']
    ]);
    assert.equal(isLeaveType('PAID'), false);
    assert.equal(isLeaveType('ANNUAL'), true);
  });

  it('EXPLANATION_CASES are the seven cases in order', () => {
    assert.deepEqual(EXPLANATION_CASES.map(c => c.code), ['LATE_CHECK_IN', 'EARLY_CHECK_OUT', 'MISSING_CHECK_IN',
      'MISSING_CHECK_OUT', 'EARLY_CHECK_IN', 'LATE_CHECK_OUT', 'FORGOT_CHECK_OUT']);
    assert.equal(EXPLANATION_CASES[6].label, 'Quên check-out (ra muộn quá 30 phút)');
    assert.equal(isExplanationCase('X'), false);
  });

  it('EXPLANATION_CASES labels match the spec table', () => {
    assert.deepEqual(EXPLANATION_CASES.map(c => c.label), [
      'Vào muộn quá 15 phút', 'Ra sớm', 'Thiếu giờ vào', 'Thiếu giờ ra',
      'Vào sớm quá 15 phút', 'Ra muộn quá 15 phút khi không có OT', 'Quên check-out (ra muộn quá 30 phút)'
    ]);
    assert.equal(isExplanationCase('FORGOT_CHECK_OUT'), true);
  });

  it('SHIFT_FRAMES are the six frames', () => {
    assert.deepEqual(SHIFT_FRAMES.map(f => `${f.shiftType} ${f.startTime}-${f.endTime}`), ['NORMAL 08:00-17:00',
      'NORMAL 10:00-19:00', 'FLEX 06:00-15:00', 'FLEX 13:00-22:00', 'NIGHT 22:00-07:00', 'NIGHT 21:00-06:00']);
    assert.equal(findShiftFrame('FLEX', '13:00')?.endTime, '22:00');
    assert.equal(findShiftFrame('NORMAL', '09:00'), null);
    assert.equal(findShiftFrame('CUSTOM', '08:00'), null);
  });

  it('findShiftFrame rejects values that are not strings', () => {
    assert.equal(findShiftFrame(undefined, '08:00'), null);
    assert.equal(findShiftFrame('NORMAL', 800), null);
  });

  it('workingDays follows the type weekdays and skips holidays', () => {
    const nv = [1, 2, 3, 4, 5, 6], tts = [1, 2, 3, 4, 5], none = new Set<string>();
    assert.deepEqual(workingDays('2026-11-13', '2026-11-16', nv, none), ['2026-11-13', '2026-11-14', '2026-11-16']);
    assert.deepEqual(workingDays('2026-11-13', '2026-11-16', tts, none), ['2026-11-13', '2026-11-16']);
    assert.deepEqual(workingDays('2026-09-01', '2026-09-03', nv, new Set(['2026-09-02'])), ['2026-09-01', '2026-09-03']);
    assert.deepEqual(workingDays('2026-11-15', '2026-11-15', nv, none), []);
  });

  it('date helpers', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.deepEqual(eachDate('2026-11-29', '2026-12-01'), ['2026-11-29', '2026-11-30', '2026-12-01']);
    assert.equal(weekday('2026-11-15'), 0);
    assert.equal(lastDayOfMonth('2026-02'), '2026-02-28');
    assert.equal(formatDayMonth('2026-11-12'), '12/11');
    assert.equal(vietnamToday(new Date('2026-11-04T18:30:00Z')), '2026-11-05');
  });

  it('date helpers cross month, year and leap-day boundaries', () => {
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(lastDayOfMonth('2028-02'), '2028-02-29');
    assert.equal(lastDayOfMonth('2026-12'), '2026-12-31');
    assert.equal(monthOf('2026-11-30'), '2026-11');
    assert.equal(weekday('2026-11-07'), 6);
    assert.deepEqual(eachDate('2026-11-05', '2026-11-05'), ['2026-11-05']);
    assert.deepEqual(eachDate('2026-11-06', '2026-11-05'), []);
    assert.equal(vietnamToday(new Date('2026-11-04T16:59:59Z')), '2026-11-04');
  });
});
