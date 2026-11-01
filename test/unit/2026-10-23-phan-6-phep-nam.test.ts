'use strict';
// Cộng phép năm.
// Luật đối chiếu (nguồn thứ cấp, cần pháp chế xác nhận): Bộ luật Lao động 45/2019/QH14 Điều 113 (12 ngày/năm, tỷ lệ theo tháng làm việc), Điều 114 (+1 ngày mỗi 5 năm);
// Nghị định 145/2020/NĐ-CP Điều 65 (thời gian thử việc được tính nếu tiếp tục làm việc).
//   - leave.accrual.start = 0: bỏ +1 ngày vào làm; 1 ngày mỗi tháng làm việc tròn tính từ ngày vào làm (kể cả thử việc);
//   - +1 mỗi leave.seniority.stepYears (5) năm tròn kể từ ngày vào làm; sinh nhật +1 (chỉ cấp Nhân viên);
//   - Điều chỉnh phép của Admin (leaveAdjust) vẫn cộng một lần.
// Hợp đồng chỉ cố định TỔNG (total) và hai trường months, birthdays; tên trường chi tiết (thâm niên) không cố định,
// nên test chỉ kiểm tổng và việc các phần chi tiết cộng lại đúng tổng.
// Ngày giả định cố định, người bịa; không đọc đồng hồ thật.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const Leave = require('../../src/engine/leave');

const total = (staff?, upTo?) => Leave.accrued(staff, upTo).total;
const withParams = (patch?) => ({ ...DEFAULTS, ...patch });

test('B: tham số mặc định: leave.accrual.start = 0 và leave.seniority.stepYears = 5', () => {
  assert.equal(DEFAULTS['leave.accrual.start'], 0);
  assert.equal(DEFAULTS['leave.seniority.stepYears'], 5);
  assert.equal(DEFAULTS['leave.accrual.perMonth'], 1);
  assert.equal(DEFAULTS['leave.accrual.birthday'], 1);
});

test('B: không còn +1 ngày phép vào ngày đầu đi làm: ngày vào làm và ngày kế tiếp đều bằng 0 ngày', () => {
  const staff = { startDate: '2026-03-15', type: 'ctv' };
  assert.equal(total(staff, '2026-03-14'), 0, 'chưa vào làm');
  assert.equal(total(staff, '2026-03-15'), 0, 'ngày đầu đi làm: trước đây 1, nay 0');
  assert.equal(total(staff, '2026-03-16'), 0);
  assert.equal(Leave.accrued(staff, '2026-03-15').start || 0, 0, 'phần "ngày đầu" nếu còn trong kết quả thì bằng 0');
});

test('B: 1 ngày mỗi tháng làm việc tròn kể từ ngày vào làm, không chờ hết thử việc (tháng thứ 1 và thứ 2 đã tính)', () => {
  const staff = { startDate: '2026-03-15', type: 'ctv' };
  assert.equal(total(staff, '2026-04-14'), 0, 'chưa tròn một tháng');
  assert.equal(total(staff, '2026-04-15'), 1, 'tròn tháng thứ 1 (trong thử việc)');
  assert.equal(total(staff, '2026-05-14'), 1);
  assert.equal(total(staff, '2026-05-15'), 2, 'tròn tháng thứ 2 (hết thử việc 2 tháng)');
  assert.equal(total(staff, '2027-03-15'), 12, 'một năm tròn: đúng 12 ngày (Điều 113), trước đây 13');
  assert.equal(Leave.accrued(staff, '2027-03-15').months, 12);
});

test('B: vào làm ngày 31/01 thì tháng tròn rơi vào ngày cuối tháng ngắn, rồi quay lại 31 (quy tắc tháng tròn không đổi)', () => {
  const staff = { startDate: '2026-01-31', type: 'ctv' };
  assert.equal(total(staff, '2026-02-27'), 0);
  assert.equal(total(staff, '2026-02-28'), 1);
  assert.equal(total(staff, '2026-03-30'), 1);
  assert.equal(total(staff, '2026-03-31'), 2);
});

test('B: thâm niên: +1 ngày khi tròn 5 năm (60 tháng) kể từ ngày vào làm, +2 khi tròn 10 năm', () => {
  const staff = { startDate: '2021-06-10', type: 'ctv' };
  assert.equal(total(staff, '2026-06-09'), 59, 'chưa tròn 5 năm: 59 tháng, chưa có thâm niên');
  assert.equal(total(staff, '2026-06-10'), 61, 'tròn 5 năm: 60 tháng + 1 ngày thâm niên');
  assert.equal(total(staff, '2030-06-10'), 109, '9 năm: 108 tháng + 1');
  assert.equal(total(staff, '2031-06-09'), 119 + 1, '10 năm chưa tròn: 119 tháng + 1');
  assert.equal(total(staff, '2031-06-10'), 120 + 2, 'tròn 10 năm: 120 tháng + 2');
});

test('B: thâm niên của người vào làm 29/02: mốc 5 năm là 28/02 năm không nhuận, cùng mốc với tháng tròn thứ 60', () => {
  const staff = { startDate: '2020-02-29', type: 'ctv' };
  assert.equal(total(staff, '2025-02-27'), 59);
  assert.equal(total(staff, '2025-02-28'), 61, '60 tháng + 1 ngày thâm niên');
});

test('B: sinh nhật +1 ngày chỉ cho cấp Nhân viên (Đ40, 26/10/2026); sinh nhật trùng ngày vào làm chỉ có 1 ngày sinh nhật, không còn ngày đầu', () => {
  const nv = { startDate: '2026-01-05', birthday: '1990-07-20', type: 'nv' };
  assert.equal(total(nv, '2026-07-19'), 6, '05/02 đến 05/07: 6 tháng');
  assert.equal(total(nv, '2026-07-20'), 7, '6 tháng + sinh nhật');
  assert.equal(Leave.accrued(nv, '2026-07-20').birthdays, 1);
  assert.equal(total({ startDate: '2026-07-20', birthday: '1999-07-20', type: 'nv' }, '2026-07-20'), 1);
  assert.equal(
    total({ startDate: '2026-08-01', birthday: '1990-03-10', type: 'nv' }, '2026-12-31'),
    4,
    'sinh nhật trước ngày vào làm không tính'
  );
  // CTV cùng ngày vào làm, cùng ngày sinh: không có ngày sinh nhật
  const ctv = { ...nv, type: 'ctv' };
  assert.equal(total(ctv, '2026-07-19'), 6, 'CTV: 6 tháng');
  assert.equal(total(ctv, '2026-07-20'), 6, 'CTV: sinh nhật không cộng ngày nào');
  assert.equal(Leave.accrued(ctv, '2026-07-20').birthdays, 0);
});

test('B: Điều chỉnh phép của Admin cộng một lần (âm cũng được); chưa có ngày vào làm thì chỉ có số điều chỉnh', () => {
  const staff = { startDate: '2026-01-15', type: 'ctv' };
  assert.equal(total({ ...staff, leaveAdjust: 3 }, '2026-03-15'), 5, '2 tháng + 3');
  assert.equal(total({ ...staff, leaveAdjust: -5 }, '2026-03-15'), -3, '2 tháng - 5');
  assert.equal(total({ leaveAdjust: 3, type: 'ctv' }, '2026-10-07'), 3);
  assert.equal(total({ startDate: '2026-10-08', leaveAdjust: -2, type: 'ctv' }, '2026-10-07'), -2);
});

test('B: các phần chi tiết của kết quả cộng lại đúng tổng (mặc định mỗi phần 1 ngày)', () => {
  const staff = { startDate: '2021-06-10', birthday: '1990-07-20', type: 'nv', leaveAdjust: 2 };
  const got = Leave.accrued(staff, '2026-07-20');
  const parts = Object.entries<any>(got)
    .filter(([key, value]: any) => key !== 'total' && typeof value === 'number')
    .reduce((sum, [, value]: any) => sum + value, 0);
  assert.equal(
    got.total,
    61 + 1 + 6 + 2,
    '61 tháng (đến 10/07/2026) + thâm niên 1 + 6 sinh nhật (2021 đến 2026) + điều chỉnh 2'
  );
  assert.equal(parts, got.total, `chi tiết ${JSON.stringify(got)} phải cộng ra tổng`);
});

test('B: đổi leave.seniority.stepYears thì mốc thâm niên đổi theo: 3 năm thay vì 5 (người vào làm 10/06/2023 đến 10/06/2026)', async () => {
  const staff = { startDate: '2023-06-10', type: 'ctv' };
  assert.equal(total(staff, '2026-06-10'), 36, 'mặc định 5 năm: chưa có thâm niên');
  assert.equal(
    Leave.create(await withParams({ 'leave.seniority.stepYears': 3 })).accrued(staff, '2026-06-10').total,
    37
  );
});

test('B: bản trần của mô-đun bằng create(DEFAULTS) và không sửa đối tượng nhân sự', () => {
  const staff = Object.freeze({ startDate: '2021-06-10', birthday: '1990-07-20', type: 'nv', leaveAdjust: 1 });
  assert.deepEqual(Leave.accrued(staff, '2026-07-20'), Leave.create(DEFAULTS).accrued(staff, '2026-07-20'));
});
