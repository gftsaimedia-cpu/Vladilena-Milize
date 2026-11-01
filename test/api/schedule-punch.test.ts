'use strict';
// Check-in/out theo lịch của từng người (punch.js nhận staff.isWorkDay).
// Ca 1 (planShift), ca 4 (di chuyển dữ liệu cũ); ca 2, 3 đi qua POST /api/punch và punchState có workDate, scheduled.
// Chỉ Check-in/out đọc lịch; lượt chấm công không bao giờ ghi vào Lịch ước tính (hai luồng giữ tách).
const S = require('../helpers/schedule-api');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const PunchRules = require('../../src/engine/punch');

const { F, store, F0 } = S;
F.explainPunches = true; // lượt bấm trễ ở đây chỉ là đầu vào: kèm giải trình lúc bấm

before(F.start);
after(F.stop);
beforeEach(async () => {
  await S.world();
  await F.at('2026-11-02T09:00:00');
});
// Check-in luôn bật nên enable() không làm gì; giữ để các bài đọc rõ bước
const enable = async (_month?) => {};
const sessionBody = require('../helpers/session-contract-helper');
const punch = async (who?, type?) =>
  await F.call('POST', '/punch', { who, body: await sessionBody(store, who, 'POST', '/punch', { type }) });

test('S1: chấm công 1: planShift với staff.isWorkDay: ngày trong lịch kind "work", ngày ngoài lịch "makeup"; với staff.sched (tương thích) cho đúng như hôm nay', () => {
  const mwf = { shiftCode: 'n1', isWorkDay: (d?) => F0.MWF.includes(F0.dowOf(d)) };
  assert.equal(PunchRules.planShift(mwf, '2026-11-02').kind, 'work'); // Thứ Hai
  assert.equal(PunchRules.planShift(mwf, '2026-11-03').kind, 'makeup'); // Thứ Ba
  assert.equal(PunchRules.planShift(mwf, '2026-11-07').kind, 'makeup'); // Thứ Bảy
  const compat = { shiftCode: 'n1', sched: F0.MON_FRI };
  assert.equal(PunchRules.planShift(compat, '2026-11-06').kind, 'work');
  assert.equal(PunchRules.planShift(compat, '2026-11-07').kind, 'makeup');
  // isWorkDay thắng sched khi có cả hai (lịch giải theo ngày được ưu tiên)
  assert.equal(PunchRules.planShift({ ...compat, isWorkDay: () => false }, '2026-11-02').kind, 'makeup');
});

test('S1: chấm công 2: TTS vào Thứ Bảy 07/11 (ngoài lịch T2–T6, không có OT / làm bù được duyệt): GET /api/punch có scheduled false, workDate và không cho Check-in; Thứ Sáu thì scheduled true; Lịch ước tính không bị ghi', async () => {
  await enable('2026-11-02');
  const before = JSON.stringify(await store.getSheet('qa_s_tts', S.MONTH));
  await F.at('2026-11-07T08:00:00');
  let r = S.must(await F.call('GET', '/punch', { who: 'qa_s_tts' }), 'GET /punch Thứ Bảy');
  assert.equal(r.data.scheduled, false);
  assert.equal(r.data.workDate, '2026-11-07');
  assert.equal(r.data.canCheckIn, false);
  assert.match(r.data.checkInBlock, /không có lịch làm việc/);
  r = await punch('qa_s_tts', 'in');
  assert.equal(r.status, 409, 'lịch của loại quyết định: Thứ Bảy ngoài lịch thì không Check-in');
  assert.equal((await store.listSessions({ username: 'qa_s_tts' })).length, 0);
  await F.at('2026-11-06T08:00:00');
  r = S.must(await punch('qa_s_tts', 'in'), 'vào Thứ Sáu');
  assert.equal(r.data.scheduled, true);
  assert.equal(r.data.workDate, '2026-11-06');
  assert.equal(r.data.open.plannedShift.kind, 'work');
  assert.ok(!r.data.openSession.entry.outsideShift);
  assert.equal(
    JSON.stringify(await store.getSheet('qa_s_tts', S.MONTH)),
    before,
    'chấm công không ghi vào Lịch ước tính'
  );
});

test('S1: chấm công 3: ca đêm cuối tháng: người ca g2 vào lúc 00:30 ngày 01/11 (ngày công 31/10, tháng 10): lịch của 31/10 quyết định', async () => {
  await F.person('qa_s_night', 'staff', { shiftCode: 'g2' });
  await F.at('2026-10-31T09:00:00');
  await enable('2026-10-31');
  await F.at('2026-11-01T00:30:00');
  const r = S.must(await punch('qa_s_night', 'in'), 'vào ca đêm');
  assert.equal(r.data.workDate, '2026-10-31');
  assert.equal(r.data.scheduled, true, 'ngày công 31/10 là Thứ Bảy, nằm trong lịch T2–T7 của NV');
  assert.equal(r.data.open.plannedShift.kind, 'work');
});
