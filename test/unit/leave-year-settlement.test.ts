// Phép năm theo từng năm dương lịch: mỗi năm là một quỹ phép riêng, quỹ năm N hết hạn cuối tháng leave.expiry.month của năm N+1
// và phần chưa dùng được quy tiền vào phiếu tháng liền sau. Các năm trước leave.expiry.fromYear không nằm trong sổ phép.
// Lương ngày mẫu = lương cơ bản ÷ ngày công chuẩn: 7.500.000 ÷ 26.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Leave = require('../../src/engine/leave');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const { accrued, ledger, settlementFor } = Leave;
const pad = (n?) => String(n).padStart(2, '0');
const DAILY = 7500000 / 26;
const pay = (days?) => Math.round(days * DAILY);
// 10 ngày làm việc liên tiếp từ 04/01/2027 (thứ Hai) tới 15/01/2027
const JAN_LEAVE = [4, 5, 6, 7, 8, 11, 12, 13, 14, 15].map(d => `2027-01-${pad(d)}`);
// NV vào làm 10/06/2021, sinh nhật 01/01
const P08 = { startDate: '2021-06-10', birthday: '1990-01-01', type: 'nv', leaveAdjust: 0 };

test('quỹ 2026 của người vào làm 2021 chỉ gồm phép cộng trong 2026: 12 tháng + sinh nhật + thâm niên 5 năm = 14', () => {
  const got = ledger(P08, [], '2026-12-31');
  assert.deepEqual([got.months, got.birthdays, got.seniority, got.total, got.balance], [12, 1, 1, 14, 14]);
  assert.equal(
    accrued(P08, '2026-12-31').total,
    14 + 54 + 4,
    'accrued vẫn đếm từ ngày vào làm (54 tháng, 4 sinh nhật 2022-2025)'
  );
});

test('dùng 10 ngày phép tháng 01/2027: 30/01 còn 4 ngày sắp hết hạn, phiếu 02/2027 quy tiền 4 ngày chứ không phải 67', () => {
  const at = ledger(P08, JAN_LEAVE, '2027-01-30');
  assert.deepEqual(at.expiring, { days: 4, on: '2027-01-31' });
  assert.equal(at.used, 10);
  assert.equal(at.balance, 6, 'quỹ 2026 còn 4 + phép 2027 mới cộng 2 (tháng 01 và sinh nhật) − 0');
  const after = ledger(P08, JAN_LEAVE, '2027-02-02');
  assert.deepEqual(after.settled, [{ year: 2026, on: '2027-01-31', days: 4 }]);
  assert.equal(after.expired, 4);
  assert.equal(after.balance, 2);
  assert.equal(after.expiring, null);
  assert.equal(settlementFor(P08, JAN_LEAVE, '2027-02'), 4);
  assert.equal(pay(4), 1153846);
  assert.equal(settlementFor(P08, JAN_LEAVE, '2027-01'), 0);
  assert.equal(settlementFor(P08, JAN_LEAVE, '2027-03'), 0);
});

test('không dùng ngày phép nào: quy tiền đúng quỹ 2026 (14 ngày), phép 2027 mới cộng giữ lại', () => {
  assert.equal(settlementFor(P08, [], '2027-02'), 14);
  const after = ledger(P08, [], '2027-02-02');
  assert.equal(after.expired, 14);
  assert.equal(after.balance, 2);
});

test('ngày phép dùng trước năm quỹ đầu tiên (2025 trở về trước) không trừ vào quỹ 2026', () => {
  const old = ['2025-03-03', '2025-03-04', '2024-05-06'];
  assert.equal(settlementFor(P08, old, '2027-02'), 14);
  assert.equal(ledger(P08, old, '2026-12-31').used, 0);
});

test('điều chỉnh phép âm thuộc quỹ 2026: −8 thì quỹ còn 6, dùng 10 ngày thì không còn gì hết hạn và số dư âm 2', () => {
  const staff = { ...P08, leaveAdjust: -8 };
  assert.equal(ledger(staff, [], '2026-12-31').total, 6);
  assert.equal(settlementFor(staff, [], '2027-02'), 6, 'không dùng ngày nào: điều chỉnh âm làm giảm tiền quy đổi');
  const at = ledger(staff, JAN_LEAVE, '2027-01-30');
  assert.equal(at.expiring, null);
  assert.equal(settlementFor(staff, JAN_LEAVE, '2027-02'), 0);
  assert.equal(ledger(staff, JAN_LEAVE, '2027-02-02').balance, -2);
});

test('điều chỉnh phép dương cũng thuộc quỹ 2026 và được quy tiền khi hết hạn', () => {
  const staff = { ...P08, leaveAdjust: 3 };
  assert.equal(ledger(staff, [], '2026-12-31').total, 17);
  assert.equal(settlementFor(staff, [], '2027-02'), 17);
  assert.equal(settlementFor(staff, JAN_LEAVE, '2027-02'), 7);
});

test('điều chỉnh phép chỉ tính một lần, không nhân theo số năm: sang 2028 quỹ 2027 không mang thêm điều chỉnh', () => {
  const staff = { ...P08, leaveAdjust: 3 };
  // quỹ 2027: 12 tháng + 1 sinh nhật = 13
  assert.equal(settlementFor(staff, [], '2028-02'), 13);
});

test('người vào làm 15/03/2026: quỹ 2026 đếm từ ngày vào làm (9 tháng tròn, chưa tới sinh nhật 2026 vì sinh nhật trước ngày vào làm)', () => {
  const staff = { startDate: '2026-03-15', birthday: '1990-01-01', type: 'nv', leaveAdjust: 0 };
  assert.equal(ledger(staff, [], '2026-12-31').total, 9);
  assert.equal(settlementFor(staff, [], '2027-02'), 9);
  assert.equal(
    settlementFor(staff, JAN_LEAVE, '2027-02'),
    0,
    'dùng 10 ngày: hết quỹ 2026, ngày còn lại lấy từ phép 2027'
  );
});

test('người vào làm 10/01/2027 không có quỹ 2026', () => {
  const staff = { startDate: '2027-01-10', type: 'ctv', leaveAdjust: 0 };
  assert.equal(ledger(staff, [], '2027-03-01').settled.length, 0);
  assert.equal(settlementFor(staff, [], '2027-02'), 0);
  assert.equal(ledger(staff, [], '2027-12-31').total, 11);
});

test('quỹ 2027 hết hạn cuối 01/2028 và quy tiền vào phiếu 02/2028 sau khi quỹ 2026 đã quy tiền ở 02/2027', () => {
  assert.equal(settlementFor(P08, [], '2027-02'), 14);
  assert.equal(settlementFor(P08, [], '2028-02'), 13);
  const mid = ledger(P08, [], '2027-06-30');
  assert.equal(mid.expired, 14);
  assert.equal(mid.balance, mid.total - 14);
});

test('số dư hiển thị chỉ gồm các quỹ đang mở: trước hết hạn có quỹ 2026, sau hết hạn không còn phép các năm cũ', () => {
  assert.equal(ledger(P08, [], '2027-01-31').balance, 16, '14 của quỹ 2026 + 2 của 01/2027');
  assert.equal(ledger(P08, [], '2027-02-01').balance, 2);
});

test('leave.expiry.fromYear đổi thì quỹ đầu tiên đổi theo; leave.expiry.month = 0 thì phép không hết hạn và đếm từ ngày vào làm', () => {
  const from2021 = Leave.create({ ...DEFAULTS, 'leave.expiry.fromYear': 2021 });
  assert.equal(from2021.ledger(P08, [], '2027-02-02').settled.length, 6, 'các năm 2021 tới 2026');
  const never = Leave.create({ ...DEFAULTS, 'leave.expiry.month': 0 });
  assert.equal(never.settlementFor(P08, [], '2027-02'), 0);
  assert.equal(never.ledger(P08, [], '2027-02-02').total, accrued(P08, '2027-02-02').total);
});

test('ngày nghỉ phép trước ngày vào làm nhưng từ 01/01 của năm quỹ đầu tiên vẫn trừ như mọi ngày phép khai', () => {
  const staff = { startDate: '2026-11-01', type: 'ctv', leaveAdjust: 0 };
  const got = ledger(staff, ['2025-10-05', '2026-10-05', '2026-12-10'], '2026-12-31');
  assert.equal(got.used, 2, 'ngày 2025 trước năm quỹ đầu tiên bị bỏ, hai ngày 2026 được trừ');
  assert.equal(got.balance, got.total - 2);
});

test('điều chỉnh âm lớn hơn quỹ đầu: quỹ 2026 về 0 khi hết hạn và phần âm còn lại trừ vào số dư/quỹ các năm sau', () => {
  const staff = { ...P08, leaveAdjust: -20 }; // quỹ 2026 = 14 − 20 = −6
  assert.equal(ledger(staff, [], '2026-12-31').balance, -6);
  assert.equal(settlementFor(staff, [], '2027-02'), 0, 'quỹ âm không quy tiền');
  assert.equal(settlementFor(staff, [], '2028-02'), 7, 'quỹ 2027 = 13 − 6 còn nợ');
});
