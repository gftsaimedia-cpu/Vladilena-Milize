'use strict';
// Cờ miễn thuế của khối phụ cấp (none / full / cap) đi vào khoản miễn thuế CHỈ khi Kế toán đã xác nhận (flagsConfirmedBy); chưa xác nhận thì chịu thuế như thường.
// Hợp đồng dài: thuế = biểu luỹ tiến trên (tổng thu nhập − miễn thuế − bảo hiểm − giảm trừ gia cảnh). Hợp đồng ngắn: khấu trừ 10 % trên tổng thu nhập, cờ không đổi tiền thuế.
// Khoản thu 20.000.000 ₫ và hạn mức 5.000.000 ₫ là số GIẢ để thử, chỉ nằm trong bộ nhớ. Người mẫu NV bậc 1 có 1 người phụ thuộc (giảm trừ 21.700.000).
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const F = require('../helpers/schedule-fixtures');

const LONG = F.nvStaff({ dependants: 1, contract: 'long' });
const SHORT = F.nvStaff({ contract: 'short' });
const BLOCK = 20000000;
const DEDUCTION = 21700000;
const run = (staff?, params?) =>
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
const block = (tax?, { taxCap, confirmed = true }: any = {}) => ({
  ...DEFAULTS,
  'block.def.thu': {
    label: 'Khoản thu giả',
    component: '3',
    method: 'fixed',
    scalesWithDays: false,
    tax,
    ...(taxCap === undefined ? {} : { taxCap }),
    flagsConfirmedBy: confirmed ? 'ketoan' : null
  },
  'type.nv.block.thu.on': true,
  'type.nv.block.thu.amount': BLOCK
});
// biểu luỹ tiến tính tay
function bracketTax(assessable?) {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of [
    [10000000, 0.05],
    [30000000, 0.1],
    [60000000, 0.2],
    [100000000, 0.3],
    [Infinity, 0.35]
  ]) {
    if (assessable <= lower) break;
    tax += (Math.min(assessable, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}
const longTaxOf = (n?) => bracketTax(Math.max(0, n.taxable - n.insurance - DEDUCTION));

test('khối +20.000.000 ₫ (hợp đồng dài) chịu thuế / miễn toàn bộ / miễn đến 5.000.000 ₫: miễn thuế tăng 0 / 20.000.000 / 5.000.000 và thuế theo biểu trên phần còn lại', () => {
  const base = run(LONG, DEFAULTS).net;
  const taxed = run(LONG, block('none')).net;
  const full = run(LONG, block('full')).net;
  const cap = run(LONG, block('cap', { taxCap: 5000000 })).net;
  for (const n of [taxed, full, cap]) assert.equal(n.gross, base.gross + BLOCK);
  assert.equal(taxed.exempt, base.exempt);
  assert.equal(full.exempt, base.exempt + BLOCK);
  assert.equal(cap.exempt, base.exempt + 5000000);
  for (const n of [taxed, full, cap]) {
    assert.equal(n.deduction, DEDUCTION);
    assert.equal(n.tax, longTaxOf(n), 'thuế = biểu trên chịu thuế − bảo hiểm − giảm trừ');
    assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance);
  }
  assert.ok(taxed.tax > cap.tax && cap.tax > full.tax, 'miễn càng nhiều thuế càng ít');
  assert.equal(taxed.tax - cap.tax, longTaxOf(taxed) - longTaxOf(cap));
});

test('cờ miễn thuế CHƯA Kế toán xác nhận không có hiệu lực: khối đề nghị "miễn toàn bộ" vẫn chịu thuế như khối chịu thuế', () => {
  const unconfirmed = run(LONG, block('full', { confirmed: false })).net;
  const taxed = run(LONG, block('none')).net;
  assert.equal(unconfirmed.tax, taxed.tax);
  assert.equal(unconfirmed.net, taxed.net);
  assert.equal(unconfirmed.exempt, taxed.exempt);
});

test('khối có hạn mức nhưng khoản thấp hơn hạn mức thì miễn đúng số khoản (không vượt khoản): như "miễn toàn bộ"', () => {
  const wide = run(LONG, block('cap', { taxCap: 50000000 })).net;
  const full = run(LONG, block('full')).net;
  assert.equal(wide.exempt, full.exempt);
  assert.equal(wide.tax, full.tax);
});

test('hợp đồng ngắn khấu trừ trên toàn bộ tổng thu nhập: cờ miễn thuế của khối không đổi tiền thuế, chỉ ghi vào khoản miễn thuế của bảng lương', () => {
  const taxed = run(SHORT, block('none')).net;
  const full = run(SHORT, block('full')).net;
  assert.equal(taxed.tax, Math.round(taxed.gross * DEFAULTS['tax.casual.rate']));
  assert.equal(full.tax, taxed.tax);
  assert.equal(full.net, taxed.net);
  assert.equal(full.exempt, taxed.exempt + BLOCK);
});

test('không có khối nào thì m không có blocks và m.net không có entriesAdd; thuế của hợp đồng dài theo biểu trên chịu thuế − bảo hiểm − giảm trừ', () => {
  const m = run(LONG, DEFAULTS);
  assert.equal(Object.hasOwn(m, 'blocks'), false);
  assert.equal(Object.hasOwn(m.net, 'entriesAdd'), false);
  assert.equal(m.net.tax, longTaxOf(m.net));
});
