'use strict';
// tail-half-dong-boundary: làm tròn đúng các chỗ dưới đây, không thêm làm tròn giữa chừng.
// Đuôi của thực lĩnh làm tròn ở đúng các chỗ sau: tổng thu nhập làm tròn đồng một lần (gross = roundDong(m.total), nửa đồng lên),
// thuế lũy tiến làm tròn đồng một lần trên thuế lũy tiến chưa làm tròn, khấu trừ cố định 10 % làm tròn đồng một lần. Thực lĩnh là số nguyên, không có làm tròn thứ hai.
// Các biên .5 ở đây tính bằng tay; số giả chỉ nằm trong bộ nhớ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { legacyParams } = require('../helpers/legacy-params');
const golden = require('../fixtures/payroll-golden-v0.json');

const D = legacyParams(); // ca vàng của khối cũ: ngưỡng không đóng bảo hiểm rất lớn (xem test/helpers/legacy-params.ts)
const LONG = 'known-kpi-five-100-90-80-85-100';
const copy = (v?) => JSON.parse(JSON.stringify(v));
const engine = PayrollEngine.create(D);
const input = copy(golden.cases.find(c => c.id === LONG).input);
const { m: base } = engine.computeMonth(copy(input));

test('GĐ3: tail-half-dong-boundary: tổng thu nhập lẻ đúng nửa đồng làm tròn lên một lần; dưới nửa đồng làm tròn xuống; thực lĩnh là số nguyên', () => {
  for (const [total, gross] of [
    [5000000.5, 5000001],
    [5000000.4999, 5000000],
    [5000000.5001, 5000001],
    [5000000, 5000000]
  ]) {
    const net = engine.calcNet(input.staff, { ...base, total });
    assert.equal(net.gross, gross, `tổng ${total}`);
    assert.equal(net.net, gross - net.insurance - net.tax - net.advance, `thực lĩnh của tổng ${total}`);
    assert.ok(Number.isInteger(net.net), 'thực lĩnh nguyên đồng');
  }
});

test('GĐ3: tail-half-dong-boundary: khấu trừ cố định 10 % của hợp đồng ngắn làm tròn một lần: 1.000.005 × 10 % = 100.000,5 → 100.001; 1.000.004 → 100.000', () => {
  const flat = (gross?) => engine.taxFrom({ contract: 'short', taxOn: true, deduction: 0 }, gross, gross, 0).tax;
  // ngưỡng khấu trừ của hợp đồng ngắn do tham số quyết định: dùng tổng thu nhập trên ngưỡng
  const big = 20000005; // 2.000.000,5 ₫
  assert.equal(flat(big), 2000001);
  assert.equal(flat(20000004), 2000000);
  assert.equal(flat(0), 0, 'dưới ngưỡng không khấu trừ');
});

test('GĐ3: tail-half-dong-boundary: các lựa chọn mới giữ đúng chỗ làm tròn: khấu trừ cố định cho hợp đồng dài làm tròn như hợp đồng ngắn, nền bảo hiểm làm tròn từng quỹ', () => {
  const flatLong = PayrollEngine.create({ ...D, 'tax.method.long': 'flat' });
  assert.equal(flatLong.taxFrom({ contract: 'long', taxOn: true, deduction: 0 }, 20000005, 20000005, 0).tax, 2000001);
  // bảo hiểm: mỗi quỹ làm tròn đồng một lần rồi cộng (nền 6.000.005 × 8 % = 480.000,4 → 480.000; × 1,5 % = 90.000,075 → 90.000; × 1 % = 60.000,05 → 60.000)
  const m = PayrollEngine.create({ ...D, 'level.nv.1.base': 6000005 }).computeMonth(copy(input)).m;
  assert.equal(m.net.bhxh, 480000);
  assert.equal(m.net.bhyt, 90000);
  assert.equal(m.net.bhtn, 60000);
  assert.equal(m.net.insurance, 630000);
});
