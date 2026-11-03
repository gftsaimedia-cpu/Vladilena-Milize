'use strict';
// Check-in của nhân viên chỉ mở cho ngày làm việc trong lịch được gán (không phải ngày lễ), ngày có OT / làm bù theo giờ đã được duyệt,
// hoặc ngày lễ có OT (khai trên ngày lễ) đã được duyệt. Lượt bị từ chối không ghi gì; Check-out lượt đang mở luôn được.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
F.explainPunches = true; // lượt bấm trễ / ngoài ca ở đây chỉ là đầu vào: kèm giải trình lúc bấm
const { store } = F;

// 01/11/2026 là Chủ nhật: 02/11 Thứ Hai, 04/11 Thứ Tư, 07/11 Thứ Bảy, 08/11 Chủ nhật. Chức vụ nv làm T2–T7.
const MONTH = '2026-11',
  MON = '2026-11-02',
  WED = '2026-11-04',
  SAT = '2026-11-07',
  SUN = '2026-11-08';
const REFUSED = /không có lịch làm việc hay giờ OT\/làm bù được duyệt/;
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const OT = { ...WORK, extraKind: 'ot', extraOut: '19:00' };

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.person('admin', 'admin');
  await F.person('nv_gate');
  await F.at(`${MON}T07:00:00`);
});

const punch = async (who?, type?) =>
  await F.call('POST', '/punch', {
    who,
    body: {
      type,
      requestId: crypto.randomUUID(),
      ...(type === 'out' ? { sessionId: (await store.openSession(who))?.id } : {})
    }
  });
const count = async (table?) => (await store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;
const stored = async () => ({
  sessions: await count('attendance_sessions'),
  punches: await count('punches'),
  requests: await count('punch_requests')
});
const saveOwn = async (who?, days?) => {
  const r = await F.call('PUT', '/sheet', { who, body: { month: MONTH, days } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
async function decide(who?, date?, action?) {
  const a = (await F.call('GET', `/sheet?month=${MONTH}`, { who })).data.approvals[date];
  assert.ok(a, `có khoản cần duyệt ngày ${date}`);
  const r = await F.call('PUT', '/approvals/decide', {
    body: {
      action,
      ...(action === 'reject' ? { note: 'Không cần làm thêm' } : {}),
      items: [{ username: who, date, rev: a.rev, fingerprint: a.fingerprint }]
    }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
async function refused(who?) {
  const before = await stored();
  const r = await punch(who, 'in');
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.match(r.data.error, REFUSED);
  assert.deepEqual(await stored(), before, 'lượt bị từ chối không ghi phiên, lượt bấm hay requestId');
}

test('unscheduled day without approved extra hours: Check-in refused and nothing stored; GET /api/punch reports it', async () => {
  await F.at(`${SUN}T08:00:00`);
  const state = (await F.call('GET', '/punch', { who: 'nv_gate' })).data;
  assert.equal(state.canCheckIn, false);
  assert.match(state.checkInBlock, REFUSED);
  await refused('nv_gate');
});

test('scheduled day: GET /api/punch allows Check-in without a reason and Check-in succeeds', async () => {
  await F.at(`${MON}T08:00:00`);
  const state = (await F.call('GET', '/punch', { who: 'nv_gate' })).data;
  assert.equal(state.canCheckIn, true);
  assert.equal(state.checkInBlock, undefined);
  const r = await punch('nv_gate', 'in');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.openSession.date, MON);
});

test('off-schedule day with approved OT: Check-in succeeds on that day', async () => {
  await saveOwn('nv_gate', { [SUN]: OT });
  await decide('nv_gate', SUN, 'approve');
  await F.at(`${SUN}T18:00:00`); // OT 17:00–19:00
  assert.equal((await F.call('GET', '/punch', { who: 'nv_gate' })).data.canCheckIn, true);
  const r = await punch('nv_gate', 'in');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.openSession.date, SUN);
});

test('off-schedule day with only pending or rejected OT: Check-in refused', async () => {
  await saveOwn('nv_gate', { [SUN]: OT });
  await F.at(`${SUN}T08:00:00`);
  await refused('nv_gate');
  await F.at(`${MON}T07:00:00`);
  await decide('nv_gate', SUN, 'reject');
  await F.at(`${SUN}T08:00:00`);
  await refused('nv_gate');
});

test('off-schedule work day declared by the staff without extra hours does not open Check-in', async () => {
  await saveOwn('nv_gate', { [SUN]: WORK });
  await F.at(`${SUN}T08:00:00`);
  await refused('nv_gate');
});

test('Admin on-behalf OT counts as approved and opens Check-in', async () => {
  const r = await F.call('PUT', '/sheet', { body: { user: 'nv_gate', month: MONTH, days: { [SUN]: OT } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await F.at(`${SUN}T18:00:00`); // OT 17:00–19:00
  assert.equal((await punch('nv_gate', 'in')).status, 200);
});

test('holiday: refused without approval, refused while holiday work is pending, allowed once approved', async () => {
  await store.setSetting('holidays', [WED]);
  await F.at(`${WED}T08:00:00`);
  await refused('nv_gate');
  await F.at(`${MON}T07:00:00`);
  await saveOwn('nv_gate', { [WED]: WORK });
  await F.at(`${WED}T08:00:00`);
  await refused('nv_gate');
  await F.at(`${MON}T07:00:00`);
  await decide('nv_gate', WED, 'approve');
  await F.at(`${WED}T08:00:00`);
  const r = await punch('nv_gate', 'in');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.openSession.date, WED);
});

test('night shift after midnight belongs to its start date', async () => {
  await F.person('nv_night', 'staff', { shiftCode: 'g2' }); // 22:00 → 07:00
  await F.at(`${SUN}T00:30:00`); // ca bắt đầu Thứ Bảy 07/11 (trong lịch) dù đồng hồ đã sang Chủ nhật
  const r = await punch('nv_night', 'in');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.openSession.date, SAT);
  await F.at(`${SUN}T07:00:00`);
  assert.equal((await punch('nv_night', 'out')).status, 200);
  await F.at(`${SUN}T21:55:00`); // ca bắt đầu Chủ nhật: ngoài lịch
  await refused('nv_night');
});

test('Check-out of an open session is always allowed, even after the day stops qualifying', async () => {
  await F.at(`${MON}T08:00:00`);
  assert.equal((await punch('nv_gate', 'in')).status, 200);
  await store.setSetting('holidays', [MON]); // ngày công vừa thành ngày lễ, không có khoản duyệt
  const state = (await F.call('GET', '/punch', { who: 'nv_gate' })).data;
  assert.equal(state.canCheckIn, false);
  assert.equal(state.checkInBlock, undefined, 'đang có lượt mở: không có câu chặn, chỉ cần Check-out');
  await F.at(`${MON}T17:00:00`);
  const out = await punch('nv_gate', 'out');
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal(await store.openSession('nv_gate'), null);
});
