'use strict';
// Giải trình về ngày đi trễ hoặc về sớm được duyệt: chỉ hết giữ ngày, KHÔNG ghi lượt Admin; ActualHours vẫn cắt theo bậc halfUpStep của
// hệ thống (quá 15 phút: 16 → 30, 40 → 30, 45 → 60). Đúng 15 phút không cắt.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');

const cutOf = async (username?, date?) => {
  const day = (await X.payOf(username)).payDays[date];
  return (day.cutStartMin || 0) + (day.cutEndMin || 0);
};

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['an', 'binh', 'cuong', 'dung', 'em']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Đi trễ 40 phút được duyệt: hết giữ, vẫn bị cắt 30 phút theo bậc, không có lượt Admin', async () => {
  await X.fullDay('an', '2026-10-19', '08:40', '17:00', 'le-an');
  const item = await X.askAndAnswer('an', '2026-10-19');
  assert.equal((await X.payOf('an')).payDays['2026-10-19'].kind, 'unpaid'); // chờ duyệt: giữ
  const ok = await X.decide(item.id, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.recorded, false);
  assert.deepEqual(ok.data.warnings || [], []);
  const paid = await X.payOf('an');
  assert.equal(paid.payDays['2026-10-19'].kind, 'work');
  assert.equal(await cutOf('an', '2026-10-19'), 30);
  assert.equal(paid.m.count, 1);
  assert.ok(paid.m.cut > 0);
  assert.equal((await X.sessionsOn('an', '2026-10-19')).filter(s => s.entry.origin === ADMIN_ORIGIN).length, 0);
});

test('Về sớm 20 phút được duyệt: hết giữ, vẫn bị cắt 30 phút, không có lượt Admin', async () => {
  await X.fullDay('binh', '2026-10-19', '08:00', '16:40', 'le-binh');
  const item = await X.askAndAnswer('binh', '2026-10-19');
  assert.equal((await X.decide(item.id, true)).data.recorded, false);
  assert.equal((await X.payOf('binh')).payDays['2026-10-19'].kind, 'work');
  assert.equal(await cutOf('binh', '2026-10-19'), 30);
  assert.equal((await X.sessionsOn('binh', '2026-10-19')).length, 1);
});

test('Biên: trễ đúng 15 phút không bị cắt, trễ 16 phút bị cắt 30 phút, trễ 45 phút bị cắt 60 phút', async () => {
  const rows = [
    ['cuong', '08:15', 0],
    ['dung', '08:16', 30],
    ['em', '08:45', 60]
  ];
  for (const [who, inAt, cut] of rows) {
    await X.fullDay(who, '2026-10-19', inAt, '17:00', `le-${who}`);
    const item = await X.askAndAnswer(who, '2026-10-19');
    assert.equal((await X.decide(item.id, true)).status, 200);
    assert.equal(await cutOf(who, '2026-10-19'), cut, `${who} vào ${inAt}`);
    assert.equal((await X.sessionsOn(who, '2026-10-19')).filter(s => s.entry.origin === ADMIN_ORIGIN).length, 0);
  }
});
