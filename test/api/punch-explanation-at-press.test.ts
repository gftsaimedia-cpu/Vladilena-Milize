'use strict';
// Giải trình lúc bấm: Check-in / Check-out không hợp lệ (cùng luật nhãn của lượt, SessionStatus) phải kèm giải trình ngay lần bấm.
//   Không có giải trình: 409 CHECKIN_NEEDS_EXPLANATION / CHECKOUT_NEEDS_EXPLANATION (kèm trường hợp, số phút), không ghi gì.
//   Có giải trình: ghi đúng giờ bấm, giải trình gắn với lượt (punch-in / punch-out), lượt "Chờ xử lý" cho tới khi Admin quyết định.
//   Admin duyệt: lượt "Được phê duyệt", hết giữ lương; từ chối: lượt "Bị từ chối", ngày giữ lương ở trạng thái từ chối.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const explanations = require('../../src/domain/explanation/explanations');
const AS = require('../../src/engine/attendance-status');

const iso = X.iso;
const punch = X.punch;
const NAMES = ['tre', 'som', 'dung', 'ngoai', 'vung', 'trung', 'duyet', 'tuchoi', 'muon', 'quen'];
let seq = 0;
const rid = () => `pe-${String(++seq).padStart(4, '0')}-req`;

before(async () => {
  await F.start();
  await F.at('2026-10-19T12:00:00');
  for (const name of NAMES) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

const pressIn = async (who?, at?, extra: any = {}) => {
  await F.at(at);
  return await punch(who, { type: 'in', requestId: rid(), ...extra });
};
const pressOut = async (who?, sessionId?, at?, extra: any = {}) => {
  await F.at(at);
  return await punch(who, { type: 'out', sessionId, requestId: rid(), ...extra });
};
const sessionsOf = async (who?) => await F.store.listSessions({ username: who });
const heldOf = async (who?, month = '2026-10') =>
  ((await explanations.heldByUser(month)).get(who) || []).map(d => `${d.date}:${d.status}`);
const lastOf = async (who?) => {
  await F.at('2026-10-29T12:00:00');
  return (await F.call('GET', '/punch', { who })).data.lastSession;
};

test('Check-in trễ quá ngưỡng: 409 CHECKIN_NEEDS_EXPLANATION, không ghi lượt; có giải trình thì ghi đúng giờ bấm, lượt Chờ xử lý', async () => {
  const none = await pressIn('tre', '2026-10-20T08:20:00');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'CHECKIN_NEEDS_EXPLANATION');
  assert.equal(none.data.case, 'late');
  assert.equal(none.data.minutes, 20);
  assert.equal(none.data.note, 'Vào trễ 20 phút');
  assert.equal((await sessionsOf('tre')).length, 0); // 409 không ghi gì
  assert.equal((await explanations.list({ username: 'tre' })).length, 0);

  const blank = await pressIn('tre', '2026-10-20T08:20:00', { explanation: '   ' });
  assert.equal(blank.status, 409);

  const ok = await pressIn('tre', '2026-10-20T08:20:00', { explanation: 'Kẹt xe' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const [session] = await sessionsOf('tre');
  assert.equal(session.state, 'open');
  assert.equal(session.entry.presIn, iso('2026-10-20T08:20:00')); // giờ bấm thật
  const [e] = await explanations.list({ username: 'tre' });
  assert.equal(e.kind, 'punch-in');
  assert.equal(e.status, 'answered');
  assert.equal(e.sessionId, session.id);
  assert.equal(e.answer, 'Kẹt xe');
  assert.equal(e.prompt, 'Vào trễ 20 phút');
  assert.equal(ok.data.openSession.status, 'pending');
  assert.equal(AS.labelOf(ok.data.openSession), 'Chờ xử lý');
  assert.deepEqual(await heldOf('tre'), ['2026-10-20:answered']);
});

test('Check-out sớm: 409 CHECKOUT_NEEDS_EXPLANATION kèm phút về sớm và số "nếu Check-out bây giờ"; có giải trình thì giờ bấm là giờ ra, lượt Chờ xử lý', async () => {
  const opened = await pressIn('som', '2026-10-20T08:00:00');
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const id = opened.data.open.id;
  const none = await pressOut('som', id, '2026-10-20T16:25:00');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  assert.equal(none.data.case, 'early');
  assert.equal(none.data.minutes, 35);
  assert.equal(none.data.note, 'Về sớm 35 phút');
  assert.equal(none.data.preview.early, 35);
  assert.equal((await F.store.getSession(id)).state, 'open'); // huỷ hộp = vẫn đang làm

  const ok = await pressOut('som', id, '2026-10-20T16:25:00', { explanation: 'Đi khám bệnh' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const s = await F.store.getSession(id);
  assert.equal(s.state, 'closed');
  assert.equal(s.entry.presOut, iso('2026-10-20T16:25:00'));
  const mine = await explanations.list({ username: 'som' });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].kind, 'punch-out');
  assert.equal(mine[0].prompt, 'Về sớm 35 phút');
  const last = await lastOf('som');
  assert.equal(AS.labelOf(last), 'Chờ xử lý');
});

test('Check-in, Check-out hợp lệ (đúng giờ, trễ trong ngưỡng, ra muộn trong mức cho phép): không hỏi giải trình, không ghi giải trình', async () => {
  const opened = await pressIn('dung', '2026-10-20T08:10:00'); // trễ 10 phút, trong ngưỡng
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const closed = await pressOut('dung', opened.data.open.id, '2026-10-20T17:20:00'); // muộn 20 phút, trong mức cho phép
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  assert.equal((await explanations.list({ username: 'dung' })).length, 0);
  assert.equal(AS.labelOf(await lastOf('dung')), 'Đã Check-out');
});

test('Check-out muộn quá mức vẫn đòi giải trình như trước (CHECKOUT_NEEDS_EXPLANATION, trường hợp lateOut)', async () => {
  const opened = await pressIn('muon', '2026-10-20T08:00:00');
  const none = await pressOut('muon', opened.data.open.id, '2026-10-20T18:10:00');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  assert.equal(none.data.case, 'lateOut');
  assert.equal(none.data.minutes, 70);
  assert.equal(none.data.note, 'Check-out muộn 70 phút');
  const ok = await pressOut('muon', opened.data.open.id, '2026-10-20T18:10:00', { explanation: 'Chờ khách' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await explanations.list({ username: 'muon' }))[0].kind, 'late-checkout');
});

test('Check-in ngoài ca có OT được duyệt phủ giờ đó: 409 trường hợp offShift; có giải trình thì ghi lượt ngoài ca, Chờ xử lý', async () => {
  const declared = await F.call('PUT', '/sheet', {
    who: 'admin',
    body: {
      user: 'ngoai',
      month: '2026-10',
      days: { '2026-10-20': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '21:00' } }
    }
  });
  assert.equal(declared.status, 200, JSON.stringify(declared.data));
  const none = await pressIn('ngoai', '2026-10-20T20:00:00');
  assert.equal(none.status, 409, JSON.stringify(none.data));
  assert.equal(none.data.code, 'CHECKIN_NEEDS_EXPLANATION');
  assert.equal(none.data.case, 'offShift');
  assert.equal(none.data.note, 'Ngoài ca');
  assert.equal((await sessionsOf('ngoai')).length, 0);
  const ok = await pressIn('ngoai', '2026-10-20T20:00:00', { explanation: 'Làm thêm việc gấp' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await sessionsOf('ngoai'))[0].entry.outsideShift, true);
  assert.equal((await explanations.list({ username: 'ngoai' }))[0].kind, 'punch-in');
  assert.equal(AS.labelOf(ok.data.openSession), 'Chờ xử lý');
});

test('Check-in ngoài vùng GPS: 409 trường hợp outsideZone; trong vùng thì không hỏi', async () => {
  const fence = { lat: 10.7769, lng: 106.7009, radiusM: 150, maxAccuracyM: 80 };
  assert.equal((await F.call('PUT', '/settings/geofence', { who: 'admin', body: fence })).status, 200);
  const far = { lat: 10.7769 + 0.01, lng: 106.7009, accuracy: 10 };
  const near = { lat: 10.7769, lng: 106.7009, accuracy: 10 };
  const none = await pressIn('vung', '2026-10-20T08:00:00', { location: far });
  assert.equal(none.status, 409, JSON.stringify(none.data));
  assert.equal(none.data.case, 'outsideZone');
  assert.equal(none.data.note, 'Ngoài vùng GPS');
  assert.equal((await sessionsOf('vung')).length, 0);
  const ok = await pressIn('vung', '2026-10-20T08:00:00', { location: far, explanation: 'Họp ở chi nhánh' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await sessionsOf('vung'))[0].entry.outsideZone, true);
  const inside = await pressIn('dung', '2026-10-21T08:00:00', { location: near });
  assert.equal(inside.status, 200, JSON.stringify(inside.data));
  assert.equal((await F.call('PUT', '/settings/geofence', { who: 'admin', body: null })).status, 200);
});

test('Lượt thứ hai trong cùng một ca: 409 trường hợp multiple khi Check-in', async () => {
  const first = await pressIn('trung', '2026-10-20T08:00:00');
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const out = await pressOut('trung', first.data.open.id, '2026-10-20T08:01:00', { explanation: 'Bấm nhầm' });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  const none = await pressIn('trung', '2026-10-20T08:05:00');
  assert.equal(none.status, 409, JSON.stringify(none.data));
  assert.equal(none.data.case, 'multiple');
  assert.equal(none.data.note, 'Nhiều lượt trong một ca');
  const ok = await pressIn('trung', '2026-10-20T08:05:00', { explanation: 'Vào lại sau khi bấm nhầm' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await explanations.list({ username: 'trung' })).filter(x => x.kind === 'punch-in').length, 1);
});

test('Check-in trễ và Check-out sớm cùng một lượt: hai giải trình, Admin duyệt từng cái; một đầu còn chờ thì lượt vẫn Chờ xử lý', async () => {
  const opened = await pressIn('duyet', '2026-10-21T08:30:00', { explanation: 'Kẹt xe' });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const closed = await pressOut('duyet', opened.data.open.id, '2026-10-21T16:00:00', { explanation: 'Việc nhà' });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const [a, b] = (await explanations.list({ username: 'duyet' })).sort((x: any, y: any) => x.id - y.id);
  assert.deepEqual([a.kind, b.kind], ['punch-in', 'punch-out']);
  assert.equal((await X.decide(a.id, true)).status, 200);
  assert.equal(AS.labelOf(await lastOf('duyet')), 'Chờ xử lý'); // Check-out sớm còn chờ
  assert.deepEqual(await heldOf('duyet'), ['2026-10-21:answered']);
  assert.equal((await X.decide(b.id, true)).status, 200);
  const last = await lastOf('duyet');
  assert.equal(AS.labelOf(last), 'Được phê duyệt');
  assert.deepEqual(await heldOf('duyet'), []); // duyệt hết thì hết giữ lương
  const s = await F.store.getSession(opened.data.open.id);
  assert.equal(s.entry.presIn, iso('2026-10-21T08:30:00')); // duyệt không đổi giờ bấm
  assert.equal(s.entry.presOut, iso('2026-10-21T16:00:00'));
});

test('Admin từ chối giải trình lúc bấm: lượt Bị từ chối (cả khi đầu kia đã duyệt), ngày giữ lương ở trạng thái từ chối; đổi ý duyệt thì hết giữ', async () => {
  const opened = await pressIn('tuchoi', '2026-10-22T08:40:00', { explanation: 'Kẹt xe' });
  const closed = await pressOut('tuchoi', opened.data.open.id, '2026-10-22T17:00:00');
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const [e] = await explanations.list({ username: 'tuchoi' });
  assert.equal((await X.decide(e.id, false)).status, 200);
  const last = await lastOf('tuchoi');
  assert.equal(AS.labelOf(last), 'Bị từ chối');
  assert.equal(AS.labelOf((await F.call('GET', '/punch', { who: 'tuchoi' })).data.record), 'Bị từ chối');
  assert.deepEqual(await heldOf('tuchoi'), ['2026-10-22:rejected']);
  assert.equal((await X.decide(e.id, true)).status, 200);
  assert.equal(AS.labelOf(await lastOf('tuchoi')), 'Được phê duyệt');
  assert.deepEqual(await heldOf('tuchoi'), []);
});

test('Admin thấy giải trình lúc bấm trong danh sách Giải trình (kind, prompt, câu trả lời) và duyệt như giải trình Check-out muộn', async () => {
  const seen = await F.call('GET', '/explanations?status=answered&user=tre', { who: 'admin' });
  assert.equal(seen.status, 200);
  const [item] = seen.data.items;
  assert.equal(item.kind, 'punch-in');
  assert.equal(item.prompt, 'Vào trễ 20 phút');
  assert.equal(item.answer, 'Kẹt xe');
  assert.equal(item.requestedOut, null);
  const done = await X.decide(item.id, true);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.recorded, false); // chỉ quyết định nhãn và giữ lương, không ghi lượt Admin
  assert.deepEqual((await F.store.listSessions({ username: 'tre' })).filter(s => s.entry.origin).length, 0);
});

test('Giải trình Check-in trễ đã duyệt chỉ che đầu Check-in: quên Check-out sau đó vẫn là Chờ xử lý', async () => {
  const opened = await pressIn('quen', '2026-10-23T08:30:00', { explanation: 'Kẹt xe' });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const [e] = await explanations.list({ username: 'quen' });
  assert.equal((await X.decide(e.id, true)).status, 200);
  await F.at('2026-10-23T12:00:00');
  assert.equal(AS.labelOf((await F.call('GET', '/punch', { who: 'quen' })).data.openSession), 'Được phê duyệt');
  // sang ngày sau 12:00 lượt mở quá 16 giờ tự đóng thành Quên Check-out (lastOf đọc lúc 29/10)
  const last = await lastOf('quen');
  assert.equal(AS.labelOf(last), 'Chờ xử lý');
  assert.equal(last.statusNote, 'Quên Check-out');
});

test('Nhân sự thấy giải trình lúc bấm của mình ở danh sách Giải trình; Admin không tạo được yêu cầu giải trình loại lúc bấm', async () => {
  const mine = await F.call('GET', '/explanations', { who: 'som' });
  assert.deepEqual(
    mine.data.items.map(x => x.kind),
    ['punch-out']
  );
  const made = await F.call('POST', '/explanations', {
    who: 'admin',
    body: { username: 'tre', date: '2026-10-20', prompt: 'x', source: 'punch-in' }
  });
  assert.equal(made.status, 200);
  assert.equal(made.data.item.kind, 'admin'); // nguồn lạ → yêu cầu Admin thường
});
