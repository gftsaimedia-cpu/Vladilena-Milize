'use strict';
// Nhãn của lượt đổi theo giải trình gắn với lượt (Check-out muộn): gửi lại hoặc Admin quyết định phải báo màn Chấm công đang mở nạp lại
// (attendance.changed kind 'explanation' tới người có attendance.correct), không chỉ khi giờ của lượt đổi.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const SSE = require('../helpers/sse-client');

before(async () => {
  await F.start();
  await F.at('2026-10-19T12:00:00');
  await F.person('dung');
  await F.person('admin', 'admin');
});
after(async () => {
  SSE.events.closeAll();
  await F.stop();
});

const explanationEvents = (frames?) =>
  SSE.only(frames, 'attendance.changed').filter(f => f.data && f.data.kind === 'explanation');

test('Admin không duyệt rồi duyệt giải trình Check-out muộn: mỗi lần màn Chấm công nhận attendance.changed kind explanation', async () => {
  await F.at('2026-10-21T08:00:00');
  const opened = await F.call('POST', '/punch', { who: 'dung', body: { type: 'in', requestId: 'evt-in-dung' } });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  await F.at('2026-10-21T18:10:00');
  const sessionId = (await F.store.openSession('dung')).id;
  const out = await F.call('POST', '/punch', {
    who: 'dung',
    body: { type: 'out', sessionId, requestId: 'evt-out-dung', explanation: 'Chờ khách ký biên bản' }
  });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  const id = (await F.store.db.prepare('SELECT id FROM explanations WHERE session_id = ?').get(sessionId)).id;

  const [admin, staff] = await SSE.openMany('admin', 'dung');
  await SSE.settle([admin, staff]);
  const no = await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: false } });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  let [fAdmin, fStaff] = await SSE.settle([admin, staff]);
  const got = explanationEvents(fAdmin);
  assert.equal(got.length, 1, JSON.stringify(fAdmin));
  assert.deepEqual(got[0].data, { kind: 'explanation', month: '2026-10' });
  assert.deepEqual(SSE.only(fStaff, 'attendance.changed'), [], 'nhân sự không có attendance.correct không nhận');

  const resend = await F.call('POST', '/explanations', { who: 'dung', body: { sessionId, text: 'Bổ sung biên bản' } });
  assert.equal(resend.status, 200, JSON.stringify(resend.data));
  [fAdmin] = await SSE.settle([admin, staff]);
  assert.equal(explanationEvents(fAdmin).length, 1, 'gửi lại sau khi bị từ chối');
  admin.close();
  staff.close();
});
