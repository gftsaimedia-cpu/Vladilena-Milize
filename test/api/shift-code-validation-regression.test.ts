require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'shift-code-validation-regression-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');
const PunchRules = require('../../src/engine/punch');
let base;
const originalNow = Date.now;
const tables = [
  'punch_requests',
  'corrections',
  'punches',
  'attendance_sessions',
  'attendance_days',
  'timesheets',
  'staff',
  'settings'
];
const profile = {
  name: 'Updated worker',
  role: 'staff',
  type: 'nv',
  level: 1,
  nightPct: 40,
  shiftCode: 'n1',
  startDate: '2026-01-01'
};

async function snapshot() {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async table => [table, await store.db.prepare('SELECT * FROM ' + table + ' ORDER BY ctid').all()])
    )
  );
}
async function call(method?, route?, body?) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: auth.cookieHeader(await auth.createSession('admin'), 86400)
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function assertRejected(result?, previous?) {
  assert.deepEqual(await snapshot(), previous, 'Rejected shift input must not change stored data');
  assert.equal(result.status, 400, JSON.stringify(result.data));
  assert.ok(result.data.error);
}

before(async () => {
  Date.now = () => Date.parse('2026-10-08T20:00:00+07:00');
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of tables) await store.db.exec('DELETE FROM ' + table);
  for (const [username, role] of [
    ['admin', 'admin'],
    ['worker', 'staff']
  ]) {
    await store.upsertStaff({ ...profile, username, name: username, role, passHash: auth.hashPassword('test-pass') });
  }
  await store.setSheet('worker', '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } });
});
after(async () => {
  Date.now = originalNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

for (const shiftCode of [['n1'], ['g2']]) {
  test(`staff rejects array shift ${JSON.stringify(shiftCode)} with 400 and no writes`, async () => {
    const previous = await snapshot();
    const result = await call('PUT', '/staff/worker', { ...profile, shiftCode });
    await assertRejected(result, previous);
  });
}

test('staff rejects an unknown nonempty shift without clearing the assigned shift', async () => {
  const previous = await snapshot();
  const result = await call('PUT', '/staff/worker', { ...profile, shiftCode: 'invalid' });
  await assertRejected(result, previous);
});

// Lưu hồ sơ chỉ kiểm mã ca hợp lệ (không có sửa giờ Check-in/out)
for (const shiftCode of ['n1', 'n2', 'f1', 'f2', 'g1', 'g2']) {
  test(`valid shift ${shiftCode} still updates staff`, async () => {
    const estimate = await store.getSheet('worker', '2026-10');
    const updated = await call('PUT', '/staff/worker', { ...profile, shiftCode });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal((await store.getStaff('worker')).shiftCode, PunchRules.canonicalOf(shiftCode)); // hồ sơ lưu mã ca của danh mục
    assert.deepEqual(await store.getSheet('worker', '2026-10'), estimate);
  });
}

for (const [label, shiftCode] of [
  ['null', null],
  ['empty string', ''],
  ['omitted', undefined]
]) {
  test(`staff ${label} shift preserves the unassigned-shift path`, async () => {
    const result = await call('PUT', '/staff/worker', { ...profile, shiftCode });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal((await store.getStaff('worker')).shiftCode, null);
  });
}
