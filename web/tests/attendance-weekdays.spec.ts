import { expect, test } from '@playwright/test';
import { attendanceFromTimesheets, weekMonthsOf, type AttendanceInput } from '../src/builders/api/attendance';

// Lưới chấm công Admin theo tuần từng người: ngày không có timesheet mà thứ nằm ngoài tuần của người đó là "không có ca".
// Thuần, không trình duyệt và không page.route.
const person = (username: string) => ({
  account: { username },
  profile: { fullName: `Người ${username}`, uuid: `u-${username}` },
  contract: { status: 'nv', shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' }, position: { jobTitle: 'Nhân viên' } }
});
const input = (weekdays?: Record<string, number[]>): AttendanceInput =>
  ({
    month: '2026-10',
    today: '2026-10-28',
    employees: [person('nv-a'), person('nv-b')],
    timesheets: [],
    pending: [],
    ...(weekdays ? { weeks: { '2026-10': weekdays } } : {})
  }) as any;
const cell = (view: any, username: string, date: string) =>
  view.rows.find((r: any) => r.person.id === username).cells.find((c: any) => c.date === date);

test('without weekdays Saturday 24/10 with no timesheet is absent (T2–T7 as before)', () => {
  expect(cell(attendanceFromTimesheets(input()), 'nv-a', '2026-10-24').kind).toBe('absent');
});

test('a person whose own week is T2–T6 has Saturday 24/10 off, others keep T2–T7', () => {
  const view = attendanceFromTimesheets(input({ 'nv-a': [1, 2, 3, 4, 5] }));
  expect(cell(view, 'nv-a', '2026-10-24').kind).toBe('off');
  expect(cell(view, 'nv-b', '2026-10-24').kind).toBe('absent');
});

test('grid days of the previous month follow that month’s week, not the selected month’s', () => {
  // Hôm nay 07/10: lưới 4 tuần chạy 21/09–18/10. nv-a làm T2–T6 trong tháng 9, T2–T7 từ tháng 10.
  const view = attendanceFromTimesheets({
    ...input(),
    today: '2026-10-07',
    weeks: { '2026-09': { 'nv-a': [1, 2, 3, 4, 5] }, '2026-10': { 'nv-a': [1, 2, 3, 4, 5, 6] } }
  } as any);
  expect(cell(view, 'nv-a', '2026-09-26').kind).toBe('off');
  expect(cell(view, 'nv-a', '2026-10-03').kind).toBe('absent');
});

test('weeks are loaded for the selected month and each month the 4-week grid touches, nothing in between', () => {
  // Hôm nay 07/10: lưới 21/09–18/10 chạm tháng 9 và 10. Xem tháng 10 → 2 tháng; xem tháng 6 → tháng 6 + hai tháng của lưới.
  expect(weekMonthsOf('2026-10', '2026-10-07')).toEqual(['2026-09', '2026-10']);
  expect(weekMonthsOf('2026-06', '2026-10-07')).toEqual(['2026-06', '2026-09', '2026-10']);
  // Hôm nay 28/10: lưới 12/10–08/11.
  expect(weekMonthsOf('2026-10', '2026-10-28')).toEqual(['2026-10', '2026-11']);
});

test('a day with a timesheet still shows the timesheet, and a weekday in the week is unchanged', () => {
  const view = attendanceFromTimesheets({
    ...input({ 'nv-a': [1, 2, 3, 4, 5] }),
    timesheets: [
      {
        employeeId: 'u-nv-a', workDate: '2026-10-24', shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00',
        actualCheckIn: '08:00', actualCheckOut: '17:00', status: 'PRESENT', checkInStatus: 'ON_TIME', checkOutStatus: 'ON_TIME', metrics: {}
      }
    ] as any
  });
  expect(cell(view, 'nv-a', '2026-10-24').kind).toBe('work');
  expect(cell(view, 'nv-a', '2026-10-23').kind).toBe('absent');
  expect(cell(view, 'nv-a', '2026-10-25').kind).toBe('off');
});
