'use strict';
// Mọi lựa chọn bảo hiểm và thuế đang available: false bị bộ máy từ chối rõ ràng (PARAM_OPTION_UNAVAILABLE), không rơi âm thầm về một cách tính khác.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayTailCalc = require('../../src/engine/pay-tail-calc');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const registry = require('../../src/params/registry');

test('GĐ2: bảng UNAVAILABLE của pay-tail-calc.js khớp đúng các phương án available: false của registry (một nguồn, test khoá)', () => {
  const keys = [
    'tax.method.long',
    'tax.method.short',
    'insurance.coverage.long',
    'insurance.coverage.short',
    'insurance.floorMode',
    'insurance.base',
    'tax.arise.mode'
  ];
  for (const key of keys) {
    const off = registry
      .entryFor(key)
      .entry.options.filter(o => !o.available)
      .map(o => o.value);
    assert.deepEqual([...(PayTailCalc.UNAVAILABLE[key] || [])].sort(), off.sort(), key);
  }
  assert.deepEqual(
    Object.keys(PayTailCalc.UNAVAILABLE).sort(),
    keys.filter(k => k !== 'insurance.coverage.short').sort()
  );
});

test('GĐ2: mỗi phương án chưa dùng được bị assertAvailable từ chối PARAM_OPTION_UNAVAILABLE (đường tính lương của máy chủ); giá trị mặc định thì qua', () => {
  PayTailCalc.assertAvailable({ ...DEFAULTS });
  for (const [key, values] of Object.entries<any>(PayTailCalc.UNAVAILABLE))
    for (const value of values)
      assert.throws(
        () => PayTailCalc.assertAvailable({ ...DEFAULTS, [key]: value }),
        e => e.code === 'PARAM_OPTION_UNAVAILABLE' && e.key === key,
        `${key} = ${String(value)}`
      );
});

test('GĐ2: payrollService.computeFor từ chối bộ tham số có phương án chưa dùng được (kỳ lương thành phiếu lỗi, không tính ra số lạ)', () => {
  const service = require('../../src/domain/payroll/payroll-service');
  assert.throws(
    () =>
      service.computeFor(
        '2026-10',
        { username: 'x', type: 'nv', level: 1 },
        { people: new Map<any, any>([['x', {}]]) },
        { ...DEFAULTS, 'tax.method.long': 'none' }
      ),
    e => e.code === 'PARAM_OPTION_UNAVAILABLE'
  );
});
