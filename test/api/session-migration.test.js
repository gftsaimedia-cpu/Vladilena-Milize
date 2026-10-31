process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'migration-tests';
const { test, after } = require('node:test'),
  assert = require('node:assert/strict');
const store = require('../../lib/db'),
  auth = require('../../lib/auth'),
  P = require('../../public/punch');
// đọc thẳng dòng bấm giờ mới nhất của người
const LAST = u => store.db.prepare('SELECT * FROM punches WHERE username = ? ORDER BY id DESC LIMIT 1').get(u);
// đọc thẳng các ngày chấm công của tháng
const ATT = (u, month) =>
  store.db.prepare('SELECT date FROM attendance_days WHERE username = ? AND date LIKE ?').all(u, month + '-%');
const { insertLegacyAttendanceDay } = require('../helpers/legacy-attendance');
const iso = t => new Date(t + '+07:00').toISOString();
function person(username) {
  store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    passHash: auth.hashPassword('test-pass')
  });
}
function remigrate() {
  assert.equal(typeof store.migrateAttendanceSessions, 'function');
  store.db.prepare('DELETE FROM settings WHERE key=?').run('attendance_sessions_v1');
  store.migrateAttendanceSessions();
}
after(() => store.db.close());
test('migration preserves corrected attendance without duplicating its original punch pair', () => {
  person('edited-legacy');
  const pin = iso('2026-10-07T08:20:00'),
    pout = iso('2026-10-07T16:30:00');
  const plan = P.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, '2026-10-07');
  store.addPunch('edited-legacy', pin, 'in', null, false, { plannedShift: plan });
  store.addPunch('edited-legacy', pout, 'out', null, false, { plannedShift: plan });
  const entry = P.buildDay(
    { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] },
    iso('2026-10-07T08:00:00'),
    iso('2026-10-07T17:00:00'),
    'admin',
    { plannedShift: plan, approveIncomplete: true }
  ).entry;
  insertLegacyAttendanceDay(store, 'edited-legacy', '2026-10-07', entry);
  store.setSheet('edited-legacy', '2026-10', { '2026-10-07': { kind: 'leave' } }, 17, 4000);
  const snapshot = store.getSheet('edited-legacy', '2026-10');
  remigrate();
  const sessions = store.listSessions({ username: 'edited-legacy' });
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].entry, entry);
  assert.equal(store.sessionPunches(sessions[0].id).length, 2);
  store.migrateAttendanceSessions();
  assert.equal(store.listSessions({ username: 'edited-legacy' }).length, 1);
  assert.deepEqual(store.getSheet('edited-legacy', '2026-10'), snapshot);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM punches WHERE username=?').get('edited-legacy').n, 2);
});
test('unambiguous pairs and an orphan open punch migrate, orphan checkout is retained', () => {
  person('pairs');
  const d = '2026-10-08';
  for (const [time, type] of [
    ['08:00:00', 'in'],
    ['12:00:00', 'out'],
    ['13:00:00', 'in'],
    ['17:00:00', 'out']
  ])
    store.addPunch('pairs', iso(d + 'T' + time), type, null, false, null);
  person('orphan-in');
  store.addPunch('orphan-in', iso(d + 'T08:00:00'), 'in', null, false, null);
  person('orphan-out');
  store.addPunch('orphan-out', iso(d + 'T17:00:00'), 'out', null, false, null);
  remigrate();
  assert.equal(store.listSessions({ username: 'pairs' }).length, 2);
  assert.equal(store.openSession('orphan-in').state, 'open');
  assert.equal(store.listSessions({ username: 'orphan-out' }).length, 0);
  assert.equal(LAST('orphan-out').type, 'out');
});
test('two unambiguous raw pairs using the same historical shift create separate sessions', () => {
  person('same-plan-pairs');
  const date = '2026-10-08',
    planned = P.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, date);
  for (const [time, type] of [
    ['08:00:00', 'in'],
    ['12:00:00', 'out'],
    ['13:00:00', 'in'],
    ['17:00:00', 'out']
  ])
    store.addPunch('same-plan-pairs', iso(date + 'T' + time), type, null, false, { plannedShift: planned });
  remigrate();
  const sessions = store.listSessions({ username: 'same-plan-pairs' });
  assert.equal(sessions.length, 2);
  assert.ok(sessions.every(s => store.sessionPunches(s.id).length === 2));
});
test('changed current profile never duplicates an edited historical night from raw punches without context', () => {
  person('changed-night-profile');
  const planned = P.planShift({ shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] }, '2026-10-07');
  const corrected = P.buildDay(
    { shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] },
    iso('2026-10-08T00:20:00'),
    iso('2026-10-08T07:00:00'),
    'admin',
    { plannedShift: planned, approveIncomplete: true }
  ).entry;
  insertLegacyAttendanceDay(store, 'changed-night-profile', '2026-10-07', corrected);
  store.addPunch('changed-night-profile', iso('2026-10-08T00:30:00'), 'in', null, false, null);
  store.addPunch('changed-night-profile', iso('2026-10-08T07:00:00'), 'out', null, false, null);
  remigrate();
  const sessions = store.listSessions({ username: 'changed-night-profile' });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].date, '2026-10-07');
  assert.deepEqual(sessions[0].entry, corrected);
  assert.equal(store.sessionPunches(sessions[0].id).length, 2);
});
test('edited night with non-overlapping original hours retains uncertain raw evidence without another session', () => {
  person('edited-night-disjoint');
  const planned = P.planShift({ shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] }, '2026-10-07');
  const corrected = P.buildDay(
    { shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] },
    iso('2026-10-07T22:00:00'),
    iso('2026-10-08T00:00:00'),
    'admin',
    { plannedShift: planned, approveIncomplete: true }
  ).entry;
  insertLegacyAttendanceDay(store, 'edited-night-disjoint', '2026-10-07', corrected);
  store.addPunch('edited-night-disjoint', iso('2026-10-08T00:30:00'), 'in', null, false, null);
  store.addPunch('edited-night-disjoint', iso('2026-10-08T04:00:00'), 'out', null, false, null);
  remigrate();
  for (let attempt = 0; attempt < 2; attempt++) {
    const sessions = store.listSessions({ username: 'edited-night-disjoint' });
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].entry, corrected);
    assert.equal(
      store.db
        .prepare('SELECT COUNT(*) n FROM punches WHERE username=? AND session_id IS NULL')
        .get('edited-night-disjoint').n,
      2
    );
    remigrate();
  }
});
test('unrepresented raw pairs without a historical plan remain pending instead of using current profile', () => {
  person('unknown-old-shift');
  store.addPunch('unknown-old-shift', iso('2026-10-08T08:00:00'), 'in', null, false, null);
  store.addPunch('unknown-old-shift', iso('2026-10-08T17:00:00'), 'out', null, false, null);
  remigrate();
  const [s] = store.listSessions({ username: 'unknown-old-shift' });
  assert.equal(s.entry.kind, 'pending');
  assert.equal(s.entry.plannedShift, undefined);
  assert.equal(s.entry.attendanceConfirmed, undefined);
});
test('consecutive legacy check-ins followed by checkout stay unpaired for reconciliation', () => {
  person('ambiguous-pair');
  for (const [time, type] of [
    ['08:00:00', 'in'],
    ['09:00:00', 'in'],
    ['17:00:00', 'out']
  ])
    store.addPunch('ambiguous-pair', iso('2026-10-09T' + time), type, null, false, null);
  remigrate();
  assert.equal(store.listSessions({ username: 'ambiguous-pair' }).length, 0);
  assert.equal(
    store.db.prepare('SELECT COUNT(*) n FROM punches WHERE username=? AND session_id IS NULL').get('ambiguous-pair').n,
    3
  );
});
test('ambiguous open legacy attendance rolls back migration without dropping records', () => {
  person('ambiguous');
  for (const date of ['2026-10-05', '2026-10-06'])
    insertLegacyAttendanceDay(store, 'ambiguous', date, {
      kind: 'pending',
      reason: 'open',
      src: 'punch',
      presIn: iso(date + 'T08:00:00')
    });
  assert.equal(typeof store.migrateAttendanceSessions, 'function');
  store.db.prepare('DELETE FROM settings WHERE key=?').run('attendance_sessions_v1');
  const count = store.db.prepare('SELECT COUNT(*) n FROM attendance_sessions').get().n;
  assert.throws(() => store.migrateAttendanceSessions(), /ambiguous|nhiều phiên|đối soát/);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM attendance_sessions').get().n, count);
  assert.equal(store.getSetting('attendance_sessions_v1', null), null);
  assert.equal(ATT('ambiguous', '2026-10').length, 2);
  store.db.prepare('DELETE FROM attendance_days WHERE username=?').run('ambiguous');
});
test('consecutive unmatched check-ins cannot silently choose which session remains open', () => {
  person('ambiguous-tail');
  store.addPunch('ambiguous-tail', iso('2026-10-09T08:00:00'), 'in', null, false, null);
  store.addPunch('ambiguous-tail', iso('2026-10-09T09:00:00'), 'in', null, false, null);
  assert.throws(() => remigrate(), /đối soát/);
  assert.equal(store.openSession('ambiguous-tail'), null);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM punches WHERE username=?').get('ambiguous-tail').n, 2);
});
