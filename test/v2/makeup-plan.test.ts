import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planMakeup } from '../../src/modules/requests/domain/makeup-plan';

// Ngày bù 2026-11-12: khung giờ chọn được 06–22 (ví dụ rút gọn); nghỉ 2026-11-10 cần 480 phút.
const hoursOf = (starts: number[]) =>
  starts.map(start => ({
    start,
    ends: Array.from({ length: 22 - start }, (_, i) => ({ end: start + 1 + i, minutes: (i + 1) * 60 })).filter(e => e.minutes <= 720)
  }));
const ctx = {
  days: [
    { date: '2026-11-12', hours: hoursOf([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]) },
    { date: '2026-11-13', hours: hoursOf([6, 7, 8, 9, 10]) }
  ],
  choices: {
    'leave-with-makeup': {
      starts: ['2026-11-10'],
      ends: { '2026-11-10': [{ date: '2026-11-10', daysCount: 1, makeupMinutesRequired: 480 }] },
      slotDates: { '2026-11-10': ['2026-11-12', '2026-11-13'] }
    }
  }
} as any;
const row = (date = '', startTime = '', endTime = '') => ({ date, startTime, endTime });

test('khoảng nghỉ hợp lệ: cần 480 phút, chưa xếp gì thì còn thêm được dòng', () => {
  const p = planMakeup(ctx, '2026-11-10', '2026-11-10', [row()]);
  assert.deepEqual([p.requiredMinutes, p.plannedMinutes, p.canAdd], [480, 0, true]);
  assert.deepEqual(p.slotDates, ['2026-11-12', '2026-11-13']);
});

test('khoảng nghỉ không hợp lệ: cần 0 phút và không thêm được dòng', () => {
  const p = planMakeup(ctx, '2026-11-10', '2026-11-11', [row()]);
  assert.deepEqual([p.requiredMinutes, p.canAdd, p.slotDates], [0, false, []]);
});

test('đủ giờ bù thì hết thêm được dòng; giờ chọn không vượt số phút còn thiếu', () => {
  const half = planMakeup(ctx, '2026-11-10', '2026-11-10', [row('2026-11-12', '06:00', '10:00'), row('2026-11-13')]);
  assert.equal(half.plannedMinutes, 240);
  assert.equal(half.canAdd, true);
  // Dòng 2 chỉ được tối đa 240 phút nữa: giờ bắt đầu 06:00 có tối đa tới 10:00.
  assert.deepEqual(half.slots[1].startOptions.slice(0, 2), ['06:00', '07:00']);
  const full = planMakeup(ctx, '2026-11-10', '2026-11-10', [row('2026-11-12', '06:00', '10:00'), row('2026-11-13', '06:00', '10:00')]);
  assert.deepEqual([full.plannedMinutes, full.canAdd], [480, false]);
});

test('hai dòng cùng ngày không chồng giờ nhau', () => {
  const p = planMakeup(ctx, '2026-11-10', '2026-11-10', [row('2026-11-12', '08:00', '10:00'), row('2026-11-12')]);
  const starts = p.slots[1].startOptions;
  assert.ok(!starts.includes('08:00') && !starts.includes('09:00'));
  assert.ok(starts.includes('06:00') && starts.includes('10:00'));
  const second = planMakeup(ctx, '2026-11-10', '2026-11-10', [row('2026-11-12', '08:00', '10:00'), row('2026-11-12', '06:00')]);
  assert.ok(!second.slots[1].endOptions.includes('09:00')); // 06–09 chồng 08–10
  assert.ok(second.slots[1].endOptions.includes('08:00'));
});

test('chỉnh lại dòng không còn hợp lệ: ngày lạ bỏ cả dòng, giờ lạ bỏ giờ', () => {
  const p = planMakeup(ctx, '2026-11-10', '2026-11-10', [row('2026-11-20', '06:00', '08:00'), row('2026-11-13', '16:00', '18:00')]);
  assert.deepEqual(p.slots[0].date, '');
  assert.deepEqual([p.slots[0].startTime, p.slots[0].endTime], ['', '']);
  assert.deepEqual([p.slots[1].date, p.slots[1].startTime, p.slots[1].endTime], ['2026-11-13', '', '']); // 16:00 không có ở ngày 13
  assert.equal(p.plannedMinutes, 0);
});

// Bản dữ liệu giả của FE (web/src/mock/makeup-plan.ts) phải ra đúng như BE trên cùng đầu vào.
import { planMakeupMock } from '../../web/src/mock/makeup-plan';
test('bản giả của FE cho kết quả giống BE', () => {
  const cases: Array<[string, string, ReturnType<typeof row>[]]> = [
    ['2026-11-10', '2026-11-10', [row()]],
    ['2026-11-10', '2026-11-11', [row()]],
    ['2026-11-10', '2026-11-10', [row('2026-11-12', '06:00', '10:00'), row('2026-11-13')]],
    ['2026-11-10', '2026-11-10', [row('2026-11-12', '08:00', '10:00'), row('2026-11-12', '06:00')]],
    ['2026-11-10', '2026-11-10', [row('2026-11-20', '06:00', '08:00'), row('2026-11-13', '16:00', '18:00')]],
    ['2026-11-10', '2026-11-10', [row('2026-11-12', '06:00', '10:00'), row('2026-11-13', '06:00', '10:00')]]
  ];
  for (const [s, e, slots] of cases) assert.deepEqual(planMakeupMock(ctx, s, e, slots), planMakeup(ctx, s, e, slots));
});
