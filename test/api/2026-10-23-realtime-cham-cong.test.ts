'use strict';
// Realtime chấm công:
//   - POST /api/punch thành công (Check-in, Check-out, cả lượt mở quá 16 giờ tự đóng) phát attendance.changed { kind: 'punch', month }
//     tới người có attendance.correct (Admin, C&B), KHÔNG tới nhân sự khác (kể cả người có attendance.read nhưng không sửa được công).
//   - punch.changed { month, date } chỉ tới chính người bấm (mọi máy của họ) để máy thứ hai nạp lại.
//   - month = tháng của ngày công (ca đêm thuộc ngày bắt đầu). Payload không mang giờ, tên, toạ độ.
//   - Yêu cầu bị từ chối (4xx) không phát gì.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả bằng F.at (api-fixture).
const P = require('../helpers/period-api');
const SSE = require('../helpers/sse-client');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { F, store } = P;
F.explainPunches = true; // lượt bấm trễ ở đây chỉ là đầu vào: kèm giải trình lúc bấm
const { events } = SSE;

before(F.start);
after(F.stop);
afterEach(() => {
  events.configure({});
  events.closeAll();
});

// Admin, C&B (qa_nv1, vai trò cb), HR (qa_ctv1: có attendance.read nhưng không có attendance.correct), một nhân sự thường (qa_nv2) và người bấm (qa_tts1, ca n1 Thứ Hai đến Thứ Sáu)
async function setup(clock = '2026-11-03T07:50:00') {
  await F.reset();
  await P.revokeAllRoles();
  await F.at(clock);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_tts1', 'staff', { type: 'tts', level: 3, shiftCode: 'n1', startDate: '2026-01-05' });
  await F.person('qa_nv1', 'staff', { type: 'nv', level: 1, shiftCode: 'g2', startDate: '2026-01-05', nightPct: 60 });
  await F.person('qa_nv2', 'staff', { type: 'nv', level: 3, shiftCode: 'n2', startDate: '2026-01-05' });
  await F.person('qa_ctv1', 'staff', { type: 'ctv', level: 2, shiftCode: 'n2', startDate: '2026-01-05' });
  await P.grant('qa_nv1', 'cb');
  await P.grant('qa_ctv1', 'hr');
}
const punch = (who?, body?) => F.call('POST', '/punch', { who, body: { requestId: randomUUID(), ...body } });
const punchIn = (who?) => punch(who, { type: 'in' });
const punchOut = async (who?) => punch(who, { type: 'out', sessionId: (await store.openSession(who)).id });
// Mọi khung mang dữ liệu nhạy cảm: giờ, tên, tên đăng nhập, toạ độ
const LEAK = /qa_|Người thử|\d{1,2}:\d{2}|T\d\d|lat|lng|location|toạ độ/i;

test('R: Check-in phát attendance.changed kind punch tới Admin và C&B, không tới nhân sự khác; punch.changed chỉ tới chính người bấm (cả hai máy)', async () => {
  await setup();
  const [admin, cb, hr, staff, deviceA, deviceB] = await SSE.openMany(
    'admin',
    'qa_nv1',
    'qa_ctv1',
    'qa_nv2',
    'qa_tts1',
    'qa_tts1'
  );
  const all = [admin, cb, hr, staff, deviceA, deviceB];
  await SSE.settle(all);

  const res = await punchIn('qa_tts1');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const [fAdmin, fCb, fHr, fStaff, fA, fB] = await SSE.settle(all);

  for (const [who, frames] of [
    ['admin', fAdmin],
    ['qa_nv1 (C&B)', fCb]
  ]) {
    const got = SSE.only(frames, 'attendance.changed');
    assert.equal(got.length, 1, `${who}: đúng một attendance.changed`);
    assert.equal(got[0].data.kind, 'punch', who);
    assert.equal(got[0].data.month, '2026-11', who);
    assert.ok(
      Object.keys(got[0].data).every(key => ['kind', 'month'].includes(key)),
      `${who}: chỉ có trường được phép: ${Object.keys(got[0].data)}`
    );
    assert.deepEqual(SSE.only(frames, 'punch.changed'), [], `${who}: không nhận punch.changed của người khác`);
  }
  // người có attendance.read nhưng không có attendance.correct, và nhân sự thường: không nhận gì về lượt chấm công của người khác
  assert.deepEqual(fHr, [], 'HR (attendance.read, không attendance.correct)');
  assert.deepEqual(fStaff, [], 'nhân sự thường');
  // chính người bấm: mỗi máy đúng một punch.changed { month, date }, không có attendance.changed
  for (const [label, frames] of [
    ['máy 1', fA],
    ['máy 2', fB]
  ]) {
    assert.deepEqual(
      SSE.only(frames, 'punch.changed').map(f => f.data),
      [{ month: '2026-11', date: '2026-11-03' }],
      `người bấm, ${label}`
    );
    assert.deepEqual(SSE.only(frames, 'attendance.changed'), [], `người bấm không nhận attendance.changed (${label})`);
  }
  // không khung nào mang giờ, tên, tên đăng nhập hay toạ độ
  assert.doesNotMatch(JSON.stringify([fAdmin, fCb, fA, fB]), LEAK);
});

test('R: Check-out cũng phát attendance.changed kind punch (Admin, C&B) và punch.changed (chính người bấm); nhân sự khác không nhận', async () => {
  await setup();
  assert.equal((await punchIn('qa_tts1')).status, 200);
  await F.at('2026-11-03T17:10:00');
  const [admin, cb, staff, self] = await SSE.openMany('admin', 'qa_nv1', 'qa_nv2', 'qa_tts1');
  const all = [admin, cb, staff, self];
  await SSE.settle(all);

  const res = await punchOut('qa_tts1');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const [fAdmin, fCb, fStaff, fSelf] = await SSE.settle(all);

  for (const frames of [fAdmin, fCb]) {
    const got = SSE.only(frames, 'attendance.changed');
    assert.equal(got.length, 1);
    assert.equal(got[0].data.kind, 'punch');
    assert.equal(got[0].data.month, '2026-11');
  }
  assert.deepEqual(fStaff, []);
  assert.deepEqual(
    SSE.only(fSelf, 'punch.changed').map(f => f.data),
    [{ month: '2026-11', date: '2026-11-03' }]
  );
  assert.doesNotMatch(JSON.stringify([fAdmin, fCb, fSelf]), LEAK);
});

test('R: ca đêm — Check-in 30/11 và Check-out 01/12 đều thuộc tháng của ngày bắt đầu ca (2026-11) ở cả attendance.changed lẫn punch.changed', async () => {
  await setup('2026-11-30T21:55:00');
  const [admin, self] = await SSE.openMany('admin', 'qa_nv1');
  // qa_nv1 là C&B của setup chung: dùng chính người này để chấm công đêm thì bản thân cũng có attendance.correct; nên chỉ kiểm Admin và punch.changed
  await SSE.settle([admin, self]);

  assert.equal((await punchIn('qa_nv1')).status, 200);
  let [fAdmin, fSelf] = await SSE.settle([admin, self]);
  assert.equal(SSE.only(fAdmin, 'attendance.changed')[0].data.month, '2026-11');
  assert.deepEqual(SSE.only(fSelf, 'punch.changed')[0].data, { month: '2026-11', date: '2026-11-30' });

  await F.at('2026-12-01T07:05:00');
  assert.equal((await punchOut('qa_nv1')).status, 200);
  [fAdmin, fSelf] = await SSE.settle([admin, self]);
  const out = SSE.only(fAdmin, 'attendance.changed');
  assert.equal(out.length, 1);
  assert.equal(out[0].data.kind, 'punch');
  assert.equal(out[0].data.month, '2026-11', 'Check-out sáng 01/12 vẫn thuộc ca bắt đầu ngày 30/11');
  assert.deepEqual(SSE.only(fSelf, 'punch.changed')[0].data, { month: '2026-11', date: '2026-11-30' });
});

test('R: lượt mở quá 16 giờ tự đóng khi người đó Check-in lần sau — phát attendance.changed cho cả tháng của lượt cũ (2026-11) và của lượt mới (2026-12)', async () => {
  await setup('2026-11-30T07:55:00');
  assert.equal((await punchIn('qa_tts1')).status, 200); // lượt ngày 30/11, rồi quên Check-out
  const stale = await store.openSession('qa_tts1');
  const [admin, staff, self] = await SSE.openMany('admin', 'qa_nv2', 'qa_tts1');
  await SSE.settle([admin, staff, self]);

  await F.at('2026-12-01T10:00:00'); // 26 giờ sau
  const res = await punchIn('qa_tts1');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const closed = await store.getSession(stale.id);
  assert.equal(closed.state, 'closed', 'lượt cũ đã bị đóng vì quá 16 giờ');
  assert.equal(closed.entry.reason, 'forgot-out');

  const [fAdmin, fStaff, fSelf] = await SSE.settle([admin, staff, self]);
  const got = SSE.only(fAdmin, 'attendance.changed');
  assert.ok(
    got.every(f => f.data.kind === 'punch'),
    JSON.stringify(got)
  );
  const months = new Set<any>(got.map(f => f.data.month));
  assert.ok(months.has('2026-11'), `tháng của lượt tự đóng: ${[...months]}`);
  assert.ok(months.has('2026-12'), `tháng của lượt Check-in mới: ${[...months]}`);
  assert.deepEqual(fStaff, []);
  assert.ok(
    SSE.only(fSelf, 'punch.changed').some(f => f.data.date === '2026-12-01' && f.data.month === '2026-12'),
    'người bấm nhận punch.changed của lượt mới'
  );
});

test('R: yêu cầu bị từ chối không phát sự kiện nào (bấm trùng 409, Admin chấm công 403, Check-out sai lượt 404; Check-in luôn bật từ 23/10/2026 nên không còn lỗi chưa tới ngày bật)', async () => {
  await setup();
  assert.equal((await punchIn('qa_tts1')).status, 200);
  const [admin, cb, self, staff] = await SSE.openMany('admin', 'qa_nv1', 'qa_tts1', 'qa_nv2');
  const all = [admin, cb, self, staff];
  await SSE.settle(all);

  assert.equal((await punchIn('qa_tts1')).status, 409, 'đang có lượt mở');
  assert.equal((await punchIn('admin')).status, 403, 'Admin không chấm công');
  assert.equal((await punch('qa_tts1', { type: 'out', sessionId: 999999 })).status, 404, 'lượt không tồn tại');
  const got = await SSE.settle(all);
  assert.deepEqual(got, [[], [], [], []]);
});

test('R: danh mục sự kiện — punch.changed chỉ gửi theo người nhận chỉ định, chỉ giữ month và date; attendance.changed nhận kind punch', async () => {
  await setup();
  const catalog = events.EVENTS['punch.changed'];
  assert.ok(catalog, 'src/platform/events.ts → EVENTS phải có punch.changed');
  assert.deepEqual(catalog.audiences, ['users']);
  assert.deepEqual(
    catalog.tiers.flatMap(tier => tier.fields),
    ['month', 'date']
  );
  await assert.rejects(
    async () => events.publish('punch.changed', {}, { all: true }),
    /không được phát tới kiểu người nhận này/
  );

  const [self, other, admin] = await SSE.openMany('qa_tts1', 'qa_nv2', 'admin');
  await SSE.settle([self, other, admin]);
  events.publish(
    'punch.changed',
    { month: '2026-11', date: '2026-11-03', in: '07:58', name: 'Người thử', lat: 10.7, nested: { a: 1 } },
    { users: ['qa_tts1'] }
  );
  const [fSelf, fOther, fAdmin] = await SSE.settle([self, other, admin]);
  assert.deepEqual(
    SSE.only(fSelf, 'punch.changed').map(f => f.data),
    [{ month: '2026-11', date: '2026-11-03' }],
    'trường lạ bị bỏ'
  );
  assert.deepEqual([fOther, fAdmin], [[], []]);
});
