require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'api-input-validation-tests';
const { test, before, beforeEach, after } = require('node:test');
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
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass')
  });
}
async function snapshot() {
  return Object.fromEntries(
    await Promise.all(
      [
        'staff',
        'timesheets',
        'settings',
        'attendance_days',
        'attendance_sessions',
        'punches',
        'corrections',
        'punch_requests'
      ].map(async table => [table, await store.db.prepare('SELECT * FROM ' + table + ' ORDER BY ctid').all()])
    )
  );
}
async function call(method?, route?, { who = 'admin', cookie, body }: any = {}) {
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (cookie !== undefined) headers.Cookie = cookie;
  else if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json()) as any };
}
const profile = {
  name: 'Updated worker',
  role: 'staff',
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  startDate: '2026-01-01'
};

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
  await person('admin', 'admin');
  await person('worker');
  await store.setSheet('worker', '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } });
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

for (const [label, signature] of [
  ['non-ASCII signature with 43 characters and 86 bytes', 'é'.repeat(43)],
  ['mixed signature with 43 characters and 44 bytes', 'a'.repeat(42) + 'é'],
  ['forged ASCII signature of the correct length', 'a'.repeat(43)],
  ['short signature', 'a'],
  ['long signature', 'a'.repeat(44)]
]) {
  test(`malformed session cookie: ${label} is unauthenticated without changing data`, async () => {
    const previous = await snapshot();
    const r = await call('GET', '/sheet?month=2026-10', { cookie: 'luong_sid=abc.' + signature });
    assert.equal(r.status, 401, JSON.stringify(r.data));
    assert.ok(r.data.error);
    assert.deepEqual(await snapshot(), previous);
    assert.equal((await call('GET', '/sheet?month=2026-10', { who: 'worker' })).status, 200);
  });
}

test('valid signed cookies still identify the intended account', async () => {
  const r = await call('GET', '/me', { who: 'worker' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.username, 'worker');
  assert.equal(r.data.user.role, 'staff');
});

for (const method of ['PUT']) {
  for (const encoded of ['%E0%A4%A', '%FF']) {
    test(`${method} staff refuses malformed username encoding ${encoded} with 400 and no writes`, async () => {
      const previous = await snapshot();
      const r = await call(method, '/staff/' + encoded, { body: method === 'PUT' ? profile : undefined });
      assert.equal(r.status, 400, JSON.stringify(r.data));
      assert.ok(r.data.error);
      assert.deepEqual(await snapshot(), previous);
    });
  }
  for (const [who, status] of [
    [null, 401],
    ['worker', 403]
  ]) {
    test(`${method} staff keeps authorization ahead of username decoding for ${who || 'anonymous'}`, async () => {
      const previous = await snapshot();
      const r = await call(method, '/staff/%E0%A4%A', { who, body: method === 'PUT' ? profile : undefined });
      assert.equal(r.status, status, JSON.stringify(r.data));
      assert.deepEqual(await snapshot(), previous);
    });
  }
  test(`${method} staff still refuses a decoded invalid username without writes`, async () => {
    const previous = await snapshot();
    const r = await call(method, '/staff/%C3%A9', { body: method === 'PUT' ? profile : undefined });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.deepEqual(await snapshot(), previous);
  });
}

test('valid encoded username still updates the intended staff account', async () => {
  const r = await call('PUT', '/staff/%77orker', { body: profile });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await store.getStaff('worker')).name, 'Updated worker');
  assert.equal((await store.getStaff('admin')).name, 'admin');
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' }
  });
});

test('Q5: valid encoded username locks the intended staff account and keeps its estimate', async () => {
  const r = await call('PUT', '/staff/%77orker', { body: { locked: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(await store.getStaff('worker'), 'tài khoản bị khoá vẫn còn');
  const list = (await call('GET', '/staff')).data.staff;
  assert.equal(list.find(s => s.username === 'worker').locked, true);
  assert.ok(!list.find(s => s.username === 'admin').locked, 'tài khoản khác không bị khoá');
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' }
  });
});

test('staff tax profile: defaults by group, saves contract / insurance / dependants and keeps them when an old form omits them', async () => {
  assert.deepEqual(
    [
      (await store.getStaff('worker')).contract,
      (await store.getStaff('worker')).insured,
      (await store.getStaff('worker')).dependants
    ],
    ['long', true, 0]
  );
  await store.upsertStaff({
    username: 'intern',
    name: 'intern',
    role: 'staff',
    type: 'tts',
    level: 1,
    passHash: auth.hashPassword('test-pass')
  });
  assert.deepEqual(
    [(await store.getStaff('intern')).contract, (await store.getStaff('intern')).insured],
    ['short', false]
  );
  const saved = await call('PUT', '/staff/worker', {
    body: { ...profile, contract: 'short', insured: true, dependants: 2 }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(
    [saved.data.staff.contract, saved.data.staff.insured, saved.data.staff.dependants],
    ['short', true, 2]
  );
  const oldForm = await call('PUT', '/staff/worker', { body: { ...profile, name: 'Renamed' } });
  assert.equal(oldForm.status, 200);
  assert.deepEqual(
    [oldForm.data.staff.contract, oldForm.data.staff.insured, oldForm.data.staff.dependants],
    ['short', true, 2]
  );
  const reset = await call('PUT', '/staff/worker', { body: { ...profile, contract: null, insured: null } });
  assert.deepEqual(
    [reset.data.staff.contract, reset.data.staff.insured],
    ['long', true],
    'null returns to the group default'
  );
});

test('staff tax profile rejects invalid contract, insurance flag and dependant counts without writing', async () => {
  for (const extra of [
    { contract: 'forever' },
    { contract: 3 },
    { insured: 'yes' },
    { dependants: -1 },
    { dependants: 1.5 },
    { dependants: 21 },
    { dependants: 'two' },
    { dependants: true },
    { dependants: [3] },
    { dependants: {} },
    { dependants: '0x2' },
    { dependants: '1e1' }
  ]) {
    const before = await snapshot();
    const r = await call('PUT', '/staff/worker', { body: { ...profile, ...extra } });
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.deepEqual(await snapshot(), before, JSON.stringify(extra));
  }
});

test('staff tax switches: default on, saved when sent, kept when an old form omits them, invalid values refused', async () => {
  const fresh = await store.getStaff('worker');
  assert.deepEqual([fresh.taxOn, fresh.deductOn, fresh.advanceOn], [true, true, true]);
  const saved = await call('PUT', '/staff/worker', {
    body: { ...profile, taxOn: false, deductOn: false, advanceOn: true }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(
    [saved.data.staff.taxOn, saved.data.staff.deductOn, saved.data.staff.advanceOn],
    [false, false, true]
  );
  const oldForm = await call('PUT', '/staff/worker', { body: { ...profile } });
  assert.deepEqual([oldForm.data.staff.taxOn, oldForm.data.staff.deductOn], [false, false]);
  for (const extra of [{ taxOn: 'no' }, { deductOn: 2 }, { advanceOn: [] }]) {
    const before = await snapshot();
    assert.equal(
      (await call('PUT', '/staff/worker', { body: { ...profile, ...extra } })).status,
      400,
      JSON.stringify(extra)
    );
    assert.deepEqual(await snapshot(), before);
  }
});

test('slip overrides: Admin only, validated, saved per person and month, cleared by empty values and kept when the account is locked', async () => {
  const route = '/slip-override?month=2026-10&user=worker';
  assert.deepEqual((await call('GET', route)).data.values, {});
  assert.equal((await call('GET', route, { who: 'worker' })).status, 403);
  assert.equal(
    (
      await call('PUT', '/slip-override', {
        who: 'worker',
        body: { user: 'worker', month: '2026-10', values: { tax: 0 }, reason: 'Điều chỉnh theo biên bản kiểm tra' }
      })
    ).status,
    403
  );
  const saved = await call('PUT', '/slip-override', {
    body: {
      user: 'worker',
      month: '2026-10',
      values: { workBase: 1234567.4, workDays: 20.456, tax: 0 },
      reason: 'Điều chỉnh theo biên bản kiểm tra'
    }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(saved.data.values, { workBase: 1234567, workDays: 20.46, tax: 0 });
  assert.equal(saved.data.updatedBy, 'admin');
  assert.deepEqual(
    (await call('GET', '/slip-override?month=2026-09&user=worker')).data.values,
    {},
    'other months untouched'
  );
  for (const body of [
    { user: 'worker', month: '2026-10', values: { password: 1 } },
    { user: 'worker', month: '2026-10', values: { tax: '5' } },
    { user: 'worker', month: '2026-10', values: { tax: -1 } },
    { user: 'worker', month: '2026-10', values: { workDays: 1e6 } },
    { user: 'worker', month: '2026-10', values: [1] },
    { user: 'worker', month: '10-2026', values: {} },
    { user: 'nobody', month: '2026-10', values: {} }
  ]) {
    const before = await store.getSlipOverride('worker', '2026-10');
    const withReason = { ...body, reason: 'Điều chỉnh theo biên bản kiểm tra' }; // có lý do để từ chối đúng vì nội dung sai, không phải vì thiếu lý do
    assert.ok(
      [400, 404].includes((await call('PUT', '/slip-override', { body: withReason })).status),
      JSON.stringify(body)
    );
    assert.deepEqual(await store.getSlipOverride('worker', '2026-10'), before);
  }
  assert.deepEqual(
    (
      await call('PUT', '/slip-override', {
        body: { user: 'worker', month: '2026-10', values: {}, reason: 'Bỏ hết số đã sửa trên phiếu' }
      })
    ).data.values,
    {},
    'empty values clear the overrides'
  );
  const longReason = await call('PUT', '/slip-override', {
    body: { user: 'worker', month: '2026-10', values: {}, reason: 'x'.repeat(301) }
  });
  assert.equal(longReason.status, 400, 'lý do quá dài bị từ chối');
  assert.equal(longReason.data.code, 'REASON_REQUIRED');
  const noReason = await call('PUT', '/slip-override', { body: { user: 'worker', month: '2026-10', values: {} } });
  assert.equal(noReason.status, 200, 'thiếu lý do vẫn lưu (lý do tuỳ chọn)');
  await store.setSlipOverride('worker', '2026-10', { tax: 1 }, 'admin');
  assert.equal((await call('PUT', '/staff/worker', { body: { locked: true } })).status, 200);
  assert.equal(
    (await store.db.prepare('SELECT COUNT(*) AS n FROM slip_overrides').get()).n,
    1,
    'Q5: khoá tài khoản giữ nguyên số sửa trên phiếu lương'
  );
  assert.deepEqual((await store.getSlipOverride('worker', '2026-10')).values, { tax: 1 });
});

test('iDorm is saved only for NV', async () => {
  for (const [type, expected] of [
    ['nv', true],
    ['ctv', false],
    ['tts', false]
  ]) {
    const r = await call('PUT', '/staff/worker', { body: { ...profile, type, idorm: true } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await store.getStaff('worker')).idorm, expected, type);
  }
});

test('job title: saved from the staff form, kept when omitted, trimmed and limited to 80 characters', async () => {
  assert.equal((await store.getStaff('worker')).jobTitle, '');
  const saved = await call('PUT', '/staff/worker', { body: { ...profile, jobTitle: '  15. NV C&B  ' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.staff.jobTitle, '15. NV C&B');
  assert.equal(
    (await call('PUT', '/staff/worker', { body: { ...profile } })).data.staff.jobTitle,
    '15. NV C&B',
    'old form keeps the title'
  );
  for (const bad of ['x'.repeat(81), 42, ['a']]) {
    const before = await snapshot();
    assert.equal((await call('PUT', '/staff/worker', { body: { ...profile, jobTitle: bad } })).status, 400);
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal(
    (await call('PUT', '/staff/worker', { body: { ...profile, jobTitle: '' } })).data.staff.jobTitle,
    '',
    'empty clears it'
  );
});
