'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Params = require('../../src/engine/payroll-params');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { KNOWN_CASES } = require('../helpers/payroll-cases');

const inputFor = (id?) => {
  const found = KNOWN_CASES.find(c => c.id === id);
  assert.ok(found, `missing known case ${id}`);
  return JSON.parse(JSON.stringify(found.input));
};

const engine = PayrollEngine.create(Params.DEFAULTS);

test('engine: tổng 74% dưới mốc 75 thì KPI 0 dù Base Wework đạt (cần cả hai điều kiện)', () => {
  const { m } = engine.computeMonth(inputFor('known-kpi-five-80-70-70-70-70'));

  assert.equal(m.kpiPct, 74);
  assert.equal(m.kpiGate, true);
  assert.equal(m.kpiPass, false);
  assert.equal(m.kpiReason, 'below-pass');
  assert.equal(m.kpiPay, 0);
});

test('engine: Admin ghim tổng KPI dưới 75% thì không đạt', () => {
  const input = inputFor('known-kpi-five-80-70-70-70-70');
  input.kpi.totalPct = 74;
  const { m } = engine.computeMonth(input);

  assert.equal(m.kpiPct, 74);
  assert.equal(m.kpiGate, true);
  assert.equal(m.kpiPass, false);
  assert.equal(m.kpiReason, 'below-pass');
  assert.equal(m.kpiPay, 0);
});
