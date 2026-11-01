// Kiểm thử cách cộng phép năm (chỉ phần cộng; điều kiện hưởng và cách dùng phép nằm ở test API).
// Quy tắc: không cộng +1 ngày đầu đi làm; 1 ngày mỗi tháng
// làm việc tròn; +1 ngày mỗi 5 năm thâm niên; ngày sinh nhật chỉ cho cấp Nhân viên.
// (Tròn một năm không cộng riêng: xem leave-no-yearly-bonus.test.ts.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { accrued } = require('../../src/engine/leave');

const C = (months?, extra: any = {}) => ({
  start: 0,
  months,
  seniority: 0,
  birthdays: 0,
  adjust: 0,
  total: months,
  ...extra
});

test('phép bắt đầu từ ngày vào làm và không còn cộng 1 ngày đầu (Đ35)', () => {
  const staff = { startDate: '2026-03-15' };
  assert.deepEqual(accrued(staff, '2026-03-14'), {
    start: 0,
    months: 0,
    seniority: 0,
    birthdays: 0,
    adjust: 0,
    total: 0
  });
  assert.deepEqual(accrued(staff, '2026-03-15'), C(0));
  assert.deepEqual(accrued(staff, '2026-03-16'), C(0));
});

test('mỗi tháng làm việc tròn cộng 1 ngày, chỉ khi đã tròn tháng', () => {
  const staff = { startDate: '2026-03-15' };
  assert.deepEqual(accrued(staff, '2026-04-14'), C(0));
  assert.deepEqual(accrued(staff, '2026-04-15'), C(1));
  assert.deepEqual(accrued(staff, '2026-05-14'), C(1));
  assert.deepEqual(accrued(staff, '2026-05-15'), C(2));
});

test('ngày vào làm 31/01: tròn tháng vào 28/02, rồi về 31/03', () => {
  const staff = { startDate: '2026-01-31' };
  assert.deepEqual(accrued(staff, '2026-02-27'), C(0));
  assert.deepEqual(accrued(staff, '2026-02-28'), C(1));
  assert.deepEqual(accrued(staff, '2026-03-30'), C(1));
  assert.deepEqual(accrued(staff, '2026-03-31'), C(2));
});

test('ngày vào làm 31/01 năm nhuận: chờ tới 29/02, rồi 31/03', () => {
  const staff = { startDate: '2024-01-31' };
  assert.deepEqual(accrued(staff, '2024-02-28'), C(0));
  assert.deepEqual(accrued(staff, '2024-02-29'), C(1));
  assert.deepEqual(accrued(staff, '2024-03-30'), C(1));
  assert.deepEqual(accrued(staff, '2024-03-31'), C(2));
});

test('ngày vào làm 29/02: mốc năm sau lấy 28/02', () => {
  const staff = { startDate: '2024-02-29' };
  assert.deepEqual(accrued(staff, '2025-02-27'), C(11));
  assert.deepEqual(accrued(staff, '2025-02-28'), C(12));
  assert.deepEqual(accrued(staff, '2025-03-28'), C(12));
  assert.deepEqual(accrued(staff, '2025-03-29'), C(13));
});

test('thâm niên: +1 ngày mỗi 5 năm tròn, cho mọi loại có tài khoản phép', () => {
  const staff = { startDate: '2021-06-10', type: 'ctv' };
  assert.deepEqual(accrued(staff, '2026-06-09'), C(59));
  assert.deepEqual(accrued(staff, '2026-06-10'), C(60, { seniority: 1, total: 61 }));
});

test('ngày sinh nhật +1 chỉ cho cấp Nhân viên (Đ40, 26/10/2026); CTV không có', () => {
  const base = { startDate: '2026-01-05', birthday: '1990-07-20' };
  assert.deepEqual(accrued({ ...base, type: 'nv' }, '2026-07-19'), C(6));
  assert.deepEqual(accrued({ ...base, type: 'nv' }, '2026-07-20'), C(6, { birthdays: 1, total: 7 }));
  assert.deepEqual(accrued({ ...base, type: 'ctv' }, '2026-07-20'), C(6));
});

test('sinh nhật 29/02: năm nhuận lấy 29/02, năm không nhuận lấy 28/02', () => {
  const staff = { startDate: '2023-12-01', birthday: '2000-02-29', type: 'nv' };
  assert.deepEqual(accrued(staff, '2024-02-28'), C(2));
  assert.deepEqual(accrued(staff, '2024-02-29'), C(2, { birthdays: 1, total: 3 }));
  assert.deepEqual(accrued(staff, '2025-02-27'), C(14, { birthdays: 1, total: 15 }));
  assert.deepEqual(accrued(staff, '2025-02-28'), C(14, { birthdays: 2, total: 16 }));
});

test('sinh nhật trước ngày vào làm không được tính', () => {
  const staff = { startDate: '2026-08-01', birthday: '1990-03-10', type: 'nv' };
  assert.deepEqual(accrued(staff, '2026-12-31'), C(4));
  assert.deepEqual(accrued(staff, '2027-03-09'), C(7));
  assert.deepEqual(accrued(staff, '2027-03-10'), C(7, { birthdays: 1, total: 8 }));
});

test('phép cộng dồn qua các năm, không reset tháng 1', () => {
  const staff = { startDate: '2026-03-15', birthday: '1999-07-20', type: 'nv' };
  assert.deepEqual(accrued(staff, '2026-12-31'), C(9, { birthdays: 1, total: 10 }));
  assert.deepEqual(accrued(staff, '2027-01-01'), C(9, { birthdays: 1, total: 10 }));
  assert.deepEqual(accrued(staff, '2027-03-15'), C(12, { birthdays: 1, total: 13 }));
  assert.deepEqual(accrued(staff, '2027-07-20'), C(16, { birthdays: 2, total: 18 }));
});

test('điều chỉnh tay của Admin cộng đúng một lần và có thể âm', () => {
  const staff = { startDate: '2026-01-15' };
  assert.deepEqual(accrued({ ...staff, leaveAdjust: 3 }, '2026-03-15'), C(2, { adjust: 3, total: 5 }));
  assert.deepEqual(accrued({ ...staff, leaveAdjust: -5 }, '2026-03-15'), C(2, { adjust: -5, total: -3 }));
});

test('chưa có ngày vào làm hoặc ngày vào làm ở tương lai: chỉ có số điều chỉnh', () => {
  assert.deepEqual(accrued({}, '2026-10-07'), {
    start: 0,
    months: 0,
    seniority: 0,
    birthdays: 0,
    adjust: 0,
    total: 0
  });
  assert.deepEqual(accrued({ birthday: '1999-01-01', leaveAdjust: 3 }, '2026-10-07'), C(0, { adjust: 3, total: 3 }));
  assert.deepEqual(
    accrued({ startDate: '2026-10-08', birthday: '1999-10-07', leaveAdjust: -2 }, '2026-10-07'),
    C(0, { adjust: -2, total: -2 })
  );
});

test('hàm cộng phép không sửa hồ sơ đầu vào và trả kết quả độc lập', () => {
  const original = { startDate: '2026-03-15', birthday: '1999-07-20', leaveAdjust: 2, name: 'Audit only', type: 'nv' };
  const staff = Object.freeze({ ...original });
  const first = accrued(staff, '2026-07-20');
  assert.deepEqual(first, C(4, { birthdays: 1, adjust: 2, total: 7 }));
  first.total = 999;
  const second = accrued(staff, '2026-07-20');
  assert.deepEqual(second, C(4, { birthdays: 1, adjust: 2, total: 7 }));
  assert.notStrictEqual(first, second);
  assert.deepEqual(staff, original);
});
