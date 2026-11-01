'use strict';
// Bảy khoá request.type.<mục>.countsAbsent phải nằm trong PayrollParams.LATE_KEYS: bản chụp tham số của kỳ đã chạy trước khi có khoá
// (payroll_runs.params_json) thiếu khoá, và nếu không điền mặc định thì bộ máy ném PARAM_MISSING khi kiểm lại (periods.verify) hay tính lại.
// Mặc định true giữ cách tính của bản chụp nên điền khoá qua LATE_KEYS không đổi tiền.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, DEFAULTS, caseOf, clone } = require('../helpers/pay-oracle');
const Params = require('../../src/engine/payroll-params');

const KEYS = Object.keys(DEFAULTS).filter(key => /^request\.type\..+\.countsAbsent$/.test(key));

test('old-snapshot: có tám khoá countsAbsent mặc định true (hành vi cũ: khoản nghỉ chờ duyệt vẫn tính là vắng)', () => {
  assert.equal(KEYS.length, 8);
  for (const key of KEYS) assert.equal(DEFAULTS[key], true, key);
});

test('old-snapshot: bản chụp tham số cũ thiếu khoá countsAbsent vẫn tính được và cho đúng số của tham số mặc định (fillLate điền khoá muộn)', () => {
  const old = { ...DEFAULTS };
  for (const key of KEYS) delete old[key];
  const filled = Params.fillLate(old);
  const input = caseOf('s20261015-00048').input;
  const expected = Engine.create(DEFAULTS).computeMonth(clone(input)).m.net.net;
  const actual = Engine.create(filled).computeMonth(clone(input)).m.net.net;
  assert.equal(actual, expected);
});
