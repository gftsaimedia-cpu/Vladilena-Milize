'use strict';
// Phụ cấp ca và giờ nghỉ đêm có lương của một ngày đi làm (PayrollEngine.calcDay):
//   - ngày có OT được trả vẫn hưởng phụ cấp ca (night theo %, Flex theo giờ) và giờ nghỉ đêm như ngày không OT, tiền OT cộng thêm;
//   - ngày có giờ làm bù được trả vẫn hưởng phụ cấp ca/giờ nghỉ đêm của ca chính.
// Số tay theo bộ tham số mặc định: NV level 1 lương 6.000.000 ₫ / 26 ngày / 8 giờ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
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

test('ca đêm có giờ làm bù được trả vẫn giữ phụ cấp ca và Off Paid của ca chính', () => {
  const k = Engine.create(DEFAULTS);
  // còn 4 giờ thiếu chưa bù (avail = 4): 2 giờ 07:00–09:00 đều là giờ làm bù được trả
  const mk = k.calcDay(NIGHT, { ...nightShift, extraKind: 'makeup', extraIn: '', extraOut: '09:00' }, false, 4, CTX);
  assert.equal(mk.makeupH, 2);
  near(mk.bonus, DAILY * 0.4);
  assert.equal(mk.breakH, 1);
  near(mk.breakPay, HOURLY * 1.3);
  assert.equal(mk.otH, 0);
  // ca chính giữ allowance/Off Paid; hai giờ bù chỉ nhận lương giờ cơ bản.
  near(mk.total, DAILY + DAILY * 0.4 + HOURLY * 1.3 + 2 * HOURLY);
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

test('giờ nghỉ đêm trong đoạn làm bù không được trả như Off Paid', () => {
  const k = Engine.create(DEFAULTS);
  const mk = k.calcDay(
    NIGHT,
    { kind: 'work', in: '23:00', out: '08:00', extraKind: 'makeup', extraIn: '18:00' },
    false,
    0,
    CTX
  );
  assert.equal(mk.makeupH, 4);
  assert.equal(mk.breakH, 1);
  near(mk.breakPay, HOURLY * 1.3, 'only the main-shift night break is paid');
});

test('extraOnly làm bù không có phụ cấp ca hoặc Off Paid', () => {
  const k = Engine.create(DEFAULTS);
  const extra = k.calcDay(
    NIGHT,
    { ...nightShift, extraKind: 'makeup', extraOut: '09:00', extraOnly: true },
    false,
    4,
    CTX
  );
  assert.equal(extra.makeupH, 2);
  assert.equal(extra.makeupPay, 2 * HOURLY);
  assert.equal(extra.bonus, 0);
  assert.equal(extra.breakPay, 0);
});

test('breakPayOff vẫn tắt Off Paid ca chính khi giờ nghỉ không được phủ', () => {
  const k = Engine.create(DEFAULTS);
  const day = k.calcDay(
    NIGHT,
    { ...nightShift, extraKind: 'makeup', extraOut: '09:00', breakPayOff: true },
    false,
    4,
    CTX
  );
  near(day.bonus, DAILY * 0.4);
  assert.equal(day.breakH, 0);
  assert.equal(day.breakPay, 0);
});
