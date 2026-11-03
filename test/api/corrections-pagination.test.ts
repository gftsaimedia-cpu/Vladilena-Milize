require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'corrections-pagination-tests';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');
let base;

async function person(username?, role = 'staff') {
  await store.upsertStaff({
    username,
    name: username,
    role,
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    passHash: auth.hashPassword('test-pass')
  });
}
async function correction(username?, session?, status = 'pending') {
  const decided = status === 'approved' || status === 'rejected';
  return Number(
    (
      await store.db
        .prepare(
          `INSERT INTO corrections
    (username,date,req_in,req_out,reason,status,decided_by,decided_at,created_at,context_json,session_id,session_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          username,
          session.date,
          session.entry.presIn,
          session.entry.presOut,
          'Pagination fixture',
          status,
          decided ? 'admin' : null,
          decided ? '2026-10-20T00:00:00.000Z' : null,
          '2026-10-20T00:00:00.000Z',
          '{}',
          session.id,
          session.version
        )
    ).lastInsertRowid
  );
}
async function session(username?, index?) {
  const start = new Date(Date.parse('2026-10-01T01:00:00.000Z') + index * 45 * 60000);
  const end = new Date(start.getTime() + 30 * 60000);
  const day = new Date(start.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  return await store.createSession(username, day, 'closed', {
    kind: 'pending',
    reason: 'needs-review',
    src: 'admin',
    presIn: start.toISOString(),
    presOut: end.toISOString()
  });
}
async function get(username?, route?) {
  const response = await fetch(base + '/api' + route, {
    headers: { Cookie: auth.cookieHeader(await auth.createSession(username), 86400) }
  });
  return { status: response.status, data: (await response.json()) as any };
}
before(async () => {
  await person('admin', 'admin');
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// Lịch sử của một phiên không được mất khi người đó có hơn 500 bản sửa mới hơn (không lọc sau khi đã cắt 500 dòng).
test('session history and sheet retain old records after more than 500 newer corrections', async () => {
  await person('history');
  const target = await session('history', 0);
  const oldest = await correction('history', target, 'replaced');
  const middle = await correction('history', target, 'rejected');
  const newest = await correction('history', target, 'approved');
  await store.transaction(async () => {
    for (let i = 1; i <= 501; i++) await correction('history', await session('history', i), 'approved');
  });
  const result = await get('history', '/sheet?month=2026-10');
  assert.equal(result.status, 200);
  const item = result.data.attendanceSessions.find(s => s.id === target.id);
  assert.deepEqual(
    item.corrections.map(c => c.id),
    [newest, middle, oldest]
  );
  assert.equal(result.data.corrections.length, 504);
  assert.deepEqual(
    (await store.listCorrections({ username: 'history', sessionId: target.id, limit: 2 })).map(c => c.id),
    [newest, middle]
  );
});

// GET/POST/PUT /api/corrections không có chính sách quyền nên bị từ chối mặc định;
// bảng corrections và lịch sử vẫn đọc được qua /sheet (test trên)
test('removed correction routes are denied by default and team rows carry no pending count', async () => {
  for (const [method, route] of [
    ['GET', '/corrections'],
    ['POST', '/corrections'],
    ['PUT', '/corrections/1']
  ]) {
    const response = await fetch(base + '/api' + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: auth.cookieHeader(await auth.createSession('admin'), 86400)
      },
      body: method === 'GET' ? undefined : '{}'
    });
    assert.equal(response.status, 403, method + ' ' + route);
    assert.equal(((await response.json()) as any).code, 'NO_ROUTE_POLICY');
  }
  const team = await get('admin', '/team?month=2026-10');
  assert.equal(team.status, 200);
  assert.ok(team.data.rows.every(r => !Object.hasOwn(r, 'pendingCorrections')));
});
