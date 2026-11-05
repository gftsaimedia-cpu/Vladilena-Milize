import { expect, test } from '@playwright/test';
import { attendanceFromTimesheets, type AttendanceInput } from '../src/builders/api/attendance';

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
    ...(weekdays ? { weekdays } : {})
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
