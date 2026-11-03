'use strict';
// Phương pháp thuế theo hợp đồng (tax.method.<hợp đồng>), biểu thuế (tax.brackets), ngưỡng phát sinh thuế và chỗ làm tròn của thuế.
//   progressive: (chịu thuế − bảo hiểm − giảm trừ gia cảnh) áp biểu luỹ tiến; phát sinh khi chịu thuế − bảo hiểm lớn hơn ngưỡng
//     (giảm trừ bản thân, hoặc tax.arise.threshold khi tax.arise.mode = custom)
//   flat: tax.casual.rate × tổng thu nhập, từ tax.casual.threshold; không áp giảm trừ gia cảnh
//   none: 0
// Thuế làm tròn đồng đúng một lần, ở cuối, trên thuế chưa làm tròn.
// Số tiền ở đây tính tay; người mẫu NV bậc 1 (lương cơ bản 6.000.000, bảo hiểm 630.000 khi có đóng), có 1 người phụ thuộc
// nên giảm trừ gia cảnh 21.700.000. Mọi tham số đổi chỉ nằm trong bộ nhớ.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const F = require('../helpers/schedule-fixtures');

const LONG = F.nvStaff({ dependants: 1, contract: 'long' });
const SHORT = F.nvStaff({ dependants: 1, contract: 'short', insured: true });
const monthOf = (staff?, params?) =>
  Engine.create(params).calcMonth(
    staff,
    F.fullDays('2026-10', F.MON_SAT),
    null,
    [],
    '2026-10',
    null,
    undefined,
    '2026-11-05T00:00:00Z'
  );
// phiếu của người với tổng thu nhập đúng `total` (không miễn thuế)
const netAt = (staff?, total?, over: any = {}) => {
  const params = { ...DEFAULTS, ...over };
  return Engine.create(params).calcNet(staff, { ...monthOf(staff, params), total });
};

test('mặc định: hợp đồng dài luỹ tiến, hợp đồng ngắn khấu trừ cố định 10 %, ngưỡng phát sinh là giảm trừ bản thân', () => {
  assert.equal(DEFAULTS['tax.method.long'], 'progressive');
  assert.equal(DEFAULTS['tax.method.short'], 'flat');
  assert.equal(DEFAULTS['tax.arise.mode'], 'personalDeduction');
  assert.equal(DEFAULTS['tax.personalCompare'], 'gt');
  assert.equal(DEFAULTS['tax.casual.rate'], 0.1);
  assert.equal(DEFAULTS['tax.casual.threshold'], 5000000);
});

test('hợp đồng dài, 1 người phụ thuộc, tổng thu nhập 40.000.000: thu nhập tính thuế 40.000.000 − 630.000 − 21.700.000 = 17.670.000, thuế 500.000 + 7.670.000 × 10 % = 1.267.000', () => {
  const n = netAt(LONG, 40000000);
  assert.equal(n.insurance, 630000);
  assert.equal(n.deduction, 21700000);
  assert.equal(n.assessable, 17670000);
  assert.equal(n.tax, 1267000);
  assert.equal(n.net, 40000000 - 630000 - 1267000);
});

test('hợp đồng ngắn khấu trừ cố định 10 % trên tổng thu nhập, không áp giảm trừ gia cảnh, không trừ bảo hiểm: 20.000.000 → 2.000.000', () => {
  const n = netAt(SHORT, 20000000);
  assert.equal(n.tax, 2000000);
  assert.equal(n.deduction, 0);
  assert.equal(n.assessable, 0);
  assert.equal(netAt(SHORT, 4999999).tax, 0, 'dưới tax.casual.threshold thì không khấu trừ');
  assert.equal(netAt(SHORT, 5000000).tax, 500000, 'đúng ngưỡng thì khấu trừ (so sánh gte)');
});

test('tax.method.short = progressive: hợp đồng ngắn áp biểu luỹ tiến có giảm trừ gia cảnh; = none: không thuế', () => {
  // 20.000.000 − bảo hiểm 630.000 − giảm trừ 21.700.000 < 0: chưa có thu nhập tính thuế
  assert.equal(netAt(SHORT, 20000000, { 'tax.method.short': 'progressive' }).tax, 0);
  // 40.000.000 − 630.000 − 21.700.000 = 17.670.000 → 1.267.000
  assert.equal(netAt(SHORT, 40000000, { 'tax.method.short': 'progressive' }).tax, 1267000);
  const none = netAt(SHORT, 40000000, { 'tax.method.short': 'none' });
  assert.equal(none.tax, 0);
  assert.equal(none.net, 40000000 - none.insurance);
});

test('tax.method.long = flat: khấu trừ 10 % trên tổng thu nhập, không giảm trừ gia cảnh; = none thì 0; hợp đồng ngắn không bị ảnh hưởng', () => {
  const flat = netAt(LONG, 40000000, { 'tax.method.long': 'flat' });
  assert.equal(flat.tax, 4000000);
  assert.equal(flat.deduction, 0);
  assert.equal(netAt(LONG, 40000000, { 'tax.method.long': 'none' }).tax, 0);
  assert.equal(netAt(SHORT, 20000000, { 'tax.method.long': 'none' }).tax, 2000000);
});

test('tax.arise.mode = custom: thuế luỹ tiến chỉ phát sinh khi chịu thuế − bảo hiểm lớn hơn tax.arise.threshold', () => {
  const custom = { 'tax.arise.mode': 'custom', 'tax.arise.threshold': 39370000 };
  const at = netAt(LONG, 40000000, custom); // 40.000.000 − 630.000 = 39.370.000, không lớn hơn ngưỡng
  assert.equal(at.taxDue, false);
  assert.equal(at.tax, 0);
  const over = netAt(LONG, 40000010, custom);
  assert.equal(over.taxDue, true);
  assert.equal(over.tax, 1267001);
});

test('biểu thuế tax.brackets đổi được: một bậc 10 % cho thuế 10 % của thu nhập tính thuế', () => {
  const n = netAt(LONG, 40000000, { 'tax.brackets': [[null, 0.1]] });
  assert.equal(n.assessable, 17670000);
  assert.equal(n.tax, 1767000);
});

test('thuế luỹ tiến làm tròn đồng một lần ở cuối: 500.000,5 lên 500.001; 500.000,4 xuống 500.000', async () => {
  const engine = Engine.create(DEFAULTS);
  const LONG_TAX = { contract: 'long', taxOn: true };
  const at = (assessable?) => engine.taxFrom(LONG_TAX, 15500000 + assessable, 15500000 + assessable, 0, 15500000);
  assert.equal((await at(10000005)).tax, 500001); // 10.000.000 × 5 % + 5 × 10 % = 500.000,5
  assert.equal((await at(10000004)).tax, 500000); // 500.000,4
  assert.equal((await at(10000010)).tax, 500001); // 500.001 đúng
});

test('khấu trừ cố định làm tròn đồng một lần: 20.000.005 × 10 % = 2.000.000,5 → 2.000.001; 20.000.004 → 2.000.000', () => {
  const engine = Engine.create(DEFAULTS);
  const flat = (gross?) => engine.taxFrom({ contract: 'short', taxOn: true }, gross, gross, 0).tax;
  assert.equal(flat(20000005), 2000001);
  assert.equal(flat(20000004), 2000000);
  assert.equal(flat(0), 0);
  const flatLong = Engine.create({ ...DEFAULTS, 'tax.method.long': 'flat' });
  assert.equal(flatLong.taxFrom({ contract: 'long', taxOn: true }, 20000005, 20000005, 0).tax, 2000001);
});

test('hợp đồng ngắn tắt khấu trừ (taxOn = false) thì không thuế; hợp đồng dài luôn chịu thuế dù taxOn = false', () => {
  assert.equal(netAt({ ...SHORT, taxOn: false }, 20000000).tax, 0);
  assert.equal(netAt({ ...LONG, taxOn: false }, 40000000).tax, 1267000);
});
