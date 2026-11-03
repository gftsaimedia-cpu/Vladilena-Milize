'use strict';
// Khối phụ cấp thêm nằm trong ③ của tám thành phần; lịch riêng không để một ngày vừa là ngày làm vừa là ngày làm bù.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, closeTo } = require('../helpers/pay-oracle');
const service = require('../../src/domain/payroll/payroll-service');

test('GĐ2 ④: thanhPhanOf cộng khối phụ cấp thêm vào phụ cấp (③): tổng tám thành phần ngày + phụ cấp + KPI − trừ khớp tổng thu nhập', async () => {
  const block = {
    'block.def.antrua': {
      label: 'Ăn trưa',
      component: '3',
      mode: 'form',
      method: 'fixed',
      scalesWithDays: false,
      loss: null,
      tax: 'none',
      insuranceBase: false
    },
    'type.nv.block.antrua.on': true,
    'type.nv.block.antrua.amount': 500000
  };
  const plain = (await runGolden('known-kpi-five-100-90-80-85-100')).m;
  const withBlock = (await runGolden('known-kpi-five-100-90-80-85-100', block)).m;
  const a = service.thanhPhanOf(plain),
    b = service.thanhPhanOf(withBlock);
  assert.equal(withBlock.blocks.length, 1);
  assert.ok(closeTo(b.allowance - a.allowance, 500000, 1e-6), `phụ cấp tăng ${b.allowance - a.allowance}`);
  const sum = (x?) => x.wage + x.overtime + x.allowance + x.kpi - x.cut;
  assert.ok(
    closeTo(sum(b) - sum(a), withBlock.total - plain.total, 1e-6),
    'tổng các thành phần tăng đúng bằng tổng thu nhập'
  );
});
