'use strict';
// Check-in chỉ được trong khung của ca được gán (từ attendance.earlyCheckinMaxHours trước giờ vào ca đến trước giờ kết thúc ca);
// ngoài khung đó chỉ được khi có khoản OT hoặc làm bù theo giờ ĐÃ DUYỆT mà khoảng giờ của khoản chứa thời điểm bấm.
// GET /api/punch (canCheckIn, checkInBlock, checkInCode, checkInEntitlement) và POST /api/punch dùng cùng một phán quyết.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
F.explainPunches = true; // lượt trễ / ngoài ca được cho qua cổng vẫn cần giải trình lúc bấm: ở đây chỉ kiểm cổng
const { CheckinEntitlement } = require('../../src/domain/attendance/checkin-entitlement');
const PunchRules = require('../../src/engine/punch');
const { store } = F;

// 02/11/2026 là Thứ Hai: nv làm T2–T7; 07/11 Thứ Bảy (trong lịch), 08/11 Chủ nhật (ngoài lịch).
const MONTH = '2026-11',
  MON = '2026-11-02',
  TUE = '2026-11-03',
  SAT = '2026-11-07',
  SUN = '2026-11-08',
  HOL = '2026-11-05'; // Thứ Năm, đặt làm ngày lễ trong test riêng
const OUTSIDE = 'CHECKIN_OUTSIDE_SHIFT',
  NOT_ALLOWED = 'CHECKIN_NOT_ALLOWED';
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const withExtra = (extraKind?, extraOut?, extraIn?) => ({
  ...WORK,
  extraKind,
  extraOut,
  ...(extraIn ? { extraIn } : {})
});

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.person('admin', 'admin');
  await F.person('nv_a'); // ca n1 08:00–17:00
  await F.at(`${MON}T07:00:00`);
});

const clearPunches = async () => {
  for (const table of ['explanations', 'punches', 'attendance_sessions', 'punch_requests'])
    await store.db.exec(`DELETE FROM ${table}`);
};
// Ghi khoản cho người đó: Admin khai thay thì được duyệt ngay (approved); nhân viên tự khai thì chờ duyệt (pending)
const declare = async (who?, days?, { asAdmin = true }: any = {}) => {
  const r = await F.call('PUT', '/sheet', {
    who: asAdmin ? 'admin' : who,
    body: { ...(asAdmin ? { user: who } : {}), month: MONTH, days }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
const decide = async (who?, date?, action?) => {
  const a = (await F.call('GET', `/sheet?month=${MONTH}`, { who })).data.approvals[date];
  assert.ok(a, `có khoản cần duyệt ngày ${date}`);
  const r = await F.call('PUT', '/approvals/decide', {
    body: {
      action,
      note: 'Quyết định thử',
      items: [{ username: who, date, rev: a.rev, fingerprint: a.fingerprint }]
    }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
// Một ô của ma trận: đặt đồng hồ, hỏi GET rồi bấm POST; hai đường phải cùng kết luận, cùng mã, cùng câu báo
async function cell(who?, date?, hm?) {
  await clearPunches();
  await F.at(`${date}T${hm}:00`);
  const got = (await F.call('GET', '/punch', { who })).data;
  const posted = await F.call('POST', '/punch', { who, body: { type: 'in', requestId: crypto.randomUUID() } });
  const ok = posted.status === 200;
  assert.equal(got.canCheckIn, ok, `${date} ${hm}: GET canCheckIn=${got.canCheckIn} nhưng POST ${posted.status}`);
  if (ok) {
    assert.equal(got.checkInBlock, undefined);
    assert.equal(got.checkInCode, undefined);
    return { ok, entitlement: got.checkInEntitlement, date: posted.data.openSession.date };
  }
  assert.equal(posted.status, 409, JSON.stringify(posted.data));
  assert.equal(posted.data.code, got.checkInCode);
  assert.equal(posted.data.error, got.checkInBlock);
  assert.equal(got.checkInEntitlement, undefined);
  assert.equal((await store.listSessions({ username: who })).length, 0, 'bị từ chối thì không ghi lượt');
  return { ok, code: posted.data.code, message: posted.data.error };
}
const allowed = async (who?, date?, hm?, entitlement?) => {
  const r = await cell(who, date, hm);
  assert.equal(r.ok, true, `${date} ${hm} phải được Check-in: ${r.message}`);
  assert.equal(r.entitlement, entitlement, `${date} ${hm}`);
  return r;
};
const refused = async (who?, date?, hm?, code = OUTSIDE) => {
  const r = await cell(who, date, hm);
  assert.equal(r.ok, false, `${date} ${hm} phải bị từ chối`);
  assert.equal(r.code, code, `${date} ${hm}: ${r.message}`);
  return r;
};

test('inside the shift window Check-in passes; the window is [start - earlyCheckinMaxHours, end)', async () => {
  await refused('nv_a', MON, '03:59');
  await allowed('nv_a', MON, '04:00', 'shift');
  await allowed('nv_a', MON, '08:00', 'shift');
  await allowed('nv_a', MON, '16:59', 'shift');
  await refused('nv_a', MON, '17:00');
  await refused('nv_a', MON, '23:00');
});

test('late Check-in inside the window still passes the gate and follows the explanation flow', async () => {
  F.explainPunches = false;
  try {
    await clearPunches();
    await F.at(`${MON}T14:00:00`);
    const r = await F.call('POST', '/punch', { who: 'nv_a', body: { type: 'in', requestId: crypto.randomUUID() } });
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.code, 'CHECKIN_NEEDS_EXPLANATION');
  } finally {
    F.explainPunches = true;
  }
});

test('after the end of a morning shift Check-in is refused with a message naming the window and the request needed', async () => {
  await F.person('nv_f1', 'staff', { shiftCode: 'f1' }); // 06:00–15:00
  await allowed('nv_f1', MON, '14:00', 'shift');
  const r = await refused('nv_f1', MON, '15:30');
  assert.match(r.message, /ca 06:00–15:00/);
  assert.match(r.message, /02:00 đến trước 15:00/);
  assert.match(r.message, /yêu cầu OT hoặc làm bù/);
});

test('approved make-up hours after the shift open Check-in only for the covered times', async () => {
  await declare('nv_a', { [MON]: withExtra('makeup', '19:00') });
  await allowed('nv_a', MON, '16:59', 'shift');
  await allowed('nv_a', MON, '17:00', 'makeup_hours');
  await allowed('nv_a', MON, '18:59', 'makeup_hours');
  await refused('nv_a', MON, '19:00');
  await refused('nv_a', MON, '23:00');
});

test('approved OT after the shift opens Check-in for the covered times with entitlement ot', async () => {
  await declare('nv_a', { [MON]: withExtra('ot', '19:00') });
  await allowed('nv_a', MON, '17:30', 'ot');
  await refused('nv_a', MON, '19:00');
});

test('a request for another date or a shorter range grants nothing outside its range', async () => {
  await declare('nv_a', { [TUE]: withExtra('makeup', '19:00'), [MON]: withExtra('makeup', '18:00') });
  await allowed('nv_a', MON, '17:30', 'makeup_hours');
  await refused('nv_a', MON, '18:00');
  await refused('nv_a', MON, '18:30');
});

test('pending, rejected and removed requests grant nothing; the pending message says it is waiting', async () => {
  await declare('nv_a', { [MON]: withExtra('makeup', '19:00') }, { asAdmin: false });
  const pending = await refused('nv_a', MON, '17:30');
  assert.match(pending.message, /chờ duyệt/);
  await F.at(`${MON}T07:00:00`);
  await decide('nv_a', MON, 'reject');
  const rejected = await refused('nv_a', MON, '17:30');
  assert.doesNotMatch(rejected.message, /chờ duyệt/);
  await F.at(`${MON}T07:00:00`);
  await declare('nv_a', { [MON]: withExtra('makeup', '19:00') }, { asAdmin: false });
  await decide('nv_a', MON, 'approve');
  await allowed('nv_a', MON, '17:30', 'makeup_hours');
  await F.at(`${MON}T07:00:00`);
  await declare('nv_a', {}, { asAdmin: false });
  await refused('nv_a', MON, '17:30');
});

test('a day with no schedule: refused without a request, open only for the approved range', async () => {
  const none = await refused('nv_a', SUN, '08:00', NOT_ALLOWED);
  assert.match(none.message, /không có lịch làm việc hay giờ OT\/làm bù được duyệt/);
  await declare('nv_a', { [SUN]: withExtra('ot', '19:00') }); // khai được cho Chủ nhật ngoài lịch (chỉ cảnh báo)
  await refused('nv_a', SUN, '03:59');
  await refused('nv_a', SUN, '05:00');
  await refused('nv_a', SUN, '08:00');
  await refused('nv_a', SUN, '16:59');
  await allowed('nv_a', SUN, '17:00', 'ot');
  await allowed('nv_a', SUN, '18:30', 'ot');
  await refused('nv_a', SUN, '19:00');
});

test('a holiday with approved OT: only the declared range 08:00–19:00 opens Check-in, nothing before it', async () => {
  const holidays = await store.getSetting('holidays', []);
  await store.setSetting('holidays', [...holidays, HOL]);
  try {
    await refused('nv_a', HOL, '08:00', NOT_ALLOWED);
    await declare('nv_a', { [HOL]: withExtra('ot', '19:00') });
    await refused('nv_a', HOL, '07:00');
    await refused('nv_a', HOL, '07:59');
    await allowed('nv_a', HOL, '08:00', 'ot');
    await allowed('nv_a', HOL, '18:59', 'ot');
    await refused('nv_a', HOL, '19:00');
    await declare('nv_a', { [HOL]: WORK });
    await refused('nv_a', HOL, '07:59');
    await allowed('nv_a', HOL, '08:00', 'ot');
    await allowed('nv_a', HOL, '16:59', 'ot');
    await refused('nv_a', HOL, '17:00');
  } finally {
    await store.setSetting('holidays', holidays);
  }
});

test('night shift crossing midnight: window and request lookup use the shift start date', async () => {
  await F.person('nv_night', 'staff', { shiftCode: 'g2' }); // 22:00 → 07:00
  await refused('nv_night', SAT, '17:59');
  await allowed('nv_night', SAT, '18:00', 'shift');
  const after0 = await allowed('nv_night', SUN, '00:30', 'shift');
  assert.equal(after0.date, SAT, 'sau nửa đêm vẫn là ngày bắt đầu ca');
  await allowed('nv_night', SUN, '06:59', 'shift');
  await refused('nv_night', SUN, '07:00');
  await refused('nv_night', SUN, '08:30');
  await declare('nv_night', { [SAT]: { kind: 'work', in: '22:00', out: '07:00', extraKind: 'ot', extraOut: '09:00' } });
  await allowed('nv_night', SUN, '08:30', 'ot');
  await refused('nv_night', SUN, '09:00');
});

test('no assigned shift means no window: refused, and an approved request covering the time opens it', async () => {
  await F.person('nv_free', 'staff', { shiftCode: null });
  const none = await refused('nv_free', MON, '09:00');
  assert.match(none.message, /Chưa được gán ca cố định/);
  await declare('nv_free', { [MON]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' } });
  await allowed('nv_free', MON, '17:30', 'ot');
  await refused('nv_free', MON, '09:00');
});

test('a request-covered Check-in outside the window opens an outside-shift session that follows the explanation flow', async () => {
  await declare('nv_a', { [MON]: withExtra('makeup', '19:00') });
  F.explainPunches = false;
  try {
    await F.at(`${MON}T17:30:00`);
    const none = await F.call('POST', '/punch', { who: 'nv_a', body: { type: 'in', requestId: crypto.randomUUID() } });
    assert.equal(none.status, 409, JSON.stringify(none.data));
    assert.equal(none.data.code, 'CHECKIN_NEEDS_EXPLANATION');
    assert.equal(none.data.case, 'offShift');
    assert.equal((await store.listSessions({ username: 'nv_a' })).length, 0);
    const opened = await F.call('POST', '/punch', {
      who: 'nv_a',
      body: { type: 'in', requestId: crypto.randomUUID(), explanation: 'Làm bù sau ca' }
    });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.equal(opened.data.openSession.entry.outsideShift, true);
    await F.at(`${MON}T18:30:00`);
    const closed = await F.call('POST', '/punch', {
      who: 'nv_a',
      body: { type: 'out', sessionId: opened.data.openSession.id, requestId: crypto.randomUUID() }
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.data));
    assert.equal(closed.data.lastSession.entry.reason, 'off-shift');
  } finally {
    F.explainPunches = true;
  }
});

test('Check-out of an open session is not touched by the Check-in gate', async () => {
  await F.at(`${MON}T08:00:00`);
  const r = await F.call('POST', '/punch', { who: 'nv_a', body: { type: 'in', requestId: crypto.randomUUID() } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await F.at(`${MON}T20:00:00`);
  const state = (await F.call('GET', '/punch', { who: 'nv_a' })).data;
  assert.equal(state.canCheckIn, false);
  assert.equal(state.checkInBlock, undefined, 'đang có lượt mở: không có câu chặn Check-in');
  const out = await F.call('POST', '/punch', {
    who: 'nv_a',
    body: { type: 'out', sessionId: state.openSession.id, requestId: crypto.randomUUID(), explanation: 'Ở lại' }
  });
  assert.equal(out.status, 200, JSON.stringify(out.data));
});

// Phán quyết thuần: khoảng trước ca của khoản làm bù / OT (không có ca nào đủ xa trong cấu hình mặc định, nên kiểm trực tiếp)
test('entitlement of a before-shift range: only the covered times of the shift date', async () => {
  const day = { ...WORK, extraKind: 'makeup', extraIn: '01:00' };
  const gate = new CheckinEntitlement({
    punch: PunchRules,
    declared: (_?, date?) => (date === MON ? { day, approval: { item: 'makeup_hours', status: 'approved' } } : null),
    dayBlock: () => ({ block: '', via: 'shift' })
  });
  const staff = { shiftCode: 'n1', isWorkDay: () => true };
  const at = (hm?) => gate.decide(staff, new Date(Date.parse(`${MON}T${hm}:00+07:00`)).toISOString());
  assert.equal((await at('00:59')).allowed, false);
  assert.equal((await at('00:59')).code, OUTSIDE);
  const early = await at('01:00');
  assert.equal(early.allowed, true);
  assert.equal(early.entitlement, 'makeup_hours');
  assert.equal((await at('03:59')).entitlement, 'makeup_hours');
  assert.equal((await at('04:00')).entitlement, 'shift');
});
