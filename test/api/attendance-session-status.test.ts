'use strict';
// Mọi lượt chấm công gửi cho màn Chấm công (Admin) và app nhân viên mang status + statusNote do máy chủ tính
// (src/domain/attendance/session-status.ts): GET /api/attendance, /api/team, /api/today, /api/sheet, GET / POST /api/punch.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');

const MONTH = '2026-10';
const punch = (who?, body?) => F.call('POST', '/punch', { who, body });
const checkIn = async (who?, at?, requestId?, extra: any = {}) => {
  await F.at(at);
  const res = await punch(who, { type: 'in', requestId, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
};
const STATUSES = ['checked-in', 'checked-out', 'pending', 'approved', 'rejected', 'admin'];

before(async () => {
  await F.start();
  await F.at('2026-10-19T12:00:00');
  await F.person('chi');
  await F.person('dung');
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Check-in trễ quá mức cho phép kèm giải trình: lượt mở là chờ xử lý, chờ Admin; Check-in đúng giờ là checked-in (GET / POST /api/punch)', async () => {
  const late = await checkIn('chi', '2026-10-20T08:20:00', 'status-in-chi', { explanation: 'Kẹt xe' });
  assert.equal(late.openSession.status, 'pending');
  assert.equal(late.openSession.statusNote, 'Đã gửi giải trình, chờ Admin');
  const onTime = await checkIn('dung', '2026-10-20T08:05:00', 'status-in-dung');
  assert.equal(onTime.openSession.status, 'checked-in');
  assert.equal(onTime.openSession.statusNote, '');
  await F.at('2026-10-20T12:00:00');
  const read = await F.call('GET', '/punch', { who: 'chi' });
  assert.equal(read.status, 200);
  assert.equal(read.data.openSession.status, 'pending');
});

test('Check-out đúng giờ: lượt là checked-out ở /api/attendance, /api/team, /api/today và /api/sheet của chính nhân viên', async () => {
  await F.at('2026-10-20T17:05:00');
  const sessionId = (await F.store.openSession('dung')).id;
  const out = await punch('dung', { type: 'out', sessionId, requestId: 'status-out-dung' });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal(out.data.lastSession.status, 'checked-out');

  const attendance = await F.call('GET', `/attendance?month=${MONTH}`, { who: 'admin' });
  assert.equal(attendance.status, 200);
  for (const row of attendance.data.rows) {
    assert.ok(STATUSES.includes(row.status), JSON.stringify(row));
    assert.equal(typeof row.statusNote, 'string');
  }
  const byUser = Object.fromEntries(attendance.data.rows.map(r => [r.username, r]));
  assert.equal(byUser.dung.status, 'checked-out');
  assert.equal(byUser.dung.statusNote, '');
  assert.equal(byUser.chi.status, 'pending');
  assert.equal(byUser.chi.statusNote, 'Đã gửi giải trình, chờ Admin');

  const team = await F.call('GET', `/team?month=${MONTH}`, { who: 'admin' });
  assert.equal(team.status, 200);
  const dungRow = team.data.rows.find(r => r.staff.username === 'dung');
  assert.equal(dungRow.attendanceSessions[0].status, 'checked-out');

  const today = await F.call('GET', '/today', { who: 'admin' });
  assert.equal(today.status, 200);
  const todayBy = Object.fromEntries(today.data.rows.map(r => [r.username, r]));
  assert.equal(todayBy.dung.status, 'checked-out');
  assert.equal(todayBy.chi.status, 'pending');
  assert.equal(todayBy.chi.statusNote, 'Đã gửi giải trình, chờ Admin');
  assert.equal(todayBy.admin, undefined);

  const sheet = await F.call('GET', `/sheet?month=${MONTH}`, { who: 'dung' });
  assert.equal(sheet.status, 200);
  assert.equal(sheet.data.attendanceSessions.length, 1);
  assert.equal(sheet.data.attendanceSessions[0].status, 'checked-out');
  assert.equal(sheet.data.attendanceSessions[0].statusNote, '');
});

test('Về sớm kèm giải trình: lượt là chờ xử lý; Admin duyệt cả hai giải trình thì lượt được phê duyệt kèm lý do giờ đầu tiên', async () => {
  await F.at('2026-10-20T16:50:00');
  const sessionId = (await F.store.openSession('chi')).id;
  const body = { type: 'out', sessionId, requestId: 'status-out-chi' };
  assert.equal((await punch('chi', body)).status, 409); // về sớm 10 phút phải giải trình
  const out = await punch('chi', { ...body, explanation: 'Việc nhà' });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal(out.data.lastSession.status, 'pending');
  assert.equal(out.data.lastSession.statusNote, 'Đã gửi giải trình, chờ Admin');
  const ids = await F.store.db.prepare('SELECT id FROM explanations WHERE session_id = ? ORDER BY id').all(sessionId);
  for (const { id } of ids)
    assert.equal(
      (await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: true } })).status,
      200
    );
  const read = await F.call('GET', '/punch', { who: 'chi' });
  assert.equal(read.data.lastSession.status, 'approved');
  assert.equal(read.data.lastSession.statusNote, 'Vào trễ 20 phút');
});

test('Check-out muộn gửi giải trình: chờ Admin; Admin không duyệt là Bị từ chối, duyệt lại là Được phê duyệt', async () => {
  await checkIn('dung', '2026-10-21T08:00:00', 'status-in-dung-2');
  await F.at('2026-10-21T18:10:00');
  const sessionId = (await F.store.openSession('dung')).id;
  const body = { type: 'out', sessionId, requestId: 'status-out-dung-2', explanation: 'Chờ khách ký biên bản' };
  const out = await punch('dung', body);
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal(out.data.lastSession.status, 'pending');
  assert.equal(out.data.lastSession.statusNote, 'Đã gửi giải trình, chờ Admin');
  const statusOf = async () => {
    const res = await F.call('GET', `/attendance?month=${MONTH}`, { who: 'admin' });
    return res.data.rows.find(r => r.id === sessionId);
  };
  const id = (await F.store.db.prepare('SELECT id FROM explanations WHERE session_id = ?').get(sessionId)).id;
  const no = await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: false } });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.deepEqual((({ status, statusNote }: any) => ({ status, statusNote }))(await statusOf()), {
    status: 'rejected',
    statusNote: 'Check-out muộn 70 phút'
  });
  await F.at('2026-10-21T19:00:00');
  const yes = await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: true } });
  assert.equal(yes.status, 200, JSON.stringify(yes.data));
  assert.equal((await statusOf()).status, 'approved');
});

test('Quên Check-out rồi Admin khai thay ngày đó: lượt bấm giữ nhãn riêng nhưng bị thay, nhãn của ngày là Đã chấm công', async () => {
  const AS = require('../../src/engine/attendance-status');
  await checkIn('chi', '2026-10-22T08:00:00', 'status-in-chi-forgot');
  await F.at('2026-10-23T12:00:00');
  const dayRows = async (path?, pick?) => {
    const res = await F.call('GET', path, { who: pick.who });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return (await pick.rows(res.data)).filter(s => s.username === 'chi' && s.date === '2026-10-22');
  };
  const attendance = { who: 'admin', rows: (d?) => d.rows };
  const before = await dayRows(`/attendance?month=${MONTH}`, attendance);
  assert.equal(before.length, 1);
  assert.equal(before[0].status, 'pending');
  assert.equal(before[0].statusNote, 'Quên Check-out');
  assert.equal(AS.dayStatus(before), 'pending');

  const day = { kind: 'work', in: '08:00', out: '17:00' };
  const saved = await F.call('PUT', '/sheet', {
    who: 'admin',
    body: { month: MONTH, user: 'chi', days: { '2026-10-22': day }, confirmDays: ['2026-10-22'] }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));

  const after = await dayRows(`/attendance?month=${MONTH}`, attendance);
  assert.equal(after.length, 2, JSON.stringify(after));
  const real = after.find(s => s.status !== 'admin');
  const admin = after.find(s => s.status === 'admin');
  assert.ok(admin && !admin.superseded, JSON.stringify(after));
  assert.equal(real.status, 'pending');
  assert.equal(real.statusNote, 'Quên Check-out');
  assert.equal(real.superseded, true);
  assert.equal(AS.dayStatus(after), 'admin');
  assert.deepEqual(AS.dayNotes(after), []);

  // Cùng kết quả ở /api/team (Admin) và /api/sheet của chính nhân viên
  const team = await dayRows(`/team?month=${MONTH}`, {
    who: 'admin',
    rows: (d?) => d.rows.find(r => r.staff.username === 'chi').attendanceSessions
  });
  assert.equal(AS.dayStatus(team), 'admin');
  const own = await dayRows(`/sheet?month=${MONTH}`, { who: 'chi', rows: (d?) => d.attendanceSessions });
  assert.equal(AS.dayStatus(own), 'admin');
});
