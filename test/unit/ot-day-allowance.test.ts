'use strict';
// Phụ cấp ca và giờ nghỉ đêm có lương của một ngày đi làm (PayrollEngine.calcDay):
//   - ngày có OT được trả vẫn hưởng phụ cấp ca (night theo %, Flex theo giờ) và giờ nghỉ đêm như ngày không OT, tiền OT cộng thêm;
//   - ngày có giờ làm bù được trả (makeupH > 0) không hưởng phụ cấp ca, không tiền giờ nghỉ đêm.
// Số tay theo bộ tham số mặc định: NV level 1 lương 6.000.000 ₫ / 26 ngày / 8 giờ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../public/payroll-engine.js');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');

const DATE = '2026-10-13'; // Thứ Ba, không phải ngày lễ
const CTX = { date: DATE, holidays: [] as any[] };
const DAILY = 6000000 / 26;
const HOURLY = DAILY / 8;
const NIGHT = { username: 'qa_night40', type: 'nv', level: 1, nightPct: 40, startDate: '2025-01-06' };
const FLEX = { username: 'qa_flex', type: 'nv', level: 1, startDate: '2025-01-06' };
const nightShift = { kind: 'work', in: '22:00', out: '07:00' }; // 9 giờ có mặt, 1 giờ nghỉ trong khung đêm
const flexShift = { kind: 'work', in: '06:00', out: '15:00' }; // vào trước giờ bắt đầu Flex nên là ca Flex
const near = (actual?, expected?, msg?) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${msg || ''} ${actual} != ${expected}`);

test('ca đêm có giờ làm bù được trả: không phụ cấp ca, không tiền giờ nghỉ đêm; tổng = lương ngày + tiền giờ làm bù', () => {
  const k = Engine.create(DEFAULTS);
  // còn 4 giờ thiếu chưa bù (avail = 4): 2 giờ 07:00–09:00 đều là giờ làm bù được trả
  const mk = k.calcDay(NIGHT, { ...nightShift, extraKind: 'makeup', extraIn: '', extraOut: '09:00' }, false, 4, CTX);
  assert.equal(mk.makeupH, 2);
  assert.deepEqual([mk.bonus, mk.breakH, mk.breakPay, mk.otH], [0, 0, 0, 0]);
  // tổng = 230.769 + 2 × 28.846 ≈ 288.462 ₫
  near(mk.total, DAILY + 2 * HOURLY);
});

test('ca Flex có 2 giờ OT được trả: giữ phụ cấp Flex như ngày không OT, tiền OT cộng thêm', () => {
  const k = Engine.create(DEFAULTS);
  const plain = k.calcDay(FLEX, flexShift, false, null, CTX);
  const ot = k.calcDay(FLEX, { ...flexShift, extraKind: 'ot', extraIn: '', extraOut: '17:00' }, false, null, CTX);
  assert.deepEqual([plain.shift, ot.shift, ot.otH], ['flex', 'flex', 2]);
  // phụ cấp Flex = hệ số Flex của NV 0,2 × lương giờ × 8 giờ ≈ 46.154 ₫
  near(ot.bonus, DEFAULTS['type.nv.flexBonus'] * HOURLY * 8);
  near(ot.bonus, plain.bonus);
  near(ot.total, plain.total + 2 * HOURLY * DEFAULTS['ot.rate']);
});
