'use strict';
// tail-default-differential: các lựa chọn của ⑦ ⑧ mặc định giữ cách tính hiện hành.
// Bộ máy với mọi khoá mới ghi tường minh bằng giá trị mặc định, và với insurance.base = withFlaggedAllowances khi chưa có phụ cấp nào có cờ, phải cho
// CÙNG kết quả (so từng trường, kể cả rows và m.net) với chính bộ máy chạy bộ tham số mặc định, trên cùng các ca hạt cố định.
// Số ca mặc định 600 (đặt PAYROLL_DIFF_CASES để chạy nhiều hơn).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../../src/engine/payroll-params');
const { payrollEngineDifferential } = require('../helpers/payroll-differential');

const D = PayrollParams.DEFAULTS;
const CASES = Number(process.env.PAYROLL_DIFF_CASES) || 600;
const SEED = 20261016;
const EXPLICIT = {
  'insurance.coverage.long': true,
  'insurance.coverage.short': false,
  'insurance.base': 'baseSalary',
  'insurance.baseAttr': '',
  'insurance.floorMode': 'none',
  'tax.method.long': 'progressive',
  'tax.method.short': 'flat',
  'tax.exempt.otMethod': 'byRate',
  'tax.arise.mode': 'personalDeduction'
};
const defaultEngine = PayrollEngine.create(D);
const compare = (params?, label?) => {
  const engine = PayrollEngine.create(params);
  payrollEngineDifferential(input => engine.computeMonth(input), {
    cases: CASES,
    seed: SEED,
    label,
    reference: (input?) => defaultEngine.computeMonth(input)
  });
};

test('GĐ3: tail-default-differential: DEFAULTS đã mang đúng giá trị mặc định của mọi khoá mới (không lệch registry)', () => {
  for (const [key, value] of Object.entries<any>(EXPLICIT)) assert.deepEqual(D[key], value, key);
});

test('GĐ3: tail-default-differential: ghi tường minh mọi khoá mới bằng giá trị mặc định cho cùng kết quả với bộ tham số mặc định trên bộ ca hạt cố định', () => {
  compare({ ...D, ...EXPLICIT }, 'mặc định tường minh');
});

test('GĐ3: tail-default-differential: insurance.base = withFlaggedAllowances khi chưa có phụ cấp nào có cờ cho cùng kết quả với bộ tham số mặc định', () => {
  compare({ ...D, 'insurance.base': 'withFlaggedAllowances' }, 'nền có cờ, chưa có cờ nào');
});
