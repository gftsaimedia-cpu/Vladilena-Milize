'use strict';
// Giờ bù kéo qua nửa đêm sang ngày lễ: ngày có giờ bù không hưởng phụ cấp ca nên 3 giờ bù (22:00–01:00) chỉ có lương giờ, giờ 00:00–01:00 của ngày lễ cộng thêm phần (3 − 1) × lương giờ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const engine = PayrollEngine.create(DEFAULTS);
const HOURLY = 6000000 / 26 / 8;
const nv = { type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' };
const days = {
  '2026-10-05': { kind: 'work', in: '08:00', out: '16:00' },
  '2026-10-06': { kind: 'work', in: '15:00', out: '22:00', extraKind: 'makeup', extraOut: '01:00', makeupHolRate: 3 }
};
const month = (holidays?) => engine.calcMonth(nv, days, null, holidays, '2026-10', null);

test('Làm bù đêm sang ngày lễ: phần trả thêm riêng của giờ lễ = 1 giờ × lương giờ × (3 − 1)', async () => {
  const m = await month(['2026-10-07']);
  assert.ok(Math.abs(m.makeupHolPremium - 2 * HOURLY) < 1e-6, `makeupHolPremium ${m.makeupHolPremium}`);
  const row = m.rows.find(r => r.date === '2026-10-06');
  // 3 giờ bù × lương giờ + phần trả thêm của giờ lễ, không có phụ cấp đêm trong ngày có giờ bù
  assert.ok(Math.abs(row.makeupPay - (3 + 2) * HOURLY) < 1e-6, `makeupPay ${row.makeupPay}`);
});

test('Làm bù đêm sang ngày lễ: tổng tháng 934.616 ₫ (ngày 05/10 thiếu 1 giờ, ngày 06/10 làm bù, ngày lễ 07/10 nghỉ hưởng lương)', async () => {
  const m = await month(['2026-10-07']);
  assert.equal(Math.round(m.total), 934616);
});

test('Không có ngày lễ thì không có phần trả thêm', async () => {
  assert.equal((await month([])).makeupHolPremium, 0);
});
