import { expect, test } from '@playwright/test';
import { MOCK_NOW } from '../src/mock/clock';
import {
  addHolidays,
  groupHistory,
  holidaysOf,
  payDateOf,
  payDaysOf,
  quickAddFixed,
  removeHolidays,
  resetSettingsMock,
  saveGroup,
  saveWorkWeekOf,
  saveZoneOf,
  settingsAt,
  workWeekHistory,
  workWeekOf,
  zoneOf,
} from '../src/mock/settings';

// Chạy phía Node, không mở trang. Kho giả nằm trong biến module nên mỗi test dựng lại từ đầu.
test.beforeEach(() => resetSettingsMock());

test('defaults and limits follow the BE contract', () => {
  const s = settingsAt('2026-10');
  expect(s.minMonth).toBe('2026-10');
  expect(s.groups.overtime.values).toEqual({ weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 });
  expect(s.groups.overtime.limits.weekdayRate).toEqual({ min: 1.5, max: 5, step: 0.01 });
  expect(s.groups.kpiWeights.sum).toBe(100);
  expect(s.groups.payCalendar.limits.payDay).toEqual({ min: 1, max: 28, step: 1 });
  expect(s.groups.tax.values.brackets).toHaveLength(5);
  expect(s.groups.overtime.stamp).toBe(0);
});
test('saving from month M keeps a later deliberate value (OT lễ ×3.5 / ×3.2)', () => {
  const a = saveGroup('overtime', { effectiveMonth: '2027-03', values: { holidayRate: 3.5 }, reason: null, stamp: 0 });
  saveGroup('overtime', { effectiveMonth: '2026-12', values: { holidayRate: 3.2 }, reason: null, stamp: a.stamp });
  expect(settingsAt('2026-11').groups.overtime.values.holidayRate).toBe(3);
  expect(settingsAt('2026-12').groups.overtime.values.holidayRate).toBe(3.2);
  expect(settingsAt('2027-02').groups.overtime.values.holidayRate).toBe(3.2);
  expect(settingsAt('2027-03').groups.overtime.values.holidayRate).toBe(3.5);
});
test('a later version still carrying the old number takes the new one', () => {
  const a = saveGroup('overtime', { effectiveMonth: '2027-03', values: { holidayRate: 3.5 }, reason: null, stamp: 0 });
  saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, reason: null, stamp: a.stamp });
  expect(settingsAt('2027-03').groups.overtime.values.weekdayRate).toBe(1.6);
});
test('each changed field adds one history row and moves the stamp', () => {
  const r = saveGroup('overtime', { effectiveMonth: '2026-11', values: { weekdayRate: 1.6, weekendRate: 2 }, reason: 'Theo quyết định', stamp: 0 });
  expect(r.changed).toEqual(['weekdayRate']);
  const { items } = groupHistory('overtime');
  expect(items).toEqual([{ id: r.stamp, field: 'weekdayRate', month: '2026-11', from: 1.5, to: 1.6, by: 'admin', at: MOCK_NOW, reason: 'Theo quyết định' }]);
  expect(settingsAt('2026-10').groups.overtime.stamp).toBe(r.stamp);
  expect(settingsAt('2026-10').groups.attendance.stamp).toBe(0);
});
test('an old stamp is refused with SETTINGS_STALE', () => {
  saveGroup('overtime', { effectiveMonth: '2026-10', values: { weekdayRate: 1.6 }, reason: null, stamp: 0 });
  expect(() => saveGroup('overtime', { effectiveMonth: '2026-10', values: { weekdayRate: 1.7 }, reason: null, stamp: 0 }))
    .toThrow(expect.objectContaining({ status: 409, code: 'SETTINGS_STALE' }));
});
test('a month before minMonth and a KPI total other than 100 are refused', () => {
  expect(() => saveGroup('overtime', { effectiveMonth: '2026-09', values: { weekdayRate: 1.6 }, reason: null, stamp: 0 }))
    .toThrow(expect.objectContaining({ code: 'BAD_SETTINGS_INPUT' }));
  expect(() => saveGroup('kpi-weights', { effectiveMonth: '2026-10', values: { wework: 40, user: 22, peer: 18, manager: 12, self: 6 }, reason: null, stamp: 0 }))
    .toThrow(expect.objectContaining({ code: 'BAD_SETTINGS_INPUT' }));
});
test('pay dates fall on pay day of the next month and never move', () => {
  const s = settingsAt('2026-10');
  saveGroup('pay-calendar', { effectiveMonth: '2026-12', values: { payDay: 15 }, reason: null, stamp: s.groups.payCalendar.stamp });
  const items = payDaysOf(2026).items;
  expect(items).toHaveLength(12);
  expect(items[10]).toEqual({ month: '2026-11', payDay: 10, payDate: '2026-12-10' });
  expect(items[11]).toEqual({ month: '2026-12', payDay: 15, payDate: '2027-01-15' });
  expect(payDateOf('2026-10')).toBe('2026-11-10');
});
test('work week: type by default, own week from a month, back to type with null', () => {
  expect(workWeekOf('hoang-thi-mai', '2026-10')).toMatchObject({ source: 'type', weekdays: [1, 2, 3, 4, 5, 6], from: null, standardWorkdays: 26, stamp: 0 });
  const r = saveWorkWeekOf('hoang-thi-mai', { effectiveMonth: '2026-12', weekdays: [1, 2, 3, 4, 5], reason: null, stamp: 0 });
  expect(r).toMatchObject({ source: 'own', standardWorkdays: 22 });
  expect(workWeekOf('hoang-thi-mai', '2026-11').source).toBe('type');
  expect(workWeekOf('hoang-thi-mai', '2027-01')).toMatchObject({ source: 'own', from: '2026-12', weekdays: [1, 2, 3, 4, 5] });
  expect(workWeekHistory('hoang-thi-mai').items[0]).toMatchObject({ field: 'weekdays', month: '2026-12', from: null, to: [1, 2, 3, 4, 5] });
});
test('zone saves at once with one history row', () => {
  expect(zoneOf()).toEqual({ zone: { lat: 10.7769, lng: 106.7009, radiusM: 150 }, stamp: 0 });
  const r = saveZoneOf({ lat: 10.7769, lng: 106.7009, radiusM: 200, reason: null, stamp: 0 });
  expect(zoneOf().zone!.radiusM).toBe(200);
  expect(zoneOf().stamp).toBe(r.stamp);
});
test('holidays 2026 count 11 days and quick-add skips existing ones', () => {
  expect(holidaysOf(2026).items).toHaveLength(11);
  expect(quickAddFixed(2026).added).toEqual([]);
  expect(quickAddFixed(2027).added).toEqual(['2027-01-01', '2027-04-30', '2027-05-01', '2027-09-02']);
});
