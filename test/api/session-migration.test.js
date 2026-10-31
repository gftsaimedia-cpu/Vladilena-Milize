if (require('../helpers/dialect').skipWholeFile(__filename)) return; // kiểm chính thứ chỉ SQLite có
const { AsyncList } = require('../../lib/shared/async-list');
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'migration-tests';
const { test, after } = require('node:test'),
  assert = require('node:assert/strict');
const store = require('../../lib/db'),
  auth = require('../../lib/auth'),
  P = require('../../public/punch');
// đọc thẳng dòng bấm giờ mới nhất của người
const LAST = async u => await store.db.prepare('SELECT * FROM punches WHERE username = ? ORDER BY id DESC LIMIT 1').get(u);
// đọc thẳng các ngày chấm công của tháng
const ATT = async (u, month) =>
  await store.db.prepare('SELECT date FROM attendance_days WHERE username = ? AND date LIKE ?').all(u, month + '-%');
const { insertLegacyAttendanceDay } = require('../helpers/legacy-attendance');
const iso = t => new Date(t + '+07:00').toISOString();
async function person(username) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    passHash: auth.hashPassword('test-pass')
  });
}
async function remigrate() {
  assert.equal(typeof store.migrateAttendanceSessions, 'function');
  await store.db.prepare('DELETE FROM settings WHERE key=?').run('attendance_sessions_v1');
  await store.migrateAttendanceSessions();
}
after(() => store.db.close());
test('migration preserves corrected attendance without duplicating its original punch pair', async () => {
  await person('edited-legacy');
  const pin = iso('2026-10-07T08:20:00'),
    pout = iso('2026-10-07T16:30:00');
  const plan = P.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, '2026-10-07');
  await store.addPunch('edited-legacy', pin, 'in', null, false, { plannedShift: plan });
  await store.addPunch('edited-legacy', pout, 'out', null, false, { plannedShift: plan });
  const entry = P.buildDay(
    { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] },
    iso('2026-10-07T08:00:00'),
    iso('2026-10-07T17:00:00'),
    'admin',
    { plannedShift: plan, approveIncomplete: true }
  ).entry;
  await insertLegacyAttendanceDay(store, 'edited-legacy', '2026-10-07', entry);
  await store.setSheet('edited-legacy', '2026-10', { '2026-10-07': { kind: 'leave' } }, 17, 4000);
  const snapshot = await store.getSheet('edited-legacy', '2026-10');
  await remigrate();
  const sessions = await store.listSessions({ username: 'edited-legacy' });
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].entry, entry);
  assert.equal((await store.sessionPunches(sessions[0].id)).length, 2);
  await store.migrateAttendanceSessions();
  assert.equal((await store.listSessions({ username: 'edited-legacy' })).length, 1);
  assert.deepEqual(await store.getSheet('edited-legacy', '2026-10'), snapshot);
  assert.equal((await store.db.prepare('SELECT COUNT(*) n FROM punches WHERE username=?').get('edited-legacy')).n, 2);
});
test('unambiguous pairs and an orphan open punch migrate, orphan checkout is retained', async () => {
  await person('pairs');
  const d = '2026-10-08';
  for (const [time, type] of [
    ['08:00:00', 'in'],
    ['12:00:00', 'out'],
    ['13:00:00', 'in'],
    ['17:00:00', 'out']
  ])
    await store.addPunch('pairs', iso(d + 'T' + time), type, null, false, null);
  await person('orphan-in');
  await store.addPunch('orphan-in', iso(d + 'T08:00:00'), 'in', null, false, null);
  await person('orphan-out');
  await store.addPunch('orphan-out', iso(d + 'T17:00:00'), 'out', null, false, null);
  await remigrate();
  assert.equal((await store.listSessions({ username: 'pairs' })).length, 2);
  assert.equal((await store.openSession('orphan-in')).state, 'open');
  assert.equal((await store.listSessions({ username: 'orphan-out' })).length, 0);
  assert.equal((await LAST('orphan-out')).type, 'out');
});
test('two unambiguous raw pairs using the same historical shift create separate sessions', async () => {
  await person('same-plan-pairs');
  const date = '2026-10-08',
    planned = P.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, date);
  for (const [time, type] of [
    ['08:00:00', 'in'],
    ['12:00:00', 'out'],
    ['13:00:00', 'in'],
    ['17:00:00', 'out']
  ])
    await store.addPunch('same-plan-pairs', iso(date + 'T' + time), type, null, false, { plannedShift: planned });
  await remigrate();
  const sessions = await store.listSessions({ username: 'same-plan-pairs' });
  assert.equal(sessions.length, 2);
  assert.ok(await AsyncList.every(sessions, async s => (await store.sessionPunches(s.id)).length === 2));
});
test('changed current profile never duplicates an edited historical night from raw punches without context', async () => {
  await person('changed-night-profile');
  const planned = P.planShift({ shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] }, '2026-10-07');
  const corrected = P.buildDay(
    { shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] },
    iso('2026-10-08T00:20:00'),
    iso('2026-10-08T07:00:00'),
    'admin',
    { plannedShift: planned, approveIncomplete: true }
  ).entry;
  await insertLegacyAttendanceDay(store, 'changed-night-profile', '2026-10-07', corrected);
  await store.addPunch('changed-night-profile', iso('2026-10-08T00:30:00'), 'in', null, false, null);
  await store.addPunch('changed-night-profile', iso('2026-10-08T07:00:00'), 'out', null, false, null);
  await remigrate();
  const sessions = await store.listSessions({ username: 'changed-night-profile' });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].date, '2026-10-07');
  assert.deepEqual(sessions[0].entry, corrected);
  assert.equal((await store.sessionPunches(sessions[0].id)).length, 2);
});
test('edited night with non-overlapping original hours retains uncertain raw evidence without another session', async () => {
  await person('edited-night-disjoint');
  const planned = P.planShift({ shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] }, '2026-10-07');
  const corrected = P.buildDay(
    { shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] },
    iso('2026-10-07T22:00:00'),
    iso('2026-10-08T00:00:00'),
    'admin',
    { plannedShift: planned, approveIncomplete: true }
  ).entry;
  await insertLegacyAttendanceDay(store, 'edited-night-disjoint', '2026-10-07', corrected);
  await store.addPunch('edited-night-disjoint', iso('2026-10-08T00:30:00'), 'in', null, false, null);
  await store.addPunch('edited-night-disjoint', iso('2026-10-08T04:00:00'), 'out', null, false, null);
  await remigrate();
  for (let attempt = 0; attempt < 2; attempt++) {
    const sessions = await store.listSessions({ username: 'edited-night-disjoint' });
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].entry, corrected);
    assert.equal(
      (await store.db
        .prepare('SELECT COUNT(*) n FROM punches WHERE username=? AND session_id IS NULL')
        .get('edited-night-disjoint')).n,
      2
    );
    await remigrate();
  }
});
test('unrepresented raw pairs without a historical plan remain pending instead of using current profile', async () => {
  await person('unknown-old-shift');
  await store.addPunch('unknown-old-shift', iso('2026-10-08T08:00:00'), 'in', null, false, null);
  await store.addPunch('unknown-old-shift', iso('2026-10-08T17:00:00'), 'out', null, false, null);
  await remigrate();
  const [s] = await store.listSessions({ username: 'unknown-old-shift' });
  assert.equal(s.entry.kind, 'pending');
  assert.equal(s.entry.plannedShift, undefined);
  assert.equal(s.entry.attendanceConfirmed, undefined);
});
test('consecutive legacy check-ins followed by checkout stay unpaired for reconciliation', async () => {
  await person('ambiguous-pair');
  for (const [time, type] of [
    ['08:00:00', 'in'],
    ['09:00:00', 'in'],
    ['17:00:00', 'out']
  ])
    await store.addPunch('ambiguous-pair', iso('2026-10-09T' + time), type, null, false, null);
  await remigrate();
  assert.equal((await store.listSessions({ username: 'ambiguous-pair' })).length, 0);
  assert.equal(
    (await store.db.prepare('SELECT COUNT(*) n FROM punches WHERE username=? AND session_id IS NULL').get('ambiguous-pair')).n,
    3
  );
});
test('ambiguous open legacy attendance rolls back migration without dropping records', async () => {
  await person('ambiguous');
  for (const date of ['2026-10-05', '2026-10-06'])
    await insertLegacyAttendanceDay(store, 'ambiguous', date, {
      kind: 'pending',
      reason: 'open',
      src: 'punch',
      presIn: iso(date + 'T08:00:00')
    });
  assert.equal(typeof store.migrateAttendanceSessions, 'function');
  await store.db.prepare('DELETE FROM settings WHERE key=?').run('attendance_sessions_v1');
  const count = (await store.db.prepare('SELECT COUNT(*) n FROM attendance_sessions').get()).n;
  await assert.rejects(async () => await store.migrateAttendanceSessions(), /ambiguous|nhiều phiên|đối soát/);
  assert.equal((await store.db.prepare('SELECT COUNT(*) n FROM attendance_sessions').get()).n, count);
  assert.equal(await store.getSetting('attendance_sessions_v1', null), null);
  assert.equal((await ATT('ambiguous', '2026-10')).length, 2);
  await store.db.prepare('DELETE FROM attendance_days WHERE username=?').run('ambiguous');
});
test('consecutive unmatched check-ins cannot silently choose which session remains open', async () => {
  await person('ambiguous-tail');
  await store.addPunch('ambiguous-tail', iso('2026-10-09T08:00:00'), 'in', null, false, null);
  await store.addPunch('ambiguous-tail', iso('2026-10-09T09:00:00'), 'in', null, false, null);
  await assert.rejects(async () => await remigrate(), /đối soát/);
  assert.equal(await store.openSession('ambiguous-tail'), null);
  assert.equal((await store.db.prepare('SELECT COUNT(*) n FROM punches WHERE username=?').get('ambiguous-tail')).n, 2);
});
