import { expect, test } from '@playwright/test';
import { attendanceViewOf, dayDetailOf, type MeMonth } from '../src/builders/api/staff-phone';

// Lịch tháng của nhân viên trên phản hồi BE thật: BE trả đủ 5 loại ngày nghỉ (paid, unpaid, holiday, isat, makeup).
// Lỗi cũ: FE chỉ biết 3 loại nên tháng nào có ngày iSAT hoặc nghỉ có làm bù thì cả lịch không dựng được. Không dùng trình duyệt.
const day = (date: string, kind: string, leave?: string) => ({ date, kind, ...(leave ? { leave } : {}), in: null, out: null, lateMinutes: 0 });

const month = (days: ReturnType<typeof day>[]): MeMonth =>
  ({ month: '2026-10', periodState: 'locked', totals: { workDays: 20, standardDays: 26, lateCount: 0, paidLeaveDays: 1 }, days, range: { from: '2026-09', to: '2026-11' } }) as unknown as MeMonth;

test('a month with iSAT and makeup-leave days still builds, with its own labels', () => {
  const view = attendanceViewOf(
    month([
      day('2026-10-01', 'leave', 'paid'),
      day('2026-10-02', 'leave', 'unpaid'),
      day('2026-10-03', 'leave', 'holiday'),
      day('2026-10-17', 'leave', 'isat'),
      day('2026-10-21', 'leave', 'makeup')
    ]),
    'HC 08:00–17:00',
    '2026-11-06',
    5
  );
  const label = (date: string) => view.cells.find(c => c?.date === date)?.label ?? '';
  expect(label('2026-10-01')).toContain('nghỉ có lương');
  expect(label('2026-10-03')).toContain('nghỉ lễ');
  expect(label('2026-10-17')).toContain('nghỉ iSAT');
  expect(label('2026-10-21')).toContain('nghỉ có làm bù');
  expect(view.prev).toBe('2026-09');
});

test('the day box names iSAT and makeup leave', () => {
  const box = (date: string, leave: string) =>
    dayDetailOf({ ...day(date, 'leave', leave), shift: null } as any, { start: '08:00', end: '17:00' }, '2026-11-06', '10:00');
  expect(box('2026-10-17', 'isat')?.leave?.type).toBe('Nghỉ iSAT');
  expect(box('2026-10-21', 'makeup')?.leave?.type).toBe('Nghỉ có làm bù');
});
