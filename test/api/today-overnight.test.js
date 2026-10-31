process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'today-overnight-isolated-tests';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const store = require('../../lib/db'),
  auth = require('../../lib/auth'),
  server = require('../../server');
let base, clock;
const originalNow = Date.now;
const at = value => {
  clock = Date.parse(value + '+07:00');
};
const iso = value => new Date(value + '+07:00').toISOString();
function person(username, shiftCode = 'g2') {
  store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode,
    passHash: 'isolated-test-profile'
  });
}
async function call(user, method, route, body) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(auth.createSession(user), 86400) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
const punch = (user, type, sessionId) =>
  call(user, 'POST', '/punch', { type, sessionId, requestId: randomUUID(), explanation: 'Giải trình lúc bấm' });
// Lượt đang mở ngoài khung ca của người chưa gán ca: Admin khai khoản OT đã duyệt phủ giờ bấm (đoạn OT trước hoặc sau ca 08:00–17:00), rồi người đó Check-in
const openOutsideShift = async (user, local, extra) => {
  const date = local.slice(0, 10);
  await call('admin', 'PUT', '/sheet', {
    user,
    month: date.slice(0, 7),
    days: { [date]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', ...extra } }
  });
  return (await punch(user, 'in')).openSession;
};
const today = async user => (await call('admin', 'GET', '/today')).rows.find(row => row.username === user);
before(async () => {
  at('2026-10-07T21:55:00');
  Date.now = () => clock;
  store.upsertStaff({
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: 'isolated-test-admin'
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  Date.now = originalNow;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  store.db.close();
});

test('Today counts the overnight session that it displays as open', async () => {
  person('open-night');
  at('2026-10-07T21:55:00');
  const session = (await punch('open-night', 'in')).openSession;
  at('2026-10-08T01:00:00');
  const row = await today('open-night');
  assert.equal(row.sessionId, session.id);
  assert.equal(row.open, true);
  assert.equal(row.date, '2026-10-07');
  assert.equal(row.sessionCount, 1);
});

test('Today keeps a forgotten overnight checkout after the 16-hour boundary without inventing an exit', async () => {
  person('forgot-night');
  at('2026-10-07T21:55:00');
  store.setSheet('forgot-night', '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } }, null, null);
  const estimate = store.getSheet('forgot-night', '2026-10');
  const session = (await punch('forgot-night', 'in')).openSession;
  at('2026-10-08T13:55:00');
  const boundary = await today('forgot-night');
  assert.equal(boundary.open, true);
  at('2026-10-08T13:55:59');
  assert.equal((await today('forgot-night')).open, true);
  at('2026-10-08T13:56:00');
  const row = await today('forgot-night');
  assert.equal(row.sessionId, session.id);
  assert.equal(row.kind, 'pending');
  assert.equal(row.reason, 'forgot-out');
  assert.equal(row.sessionCount, 1);
  assert.equal(row.open, false);
  assert.equal(row.presOut, null);
  assert.equal(row.out, null);
  assert.equal(row.presIn, iso('2026-10-07T21:55:00'));
  assert.equal(store.getSession(session.id).entry.presOut, undefined);
  const log = store.sessionPunches(session.id);
  assert.equal(log.length, 2);
  assert.equal(log[1].auto, 1);
  assert.deepEqual(await today('forgot-night'), row);
  assert.equal(store.sessionPunches(session.id).length, 2);
  assert.deepEqual(store.getSheet('forgot-night', '2026-10'), estimate);
});

test('Today keeps a forgotten night across month end while monthly history keeps its start date', async () => {
  person('month-night');
  at('2026-10-31T21:55:00');
  const session = (await punch('month-night', 'in')).openSession;
  at('2026-11-01T14:00:00');
  const row = await today('month-night');
  assert.equal(row.sessionId, session.id);
  assert.equal(row.reason, 'forgot-out');
  assert.equal(row.sessionCount, 1);
  assert.equal(row.date, '2026-10-31');
  assert.equal(store.listSessions({ username: 'month-night', month: '2026-10' }).length, 1);
  assert.equal(store.listSessions({ username: 'month-night', month: '2026-11' }).length, 0);
});

test('Forgotten sessions stay in history but do not become a daily phantom check-in', async () => {
  person('old-night');
  at('2026-10-07T21:55:00');
  const session = (await punch('old-night', 'in')).openSession;
  at('2026-10-08T14:00:00');
  await today('old-night');
  at('2026-10-09T14:00:00');
  const row = await today('old-night');
  assert.equal(row.sessionId, null);
  assert.equal(row.sessionCount, 0);
  assert.equal(store.getSession(session.id).entry.reason, 'forgot-out');
});

test('A newly opened shift takes precedence and Today counts the forgotten carryover once', async () => {
  person('next-night');
  at('2026-10-07T21:55:00');
  const first = (await punch('next-night', 'in')).openSession;
  at('2026-10-08T14:00:00');
  await today('next-night');
  at('2026-10-08T21:55:00');
  const second = (await punch('next-night', 'in')).openSession;
  const row = await today('next-night');
  assert.equal(row.sessionId, second.id);
  assert.equal(row.open, true);
  assert.equal(row.sessionCount, 2);
  assert.equal(store.getSession(first.id).entry.reason, 'forgot-out');
});

test('A confirmed checkout replaces the forgotten warning with real checkout time', async () => {
  person('confirm-night');
  at('2026-10-07T21:55:00');
  const session = (await punch('confirm-night', 'in')).openSession;
  at('2026-10-08T14:00:00');
  await today('confirm-night');
  const current = store.getSession(session.id);
  // Lượt được xác nhận giờ ra thật: không có route tạo nên dựng thẳng trong store
  const entry = { ...current.entry, kind: 'work', presOut: iso('2026-10-08T07:00:00') };
  delete entry.reason;
  assert.ok(store.updateSession(session.id, current.version, { date: current.date, state: 'closed', entry }));
  const row = await today('confirm-night');
  assert.equal(row.sessionId, session.id);
  assert.equal(row.kind, 'work');
  assert.notEqual(row.reason, 'forgot-out');
  assert.equal(row.out, '07:00');
  assert.equal(row.sessionCount, 1);
});

test('Discovering an old unassigned session does not make it presence today', async () => {
  person('late-discovery', null);
  at('2026-10-07T20:00:00');
  const session = await openOutsideShift('late-discovery', '2026-10-07T20:00:00', { extraOut: '21:00' });
  at('2026-10-10T09:00:00');
  const row = await today('late-discovery');
  assert.equal(row.sessionId, null);
  assert.equal(row.sessionCount, 0);
  assert.equal(store.getSession(session.id).entry.reason, 'forgot-out');
  assert.equal(store.getSession(session.id).entry.presOut, undefined);
});

test('An unassigned overnight session remains visible on its expiry day', async () => {
  person('unassigned-night', null);
  at('2026-10-07T20:00:00');
  const session = await openOutsideShift('unassigned-night', '2026-10-07T20:00:00', { extraOut: '21:00' });
  at('2026-10-08T13:00:00');
  const row = await today('unassigned-night');
  assert.equal(row.sessionId, session.id);
  assert.equal(row.reason, 'forgot-out');
  assert.equal(row.sessionCount, 1);
  assert.equal(row.presOut, null);
});

test('An expiry exactly at midnight belongs to the new day', async () => {
  person('midnight-expiry', null);
  at('2026-10-07T07:59:30');
  const session = await openOutsideShift('midnight-expiry', '2026-10-07T07:59:30', { extraIn: '07:00' });
  at('2026-10-07T23:59:59');
  assert.equal((await today('midnight-expiry')).open, true);
  at('2026-10-08T00:00:00');
  const row = await today('midnight-expiry');
  assert.equal(row.sessionId, session.id);
  assert.equal(row.reason, 'forgot-out');
  assert.equal(row.sessionCount, 1);
  assert.equal(row.open, false);
});

test('An edit to a completed historical session does not count as presence today', async () => {
  person('historical-edit');
  at('2026-10-10T09:00:00');
  // Lượt lịch sử đã đóng: không có route tạo nên dựng thẳng trong store
  store.createSession('historical-edit', '2026-10-07', 'closed', {
    kind: 'work',
    src: 'admin',
    presIn: iso('2026-10-07T22:00:00'),
    presOut: iso('2026-10-08T07:00:00')
  });
  const row = await today('historical-edit');
  assert.equal(row.sessionId, null);
  assert.equal(row.sessionCount, 0);
});
