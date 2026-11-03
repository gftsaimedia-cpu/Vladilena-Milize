require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'profile-calendar-regression-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');
let base;
const dates = ['2026-10-10', '2026-10-17'];
const work = { kind: 'work', in: '08:00', out: '17:00' };

async function call(method?, route?, who?, body?) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(who), 86400) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function save(days?) {
  return await call('PUT', '/sheet', 'worker', { month: '2026-10', days });
}
async function changeToCtv(kind = 'isat') {
  const saved = await save(Object.fromEntries(dates.map(date => [date, { kind }])));
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const changed = await call('PUT', '/staff/worker', 'admin', {
    name: 'Worker',
    role: 'staff',
    type: 'ctv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01'
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await store.getStaff('worker')).type, 'ctv');
}
before(async () => {
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of [
    'punch_requests',
    'corrections',
    'punches',
    'attendance_sessions',
    'attendance_days',
    'timesheets',
    'staff',
    'settings'
  ])
    await store.db.exec('DELETE FROM ' + table);
  for (const [username, role] of [
    ['admin', 'admin'],
    ['worker', 'staff']
  ]) {
    await store.upsertStaff({
      username,
      name: username,
      role,
      type: 'nv',
      level: 1,
      shiftCode: 'n1',
      startDate: '2026-01-01',
      passHash: 'unused-in-cookie-auth-tests'
    });
  }
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// Từ chối một iSAT đã lưu, chưa sửa không được cản việc gỡ một ngày cũ khác.
test('CTV can remove two saved iSAT dates one at a time after changing from NV', async () => {
  await changeToCtv();
  const first = await save({ [dates[1]]: { kind: 'isat' } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, { [dates[1]]: { kind: 'isat' } });
  assert.equal((await save({})).status, 200);
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, {});
});

test('CTV can turn an old iSAT into work while another saved iSAT remains', async () => {
  await changeToCtv();
  const result = await save({ [dates[0]]: work, [dates[1]]: { kind: 'isat' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const days = (await store.getSheet('worker', '2026-10')).days;
  assert.equal(days[dates[0]].kind, 'work');
  assert.equal(days[dates[1]].kind, 'isat');
});

test('CTV can edit a valid workday without deleting untouched historical iSAT', async () => {
  await changeToCtv();
  const result = await save({ ...(await store.getSheet('worker', '2026-10')).days, '2026-10-19': work });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const days = (await store.getSheet('worker', '2026-10')).days;
  assert.equal(days['2026-10-19'].kind, 'work');
  assert.equal(days[dates[0]].kind, 'isat');
  assert.equal(days[dates[1]].kind, 'isat');
});

test('CTV cannot copy historical iSAT to a new date', async () => {
  await changeToCtv();
  const original = await store.getSheet('worker', '2026-10');
  const result = await save({ ...original.days, '2026-10-24': { kind: 'isat' } });
  assert.equal(result.status, 400);
  assert.deepEqual(await store.getSheet('worker', '2026-10'), original);
});

test('CTV cannot restore an iSAT date after deleting it', async () => {
  await changeToCtv();
  assert.equal((await save({})).status, 200);
  const result = await save({ [dates[0]]: { kind: 'isat' } });
  assert.equal(result.status, 400);
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, {});
});

test('CTV changing a historical iSAT into a new approved leave kind saves with a BENEFIT_NOT_ALLOWED warning', async () => {
  await changeToCtv();
  const original = await store.getSheet('worker', '2026-10');
  const result = await save({ ...original.days, [dates[0]]: { kind: 'approved' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.ok(
    result.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(result.data.warnings)
  );
  assert.equal((await store.getSheet('worker', '2026-10')).days[dates[0]].kind, 'approved');
});

test('CTV can remove saved approved leave one date at a time after changing from NV', async () => {
  await changeToCtv('approved');
  const result = await save({ [dates[1]]: { kind: 'approved' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, { [dates[1]]: { kind: 'approved' } });
});
