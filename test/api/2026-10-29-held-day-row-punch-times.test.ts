'use strict';
// Dòng ngày của ngày giữ vì giải trình có giờ bấm thật và nhãn giữ: chờ duyệt = held 'pending', bị từ chối = held 'rejected'; ngày quên Check-out
// bị từ chối giữ giờ vào thật và giờ ra rỗng, ngày đi trễ bị từ chối giữ cả hai giờ bấm. Duyệt thì dòng là ngày công, không còn held.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');

const rowOf = async (username?, date?) => (await X.payOf(username)).m.rows.find(r => r.date === date);
const punches = (row?) => [row.punchIn, row.punchOut];

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['quen', 'tre', 'cho']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Quên Check-out bị từ chối: dòng ngày held rejected, giờ vào thật và giờ ra rỗng, 0 đồng', async () => {
  await X.forgotOut('quen', '2026-10-22', '08:00', 'held-quen');
  const item = await X.askAndAnswer('quen', '2026-10-22');
  assert.equal((await rowOf('quen', '2026-10-22')).held, 'pending');
  assert.equal((await X.decide(item.id, false)).status, 200);
  const row = await rowOf('quen', '2026-10-22');
  assert.equal(row.kind, 'unpaid');
  assert.equal(row.held, 'rejected');
  assert.deepEqual(punches(row), ['08:00', null]);
  assert.equal(row.total, 0);
});

test('Đi trễ bị từ chối: dòng ngày held rejected, giữ cả giờ vào và giờ ra thật', async () => {
  await X.fullDay('tre', '2026-10-19', '08:16', '17:00', 'held-tre');
  const item = await X.askAndAnswer('tre', '2026-10-19');
  assert.equal((await X.decide(item.id, false)).status, 200);
  const row = await rowOf('tre', '2026-10-19');
  assert.equal(row.held, 'rejected');
  assert.deepEqual(punches(row), ['08:16', '17:00']);
});

test('Giải trình chưa quyết định: held pending; duyệt thì dòng là ngày công và không còn held', async () => {
  await X.forgotOut('cho', '2026-10-20', '08:00', 'held-cho');
  const item = await X.askAndAnswer('cho', '2026-10-20');
  const held = await rowOf('cho', '2026-10-20');
  assert.equal(held.held, 'pending');
  assert.deepEqual(punches(held), ['08:00', null]);
  assert.equal((await X.decide(item.id, true)).status, 200);
  const done = await rowOf('cho', '2026-10-20');
  assert.equal(done.kind, 'work');
  assert.equal(done.held, undefined);
});
