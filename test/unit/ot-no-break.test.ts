'use strict';
// OT không có giờ nghỉ: mọi phút có mặt trong đoạn OT (trước hoặc sau ca) là một phút OT, ở mọi nơi tính giờ OT:
//   - tiền (calcDay: otH, otPay) và giờ OT của lịch ước tính / Check-in/out (src/domain/work-hours.js);
//   - tách ngày lễ của đoạn OT (PayrollCalendar.splitExtraWork).
// Đoạn làm bù theo giờ vẫn trừ giờ nghỉ của đoạn như trước.
// Ví dụ: ca 08:00–17:00 + OT 17:00–22:00 là đúng 5 giờ OT (không phải 4).
require('../helpers/require-isolated-database');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const Calendar = require('../../src/engine/payroll-calendar');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const store = require('../../src/platform/db');
const { estimateOtHours, actualOtHours, extraOtHours } = require('../../src/domain/overtime/worked-hours').WorkedHours;

const k = Engine.create(DEFAULTS);
const PC = Calendar.create(DEFAULTS);
const nv = { type: 'nv', level: 1, nightPct: 40 };
const HOURLY = 6000000 / 26 / 8;
const OT_RATE = DEFAULTS['ot.rate'];
const day = (extraOut?, extra: any = {}) => ({
  kind: 'work',
  in: '08:00',
  out: '17:00',
  extraKind: 'ot',
  extraOut,
  ...extra
});
const near = (actual?, expected?, msg = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg} ${actual} != ${expected}`);

after(() => store.db.close());

test('tiền: ca 08:00–17:00 + OT 17:00–22:00 là 5 giờ OT × lương giờ × ot.rate', async () => {
  const d = k.calcDay(nv, await day('22:00'), false, 0, { date: '2026-10-05', holidays: [] });
  assert.equal(d.otH, 5);
  near(d.otPay, 5 * HOURLY * OT_RATE);
});

test('tiền: OT dài hơn mốc nghỉ vẫn không trừ giờ: OT 17:00–23:00 là 6 giờ; OT trước ca 06:00–08:00 là 2 giờ', async () => {
  const long = k.calcDay(nv, await day('23:00'), false, 0, { date: '2026-10-05', holidays: [] });
  assert.equal(long.otH, 6);
  const early = k.calcDay(
    nv,
    { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraIn: '06:00' },
    false,
    0,
    {
      date: '2026-10-05',
      holidays: []
    }
  );
  assert.equal(early.otH, 2);
  near(early.otPay, 2 * HOURLY * OT_RATE);
});

test('giờ OT của lịch ước tính và của Check-in/out là giờ thô: 17:00–22:00 = 5 giờ, cả trước lẫn sau ca', async () => {
  assert.equal(estimateOtHours(await day('22:00')), 5);
  assert.equal(extraOtHours(await day('22:00')), 5);
  assert.equal(actualOtHours({ ...(await day('22:00')), otReview: { ok: true } }), 5);
  assert.equal(estimateOtHours(await day('22:00', { extraIn: '06:00' })), 7);
  assert.equal(actualOtHours({ ...(await day('22:00')), otReview: { ok: false } }), 0, 'OT bị từ chối không tính');
});

test('đoạn làm bù theo giờ vẫn trừ giờ nghỉ của đoạn, đoạn OT cùng độ dài thì không', async () => {
  const ot = PC.splitExtraWork(await day('22:00'), '2026-10-05', []);
  const makeup = PC.splitExtraWork(await day('22:00', { extraKind: 'makeup' }), '2026-10-05', []);
  assert.equal(ot.normalH, 5);
  assert.equal(makeup.normalH, 4);
});
