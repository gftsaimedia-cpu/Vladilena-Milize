import { expect, test } from '@playwright/test';
import {
  confirmLines,
  fieldText,
  groupErrors,
  historyFields,
  historyRow,
  orNoWorkWeek,
  payDatesIn,
  payDayHint,
  standardWorkdays,
  weekdaysText,
  workWeekLine,
  zoneErrors,
  zoneLines,
  type Bracket,
} from '../src/builders/api/settings';
import { payDaysOf, resetSettingsMock, settingsAt, workWeekOf } from '../src/mock/settings';
import { ApiError } from '../src/services/http';

// Chạy phía Node, không mở trang.
test.beforeEach(() => resetSettingsMock());

test('confirm line follows the user example', () => {
  expect(confirmLines('overtime', { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 }, { weekdayRate: 1.6, weekendRate: 2, holidayRate: 3 }, '2026-11'))
    .toEqual(['OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 11/2026']);
});
test('number texts', () => {
  expect([fieldText('bhytPct', 1.5), fieldText('personalDeduction', 15500000), fieldText('lateGraceMinutes', 15), fieldText('payDay', 10)])
    .toEqual(['1,5%', '15.500.000 đ', '15 phút', '10']);
});
test('errors: out of range, KPI total, bracket order', () => {
  const s = settingsAt('2026-10');
  expect(groupErrors('overtime', { ...s.groups.overtime.values, weekdayRate: 1.4 }, s.groups.overtime)).toEqual({ weekdayRate: 'Từ ×1.5 đến ×5' });
  expect(groupErrors('kpiWeights', { ...s.groups.kpiWeights.values, user: 22 }, s.groups.kpiWeights)).toEqual({ _sum: 'Tổng 98/100' });
  const br = structuredClone(s.groups.tax.values.brackets) as Bracket[];
  br[1].upTo = 5000000;
  expect(groupErrors('tax', { ...s.groups.tax.values, brackets: br }, s.groups.tax)).toEqual({ 'brackets.1.upTo': 'Phải lớn hơn 10.000.000 đ' });
  expect(zoneErrors({ lat: 10.7769, lng: 106.7009, radiusM: 10 })).toEqual({ radiusM: 'Từ 20 đến 5.000 m' });
});
test('bracket and zone lines', () => {
  const s = settingsAt('2026-10');
  const br = structuredClone(s.groups.tax.values.brackets) as Bracket[];
  br[1].upTo = 35000000;
  expect(confirmLines('tax', s.groups.tax.values, { ...s.groups.tax.values, brackets: br }, '2026-10'))
    .toEqual(['Biểu thuế bậc 2, đến 30.000.000 đ → 35.000.000 đ, áp dụng từ tháng 10/2026']);
  expect(zoneLines({ lat: 10.7769, lng: 106.7009, radiusM: 150 }, { lat: 10.7769, lng: 106.7009, radiusM: 200 }))
    .toEqual(['Bán kính 150 m → 200 m, áp dụng ngay']);
});
test('work week texts and standard workdays (D5)', () => {
  expect([1, 2, 3, 4, 5, 6].map(standardWorkdays)).toEqual([4, 9, 13, 17, 22, 26]);
  expect([weekdaysText([1, 2, 3, 4, 5, 6]), weekdaysText([1, 3, 5]), weekdaysText([1, 2, 3, 5, 6])]).toEqual(['T2–T7', 'T2, T4, T6', 'T2–T4, T6, T7']);
  const type = workWeekOf('x', '2026-10');
  expect(workWeekLine(type)).toBe('T2–T7 · công chuẩn 26 · theo loại nhân sự');
  expect(workWeekLine(type, { month: '2026-12', weekdays: [1, 2, 3, 4, 5] })).toBe('T2–T7 · công chuẩn 26 · theo loại nhân sự; từ 12/2026: T2–T6 · công chuẩn 22');
});
test('pay dates of a calendar year and the pay-day hint', () => {
  expect(payDatesIn(2026, [...payDaysOf(2025).items, ...payDaysOf(2026).items])[0]).toBe('2026-01-10');
  expect(payDayHint('2026-10', 10)).toBe('Từ 1 đến 28. Lương tháng 10 trả ngày 10/11. Trùng Chủ nhật hoặc ngày lễ vẫn trả đúng ngày này.');
});
test('history row', () => {
  expect(historyRow({ id: 3, field: 'bhxhPct', month: '2026-11', from: 8, to: 8.5, by: 'admin', at: '2026-10-28T02:40:00.000Z', reason: null }))
    .toEqual({ id: 3, field: 'bhxhPct', label: 'BHXH', month: 'Tháng 11/2026', change: '8% → 8,5%', reason: '—', by: 'admin', at: '28/10/2026 09:40' });
});

// BE §5.3: người có loại nhân sự không có tuần làm (vd. loại ql) → GET /settings/work-weeks/:username trả 404 WORK_WEEK_NOT_FOUND.
// Dữ liệu giả không có người như vậy, nên chỉ kiểm phép đổi 404 đó thành "không có tuần làm việc" (null).
test('a WORK_WEEK_NOT_FOUND 404 reads as no work week; other errors still throw', async () => {
  const week = workWeekOf('x', '2026-10');
  await expect(orNoWorkWeek(Promise.resolve(week))).resolves.toEqual(week);
  await expect(orNoWorkWeek(Promise.reject(new ApiError(404, 'Không có tuần làm việc', { code: 'WORK_WEEK_NOT_FOUND' })))).resolves.toBeNull();
  await expect(orNoWorkWeek(Promise.reject(new ApiError(404, 'Không có nhân sự này', { code: 'STAFF_NOT_FOUND' }))))
    .rejects.toMatchObject({ status: 404, code: 'STAFF_NOT_FOUND' });
  await expect(orNoWorkWeek(Promise.reject(new ApiError(500, 'Lỗi máy chủ')))).rejects.toMatchObject({ status: 500 });
});

// Trọng số KPI: một lần lưu là một dòng `weights` mang cả năm trọng số (BE §5.1).
test('a weights history row reads as the whole save or as one weight', () => {
  const row = {
    id: 4,
    field: 'weights',
    month: '2026-11',
    from: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
    to: { wework: 40, user: 22, peer: 18, manager: 12, self: 8 },
    by: 'admin',
    at: '2026-10-28T02:40:00.000Z',
    reason: null,
  };
  expect(historyFields(row)).toEqual(['user', 'self']);
  expect(historyFields({ ...row, field: 'bhxhPct', from: 8, to: 8.5 })).toEqual(['bhxhPct']);
  expect(historyRow(row)).toMatchObject({
    field: 'weights',
    label: 'Trọng số KPI',
    change: 'Trọng số Người dùng 24% → 22%; Trọng số Tự đánh giá 6% → 8%',
  });
  expect(historyRow(row, 'user')).toEqual({
    id: 4,
    field: 'user',
    label: 'Trọng số Người dùng',
    month: 'Tháng 11/2026',
    change: '24% → 22%',
    reason: '—',
    by: 'admin',
    at: '28/10/2026 09:40',
  });
});

// Các nhánh brief không có ví dụ: ô trống, thuế suất, ô đổi nhiều, dòng lịch sử đặc biệt.
test('empty field, tax rate range, own week line, extra history rows', () => {
  const s = settingsAt('2026-10');
  expect(groupErrors('overtime', { ...s.groups.overtime.values, holidayRate: null as any }, s.groups.overtime)).toEqual({ holidayRate: 'Nhập một số' });
  expect(groupErrors('overtime', s.groups.overtime.values, s.groups.overtime)).toEqual({});
  const br = structuredClone(s.groups.tax.values.brackets) as Bracket[];
  br[0].ratePct = 120;
  expect(groupErrors('tax', { ...s.groups.tax.values, brackets: br }, s.groups.tax)).toEqual({ 'brackets.0.ratePct': 'Từ 0% đến 100%' });
  br[0].ratePct = 5;
  br[1].ratePct = 12;
  expect(confirmLines('tax', s.groups.tax.values, { ...s.groups.tax.values, brackets: br }, '2026-11'))
    .toEqual(['Biểu thuế bậc 2, thuế suất 10% → 12%, áp dụng từ tháng 11/2026']);
  expect(zoneLines(null, { lat: 10.7769, lng: 106.7009, radiusM: 150 })).toEqual(['Vùng chấm công 10,7769, 106,7009, bán kính 150 m, áp dụng ngay']);
  expect(zoneLines({ lat: 10.7769, lng: 106.7009, radiusM: 150 }, { lat: 10.8, lng: 106.7009, radiusM: 150 })).toEqual(['Vĩ độ 10,7769 → 10,8, áp dụng ngay']);
  expect(zoneErrors({ lat: 91, lng: -181, radiusM: 20.5 })).toEqual({ lat: 'Từ -90 đến 90', lng: 'Từ -180 đến 180', radiusM: 'Từ 20 đến 5.000 m' });
  const own = { ...workWeekOf('x', '2026-10'), source: 'own' as const, from: '2026-12', weekdays: [1, 2, 3, 4, 5], standardWorkdays: 22 };
  expect(workWeekLine(own, { month: '2027-01', weekdays: null })).toBe('T2–T6 · công chuẩn 22 · riêng từ 12/2026; từ 01/2027: theo loại nhân sự');
  const base = { id: 1, by: 'admin', at: '2026-10-28T02:40:00.000Z', reason: 'Điều chỉnh' };
  expect(historyRow({ ...base, field: 'brackets', month: '2026-11', from: s.groups.tax.values.brackets, to: br }).change).toBe('bậc 2, thuế suất 10% → 12%');
  expect(historyRow({ ...base, field: 'zone', month: null, from: { lat: 10.7769, lng: 106.7009, radiusM: 150 }, to: { lat: 10.7769, lng: 106.7009, radiusM: 200 } }))
    .toMatchObject({ label: 'Vùng chấm công', month: '—', change: 'Bán kính 150 m → 200 m', reason: 'Điều chỉnh' });
  expect(historyRow({ ...base, field: 'weekdays', month: '2026-12', from: null, to: [1, 2, 3, 4, 5] }).change).toBe('theo loại nhân sự → T2–T6');
});
