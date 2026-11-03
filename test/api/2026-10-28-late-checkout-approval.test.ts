'use strict';
// Check-out muộn chỉ có hiệu lực khi Admin duyệt giải trình.
// Check-out muộn quá CHECKOUT_GRACE_MIN phút (giải trình gửi kèm POST /api/punch { explanation }): lượt thành "Quên Check-out" (giống lượt mở quá 16 giờ),
// giờ bấm chỉ được ghi nhận (entry.requestedOut + dòng punches thật); Admin duyệt thì giờ đó thành giờ ra; không duyệt thì cả ngày không tính lương.
// Giải trình không khoá theo kỳ: đã chốt công vẫn duyệt được.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const P = require('../helpers/period-api');
const explanations = require('../../src/domain/explanation/explanations');
const heldDates = async (month?) =>
  new Map<any, any>(
    [...(await explanations.heldByUser(month))].map(([username, days]: any) => [username, days.map(d => d.date)])
  );

const MONTH = '2026-10';
const iso = (vn?) => new Date(`${vn}+07:00`).toISOString();
const punch = async (who?, body?) => await F.call('POST', '/punch', { who, body });
const checkIn = async (who?, at?, requestId?) => {
  await F.at(at);
  const res = await punch(who, { type: 'in', requestId });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.open.id;
};
const punchesOf = async (sessionId?) => await F.store.sessionPunches(sessionId);
const lateOf = async (username?) => (await explanations.list({ username })).find(x => x.kind === 'late-checkout');

before(async () => {
  await F.start();
  await F.at('2026-10-19T12:00:00');
  await F.person('chi');
  await F.person('dung');
  await F.person('em');
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Check-out muộn gửi kèm giải trình: lượt là Quên Check-out, giờ bấm được ghi nhận, giải trình chờ duyệt; bấm lại cùng requestId không ghi hai lần', async () => {
  const sessionId = await checkIn('chi', '2026-10-20T08:00:00', 'late-ck-in-1');
  await F.at('2026-10-20T18:10:00'); // ca n1 hết 17:00: muộn 70 phút
  const noText = await punch('chi', { type: 'out', sessionId, requestId: 'late-ck-out-1' });
  assert.equal(noText.status, 409);
  assert.equal(noText.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  assert.equal((await F.store.getSession(sessionId)).state, 'open'); // 409 không ghi gì
  const body = { type: 'out', sessionId, requestId: 'late-ck-out-1', explanation: 'Chờ khách ký biên bản' };
  const res = await punch('chi', body);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const s = await F.store.getSession(sessionId);
  assert.equal(s.state, 'closed');
  assert.equal(s.entry.kind, 'pending');
  assert.equal(s.entry.reason, 'forgot-out'); // đúng trạng thái "Quên Check-out" như lượt quá 16 giờ
  assert.equal(s.entry.presOut, undefined); // giờ ra CHƯA được áp
  assert.equal(s.entry.requestedOut, iso('2026-10-20T18:10:00'));
  assert.equal(res.data.pending, 'forgot-out');
  assert.equal(res.data.openSession, null);
  await F.at('2026-10-21T08:00:00'); // lượt đã đóng nên Check-in lại được trong khung ca hôm sau
  assert.equal((await F.call('GET', '/punch', { who: 'chi' })).data.canCheckIn, true);
  await F.at('2026-10-20T18:10:00');
  const outs = (await punchesOf(sessionId)).filter(p => p.type === 'out');
  assert.equal(outs.length, 1);
  assert.equal(outs[0].at, iso('2026-10-20T18:10:00'));
  assert.equal(outs[0].auto, 0); // lần bấm thật, không phải tự đóng
  const e = await lateOf('chi');
  assert.equal(e.status, 'answered');
  assert.equal(e.answer, 'Chờ khách ký biên bản');
  assert.equal(e.sessionId, sessionId);
  assert.deepEqual((await heldDates(MONTH)).get('chi'), ['2026-10-20']);
  // bấm lại (lỗi mạng) cùng requestId: cùng phản hồi, không thêm dòng bấm hay giải trình
  const again = await punch('chi', body);
  assert.equal(again.status, 200);
  assert.equal((await punchesOf(sessionId)).filter(p => p.type === 'out').length, 1);
  assert.equal((await explanations.list({ username: 'chi' })).length, 1);
  // Admin thấy giờ bấm trên màn Giải trình
  const seen = await F.call('GET', '/explanations?status=answered&user=chi', { who: 'admin' });
  assert.equal(seen.data.items[0].requestedOut, iso('2026-10-20T18:10:00'));
});

test('Đang chờ duyệt vẫn Check-in được ca sau; Admin duyệt thì giờ bấm thành giờ Check-out của lượt', async () => {
  const sessionId = (await F.store.listSessions({ username: 'chi' }))[0].id;
  const next = await checkIn('chi', '2026-10-21T08:00:00', 'late-ck-in-2'); // không bị chặn bởi lượt chờ duyệt
  assert.notEqual(next, sessionId);
  const id = (await lateOf('chi')).id;
  const ok = await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.item.status, 'approved');
  const s = await F.store.getSession(sessionId);
  assert.equal(s.entry.presOut, iso('2026-10-20T18:10:00'));
  assert.notEqual(s.entry.reason, 'forgot-out');
  assert.equal(s.entry.requestedOut, iso('2026-10-20T18:10:00'));
  assert.equal((await heldDates(MONTH)).has('chi'), false);
  const logged = await F.store.db
    .prepare("SELECT * FROM audit_log WHERE action = 'checkout.late.apply' AND entity_id = ?")
    .all(String(sessionId));
  assert.equal(logged.length, 1);
  // lượt ca sau vẫn mở, không bị đụng
  assert.equal((await F.store.getSession(next)).state, 'open');
});

test('Admin không duyệt: lượt giữ Quên Check-out, cả ngày không tính lương; đổi ý từ duyệt sang không duyệt thì lượt quay lại Quên Check-out', async () => {
  const sessionId = await checkIn('dung', '2026-10-20T08:00:00', 'late-ck-in-3');
  await F.at('2026-10-20T19:00:00');
  const res = await punch('dung', {
    type: 'out',
    sessionId,
    requestId: 'late-ck-out-3',
    explanation: 'Kiểm kho cuối ngày'
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const id = (await lateOf('dung')).id;
  const no = await F.call('POST', `/explanations/${id}/decide`, {
    who: 'admin',
    body: { approve: false, note: 'Không có lệnh' }
  });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  let s = await F.store.getSession(sessionId);
  assert.equal(s.entry.reason, 'forgot-out');
  assert.equal(s.entry.presOut, undefined);
  const held = await require('../../src/domain/payroll/payroll-service').loadInputs(MONTH, { usernames: ['dung'] });
  assert.deepEqual(held.people.get('dung').explanationHold, ['2026-10-20']);
  // duyệt rồi đổi ý
  await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: true } });
  assert.equal((await F.store.getSession(sessionId)).entry.presOut, iso('2026-10-20T19:00:00'));
  await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: false } });
  s = await F.store.getSession(sessionId);
  assert.equal(s.entry.reason, 'forgot-out');
  assert.equal(s.entry.presOut, undefined);
  assert.equal(s.entry.requestedOut, iso('2026-10-20T19:00:00'));
  assert.deepEqual((await heldDates(MONTH)).get('dung'), ['2026-10-20']);
});

test('Check-out không muộn (trong mức cho phép) giữ nguyên: giờ bấm là giờ ra ngay, không có giải trình', async () => {
  const sessionId = await checkIn('em', '2026-10-22T08:00:00', 'late-ck-in-4');
  await F.at('2026-10-22T17:15:00');
  const res = await punch('em', { type: 'out', sessionId, requestId: 'late-ck-out-4', explanation: 'không cần' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const s = await F.store.getSession(sessionId);
  assert.equal(s.entry.presOut, iso('2026-10-22T17:15:00'));
  assert.notEqual(s.entry.reason, 'forgot-out');
  assert.equal(s.entry.requestedOut, undefined);
  assert.equal(await lateOf('em'), undefined);
});

test('Giải trình không khoá theo kỳ: đã chốt công vẫn duyệt được và giờ bấm được áp', async () => {
  const sessionId = await checkIn('em', '2026-10-23T08:00:00', 'late-ck-in-5');
  await F.at('2026-10-23T18:30:00');
  const res = await punch('em', {
    type: 'out',
    sessionId,
    requestId: 'late-ck-out-5',
    explanation: 'Sửa máy cho khách'
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  P.must(await P.step(MONTH, 'lock-attendance'), 'chốt công');
  const id = (await lateOf('em')).id;
  const ok = await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await F.store.getSession(sessionId)).entry.presOut, iso('2026-10-23T18:30:00'));
});
