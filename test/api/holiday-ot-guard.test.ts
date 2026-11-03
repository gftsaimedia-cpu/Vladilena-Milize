require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'holiday-ot-guard-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const punch = require('../../src/engine/punch');
const server = require('../helpers/server');
let base;
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();
async function person(username = 'worker', overrides: any = {}) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass'),
    ...overrides
  });
}
async function call(method?, route?, body?, who = 'admin') {
  const r = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(who), 86400) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: r.status, data: (await r.json()) as any };
}
function attendance(date?, options: any = {}) {
  const code = options.code || 'n1',
    plan = punch.planShift({ shiftCode: code, sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = punch.buildDay(
    { shiftCode: code },
    T(date, options.in || '08:00'),
    T(options.outDate || date, options.out || '21:00'),
    'punch',
    { plannedShift: plan, approveIncomplete: true }
  ).entry;
  return store.createSession(options.username || 'worker', date, 'closed', { ...entry, ...options.entry });
}
async function declare(date?, { approve = true, out = '21:00' }: any = {}) {
  const s = await attendance(date);
  let r = await call('POST', '/ot', { sessionId: s.id, version: 1, extraOut: out, reason: 'Confirmed extra work' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (approve) {
    r = await call('PUT', '/ot', { sessionId: s.id, version: 2, action: 'approve' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return store.getSession(s.id);
}
const conflictOf = (r?) => (r.data.warnings || []).find(w => w.code === 'HOLIDAY_OT_CONFLICT');
async function snapshot() {
  return Object.fromEntries(
    await Promise.all(
      ['attendance_sessions', 'corrections', 'punches', 'timesheets', 'settings'].map(async table => [
        table,
        await store.db.prepare('SELECT * FROM ' + table + ' ORDER BY ctid').all()
      ])
    )
  );
}
const work = (extraKind = '', extraOut = '') => ({ kind: 'work', in: '08:00', out: '17:00', extraKind, extraOut });
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
  await person('admin', { role: 'admin', type: 'tts', level: 0 });
  await person();
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
  test(`API refuses iSAT on weekday ${date} without changing the estimate`, async () => {
    await store.setSheet('worker', '2026-10', { '2026-10-03': { kind: 'isat' } });
    const before = await snapshot();
    const r = await call('PUT', '/sheet', { month: '2026-10', days: { [date]: { kind: 'isat' } } }, 'worker');
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.match(r.data.error, /iSAT.*[Bb]ảy/);
    assert.deepEqual(await snapshot(), before);
  });
}
test('NV Saturday iSAT remains accepted; new non-NV iSAT and Sunday remain refused', async () => {
  const save = (date?) => call('PUT', '/sheet', { month: '2026-10', days: { [date]: { kind: 'isat' } } }, 'worker');
  assert.equal((await save('2026-10-03')).status, 200);
  assert.equal((await save('2026-10-04')).status, 400);
  for (const type of ['ctv', 'tts']) {
    await person('worker', { type });
    assert.equal((await save('2026-10-10')).status, 400);
  }
});
for (const approve of [true, false]) {
  test(`holiday change over ${approve ? 'approved' : 'pending'} actual OT saves and warns HOLIDAY_OT_CONFLICT`, async () => {
    const s = await declare('2026-10-07', { approve, out: '19:00' });
    const r = await call('PUT', '/holidays', { dates: ['2026-10-07', '2026-10-08'] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
    assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
  });
}
// 7 ngày × 4 giờ OT = 28 giờ
const OT_DAYS = ['2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
test('holiday change over an actual monthly total above 40 hours saves and warns HOLIDAY_OT_CONFLICT', async () => {
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-05']) await attendance(date, { out: '17:00' });
  for (const date of ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) await declare(date);
  const r = await call('PUT', '/holidays', { dates: ['2026-10-01', '2026-10-02', '2026-10-05'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
  assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
});
test('exactly 40 actual hours remains valid and estimate hours are not added to it', async () => {
  // 9 giờ ngày lễ (08:00–17:00, không trừ nghỉ) + 7 ngày OT 4 giờ + OT 3 giờ
  await attendance('2026-10-01', { out: '17:00' });
  for (const date of OT_DAYS) await declare(date);
  await declare('2026-10-12', { out: '20:00' });
  await store.setSheet('worker', '2026-10', {
    '2026-10-01': work(),
    ...Object.fromEntries(OT_DAYS.map(date => [date, work('ot', '21:00')])),
    '2026-10-12': work('ot', '20:00')
  });
  assert.equal((await call('PUT', '/holidays', { dates: ['2026-10-01'] })).status, 200);
  assert.deepEqual(await store.getSetting('holidays', []), ['2026-10-01']);
});
test('rejecting pending OT permits a holiday change without erasing rejection history', async () => {
  const s = await declare('2026-10-07', { approve: false, out: '19:00' });
  assert.equal(
    (await call('PUT', '/ot', { sessionId: s.id, version: s.version, action: 'reject', note: 'Day will be a holiday' }))
      .status,
    200
  );
  const history = await store.getSession(s.id);
  assert.equal((await call('PUT', '/holidays', { dates: ['2026-10-07'] })).status, 200);
  assert.deepEqual(await store.getSession(s.id), history);
});
for (const extraKind of ['ot', 'makeup']) {
  test(`holiday change over ${extraKind} in an estimate saves and warns HOLIDAY_OT_CONFLICT`, async () => {
    await store.setSheet('worker', '2026-10', { '2026-10-07': work(extraKind, '19:00') });
    const r = await call('PUT', '/holidays', { dates: ['2026-10-07'] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
    assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
  });
}
test('holiday change raising an estimate from 36 to 45 combined hours saves and warns', async () => {
  const days = ['02', '03', '05', '06', '07', '08', '09', '12', '13'].map(d => ['2026-10-' + d, work('ot', '21:00')]);
  await store.setSheet('worker', '2026-10', Object.fromEntries(days.concat([['2026-10-01', work()]])));
  const r = await call('PUT', '/holidays', { dates: ['2026-10-01'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
  assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
});
test('next-month holiday warns for the actual night shift in the preceding month', async () => {
  const septemberOt = ['01', '02', '03', '04', '05', '07', '08', '09', '10'].map(d => '2026-09-' + d);
  for (const date of septemberOt) await declare(date);
  await attendance('2026-09-30', { code: 'g1', in: '21:00', outDate: '2026-10-01', out: '06:00' });
  const r = await call('PUT', '/holidays', { dates: ['2026-10-01'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
  assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
});
test('next-month holiday warns for the estimate whose night shift starts in the previous month', async () => {
  const septemberOt = ['01', '02', '03', '04', '05'].map(d => ['2026-09-' + d, work('ot', '21:00')]);
  await store.setSheet('worker', '2026-09', {
    ...Object.fromEntries(septemberOt),
    '2026-09-28': work('ot', '21:00'),
    '2026-09-29': work('ot', '21:00'),
    '2026-09-30': { kind: 'work', in: '21:00', out: '06:00' }
  });
  await store.setSetting('holidays', ['2026-09-28']);
  const r = await call('PUT', '/holidays', { dates: ['2026-09-28', '2026-10-01'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
  assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
});
test('multiple attendance sessions for one holiday shift consume its budget once', async () => {
  await attendance('2026-10-01', { in: '08:00', out: '12:00' });
  await attendance('2026-10-01', { in: '13:00', out: '17:00' });
  for (const date of OT_DAYS) await declare(date);
  await declare('2026-10-12', { out: '20:00' }); // 9 giờ ngày lễ tính một lần + 28 + 3 = 40
  assert.equal((await call('PUT', '/holidays', { dates: ['2026-10-01'] })).status, 200);
});
test('unrelated legacy conflicts do not block holidays, and removing holidays can improve them', async () => {
  await store.setSetting('holidays', ['2026-10-01', '2026-10-02']);
  await store.setSheet('worker', '2026-10', {
    '2026-10-01': work(),
    '2026-10-02': work(),
    '2026-10-03': work('ot', '21:00')
  });
  assert.equal((await call('PUT', '/holidays', { dates: ['2026-10-01', '2026-10-02', '2026-12-25'] })).status, 200);
  assert.equal((await call('PUT', '/holidays', { dates: ['2026-10-01'] })).status, 200);
});
test('guard checks other staff and later months, saving the new setting with a warning', async () => {
  await person('other');
  await store.setSheet('other', '2027-01', { '2027-01-05': work('ot', '19:00') });
  const r = await call('PUT', '/holidays', { dates: ['2026-12-25', '2027-01-05'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(conflictOf(r), JSON.stringify(r.data.warnings));
  assert.equal((await store.getSetting('holidays', [])).length, r.data.dates.length, 'ngày lễ đã lưu');
});
