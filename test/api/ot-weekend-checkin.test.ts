'use strict';
// OT đã duyệt vào ngày nghỉ cuối tuần (Chủ nhật ngoài lịch) trả qua Check-in/out:
//   - Check-in ngày ngoài lịch chỉ được trong khoảng giờ OT đã duyệt; lượt đó là lượt ngoài ca (Chờ xử lý, cần giải trình);
//   - phút OT trả theo ot.weekendRate, chỉ đoạn OT (không lương ngày, không ngày công);
//   - OT khai ở Check-in/out (POST /ot + PUT /ot) cho ngày đó ra đúng cùng khoản, không cộng đôi.
const F = require('../helpers/api-fixture');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const punch = require('../../src/engine/punch');
const sessionBody = require('../helpers/session-contract-helper');

const { store } = F;
const M = '2026-10';
const SUN = '2026-10-11';
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();

before(async () => {
  await F.start();
});
after(() => F.stop());
beforeEach(async () => {
  await F.reset();
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_a');
  await F.person('qa_b');
  await F.at('2026-10-12T09:00:00');
});

const punchCall = async (who?, type?) =>
  await F.call('POST', '/punch', { who, body: await sessionBody(store, who, 'POST', '/punch', { type }) });
const rowOf = async (who?, date?) =>
  (await F.call('GET', `/me/estimate?month=${M}&rows=1`, { who })).data.m.rows.find(r => r.date === date);

async function declareAndApproveOnSheet(username?) {
  const days = { [SUN]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' } };
  const put = await F.call('PUT', '/sheet', { who: username, body: { month: M, days } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const item = (await F.call('GET', `/approvals?user=${username}`)).data.items.find(x => x.date === SUN);
  assert.ok(item, 'khoản OT chờ duyệt');
  const ok = await F.call('PUT', '/approvals/decide', {
    body: { action: 'approve', items: [{ username, date: SUN, rev: item.rev, fingerprint: item.fingerprint }] }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
}

test('Chủ nhật có OT 17:00–19:00 đã duyệt: Check-in 07:55 bị từ chối; Check-in 17:00 và Check-out 19:00 thành lượt ngoài ca chờ giải trình', async () => {
  await F.at('2026-10-10T09:00:00');
  await declareAndApproveOnSheet('qa_a');
  await F.at(`${SUN}T07:55:00`);
  const early = await punchCall('qa_a', 'in');
  assert.equal(early.status, 409, JSON.stringify(early.data));
  assert.equal(early.data.code, 'CHECKIN_OUTSIDE_SHIFT');
  await F.at(`${SUN}T17:00:00`);
  F.explainPunches = true; // Check-in ngoài ca cần giải trình lúc bấm
  try {
    const opened = await punchCall('qa_a', 'in');
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.equal((await store.openSession('qa_a')).entry.outsideShift, true);
    await F.at(`${SUN}T19:00:00`);
    const out = await punchCall('qa_a', 'out');
    assert.equal(out.status, 200, JSON.stringify(out.data));
  } finally {
    F.explainPunches = false;
  }
  const s = (await store.listSessions({ username: 'qa_a', date: SUN }))[0];
  assert.equal(s.entry.kind, 'pending');
  assert.equal(s.entry.reason, 'off-shift');
  assert.equal(s.entry.presIn, T(SUN, '17:00'));
  assert.equal(s.entry.presOut, T(SUN, '19:00'));
});

test('Chủ nhật: lượt Check-in/out đã đóng có OT khai ở Check-in/out (POST /ot) và duyệt (PUT /ot) ra cùng tiền với đường Lịch ước tính', async () => {
  await F.at('2026-10-10T09:00:00');
  await declareAndApproveOnSheet('qa_a');
  await F.at('2026-10-12T09:00:00');
  const plan = punch.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, SUN);
  for (const who of ['qa_a', 'qa_b']) {
    const entry = punch.buildDay({ shiftCode: 'n1' }, T(SUN, '07:55'), T(SUN, '19:00'), 'punch', {
      plannedShift: plan,
      approveIncomplete: true
    }).entry;
    await store.createSession(who, SUN, 'closed', entry);
  }
  const s = (await store.listSessions({ username: 'qa_b', date: SUN }))[0];
  const decl = await F.call('POST', '/ot', {
    body: { sessionId: s.id, version: s.version, extraOut: '19:00', reason: 'Làm thêm 2 giờ' }
  });
  assert.equal(decl.status, 200, JSON.stringify(decl.data));
  const cur = await store.getSession(s.id);
  const dec = await F.call('PUT', '/ot', { body: { sessionId: cur.id, version: cur.version, action: 'approve' } });
  assert.equal(dec.status, 200, JSON.stringify(dec.data));
  const a = await rowOf('qa_a', SUN),
    b = await rowOf('qa_b', SUN);
  assert.equal(b.otH, 2, 'không cộng đôi');
  assert.equal(b.otWeekendH, 2);
  assert.equal(b.otPay, a.otPay);
});
