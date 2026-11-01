'use strict';
// OT được duyệt tính tiền đúng một lần dù khai từ đường nào: Lịch ước tính (PUT /sheet + PUT /approvals/decide) hay lượt Check-in/out (POST /ot + PUT /ot).
// Làm bù theo giờ và đi làm ngày lễ chỉ có đường Lịch ước tính (không có route riêng). Chỉ người bịa (qa_*), DB trong bộ nhớ, đồng hồ giả.
const F = require('../helpers/api-fixture');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const punch = require('../../src/engine/punch');

const { store } = F;
const M = '2026-10';
const D1 = '2026-10-07'; // Thứ Tư
const D2 = '2026-10-08'; // Thứ Năm
const D3 = '2026-10-09'; // Thứ Sáu
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();

before(async () => {
  await F.start();
  await F.at('2026-10-12T09:00:00');
});
after(() => F.stop());
beforeEach(async () => {
  await F.reset();
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_a');
  await F.person('qa_b');
});

// Lượt Check-in/out đã đóng, có mặt 08:00–19:00 cho ca n1 (08:00–17:00)
async function session(username?, date?, out = '19:00') {
  const plan = punch.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = punch.buildDay({ shiftCode: 'n1' }, T(date, '08:00'), T(date, out), 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  return await store.createSession(username, date, 'closed', entry);
}
const rows = async (who?) => {
  const res = await F.call('GET', `/me/estimate?month=${M}&rows=1`, { who });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.m.rows;
};
const rowOf = async (who?, date?) => (await rows(who)).find(r => r.date === date);
const otPaid = (row?) => Number(row.otPay || 0);

async function declareOnCheckin(username?, date?) {
  const s = await session(username, date);
  const r = await F.call('POST', '/ot', {
    body: { sessionId: s.id, version: s.version, extraOut: '19:00', reason: 'Làm thêm 2 giờ' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return await store.getSession(s.id);
}
const decideOt = async (s?, action = 'approve', note?) =>
  await F.call('PUT', '/ot', { body: { sessionId: s.id, version: s.version, action, ...(note ? { note } : {}) } });

async function declareOnSheet(username?, date?) {
  await session(username, date);
  const days = { [date]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' } };
  const put = await F.call('PUT', '/sheet', { who: username, body: { month: M, days } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const item = (await F.call('GET', `/approvals?user=${username}`)).data.items.find(x => x.date === date);
  assert.ok(item, 'khoản OT chờ duyệt');
  const ok = await F.call('PUT', '/approvals/decide', {
    body: {
      action: 'approve',
      items: [{ username, date, rev: item.rev, fingerprint: item.fingerprint }]
    }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
}

test('đường Lịch ước tính: khai, duyệt, ước tính có OT', async () => {
  await declareOnSheet('qa_a', D1);
  const row = await rowOf('qa_a', D1);
  assert.equal(row.extraOut, '19:00');
  assert.ok(otPaid(row) > 0, JSON.stringify(row));
});

test('đường Check-in/out: khai OT rồi duyệt thì ước tính có OT, bằng đường Lịch ước tính', async () => {
  await declareOnSheet('qa_a', D1);
  const s = await declareOnCheckin('qa_b', D1);
  const r = await decideOt(s);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const a = await rowOf('qa_a', D1),
    b = await rowOf('qa_b', D1);
  assert.equal(b.extraOut, '19:00');
  assert.equal(b.otH, 2, 'hai giờ OT, không cộng đôi');
  assert.equal(otPaid(b), otPaid(a));
  assert.deepEqual({ ...b, date: 0, username: 0 }, { ...a, date: 0, username: 0 }, 'hai đường ra cùng một dòng ngày');
});

test('đường Check-in/out: duyệt xong ngày có một khoản đã duyệt trong hàng duyệt, tiền tính một lần', async () => {
  const s = await declareOnCheckin('qa_b', D2);
  await decideOt(s);
  const approvals = (await F.call('GET', '/approvals?status=all&user=qa_b')).data.items;
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].item, 'ot');
  assert.equal(approvals[0].status, 'approved');
  const day = (await store.getSheet('qa_b', M)).days[D2];
  assert.equal(day.extraKind, 'ot');
  assert.equal(day.extraOut, '19:00');
  const once = otPaid(await rowOf('qa_b', D2));
  assert.ok(once > 0);
  // duyệt lại hoặc khai trên lịch cùng khung giờ không cộng thêm
  const put = await F.call('PUT', '/sheet', {
    who: 'qa_b',
    body: { month: M, days: { [D2]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' } } }
  });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const after = (await F.call('GET', '/approvals?status=all&user=qa_b')).data.items;
  assert.equal(after.length, 1);
  assert.equal(after[0].status, 'approved', 'cùng khung giờ nên khoản vẫn đã duyệt');
  assert.equal(otPaid(await rowOf('qa_b', D2)), once);
});

test('đường Check-in/out: từ chối OT thì không có OT trong ước tính và không có khoản trong hàng duyệt', async () => {
  const s = await declareOnCheckin('qa_b', D3);
  const r = await decideOt(s, 'reject', 'không có việc');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = await rowOf('qa_b', D3);
  assert.ok(!row || !row.extraOut);
  assert.equal((await F.call('GET', '/approvals?status=all&user=qa_b')).data.items.length, 0);
});

test('ngày đã có OT khác khung giờ trên Lịch ước tính: duyệt OT Check-in/out báo xung đột, không đổi gì', async () => {
  const s = await declareOnCheckin('qa_b', D1);
  const days = { [D1]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '18:00' } };
  assert.equal((await F.call('PUT', '/sheet', { who: 'qa_b', body: { month: M, days } })).status, 200);
  const before = await F.snapshot();
  const r = await decideOt(s);
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('khai lại OT ở Check-in/out sau khi đã duyệt: duyệt lần sau thay khung giờ cũ, không cộng hai khung', async () => {
  const s = await declareOnCheckin('qa_b', D2);
  assert.equal((await decideOt(s)).status, 200);
  const again = await store.getSession(s.id);
  const r = await F.call('POST', '/ot', {
    body: { sessionId: again.id, version: again.version, extraOut: '18:00', reason: 'Sửa lại còn 1 giờ' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const edited = await store.getSession(s.id);
  assert.equal((await decideOt(edited)).status, 200);
  const row = await rowOf('qa_b', D2);
  assert.equal(row.extraOut, '18:00');
  assert.equal(row.otH, 1);
  const items = (await F.call('GET', '/approvals?status=all&user=qa_b')).data.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'approved');
});

test('làm bù theo giờ và đi làm ngày lễ không có route riêng: chỉ đi qua PUT /sheet và duyệt khoản', async () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/server.ts'), 'utf8');
  const routes = [...src.matchAll(/route === '([A-Z]+ \/[^']*)'/g)].map(m => m[1]);
  assert.deepEqual(
    routes.filter(r => /makeup|holiday-work|lam-bu/i.test(r)),
    [],
    'không có route làm bù hoặc đi làm ngày lễ ngoài lịch'
  );
});
