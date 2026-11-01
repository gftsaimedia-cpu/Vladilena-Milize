'use strict';
// Các đẳng thức tiền của bộ máy lương dùng chung (src/engine/payroll-engine.ts) trên các ca bịa, không cần bộ máy chuẩn để so:
// mỗi dòng tiền là số nguyên đồng và tổng thu nhập là tổng đúng của chúng; pay của các dòng ngày cộng lại đúng tiền ngày;
// thực lĩnh = gross − bảo hiểm − thuế − tạm ứng; tính hai lần cho cùng kết quả; bộ máy không sửa đầu vào. Danh sách đẳng thức: test/helpers/payroll-invariants.ts.
// Bộ ca: 300 đầu vào ca vàng (test/fixtures/payroll-golden-v0.json, chỉ lấy đầu vào) và 5.000 ca hạt cố định, 1.000 ca hạt ngẫu nhiên mới (in hạt khi đỏ).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { readGolden } = require('../helpers/golden');
const { payrollEngineInvariants, monthProblems } = require('../helpers/payroll-invariants');

const FIXED_SEED = 20261016;
const engine = Engine.create(DEFAULTS);
const compute = (input?) => engine.computeMonth(input);
const randomSeed = () => Number(process.env.PAYROLL_DIFF_SEED) || crypto.randomInt(1, 2 ** 31 - 1);

test('payroll-engine-invariants: bộ máy dùng chung thỏa mọi đẳng thức tiền trên 5.000 ca ngẫu nhiên (hạt cố định)', () => {
  payrollEngineInvariants(compute, { cases: 5000, seed: FIXED_SEED, label: 'bộ máy dùng chung' });
});

test('payroll-engine-invariants: bộ máy dùng chung thỏa mọi đẳng thức tiền trên 1.000 ca của một hạt ngẫu nhiên mới (in hạt khi đỏ)', () => {
  payrollEngineInvariants(compute, { cases: 1000, seed: randomSeed(), label: 'bộ máy dùng chung' });
});

test('payroll-engine-invariants: bộ máy dùng chung thỏa mọi đẳng thức tiền trên đầu vào của 300 ca vàng', () => {
  const inputs = readGolden().cases.map(c => ({ id: c.id, input: c.input }));
  assert.equal(inputs.length, 300);
  payrollEngineInvariants(compute, { inputs, label: 'ca vàng' });
});

test('payroll-engine-invariants: kết quả lệch một đồng ở thực lĩnh, ở một dòng ngày hay ở tổng thu nhập thì bị bắt', async () => {
  const { input } = readGolden().cases.find(c => c.id === 'known-kpi-five-100-90-80-85-100');
  const fresh = async () => JSON.parse(JSON.stringify((await compute(JSON.parse(JSON.stringify(input)))).m));
  assert.deepEqual(monthProblems(await fresh()), []);
  const net = await fresh();
  net.net.net += 1;
  assert.match(monthProblems(net).join(';'), /thực lĩnh/);
  const row = await fresh();
  row.rows[0].pay += 1;
  assert.match(monthProblems(row).join(';'), /tổng pay các dòng ngày/);
  const total = await fresh();
  total.total += 1;
  assert.match(monthProblems(total).join(';'), /m\.total|m\.net\.gross/);
  const line = await fresh();
  line.lines.workBase += 0.5;
  assert.match(monthProblems(line).join(';'), /m\.lines\.workBase/);
});
