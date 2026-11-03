'use strict';
// Chữ công thức dưới dòng "Chi tiết" của phiếu Admin (src/domain/payroll/slip-formulas.ts → formulasOf):
//   - dòng đếm giờ thiếu chưa bù cộng gộp số hạng cùng tên ("1 giờ thiếu + 1 giờ thiếu + 1 giờ thiếu" → "3 giờ thiếu");
//   - dòng bằng 0 vì số lượng 0 không có công thức "× 0 …";
//   - số và tên (đơn vị) của nó nối bằng khoảng trắng không ngắt dòng (U+00A0), xuống dòng chỉ ở chỗ có phép tính;
//   - mọi công thức dạng phép tính vẫn tính ra đúng số của dòng, tổng thu nhập cộng các dòng nguyên đồng khớp từng đồng.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const { generateCases } = require('../helpers/payroll-cases');
const { evaluate, near, isArithmetic, plain } = require('../helpers/formula-eval');

const NBSP = String.fromCharCode(0xa0);
// khoá công thức là số tiền, và những tổng cộng các dòng nguyên đồng phải khớp từng đồng
const ALLOWANCE = ['attendance', 'travel', 'flexPay', 'breakPay', 'nightPay'];
const MONEY = [
  'workBase',
  'leavePay',
  'settlePay',
  'isatPay',
  'holidayPay',
  'otPay',
  'lateCut',
  'flexPay',
  'breakPay',
  'nightPay',
  'attendance',
  'travel',
  'kpiPay',
  'exempt',
  'insurance',
  'tax',
  'advance',
  'gross',
  'allowanceTotal',
  'taxable',
  'afterInsurance',
  'net'
];
const EXACT = ['gross', 'allowanceTotal', 'taxable', 'afterInsurance', 'net'];
const clone = (v?) => JSON.parse(JSON.stringify(v));
const STAFF = { username: 'qa_polish', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const work = (tin = '08:00', tout = '17:00') => ({ kind: 'work', in: tin, out: tout, preset: 'Normal1' });
const calc = (days?, params = DEFAULTS, month = '2026-10') =>
  Engine.create(params).calcMonth(STAFF, days, null, [], month, null, undefined, '2026-11-05T00:00:00Z');
function describe(m?, params = DEFAULTS, month = '2026-10', staff = STAFF) {
  const snapshot = clone({ ...m, trace: m.trace });
  const cells = cellsOf(snapshot);
  return { snapshot, cells, f: formulasOf({ snapshot, staffTerms: staff, params, month, cells }) };
}
// bản chụp có các ngày thiếu giờ cho trước (giờ thiếu mỗi ngày), dùng cho dòng đếm giờ thiếu chưa bù
function withShort(shorts?, madeUp = 0) {
  const days = Object.fromEntries(shorts.map((_, i) => [`2026-10-${String(5 + i).padStart(2, '0')}`, work()]));
  const m = calc(days);
  m.rows.filter(r => r.kind === 'work').forEach((r, i) => (r.short = shorts[i]));
  m.makeupHours = madeUp;
  m.debt = shorts.reduce((s, x) => s + x, 0) - madeUp;
  return describe(m);
}

test('dòng đếm giờ thiếu chưa bù: các số hạng cùng tên cộng gộp thành một', () => {
  assert.equal(plain(withShort([1, 1, 1]).f.debtH), '3 giờ thiếu');
  assert.equal(plain(withShort([1, 0.5, 0.5, 1]).f.debtH), '3 giờ thiếu');
  assert.equal(plain(withShort([1, 0.5]).f.debtH), '1,5 giờ thiếu');
  assert.equal(plain(withShort([1, 1, 1], 1).f.debtH), '3 giờ thiếu − 1 giờ làm bù');
  assert.equal(plain(withShort([1 / 6, 1 / 6, 1 / 6, 1 / 6]).f.debtH), '2/3 giờ thiếu');
  assert.equal(withShort([]).f.debtH, undefined, 'không thiếu giờ thì không có dòng đếm');
});

test('dòng bằng 0 vì số lượng 0 không có công thức × 0', () => {
  const m = calc({ '2026-10-05': work() });
  const { f, cells } = describe(m);
  assert.equal(cells.leavePay, 0);
  assert.equal(cells.holidayPay, 0);
  assert.equal(cells.isatPay, 0);
  assert.equal(cells.otPay, 0);
  for (const key of ['leavePay', 'holidayPay', 'isatPay', 'otPay', 'settlePay', 'lateCut', 'flexPay', 'nightPay'])
    assert.equal(f[key], undefined, `${key} bằng 0 thì không có công thức`);
  assert.ok(f.workBase && f.attendance && f.travel, 'dòng có số vẫn có công thức');
  for (const [key, text] of Object.entries<any>(f)) assert.doesNotMatch(plain(text), / × 0 /, `${key}: ${text}`);
});

test('số và tên của nó nối bằng khoảng trắng không ngắt dòng; bộ đọc chung đọc U+00A0 như khoảng trắng', () => {
  const m = calc({ '2026-10-05': work('08:30', '17:00'), '2026-10-06': work() });
  const { f } = describe(m);
  assert.match(f.workBase, new RegExp(`^6\.000\.000${NBSP}đ ÷ 26${NBSP}ngày${NBSP}chuẩn × 2${NBSP}ngày${NBSP}công$`));
  assert.equal(f.net.includes(`${NBSP}tổng${NBSP}thu${NBSP}nhập`), true);
  assert.equal(evaluate(`6.000.000${NBSP}đ ÷ 26${NBSP}ngày${NBSP}chuẩn × 2${NBSP}ngày${NBSP}công`), (6000000 / 26) * 2);
  assert.equal(plain(f.workBase), '6.000.000 đ ÷ 26 ngày chuẩn × 2 ngày công');
});

test('quét 400 ca: không công thức nào tách số khỏi tên bằng khoảng trắng thường, không có × 0, công thức vẫn tính ra đúng số của dòng', () => {
  let formulas = 0;
  let arithmetic = 0;
  for (const c of generateCases(20261030, 400)) {
    let out;
    try {
      out = Engine.create(DEFAULTS).computeMonth(clone(c.input));
    } catch {
      continue;
    }
    const { f, cells, snapshot } = describe(out.m, DEFAULTS, c.input.month, c.input.staff);
    for (const [key, text] of Object.entries<any>(f)) {
      formulas += 1;
      assert.doesNotMatch(text, /\d (?=\p{L})/u, `${c.id} ${key}: số tách khỏi tên: "${text}"`);
      // điểm KPI 0 là một thành phần của tổng điểm, không phải dòng bằng 0
      if (key !== 'kpiPct')
        assert.doesNotMatch(text, /[ \u00a0]× 0[ \u00a0]/, `${c.id} ${key}: công thức × 0: "${text}"`);
      const n = snapshot.net;
      const allowance =
        ALLOWANCE.reduce((sum, k) => sum + cells[k], 0) + (snapshot.blocks || []).reduce((sum, x) => sum + x.amount, 0);
      const target = {
        ...cells,
        gross: n.gross,
        allowanceTotal: allowance,
        taxable: n.taxable,
        afterInsurance: n.gross - n.insurance,
        net: n.net
      }[key];
      if (!MONEY.includes(key) || !isArithmetic(text)) continue;
      if (EXACT.includes(key)) assert.equal(evaluate(text), target, `${c.id} ${key}: "${text}"`);
      else near(text, target, `${c.id} ${key}`);
      arithmetic += 1;
    }
  }
  assert.ok(formulas > 1000 && arithmetic > 500, `đủ công thức để quét (${formulas}, ${arithmetic} phép tính)`);
});
