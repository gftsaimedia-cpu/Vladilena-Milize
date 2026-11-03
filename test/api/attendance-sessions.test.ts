require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'sessions-tests';
const { test, before, after } = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');
let base, clock;
const originalNow = Date.now;
const at = (t?) => (clock = Date.parse(t + '+07:00'));
async function person(username?, shiftCode = 'n1', type = 'nv') {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type,
    level: 1,
    shiftCode,
    passHash: auth.hashPassword('test-pass')
  });
}
async function call(user?, method?, route?, body?) {
  const r = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(user), 86400) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: r.status, data: (await r.json()) as any };
}
const punch = (u?, type?, sessionId?, requestId = crypto.randomUUID()) =>
  call(u, 'POST', '/punch', { type, sessionId, requestId, explanation: 'Giải trình lúc bấm' }); // lần bấm không hợp lệ cần giải trình
before(async () => {
  await at('2026-10-07T07:55:00');
  Date.now = () => clock;
  await store.upsertStaff({
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: auth.hashPassword('test-pass')
  });
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  Date.now = originalNow;
  server.closeAllConnections();
  await new Promise<any>(r => server.close(r));
  store.db.close();
});
test('successive sessions retain distinct identity and never change estimates', async () => {
  await person('repeat');
  await store.setSheet('repeat', '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } }, 0, 100);
  const estimate = await store.getSheet('repeat', '2026-10');
  await at('2026-10-07T07:55:00');
  let r = await punch('repeat', 'in');
  assert.equal(r.status, 200);
  assert.ok(r.data.openSession?.id);
  const first = r.data.openSession.id;
  await at('2026-10-07T12:00:00');
  r = await punch('repeat', 'out', first);
  assert.equal(r.data.canCheckIn, true);
  const second = (await punch('repeat', 'in')).data.openSession;
  assert.notEqual(second.id, first);
  await at('2026-10-07T17:00:00');
  await punch('repeat', 'out', second.id);
  const sh = (await call('repeat', 'GET', '/sheet?month=2026-10')).data;
  assert.equal(sh.attendanceSessions.length, 2);
  assert.equal(sh.attendanceSessions[0].entry.presOut, '2026-10-07T05:00:00.000Z');
  assert.deepEqual(await store.getSheet('repeat', '2026-10'), estimate);
});
test('retry identity cannot create or close a later session', async () => {
  await person('retry');
  await at('2026-10-07T08:00:00');
  const inId = crypto.randomUUID(),
    outId = crypto.randomUUID();
  const one = await punch('retry', 'in', undefined, inId);
  assert.ok(one.data.openSession);
  const sid = one.data.openSession.id;
  await at('2026-10-07T16:30:00');
  const out = await punch('retry', 'out', sid, outId);
  const two = await punch('retry', 'in');
  assert.ok(two.data.openSession);
  // phản hồi gửi lại cùng mã giữ nguyên kết quả; serverNow và checkoutPreview luôn theo đồng hồ lúc gửi lại nên không so
  const sameResult = ({ serverNow, checkoutPreview, ...rest }: any) => rest;
  const replayOut = await punch('retry', 'out', sid, outId);
  assert.deepEqual(sameResult(replayOut.data), sameResult(out.data));
  assert.equal(replayOut.data.serverNow, new Date(Date.now()).toISOString(), 'serverNow là giờ máy chủ lúc gửi lại');
  assert.deepEqual(sameResult((await punch('retry', 'in', undefined, inId)).data), sameResult(one.data));
  assert.equal((await call('retry', 'GET', '/punch')).data.openSession.id, two.data.openSession.id);
  assert.equal((await punch('retry', 'out', two.data.openSession.id, outId)).status, 409);
  assert.equal((await punch('retry', 'out', sid)).status, 409);
});
test('concurrent check-ins have at most one open session', async () => {
  await person('double');
  await at('2026-10-07T08:00:00');
  const rr = await Promise.all([punch('double', 'in'), punch('double', 'in')]);
  assert.deepEqual(rr.map(r => r.status).sort(), [200, 409]);
  assert.equal((await store.listSessions({ username: 'double' })).filter(s => s.state === 'open').length, 1);
});
test('an unscheduled Sunday is refused', async () => {
  await person('sunday', 'n1');
  await at('2026-10-11T08:00:00');
  const sunday = await punch('sunday', 'in');
  assert.equal(sunday.status, 409);
  assert.equal((await store.listSessions({ username: 'sunday' })).length, 0);
});
test('night sessions allow the next evening without hiding completed history', async () => {
  await person('night', 'g2');
  await at('2026-09-30T21:55:00');
  const one = (await punch('night', 'in')).data.openSession;
  assert.ok(one);
  await at('2026-10-01T07:00:00');
  await punch('night', 'out', one.id);
  await at('2026-10-01T21:55:00');
  const state = (await call('night', 'GET', '/punch')).data;
  assert.equal(state.canCheckIn, true);
  const two = (await punch('night', 'in')).data.openSession;
  assert.equal(two.date, '2026-10-01');
  assert.equal((await store.getSession(one.id)).date, '2026-09-30');
});
test('stale session closes without fabricated checkout; disable keeps checkout available', async () => {
  await person('stale-session');
  await at('2026-10-07T08:00:00');
  const one = (await punch('stale-session', 'in')).data.openSession;
  assert.ok(one);
  await at('2026-10-08T00:01:00');
  let state = (await call('stale-session', 'GET', '/punch')).data;
  assert.equal(state.openSession, null);
  assert.equal(state.lastSession.entry.reason, 'forgot-out');
  assert.equal(state.lastSession.entry.presOut, undefined);
  await at('2026-10-08T04:30:00');
  assert.equal((await call('stale-session', 'GET', '/punch')).data.canCheckIn, true);
  const two = (await punch('stale-session', 'in')).data.openSession;
  await at('2026-10-08T05:00:00');
  assert.equal((await punch('stale-session', 'out', two.id)).status, 200);
});
test('null/array bodies and array time fields return validation errors', async () => {
  await person('bad-input');
  for (const b of [
    null,
    [],
    { month: '2026-10', days: { '2026-10-07': { kind: 'work', in: ['08:00'], out: '17:00' } } }
  ])
    assert.equal((await call('bad-input', 'PUT', '/sheet', b)).status, 400);
  assert.equal((await call('bad-input', 'POST', '/punch', { type: 'in' })).status, 400);
  assert.equal(
    (await call('bad-input', 'POST', '/punch', { type: 'out', requestId: crypto.randomUUID() })).status,
    400
  );
});
test('whole-day makeup night is blocked while unchanged legacy entry remains reviewable', async () => {
  await person('makeup-night', 'n1', 'tts');
  const days = { '2026-10-09': { kind: 'willmakeup' }, '2026-10-10': { kind: 'makeup', in: '22:00', out: '07:00' } };
  assert.equal((await call('makeup-night', 'PUT', '/sheet', { month: '2026-10', days })).status, 400);
  await store.setSheet('makeup-night', '2026-10', days, null, null);
  assert.equal((await call('makeup-night', 'PUT', '/sheet', { month: '2026-10', days })).status, 200);
});
test('changing a legacy work night to makeup with identical times cannot bypass validation', async () => {
  await person('changed-kind', 'n1', 'tts');
  const original = { '2026-10-09': { kind: 'work', in: '22:00', out: '07:00' } };
  await store.setSheet('changed-kind', '2026-10', original, null, null);
  const changed = { '2026-10-09': { ...original['2026-10-09'], kind: 'makeup' } };
  assert.equal((await call('changed-kind', 'PUT', '/sheet', { month: '2026-10', days: changed })).status, 400);
  assert.deepEqual((await store.getSheet('changed-kind', '2026-10')).days, original);
});
test('OT targets one session, writes the approved OT on its day only and rejects a stale version', async () => {
  await person('ot-session');
  await at('2026-10-07T20:00:00');
  const plan = require('../../src/engine/punch').planShift(
    { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] },
    '2026-10-07'
  );
  const entry = {
    kind: 'work',
    in: '08:00',
    out: '17:00',
    src: 'admin',
    plannedShift: plan,
    presIn: '2026-10-07T01:00:00.000Z',
    presOut: '2026-10-07T12:00:00.000Z',
    extraKind: 'ot',
    extraOut: '19:00'
  };
  const s = await store.createSession('ot-session', '2026-10-07', 'closed', entry),
    before = await store.getSheet('ot-session', '2026-10');
  assert.equal(
    (await call('ot-session', 'PUT', '/ot', { sessionId: s.id, version: s.version, action: 'approve' })).status,
    403
  );
  assert.equal(
    (await call('admin', 'PUT', '/ot', { sessionId: s.id, version: s.version, action: 'approve' })).status,
    200
  );
  assert.equal(
    (await call('admin', 'PUT', '/ot', { sessionId: s.id, version: s.version, action: 'reject', note: 'Stale' }))
      .status,
    409
  );
  assert.equal((await store.getSession(s.id)).entry.otReview.ok, true);
  const days = (await store.getSheet('ot-session', '2026-10')).days;
  assert.deepEqual(Object.keys(days), ['2026-10-07'], 'chỉ ngày của lượt được ghi, các ngày khác giữ nguyên');
  assert.equal(days['2026-10-07'].extraKind, 'ot');
  assert.equal(days['2026-10-07'].extraOut, '19:00');
  assert.deepEqual(before.days, {});
});
test('latest presence uses actual timestamps when Admin adds an earlier session later', async () => {
  await person('insert-history');
  await at('2026-10-07T18:00:00');
  // Lượt buổi chiều ghi trước, lượt buổi sáng thêm sau: dựng thẳng trong store
  const create = (presIn?, presOut?) =>
    store.createSession('insert-history', '2026-10-07', 'closed', {
      kind: 'pending',
      reason: 'needs-review',
      src: 'admin',
      presIn,
      presOut
    });
  const afternoon = await create('2026-10-07T06:00:00.000Z', '2026-10-07T10:00:00.000Z');
  await create('2026-10-07T01:00:00.000Z', '2026-10-07T05:00:00.000Z');
  const state = (await call('insert-history', 'GET', '/punch')).data;
  assert.equal(state.lastSession.id, afternoon.id);
  const today = (await call('admin', 'GET', '/today')).data.rows.find(r => r.username === 'insert-history');
  assert.equal(today.sessionId, afternoon.id);
  assert.equal(today.out, '17:00');
  assert.equal(today.sessionCount, 2);
});
