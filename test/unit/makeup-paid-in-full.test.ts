'use strict';
// Giờ làm bù được trả đủ (giờ × lương giờ), không cắt theo giờ còn thiếu; ngày có giờ làm bù được trả không có phụ cấp ca và giờ nghỉ đêm
// có lương. OT chỉ bị giữ khi trước ngày đó còn giờ phải bù, không bị giữ vì đã làm bù nhiều hơn giờ thiếu.
// Ca tham chiếu: NV bậc 1 (6.000.000 / 26 / 8 giờ), ca đêm 40 %, ca Night2 22:00–07:00.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../public/payroll-engine.js');
const { DEFAULTS } = require('../../public/payroll-params.js');

const KINDS = { Normal1: 'normal', Flex1: 'flex', Night1: 'night', Night2: 'night', n1: 'normal', g2: 'night' };
const P = { ...DEFAULTS, 'shift.allowance.basis': 'assigned', 'type.nv.nightPct': 40 };
for (const [code, kind] of Object.entries<any>(KINDS)) P[`shift.kind.${code}`] = kind;
const E = Engine.create(P);
const NIGHT = { username: 'qa_night', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Night2' };
const DAY = { username: 'qa_day', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const DAILY = 6000000 / 26;
const HOURLY = DAILY / 8;
const near = (actual?, expected?, msg?) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${msg || ''} ${actual} != ${expected}`);
const night = (extra?) => ({
  kind: 'work',
  in: '22:00',
  out: '07:00',
  preset: 'Night2',
  extraIn: '20:00',
  extraOut: '09:00',
  ...extra
});
const day = (staff?, d?, date?) => E.calcDay(staff, d, false, null, { date, holidays: [] });
const month = (staff?, days?) => E.calcMonth(staff, days, null, [], '2026-10', null);

test('ca đêm 02/10 có làm bù 20:00–22:00 và 07:00–09:00, không còn giờ thiếu: 230.769 + 4 × 28.846 = 346.154, không phụ cấp ca, không Off Paid', async () => {
  const c = await day(NIGHT, night({ extraKind: 'makeup' }), '2026-10-02');
  assert.equal(c.makeupH, 4);
  near(c.makeupPay, 4 * HOURLY);
  assert.deepEqual([c.bonus, c.breakPay], [0, 0]);
  near(c.total, 346154);
  // cả tháng chỉ có ngày đó: không giờ thiếu nào, 4 giờ làm bù vẫn trả đủ
  const m = await month(NIGHT, { '2026-10-02': night({ extraKind: 'makeup' }) });
  assert.deepEqual([m.makeupHours, m.makeupCredit, m.debt], [4, 4, 0]);
  near(m.makeupPay, 4 * HOURLY);
  near(m.rows[0].total, 346154);
});

test('làm bù 4 giờ ngày thường khi không nợ giờ: trả 4 × lương giờ, ngày đó mất phụ cấp ca', async () => {
  const ca = { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' };
  const flex = { ...DAY, shiftCode: 'Flex1' };
  const plain = await day(flex, { ...ca, preset: 'Flex1' }, '2026-10-05');
  assert.ok(plain.bonus > 0, 'ca Flex có phụ cấp');
  const c = await day(flex, { ...ca, preset: 'Flex1', extraKind: 'makeup', extraOut: '21:00' }, '2026-10-05');
  assert.equal(c.makeupH, 4);
  near(c.makeupPay, 4 * HOURLY);
  assert.equal(c.bonus, 0);
  near(c.total, DAILY + 4 * HOURLY);
});
