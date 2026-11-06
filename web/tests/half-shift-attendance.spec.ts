// Nghỉ giữa ca ở Chấm công (yêu cầu FE của BE mục 4): ngày nghỉ giữa ca có `shift` là nửa ca làm và cờ `halfShift`;
// FE ghi "Nửa ca". Ngày công có thể lẻ (12,5) nên mọi chỗ hiện số ngày công viết dấu phẩy kiểu Việt Nam.
// Chỉ thử builder (máy chủ thật); dữ liệu giả không có ngày nghỉ giữa ca.
import { expect, test } from '@playwright/test';
import { attendanceViewOf, dayDetailOf, homeViewOf, type MeDay, type MeMonth, type MeProfile, type MeToday } from '../src/builders/api/staff-phone';
import { attendanceFromWeek, dayDetailFromDto, employeeFromDto, type DayCellDTO, type EmployeeMonthDTO, type WeekDTO } from '../src/builders/api/attendance';

const HALF: MeDay = { date: '2026-11-12', kind: 'work', in: '08:00', out: '12:00', lateMinutes: 0, halfShift: 'FIRST' };
const PLAIN: MeDay = { date: '2026-11-11', kind: 'work', in: '08:00', out: '17:00', lateMinutes: 0 };

test.describe('app nhân viên', () => {
  test('Ngày công reads 12,5 and the half-shift day says nửa ca', () => {
    const m: MeMonth = {
      month: '2026-11',
      range: { from: '2026-01', to: '2026-11' },
      totals: { workDays: 12.5, standardDays: 26, lateCount: 0, paidLeaveDays: 0 },
      days: [PLAIN, HALF]
    };
    const view = attendanceViewOf(m, 'HC 08:00–17:00', '2026-11-20');
    expect(view.tiles[0]).toEqual({ value: '12,5', of: '26', label: 'Ngày công' });
    const cells = view.cells.filter(c => c !== null);
    expect(cells.find(c => c!.date === '2026-11-12')!.label).toBe('Thứ Năm 12/11: đi làm · nửa ca');
    expect(cells.find(c => c!.date === '2026-11-11')!.label).toBe('Thứ Tư 11/11: đi làm');
  });

  test('the day box names the worked half', () => {
    const d = dayDetailOf({ ...HALF, shift: { start: '08:00', end: '12:00' } }, { start: '08:00', end: '17:00' }, '2026-11-20', '10:00');
    expect(d!.shiftLine).toBe('Nửa ca 08:00–12:00');
    const full = dayDetailOf({ ...PLAIN, shift: null }, { start: '08:00', end: '17:00' }, '2026-11-20', '10:00');
    expect(full!.shiftLine).toBe('Ca 08:00–17:00');
  });

  test('Hôm nay shows Nửa ca with the worked half', () => {
    const week = Array.from({ length: 7 }, (_, i) => ({ ...PLAIN, date: `2026-11-${String(9 + i).padStart(2, '0')}`, in: null, out: null }));
    const t: MeToday = {
      date: '2026-11-12',
      shift: { type: 'NORMAL', start: '08:00', end: '12:00' },
      halfShift: 'FIRST',
      punches: { in: null, out: null },
      workedMinutes: 0,
      week,
      alert: null
    };
    const profile: MeProfile = {
      name: 'Lê Hoàng Nam',
      username: 'nam',
      dependants: 0,
      contract: { status: 'nv', term: null, effectiveFrom: null },
      position: { type: 'NV', level: 1, jobTitle: null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      leave: { totalDays: 12, usedDays: 0, remainingDays: 12 }
    };
    const home = homeViewOf(t, profile, null, [], '07:30');
    expect(home.shiftLabel).toBe('Nửa ca · 08:00–12:00');
    expect(homeViewOf({ ...t, halfShift: null, shift: { type: 'NORMAL', start: '08:00', end: '17:00' } }, profile, null, [], '07:30').shiftLabel).toBe(
      'Ca HC · 08:00–17:00'
    );
  });
});

const cell = (over: Partial<DayCellDTO>): DayCellDTO => ({
  date: '2026-11-12',
  dow: 'T5',
  day: '12',
  today: false,
  kind: 'work',
  base: 'work',
  text: '08:00',
  in: '08:00',
  out: '12:00',
  live: false,
  lateMinutes: 0,
  explanationStatus: 'NONE',
  cases: [],
  itemId: null,
  label: 'Đi làm',
  aria: 'Đi làm 08:00–12:00',
  ...over
});
const person = {
  username: 'nam',
  name: 'Lê Hoàng Nam',
  initials: 'HN',
  group: 'Kinh doanh',
  title: 'Nhân viên',
  code: 'NV01',
  startDate: null,
  contract: 'Chính thức',
  position: { type: 'NV', level: 1, jobTitle: null },
  shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0, isOvernight: false },
  shiftText: 'HC 08:00–17:00',
  leaveLeftDays: 12
};

test.describe('Admin chấm công', () => {
  test('the week grid writes 12,5 công and reads nửa ca on the half-shift cell', () => {
    const dto: WeekDTO = {
      today: '2026-11-20',
      month: '2026-11',
      periodState: 'open',
      subtitle: '',
      tiles: [{ key: 'present', label: 'Có mặt', value: 12.5, of: 26, note: '' }],
      days: [],
      groups: [],
      rows: [{ ...person, days: [cell({ halfShift: 'FIRST' }), cell({ date: '2026-11-11' })], totals: { workDays: 12.5, lateMinutes: 0, otHours: 0 }, needsAction: 0 }],
      pending: [],
      total: 1,
      matched: 1
    };
    const view = attendanceFromWeek(dto, []);
    expect(view.rows[0].workText).toBe('12,5');
    expect(view.rows[0].totals.workDays).toBe(12.5);
    expect(view.tiles[0].value).toBe('12,5 / 26');
    expect(view.rows[0].cells[0].aria).toBe('Đi làm 08:00–12:00, nửa ca');
    expect(view.rows[0].cells[1].aria).toBe('Đi làm 08:00–12:00');
  });

  test('the person page writes 12,5 ngày and Nửa ca on the day and in the history', () => {
    const dto: EmployeeMonthDTO = {
      person,
      month: '2026-11',
      periodState: 'open',
      locked: false,
      index: 0,
      total: 1,
      prev: null,
      next: null,
      pending: null,
      stats: [{ key: 'workDays', label: 'Ngày đi làm', value: 12.5, unit: 'ngày', note: '' }],
      totals: { workDays: 12.5, standardDays: 26, lateCount: 0, paidLeaveDays: 0, lateMinutes: 0, otHours: 0, absentDays: 0 },
      chips: { work: 1, late: 0, leave: 0, absent: 0, todo: 0 },
      days: [cell({ halfShift: 'FIRST' })],
      dayHistory: [
        { date: '2026-11-12', dayLabel: 'T5 12/11', kind: 'work', tone: 'work', text: '08:00 – 12:00', status: 'Đi làm', shift: '08:00–12:00', in: '08:00', out: '12:00', itemId: null, halfShift: 'FIRST' },
        { date: '2026-11-11', dayLabel: 'T4 11/11', kind: 'work', tone: 'work', text: '08:00 – 17:00', status: 'Đi làm', shift: '08:00–17:00', in: '08:00', out: '17:00', itemId: null }
      ],
      history: []
    };
    const view = employeeFromDto(dto);
    expect(view.data.stats[0].value).toBe('12,5 ngày');
    expect(view.data.history.map(h => h.sub)).toEqual(['Nửa ca 08:00–12:00', '08:00–17:00']);
    expect(dayDetailFromDto(dto, '2026-11-12', [])!.sub).toBe('Kinh doanh · Nhân viên · Nửa ca 08:00–12:00');
  });
});
