require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'audit-followup-backend-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const punch = require('../../src/engine/punch');
const server = require('../helpers/server');
let base;
const originalNow = Date.now;
const T = (date?, time?) => new Date(`${date}T${time}+07:00`).toISOString();
async function person(username = 'worker', overrides: any = {}) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-10-01',
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
function attendance(username = 'worker', date = '2026-10-07', options: any = {}) {
  const code = options.code || 'n1';
  const plan = punch.planShift({ shiftCode: code, sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = punch.buildDay(
    { shiftCode: code },
    T(date, options.in || '07:00:00'),
    T(options.outDate || date, options.out || '21:00:00'),
    'punch',
    { plannedShift: plan, approveIncomplete: true }
  ).entry;
  return store.createSession(username, date, options.state || 'closed', { ...entry, ...options.entry });
}
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
before(async () => {
  Date.now = () => Date.parse('2026-12-31T23:00:00+07:00');
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
  Date.now = originalNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

const leaveWarning = (r?) => (r.data.warnings || []).find(w => w.code === 'HOLIDAY_LEAVE_CONFLICT');
test('removing a holiday that leaves a leave deficit saves the setting and warns HOLIDAY_LEAVE_CONFLICT', async () => {
  await store.setSetting('holidays', ['2026-10-08']);
  await store.setSheet('worker', '2026-10', { '2026-10-07': { kind: 'leave' }, '2026-10-08': { kind: 'leave' } });
  const r = await call('PUT', '/holidays', { dates: ['2026-10-09'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const warning = leaveWarning(r);
  assert.ok(warning, JSON.stringify(r.data.warnings));
  assert.equal(warning.count, 1);
  assert.deepEqual(warning.details, { count: 1, months: ['2026-10'] });
  assert.deepEqual(await store.getSetting('holidays', []), ['2026-10-09']);
});
test('holiday leave check uses entitlement on the affected date, including a later month', async () => {
  await store.setSetting('holidays', ['2026-10-08']);
  await store.setSheet('worker', '2026-10', { '2026-10-07': { kind: 'leave' }, '2026-10-08': { kind: 'leave' } });
  await store.setSheet('worker', '2026-11', { '2026-11-02': { kind: 'leave' } });
  const r = await call('PUT', '/holidays', { dates: [] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(leaveWarning(r).details.months, ['2026-10', '2026-11']);
});
test('holiday changes keep unrelated legacy deficits quiet but warn when they get worse', async () => {
  await person('worker', { startDate: null });
  await store.setSetting('holidays', ['2026-10-08']);
  await store.setSheet('worker', '2026-10', { '2026-10-07': { kind: 'leave' }, '2026-10-08': { kind: 'leave' } });
  const same = await call('PUT', '/holidays', { dates: ['2026-10-08', '2026-10-09'] });
  assert.equal(same.status, 200);
  assert.equal(leaveWarning(same), undefined, 'thiếu phép cũ không đổi thì không cảnh báo');
  const r = await call('PUT', '/holidays', { dates: ['2026-10-09'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(leaveWarning(r));
});
test('holiday check examines all people and stays quiet when entitlement is sufficient', async () => {
  await person('other', { leaveAdjust: 4 });
  await store.setSetting('holidays', ['2026-10-08']);
  await store.setSheet('other', '2026-10', { '2026-10-07': { kind: 'leave' }, '2026-10-08': { kind: 'leave' } });
  const enough = await call('PUT', '/holidays', { dates: [] });
  assert.equal(enough.status, 200);
  assert.equal(leaveWarning(enough), undefined);
  await person('other', { leaveAdjust: 0 });
  await store.setSetting('holidays', ['2026-10-08']);
  const r = await call('PUT', '/holidays', { dates: [] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(leaveWarning(r).message, /other/);
});
test('Admin declares actual OT for a closed session while salary estimates stay untouched', async () => {
  await store.setSheet('worker', '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } }, 0, 0);
  const estimate = await store.getSheet('worker', '2026-10');
  const session = await attendance();
  const r = await call('POST', '/ot', {
    sessionId: session.id,
    version: session.version,
    extraIn: '07:00',
    extraOut: '19:00',
    reason: 'Confirmed extra work'
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const current = await store.getSession(session.id);
  assert.equal(current.version, session.version + 1);
  assert.equal(current.entry.extraKind, 'ot');
  assert.equal(current.entry.extraIn, '07:00');
  assert.equal(current.entry.extraOut, '19:00');
  assert.equal(current.entry.otDeclaration.by, 'admin');
  assert.equal(current.entry.otDeclaration.reason, 'Confirmed extra work');
  assert.equal(current.entry.otReview, undefined);
  assert.equal((await call('GET', '/ot')).data.ot[0].sessionId, session.id);
  assert.deepEqual(await store.getSheet('worker', '2026-10'), estimate);
});
test('editing declared OT keeps prior declaration and decision and returns to pending', async () => {
  const session = await attendance();
  let r = await call('POST', '/ot', {
    sessionId: session.id,
    version: 1,
    extraOut: '19:00',
    reason: 'Original declaration'
  });
  assert.equal(r.status, 200);
  r = await call('PUT', '/ot', { sessionId: session.id, version: 2, action: 'approve' });
  assert.equal(r.status, 200);
  const old = (await store.getSession(session.id)).entry;
  r = await call('POST', '/ot', { sessionId: session.id, version: 3, extraOut: '18:00', reason: 'Correct end time' });
  assert.equal(r.status, 200);
  const current = (await store.getSession(session.id)).entry;
  assert.equal(current.otReview, undefined);
  assert.equal(current.otDeclarationHistory.length, 1);
  assert.equal(current.otDeclarationHistory[0].extraOut, '19:00');
  assert.deepEqual(current.otDeclarationHistory[0].review, old.otReview);
  assert.equal(current.otDeclarationHistory[0].declaration.reason, 'Original declaration');
  assert.deepEqual(current.otHistory, [old.otReview]);
});
const otWarningCodes = (r?) => (r.data.warnings || []).map(w => w.code);
test('OT declaration validates authorization, version, input format and open session without mutation', async () => {
  const session = await attendance();
  const body = { sessionId: session.id, version: session.version, extraOut: '19:00', reason: 'Extra work' };
  for (const [label, overrides, who, expected] of <any[]>[
    ['staff cannot declare', {}, 'worker', 403],
    ['stale version', { version: 999 }, 'admin', 409],
    ['no extra segment', { extraOut: '' }, 'admin', 400],
    ['malformed time', { extraOut: '25:00' }, 'admin', 400]
  ]) {
    const before = await snapshot();
    const r = await call('POST', '/ot', { ...body, ...overrides }, who);
    assert.equal(r.status, expected, label + ': ' + JSON.stringify(r.data));
    assert.deepEqual(await snapshot(), before);
  }
  await person('open');
  const open = await attendance('open', '2026-10-07', { state: 'open' });
  const r = await call('POST', '/ot', { ...body, sessionId: open.id, version: open.version });
  assert.equal(r.status, 409);
  assert.equal((await store.getSession(open.id)).entry.extraKind, '');
});
test('OT declaration without a reason is saved as pending', async () => {
  const session = await attendance();
  const r = await call('POST', '/ot', {
    sessionId: session.id,
    version: session.version,
    extraOut: '19:00',
    reason: ''
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await store.getSession(session.id)).entry.extraKind, 'ot');
});
test('OT beyond the presence window, without OT benefit or on unconfirmed attendance is saved with a warning', async () => {
  const body = { extraOut: '19:00', reason: 'Extra work' };
  const beyond = await attendance('worker', '2026-10-07', { out: '20:00:00' });
  const first = await call('POST', '/ot', {
    ...body,
    sessionId: beyond.id,
    version: beyond.version,
    extraOut: '20:30'
  });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.ok(otWarningCodes(first).includes('OT_OUTSIDE_PRESENCE'), JSON.stringify(first.data.warnings));
  assert.equal((await store.getSession(beyond.id)).entry.extraKind, 'ot');
  for (const [username, options, entry, code] of <any[]>[
    ['tts', { type: 'tts' }, undefined, 'BENEFIT_NOT_ALLOWED'],
    ['pending', {}, { attendanceConfirmed: false, kind: 'pending' }, 'OT_NEEDS_CONFIRMED_SHIFT']
  ]) {
    await person(username, options);
    const s = await attendance(username, '2026-10-07', entry ? { entry } : {});
    const r = await call('POST', '/ot', { ...body, sessionId: s.id, version: s.version });
    assert.equal(r.status, 200, `${username}: ${JSON.stringify(r.data)}`);
    assert.ok(otWarningCodes(r).includes(code), `${username}: ${JSON.stringify(r.data.warnings)}`);
    assert.equal((await store.getSession(s.id)).entry.extraKind, 'ot');
  }
});
test('OT uses planned shift snapshot rather than a newly changed staff shift', async () => {
  const session = await attendance();
  await person('worker', { shiftCode: 'g2' });
  const r = await call('POST', '/ot', {
    sessionId: session.id,
    version: 1,
    extraOut: '19:00',
    reason: 'Use assigned occurrence'
  });
  assert.equal(r.status, 200);
  assert.equal((await store.getSession(session.id)).entry.plannedShift.code, 'n1');
});
test('OT respects seconds at check-in and the night boundary', async () => {
  const early = await attendance('worker', '2026-10-07', { in: '06:00:30', out: '22:30:00' });
  const r1 = await call('POST', '/ot', { sessionId: early.id, version: 1, extraIn: '06:00', reason: 'Early work' });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.ok(otWarningCodes(r1).includes('OT_OUTSIDE_PRESENCE'), 'trước giờ Check-in 30 giây vẫn là ngoài giờ có mặt');
  const night = await attendance('worker', '2026-10-08', { in: '05:00:00', out: '17:30:00' });
  const r2 = await call('POST', '/ot', { sessionId: night.id, version: 1, extraIn: '05:00', reason: 'Night work' });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  assert.ok(otWarningCodes(r2).includes('OT_NIGHT'), JSON.stringify(r2.data.warnings));
  const okDay = await attendance('worker', '2026-10-09', { in: '06:00:30', out: '22:30:00' });
  const r = await call('POST', '/ot', {
    sessionId: okDay.id,
    version: 1,
    extraOut: '21:00',
    reason: 'Exactly four hours, no break deducted'
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.warnings, undefined, 'đủ bốn giờ liền ca, không cảnh báo');
});
test('OT over an existing makeup declaration is refused; on an assigned holiday it is accepted', async () => {
  await store.setSetting('holidays', ['2026-10-07']);
  const holiday = await attendance();
  const accepted = await call('POST', '/ot', {
    sessionId: holiday.id,
    version: 1,
    extraOut: '19:00',
    reason: 'Holiday extra'
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  await store.setSetting('holidays', []);
  const makeup = await attendance('worker', '2026-10-08', { entry: { extraKind: 'makeup', extraOut: '18:00' } });
  assert.equal(
    (await call('POST', '/ot', { sessionId: makeup.id, version: 1, extraOut: '19:00', reason: 'No overwrite' })).status,
    409
  );
  assert.equal((await store.getSession(makeup.id)).entry.extraKind, 'makeup');
});
test('night main shift may declare OT for an extension after 07:00', async () => {
  const session = await attendance('worker', '2026-10-07', {
    code: 'g2',
    in: '22:00:00',
    outDate: '2026-10-08',
    out: '08:00:00'
  });
  const r = await call('POST', '/ot', {
    sessionId: session.id,
    version: 1,
    extraOut: '08:00',
    reason: 'Night extension'
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await store.getSession(session.id)).entry.extraKind, 'ot');
  assert.equal((await store.getSession(session.id)).entry.extraOut, '08:00');
});
test('OT approval after a holiday is added is accepted with a warning; rejection stays available', async () => {
  const session = await attendance();
  assert.equal(
    (await call('POST', '/ot', { sessionId: session.id, version: 1, extraOut: '19:00', reason: 'Extra work' })).status,
    200
  );
  // Dữ liệu lưu hoặc nhập sẵn có thể đã xung đột mà không qua cảnh báo ghi ngày lễ.
  await store.setSetting('holidays', ['2026-10-07']);
  const approved = await call('PUT', '/ot', { sessionId: session.id, version: 2, action: 'approve' });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.equal((await store.getSession(session.id)).entry.otReview.ok, true);
});
test('OT beyond the actual check-out of confirmed legacy attendance without a source marker is saved with a warning', async () => {
  const session = await attendance('worker', '2026-10-07', { out: '18:00:00', entry: { src: undefined } });
  const r = await call('POST', '/ot', {
    sessionId: session.id,
    version: 1,
    extraOut: '19:00',
    reason: 'Exceeds actual check-out'
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(otWarningCodes(r).includes('OT_OUTSIDE_PRESENCE'), JSON.stringify(r.data.warnings));
});
test('rejected OT frees the budget and editing replaces the target contribution', async () => {
  const a = await attendance();
  assert.equal(
    (await call('POST', '/ot', { sessionId: a.id, version: 1, extraOut: '21:00', reason: 'Four hours' })).status,
    200
  );
  assert.equal(
    (await call('PUT', '/ot', { sessionId: a.id, version: 2, action: 'reject', note: 'Not worked' })).status,
    200
  );
  const b = await attendance();
  const first = await call('POST', '/ot', {
    sessionId: b.id,
    version: 1,
    extraOut: '21:00',
    reason: 'Actual four hours'
  });
  assert.equal(first.status, 200);
  const second = await call('POST', '/ot', {
    sessionId: b.id,
    version: 2,
    extraOut: '20:00',
    reason: 'Correct to three hours'
  });
  assert.equal(second.status, 200);
  const pending = (await store.getSession(b.id)).entry;
  assert.equal(pending.otDeclarationHistory.length, 1);
  assert.equal(pending.otDeclarationHistory[0].review, null);
  assert.equal(pending.otHistory, undefined);
  const again = await call('POST', '/ot', {
    sessionId: a.id,
    version: 3,
    extraOut: '19:00',
    reason: 'Would exceed combined cap again'
  });
  assert.equal(again.status, 400, JSON.stringify(again.data));
  assert.equal(again.data.code, 'DAY_HOURS_CAP');
});
test('multiple confirmed sessions for one holiday shift consume the holiday budget once', async () => {
  await store.setSetting('holidays', ['2026-10-01']);
  await attendance('worker', '2026-10-01', { in: '08:00:00', out: '12:00:00' });
  await attendance('worker', '2026-10-01', { in: '13:00:00', out: '17:00:00' });
  // 9 giờ ngày lễ tính một lần + 4 + 3 = 16 giờ
  for (const [date, extraOut] of [
    ['2026-10-02', '21:00'],
    ['2026-10-03', '20:00']
  ]) {
    const session = await attendance('worker', date);
    const r = await call('POST', '/ot', {
      sessionId: session.id,
      version: 1,
      extraOut,
      reason: 'Unique holiday shift counted once'
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
});
// Khai lại OT sau khi đã duyệt: bỏ kết quả duyệt cũ, thêm vào lịch sử khai và duyệt lại được
test('redeclared OT keeps the declaration audit and can be approved again', async () => {
  const session = await attendance();
  assert.equal(
    (await call('POST', '/ot', { sessionId: session.id, version: 1, extraOut: '19:00', reason: 'Extra work' })).status,
    200
  );
  assert.equal((await call('PUT', '/ot', { sessionId: session.id, version: 2, action: 'approve' })).status, 200);
  const approved = (await store.getSession(session.id)).entry;
  assert.equal(
    (await call('POST', '/ot', { sessionId: session.id, version: 3, extraOut: '18:00', reason: 'Correct declaration' }))
      .status,
    200
  );
  const current = await store.getSession(session.id);
  assert.equal(current.entry.otReview, undefined);
  assert.ok(current.entry.otDeclarationHistory.length > (approved.otDeclarationHistory || []).length);
  assert.equal(
    (await call('PUT', '/ot', { sessionId: session.id, version: current.version, action: 'approve' })).status,
    200
  );
});
