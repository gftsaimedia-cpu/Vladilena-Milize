// Route HTTP thật và SQLite trong RAM; không bao giờ nạp DB của người dùng.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'server-logic-isolated-tests';
process.env.COOKIE_SECURE = '0';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');
const sessionBody = require('../helpers/session-contract-helper');
let base, clock;
const realNow = Date.now;
const at = (local?) => {
  clock = Date.parse(local + '+07:00');
};
async function person(username?, shiftCode = 'n1') {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode,
    passHash: auth.hashPassword('test-pass')
  });
}
async function call(user?, method?, route?, body?) {
  body = await sessionBody(store, user, method, route, body);
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(user), 86400) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function checkIn(user?, time?) {
  await at(time);
  const result = await call(user, 'POST', '/punch', { type: 'in' });
  assert.equal(result.status, 200, JSON.stringify(result.data));
}
before(async () => {
  await at('2026-10-07T22:00:00');
  Date.now = () => clock;
  await store.upsertStaff({
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: auth.hashPassword('test-pass')
  });
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

test('today and punch state retain the overnight shift after checkout', async () => {
  await person('night-complete', 'g2');
  await checkIn('night-complete', '2026-10-07T22:00:00');
  await at('2026-10-08T07:00:00');
  const checkedOut = await call('night-complete', 'POST', '/punch', { type: 'out' });
  assert.equal(checkedOut.status, 200);
  const today = (await call('admin', 'GET', '/today')).data.rows.find(row => row.username === 'night-complete');
  assert.equal(today.date, '2026-10-07');
  assert.equal(today.open, false);
  assert.equal(today.in, '22:00');
  assert.equal(today.out, '07:00');
  assert.equal(today.kind, 'work');
  assert.equal(checkedOut.data.date, '2026-10-07');
  assert.deepEqual(checkedOut.data.done, { in: '22:00', out: '07:00' });
  await at('2026-10-09T07:00:00');
  const next = (await call('admin', 'GET', '/today')).data.rows.find(row => row.username === 'night-complete');
  assert.equal(next.date, '2026-10-09');
  assert.equal(next.in, null);
});

test('calendar dates reject February overflow before writing estimates', async () => {
  await person('bad-dates');
  await at('2026-10-07T22:00:00');
  for (const date of ['2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31']) {
    assert.equal(
      (
        await call('bad-dates', 'PUT', '/sheet', {
          month: date.slice(0, 7),
          days: { [date]: { kind: 'work', in: '08:00', out: '17:00' } }
        })
      ).status,
      400,
      date
    );
    assert.deepEqual((await store.getSheet('bad-dates', date.slice(0, 7))).days, {});
  }
  assert.equal(
    (
      await call('bad-dates', 'PUT', '/sheet', {
        month: '2028-02',
        days: { '2028-02-29': { kind: 'work', in: '08:00', out: '17:00' } }
      })
    ).status,
    200
  );
});

test('calendar dates reject impossible holidays and staff metadata', async () => {
  await at('2026-10-07T22:00:00');
  assert.equal((await call('admin', 'PUT', '/holidays', { dates: ['2027-02-29'] })).status, 400);
  for (const field of ['startDate', 'birthday']) {
    assert.equal(
      (
        await call('admin', 'PUT', '/staff/bad-metadata', {
          name: 'Test',
          role: 'staff',
          type: 'nv',
          level: 1,
          password: 'test-pass',
          [field]: '2026-02-31'
        })
      ).status,
      400
    );
    assert.equal(await store.getStaff('bad-metadata'), undefined);
  }
});

test('months reject non-string payloads before any sheet write', async () => {
  await person('bad-month');
  for (const month of ['2026-00', '2026-13', '0000-10', '0999-10', ['2026-10']]) {
    assert.equal((await call('bad-month', 'PUT', '/sheet', { month, days: {} })).status, 400);
  }
  assert.deepEqual(await store.listSheets('bad-month'), []);
});

test('staff levels reject fractions and values outside the type level set', async () => {
  for (const level of [1.5, 0, -1, 5, '1e309']) {
    assert.equal(
      (
        await call('admin', 'PUT', '/staff/bad-level', {
          name: 'Test',
          role: 'staff',
          type: 'nv',
          level,
          password: 'test-pass'
        })
      ).status,
      400,
      String(level)
    );
    assert.equal(await store.getStaff('bad-level'), undefined);
  }
  assert.equal(
    (
      await call('admin', 'PUT', '/staff/good-level', {
        name: 'Test',
        role: 'staff',
        type: 'nv',
        level: 4,
        password: 'test-pass',
        startDate: '2026-01-01'
      })
    ).status,
    200
  );
});

test('monthly holiday cap counts the holiday portion after midnight and refuses the save above 40 hours', async () => {
  await person('holiday-cap-next', 'g2');
  // Mỗi ca đêm bắt đầu ngày thường và kéo sang ngày lễ liền sau: 00:00–07:00 = 7 giờ ngày lễ
  await store.setSetting('holidays', [
    '2026-10-06',
    '2026-10-08',
    '2026-10-10',
    '2026-10-13',
    '2026-10-15',
    '2026-10-17'
  ]);
  const days = Object.fromEntries(
    ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14'].map(date => [
      date,
      { kind: 'work', in: '22:00', out: '07:00' }
    ])
  );
  assert.equal((await call('holiday-cap-next', 'PUT', '/sheet', { month: '2026-10', days })).status, 200);
  const original = await store.getSheet('holiday-cap-next', '2026-10');
  days['2026-10-16'] = { kind: 'work', in: '22:00', out: '07:00' };
  assert.equal((await call('holiday-cap-next', 'PUT', '/sheet', { month: '2026-10', days })).status, 400);
  assert.deepEqual(await store.getSheet('holiday-cap-next', '2026-10'), original);
});

test('monthly holiday cap excludes normal hours after a holiday night crosses midnight', async () => {
  await person('holiday-cap-start', 'g2');
  // 5 ca × 2 giờ ngày lễ (22:00–24:00) = 10 giờ; tính cả ca 22:00–07:00 sẽ là 5 × 9 = 45 giờ
  const dates = ['2026-10-01', '2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'];
  await store.setSetting('holidays', dates);
  const days = Object.fromEntries(dates.map(date => [date, { kind: 'work', in: '22:00', out: '07:00' }]));
  const result = await call('holiday-cap-start', 'PUT', '/sheet', { month: '2026-10', days });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(Object.keys((await store.getSheet('holiday-cap-start', '2026-10')).days).length, 5);
});

test('holiday date validation uses the same supported calendar years as payroll', async () => {
  const original = await store.getSetting('holidays', []);
  for (const date of ['0000-12-31', '0999-12-31']) {
    assert.equal((await call('admin', 'PUT', '/holidays', { dates: [date] })).status, 400);
    assert.deepEqual(await store.getSetting('holidays', []), original);
  }
});

test('monthly holiday cap includes worked hours on a Sunday holiday reached overnight', async () => {
  await person('holiday-cap-sunday', 'g2');
  await store.setSetting('holidays', [
    '2026-10-04',
    '2026-10-06',
    '2026-10-08',
    '2026-10-11',
    '2026-10-18',
    '2026-10-25'
  ]);
  // 4 ca thứ Bảy kéo sang Chủ nhật lễ = 4 × 7 = 28 giờ; thêm 2 ca ngày thường kéo sang ngày lễ = 42 giờ
  const night = { kind: 'work', in: '22:00', out: '07:00' };
  const days = Object.fromEntries(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24'].map(date => [date, night]));
  assert.equal((await call('holiday-cap-sunday', 'PUT', '/sheet', { month: '2026-10', days })).status, 200);
  const original = await store.getSheet('holiday-cap-sunday', '2026-10');
  days['2026-10-05'] = night;
  days['2026-10-07'] = night;
  assert.equal((await call('holiday-cap-sunday', 'PUT', '/sheet', { month: '2026-10', days })).status, 400);
  assert.deepEqual(await store.getSheet('holiday-cap-sunday', '2026-10'), original);
});
