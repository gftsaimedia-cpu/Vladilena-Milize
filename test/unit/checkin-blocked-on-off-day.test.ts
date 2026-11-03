'use strict';
// Nhân viên không Check-in được vào ngày nghỉ cả ngày: iSAT, nghỉ phép năm, nghỉ không lương đã khai (chờ duyệt hay đã duyệt, khoản bị từ chối không chặn);
// nghỉ được duyệt, nghỉ sẽ làm bù chỉ chặn khi đã duyệt. Ngày có OT / làm bù theo giờ đã duyệt vẫn Check-in được. Check-out lượt đang mở không bị chặn,
// khai thay của Admin không qua cổng. Câu báo nêu loại nghỉ; màn chấm công đọc cùng câu đó qua GET /api/punch.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const { store } = F;

// 01/11/2026 là Chủ nhật: 02/11 Thứ Hai, 04/11 Thứ Tư, 07/11 Thứ Bảy. Chức vụ nv làm T2–T7.
const MONTH = '2026-11',
  MON = '2026-11-02',
  WED = '2026-11-04',
  SAT = '2026-11-07';
const WORK = { kind: 'work', in: '08:00', out: '17:00' };

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.person('admin', 'admin');
  await F.person('nv_off');
  await F.at(`${MON}T07:00:00`);
});

const punch = async (who?, type?) =>
  F.call('POST', '/punch', {
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
const saveOwn = async (days?) => {
  const r = await F.call('PUT', '/sheet', { who: 'nv_off', body: { month: MONTH, days } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
const saveForStaff = async (days?) => {
  const r = await F.call('PUT', '/sheet', { who: 'admin', body: { month: MONTH, user: 'nv_off', days } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
async function decide(date?, action?) {
  const a = (await F.call('GET', `/sheet?month=${MONTH}`, { who: 'nv_off' })).data.approvals[date];
  assert.ok(a, `có khoản cần duyệt ngày ${date}`);
  const r = await F.call('PUT', '/approvals/decide', {
    body: {
      action,
      ...(action === 'reject' ? { note: 'Không đồng ý' } : {}),
      items: [{ username: 'nv_off', date, rev: a.rev, fingerprint: a.fingerprint }]
    }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
const stateAt = async (iso?) => {
  await F.at(iso);
  return (await F.call('GET', '/punch', { who: 'nv_off' })).data;
};
async function assertBlocked(iso?, phrase?) {
  const state = await stateAt(iso);
  assert.equal(state.canCheckIn, false);
  assert.equal(state.checkInBlock, `Hôm nay bạn ${phrase}, không Check-in được.`);
  const before = await stored();
  const r = await punch('nv_off', 'in');
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.code, 'CHECKIN_NOT_ALLOWED');
  assert.equal(r.data.error, `Hôm nay bạn ${phrase}, không Check-in được.`);
  assert.deepEqual(await stored(), before, 'lượt bị từ chối không ghi phiên, lượt bấm hay requestId');
}

test('ngày Admin khai iSAT (duyệt ngay): GET /api/punch tắt Check-in kèm câu nêu iSAT, POST /api/punch 409 và không ghi gì', async () => {
  await saveForStaff({ [SAT]: { kind: 'isat' } });
  await assertBlocked(`${SAT}T08:00:00`, 'nghỉ iSAT');
});

test('nghỉ phép năm: chờ duyệt đã chặn "nghỉ phép năm"; đã duyệt vẫn chặn; bị từ chối thì Check-in lại được', async () => {
  await saveOwn({ [MON]: { kind: 'leave' } });
  await assertBlocked(`${MON}T08:00:00`, 'nghỉ phép năm');
  await decide(MON, 'approve');
  await assertBlocked(`${MON}T08:00:00`, 'nghỉ phép năm');
  await F.at(`${MON}T09:00:00`);
  await decide(MON, 'reject');
  assert.equal((await stateAt(`${MON}T08:00:00`)).canCheckIn, true, 'bị từ chối thì không là ngày nghỉ');
  assert.equal((await punch('nv_off', 'in')).status, 200);
});

test('iSAT nhân viên tự khai đang chờ duyệt chặn Check-in; bị từ chối thì Check-in lại được', async () => {
  await saveOwn({ [SAT]: { kind: 'isat' } });
  await assertBlocked(`${SAT}T08:00:00`, 'nghỉ iSAT');
  await F.at(`${SAT}T09:00:00`);
  await decide(SAT, 'reject');
  assert.equal((await stateAt(`${SAT}T08:00:00`)).canCheckIn, true);
});

test('nghỉ được duyệt đang chờ duyệt chưa chặn Check-in', async () => {
  await saveOwn({ [MON]: { kind: 'approved' } });
  assert.equal((await stateAt(`${MON}T08:00:00`)).canCheckIn, true);
});

test('nghỉ không lương đã khai (không có khoản duyệt) chặn "nghỉ không lương"', async () => {
  await saveOwn({ [WED]: { kind: 'unpaid' } });
  await assertBlocked(`${WED}T08:00:00`, 'nghỉ không lương');
});

test('nghỉ được duyệt và nghỉ sẽ làm bù đã duyệt chặn Check-in, nêu đúng loại', async () => {
  await saveOwn({ [MON]: { kind: 'approved' }, [WED]: { kind: 'willmakeup' } });
  await decide(MON, 'approve');
  await decide(WED, 'approve');
  await assertBlocked(`${MON}T08:00:00`, 'nghỉ được duyệt');
  await assertBlocked(`${WED}T08:00:00`, 'nghỉ, sẽ làm bù');
});

test('ngày làm việc thường và ngày có OT đã duyệt vẫn Check-in được; ngày chỉ khai đi làm không đổi', async () => {
  assert.equal((await stateAt(`${MON}T08:00:00`)).canCheckIn, true);
  await saveOwn({ [WED]: { ...WORK, extraKind: 'ot', extraOut: '19:00' } });
  await decide(WED, 'approve');
  assert.equal((await stateAt(`${WED}T08:00:00`)).canCheckIn, true);
  assert.equal((await punch('nv_off', 'in')).status, 200);
});

test('Check-out của lượt đang mở không bị chặn khi Admin khai ngày đó nghỉ; ngày khác không bị ảnh hưởng', async () => {
  await F.at(`${MON}T08:00:00`);
  const opened = await punch('nv_off', 'in');
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  await saveForStaff({ [MON]: { kind: 'leave' } });
  await F.at(`${MON}T17:00:00`);
  const out = await punch('nv_off', 'out');
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal((await stateAt(`${WED}T08:00:00`)).canCheckIn, true);
});
