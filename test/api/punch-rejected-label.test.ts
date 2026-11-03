'use strict';
// Màn Chấm công của nhân viên (GET /punch): lượt có giải trình bị từ chối mang nhãn "Bị từ chối" như trên phiếu, không phải "Chờ xử lý" của kind 'pending' trong entry.
// record kèm status, statusNote của lượt (cùng phân loại của phiếu); `pending` (lý do lượt đang chờ) chỉ có khi lượt thật sự chờ xử lý.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const AS = require('../../src/engine/attendance-status');

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['quen', 'muon', 'ngay']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

const punchOf = async (who?) => {
  await F.at('2026-10-29T12:00:00');
  const res = await F.call('GET', '/punch', { who });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
};

test('Quên Check-out: giải trình chờ xử lý giữ nhãn "Chờ xử lý", Admin từ chối thì "Bị từ chối", duyệt thì lượt Admin "Đã chấm công"', async () => {
  await X.forgotOut('quen', '2026-10-20', '08:40', 'pl-quen-in');
  const item = await X.askAndAnswer('quen', '2026-10-20');

  const waiting = await punchOf('quen');
  assert.equal(waiting.record.kind, 'pending'); // entry giữ nguyên
  assert.equal(AS.labelOf(waiting.record), 'Chờ xử lý');
  assert.equal(waiting.pending, 'forgot-out');

  assert.equal((await X.decide(item.id, false)).status, 200);
  const rejected = await punchOf('quen');
  assert.equal(rejected.record.kind, 'pending');
  assert.equal(rejected.record.status, 'rejected');
  assert.equal(AS.labelOf(rejected.record), 'Bị từ chối');
  assert.equal(AS.labelOf(rejected.lastSession), 'Bị từ chối');
  assert.equal(rejected.record.statusNote, rejected.lastSession.statusNote);
  assert.equal(rejected.pending, null);

  assert.equal((await X.decide(item.id, true)).status, 200); // đổi ý
  const approved = await punchOf('quen');
  assert.equal(AS.labelOf(approved.record), 'Đã chấm công');
  assert.equal(approved.pending, null);
});

test('Check-out thiếu giờ (incomplete-shift): giải trình ngày bị từ chối thì nhãn "Bị từ chối", chưa quyết định thì "Chờ xử lý"', async () => {
  await F.at('2026-10-21T08:00:00');
  const opened = await X.punch('ngay', { type: 'in', requestId: 'pl-ngay-in' });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  await F.at('2026-10-21T15:00:00'); // ra sớm: ca chưa đủ giờ
  const closed = await X.punch('ngay', {
    type: 'out',
    sessionId: opened.data.open.id,
    requestId: 'pl-ngay-out',
    explanation: 'Việc riêng' // về sớm phải giải trình lúc bấm; giải trình này chưa được duyệt
  });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const item = await X.askAndAnswer('ngay', '2026-10-21');

  const waiting = await punchOf('ngay');
  assert.equal(waiting.record.kind, 'pending');
  assert.equal(waiting.record.reason, 'incomplete-shift');
  assert.equal(AS.labelOf(waiting.record), 'Chờ xử lý');

  assert.equal((await X.decide(item.id, false)).status, 200);
  const rejected = await punchOf('ngay');
  assert.equal(rejected.record.kind, 'pending');
  assert.equal(rejected.record.reason, 'incomplete-shift');
  assert.equal(AS.labelOf(rejected.record), 'Bị từ chối');
  assert.equal(rejected.pending, null);
});

test('Check-out muộn: giải trình chờ xử lý, Admin từ chối thì nhãn "Bị từ chối"', async () => {
  await F.at('2026-10-22T08:00:00');
  const opened = await X.punch('muon', { type: 'in', requestId: 'pl-muon-in' });
  await F.at('2026-10-22T18:10:00'); // ca hết 17:00: muộn 70 phút
  const out = await X.punch('muon', {
    type: 'out',
    sessionId: opened.data.open.id,
    requestId: 'pl-muon-out',
    explanation: 'Chờ khách ký'
  });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  const waiting = await punchOf('muon');
  assert.equal(AS.labelOf(waiting.record), 'Chờ xử lý');
  assert.equal(waiting.pending, 'forgot-out');

  const item = (await F.call('GET', '/explanations?status=answered&user=muon', { who: 'admin' })).data.items[0];
  assert.equal((await X.decide(item.id, false)).status, 200);
  const rejected = await punchOf('muon');
  assert.equal(AS.labelOf(rejected.record), 'Bị từ chối');
  assert.equal(rejected.pending, null);
});
