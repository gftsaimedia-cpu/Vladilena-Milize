'use strict';
// Phương án thuế TNCN trong registry (tax.exempt.otMethod, tax.method.*, tax.arise.mode, bảo hiểm): phương án chưa có xác nhận của kế toán hoặc pháp chế
// bị từ chối rõ ràng, mặc định luôn dùng được. Cách tính của từng phương pháp thuế ở tax-methods-brackets.test.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../../src/engine/payroll-params');
const registry = require('../../src/params/registry');
const golden = require('../fixtures/payroll-golden-v0.json');

const D = PayrollParams.DEFAULTS;
const BIG = 's20261015-00129'; // NV bậc 3, hợp đồng dài
const copy = (v?) => JSON.parse(JSON.stringify(v));
const run = (id?, params = D) =>
  PayrollEngine.create(params).computeMonth(copy(golden.cases.find(c => c.id === id).input)).m;

test('GĐ3: tax-options: tax.exempt.otMethod = byHours có trong danh sách nhưng chưa chọn được; bộ máy từ chối thay vì dùng đơn giá âm thầm', () => {
  const entry = registry.byId('tax.exempt.otMethod');
  const byHours = entry.options.find(o => o.value === 'byHours');
  assert.equal(byHours.available, false);
  assert.match(byHours.note, /kế toán hoặc pháp chế xác nhận/);
  assert.equal(entry.options.find(o => o.isDefault).value, 'byRate');
  assert.throws(
    () => run(BIG, { ...D, 'tax.exempt.otMethod': 'byHours' }),
    error => error.code === 'PARAM_OPTION_UNAVAILABLE'
  );
});

test('GĐ3: tax-options: mọi phương án mới chưa có xác nhận ở registry là available: false và ghi "cần kế toán hoặc pháp chế xác nhận"; mặc định luôn dùng được', () => {
  const ids = [
    'tax.method.long',
    'tax.method.short',
    'tax.exempt.otMethod',
    'tax.arise.mode',
    'insurance.floorMode',
    'insurance.base',
    'insurance.baseAttr',
    'insurance.coverage.long',
    'insurance.coverage.short'
  ];
  for (const id of ids) {
    const entry = registry.byId(id);
    assert.equal(entry.editableBy, 'accounting', id);
    assert.equal(entry.capability, 'config.legal', id);
    assert.equal(entry.wired, true, id);
    const defaults = entry.options.filter(o => o.isDefault);
    assert.equal(defaults.length, 1, id);
    assert.equal(defaults[0].available, true, id);
    for (const o of entry.options.filter(o => !o.available)) assert.ok(o.note, `${id}: ${o.value} thiếu ghi chú`);
  }
  for (const [id, value] of [
    ['tax.method.long', 'flat'],
    ['tax.method.long', 'none'],
    ['tax.method.short', 'progressive'],
    ['tax.arise.mode', 'custom'],
    ['insurance.floorMode', 'raiseToRegionMin'],
    ['insurance.base', 'insuranceAttr'],
    ['insurance.coverage.long', false]
  ]) {
    const option = registry.byId(id).options.find(o => o.value === value);
    assert.equal(option.available, false, `${id}=${value}`);
    assert.match(option.note, /kế toán|pháp chế/, `${id}=${value}`);
  }
  // phương án đã có căn cứ trong tài liệu thuế và bảo hiểm thì chọn được
  assert.equal(registry.byId('insurance.base').options.find(o => o.value === 'withFlaggedAllowances').available, true);
  assert.equal(registry.byId('insurance.coverage.short').options.find(o => o.value === true).available, true);
});
