'use strict';
// Trễ hoặc về sớm chỉ bị trừ khi số phút thiếu LỚN HƠN attendance.graceMin (15): đúng 15 phút không trừ, 16 phút trừ 30 phút (làm tròn nửa
// lên theo bậc 30 phút), 40 phút trừ 30 phút. Cờ giải trình của lượt (SessionStatus) dùng cùng ngưỡng nên có cờ khi và chỉ khi có trừ.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');
const ActualHours = require('../../src/engine/actual-hours');
const config = require('../../src/platform/config');
const { lateCheckoutMin } = require('../../src/domain/explanation/late-checkout');
const { SessionStatus } = require('../../src/domain/attendance/session-status');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');

const DATE = '2026-10-20'; // thứ Ba, ca n1 08:00–17:00
const STAFF = { username: 'qa_nv', type: 'nv', level: 1, shiftCode: 'n1' };
const punchStaff = { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] };
const at = (hhmm?) => new Date(`${DATE}T${hhmm}:00+07:00`).toISOString();
const hm = (min?) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// [số phút thiếu, số phút trừ]
const ROWS = [
  [14, 0],
  [15, 0],
  [16, 30],
  [40, 30]
];

async function sessionOf(inHm?, outHm?) {
  const plannedShift = P.planShift(punchStaff, DATE);
  const { entry } = P.buildDay(punchStaff, await at(inHm), await at(outHm), 'in-out', {
    plannedShift,
    approveIncomplete: true
  });
  return { id: 1, username: STAFF.username, date: DATE, state: 'closed', entry, version: 1 };
}
const cutOf = (session?) => {
  const day = ActualHours.apply(
    { [DATE]: { kind: 'work', in: '08:00', out: '17:00', preset: 'n1', extraKind: '', extraIn: '', extraOut: '' } },
    [session],
    { from: '2026-10-01', asOf: '2026-10-29T12:00:00+07:00', staff: STAFF, holidays: [], month: '2026-10' }
  ).days[DATE];
  return (day.cutStartMin || 0) + (day.cutEndMin || 0);
};
const classifier = new SessionStatus({
  rules: () => ({ graceMin: ActualHours.RULE.GRACE_MIN, lateMinutes: ActualHours.lateMinutes }),
  checkoutGraceMin: config.CHECKOUT_GRACE_MIN,
  lateCheckoutMin,
  adminOrigin: ADMIN_ORIGIN
});

test('cutMin: ngưỡng miễn 15 phút, trừ khi quá ngưỡng', () => {
  assert.equal(ActualHours.RULE.GRACE_MIN, 15);
  for (const [missed, cut] of ROWS) assert.equal(ActualHours.cutMin(missed), cut, `${missed} phút`);
});

test('Vào trễ 14, 15, 16, 40 phút: trừ 0, 0, 30, 30 phút', async () => {
  for (const [late, cut] of ROWS)
    assert.equal(await cutOf(await sessionOf(hm(480 + late), '17:00')), cut, `trễ ${late} phút`);
});

test('Về sớm 14, 15, 16, 40 phút: trừ 0, 0, 30, 30 phút, cùng ngưỡng với đi trễ', async () => {
  for (const [early, cut] of ROWS)
    assert.equal(await cutOf(await sessionOf('08:00', hm(1020 - early))), cut, `sớm ${early} phút`);
});

test('Cờ "Vào trễ" của lượt xuất hiện khi và chỉ khi lượt bị trừ vì trễ', async () => {
  for (const [late, cut] of ROWS) {
    const { statusNote } = await classifier.classify(await sessionOf(hm(480 + late), '17:00'));
    assert.equal(statusNote === `Vào trễ ${late} phút`, cut > 0, `trễ ${late} phút: "${statusNote}"`);
  }
});
