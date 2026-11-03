'use strict';
// Trạng thái hiển thị của một lượt chấm công (src/domain/attendance/session-status.ts): mỗi mã, các mốc 15 phút trễ / 30 phút Check-out muộn,
// thứ tự ưu tiên và quyết định mới nhất thắng. Ca n1 08:00–17:00.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ActualHours = require('../../src/engine/actual-hours');
const config = require('../../src/platform/config');
const { lateCheckoutMin } = require('../../src/domain/explanation/late-checkout');
const { SessionStatus } = require('../../src/domain/attendance/session-status');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');

const GRACE = ActualHours.RULE.GRACE_MIN;
const classifier = new SessionStatus({
  rules: () => ({ graceMin: GRACE, lateMinutes: ActualHours.lateMinutes }),
  checkoutGraceMin: config.CHECKOUT_GRACE_MIN,
  lateCheckoutMin,
  adminOrigin: ADMIN_ORIGIN
});
const DATE = '2026-10-20';
const at = (hhmm?) => new Date(`${DATE}T${hhmm}:00+07:00`).toISOString();
const plus = async (hhmm?, min?) => new Date(Date.parse(await at(hhmm)) + min * 60000).toISOString();
const plannedShift = {
  code: 'Normal1',
  date: DATE,
  in: '08:00',
  out: '17:00',
  startIso: at('08:00'),
  endIso: at('17:00'),
  kind: 'work'
};
const open = (presIn?, extra: any = {}) => ({
  id: 1,
  username: 'chi',
  date: DATE,
  state: 'open',
  entry: { kind: 'pending', reason: 'open', src: 'punch', presIn, plannedShift, ...extra },
  corrections: []
});
const closed = (presIn?, presOut?, extra: any = {}) => ({
  id: 2,
  username: 'chi',
  date: DATE,
  state: 'closed',
  entry: {
    kind: 'work',
    in: '08:00',
    out: '17:00',
    src: 'punch',
    presIn,
    presOut,
    plannedShift,
    attendanceConfirmed: true,
    ...extra
  },
  corrections: []
});
const of = async (session?, options?) => await classifier.classify(session, options);

test('lượt đang mở: Check-in đúng giờ là checked-in; trễ đúng mức cho phép vẫn hợp lệ, trễ hơn 1 phút là chờ xử lý', async () => {
  assert.deepEqual(await of(await open(await at('08:00'))), { status: 'checked-in', statusNote: '' });
  assert.deepEqual(await of(await open(await at('07:40'))), { status: 'checked-in', statusNote: '' });
  assert.equal(GRACE, 15);
  assert.deepEqual(await of(await open(await plus('08:00', GRACE))), { status: 'checked-in', statusNote: '' });
  assert.deepEqual(await of(await open(await plus('08:00', GRACE + 1))), {
    status: 'pending',
    statusNote: 'Vào trễ 16 phút'
  });
});

test('lượt đang mở ngoài ca hoặc ngoài vùng GPS là chờ xử lý', async () => {
  const off = await open(await at('20:00'), {
    outsideShift: true,
    plannedShift: undefined,
    assignedShift: plannedShift
  });
  assert.deepEqual(await of(off), { status: 'pending', statusNote: 'Ngoài ca' });
  assert.deepEqual(await of(await open(await at('08:00'), { outsideZone: true })), {
    status: 'pending',
    statusNote: 'Ngoài vùng GPS'
  });
});

test('lượt đã đóng hợp lệ là checked-out; trễ 15 phút (lượt thiếu giờ) vẫn checked-out, trễ 16 phút là chờ xử lý', async () => {
  assert.deepEqual(await of(closed(await at('08:00'), await at('17:00'))), { status: 'checked-out', statusNote: '' });
  const short = (inIso?, outIso?) => closed(inIso, outIso, { kind: 'pending', reason: 'incomplete-shift' });
  assert.deepEqual(await of(short(await plus('08:00', 15), await at('17:00'))), {
    status: 'checked-out',
    statusNote: ''
  });
  assert.deepEqual(await of(short(await plus('08:00', 16), await at('17:00'))), {
    status: 'pending',
    statusNote: 'Vào trễ 16 phút'
  });
});

test('về sớm dù 1 phút là chờ xử lý', async () => {
  const early = closed(await at('08:00'), await plus('17:00', -1), { kind: 'pending', reason: 'incomplete-shift' });
  assert.deepEqual(await of(early), { status: 'pending', statusNote: 'Về sớm 1 phút' });
});

test('Check-out muộn: đúng 30 phút sau giờ ra là hợp lệ, 31 phút là chờ xử lý; phần làm thêm đã khai nới giờ ra được phép', async () => {
  assert.equal(config.CHECKOUT_GRACE_MIN, 30);
  assert.deepEqual(await of(closed(await at('08:00'), await plus('17:00', 29))), {
    status: 'checked-out',
    statusNote: ''
  });
  assert.deepEqual(await of(closed(await at('08:00'), await plus('17:00', 30))), {
    status: 'pending',
    statusNote: 'Check-out muộn 30 phút'
  });
  const sheetDay = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraIn: '17:00', extraOut: '19:00' };
  assert.deepEqual(await of(closed(await at('08:00'), await at('19:20')), { sheetDay }), {
    status: 'checked-out',
    statusNote: ''
  });
});

test('Quên Check-out, Check-out muộn chờ duyệt, quyết định của Admin về giải trình', async () => {
  const forgot = closed(await at('08:00'), undefined, { kind: 'pending', reason: 'forgot-out' });
  assert.deepEqual(await of(forgot), { status: 'pending', statusNote: 'Quên Check-out' });
  const late = closed(await at('08:00'), undefined, {
    kind: 'pending',
    reason: 'forgot-out',
    requestedOut: await at('18:10')
  });
  assert.deepEqual(await of(late), { status: 'pending', statusNote: 'Check-out muộn 70 phút' });
  const answered = { sessionId: 2, status: 'answered', requestedAt: await at('18:10'), answeredAt: await at('18:10') };
  assert.deepEqual(await of(late, { explanations: [answered] }), {
    status: 'pending',
    statusNote: 'Đã gửi giải trình, chờ Admin'
  });
  const rejected = { ...answered, status: 'rejected', decidedAt: await at('20:00') };
  assert.deepEqual(await of(late, { explanations: [rejected] }), {
    status: 'rejected',
    statusNote: 'Check-out muộn 70 phút'
  });
  const applied = closed(await at('08:00'), await at('18:10'), { requestedOut: await at('18:10') });
  assert.deepEqual(await of(applied, { explanations: [{ ...rejected, status: 'approved' }] }), {
    status: 'approved',
    statusNote: 'Check-out muộn 70 phút'
  });
});

test('quyết định mới nhất thắng giữa giải trình và yêu cầu điều chỉnh', async () => {
  const s = closed(await plus('08:00', 30), await at('17:00'), { kind: 'pending', reason: 'incomplete-shift' });
  const approved = { sessionId: 2, status: 'approved', answeredAt: await at('18:00'), decidedAt: await at('19:00') };
  const correction = { status: 'rejected', created_at: await at('18:30'), decided_at: await at('20:00') };
  assert.equal((await of({ ...s, corrections: [correction] }, { explanations: [approved] })).status, 'rejected');
  const earlier = { ...correction, decided_at: await at('18:45') };
  assert.equal((await of({ ...s, corrections: [earlier] }, { explanations: [approved] })).status, 'approved');
  assert.deepEqual(
    (await of({ ...s, corrections: [correction] }, { explanations: [approved] })).statusNote,
    'Yêu cầu điều chỉnh giờ · Vào trễ 30 phút'
  );
  // yêu cầu điều chỉnh chưa quyết định hoặc đã bị thay thế không tính: lượt theo quyết định khác, không có thì theo giờ
  const waiting = { status: 'pending', created_at: await at('21:00') };
  assert.equal((await of({ ...s, corrections: [waiting] }, { explanations: [approved] })).status, 'approved');
  const valid = closed(await at('08:00'), await at('17:00'));
  assert.deepEqual(await of({ ...valid, corrections: [waiting] }), { status: 'checked-out', statusNote: '' });
  assert.equal((await of({ ...s, corrections: [{ ...waiting, status: 'replaced' }] })).status, 'pending');
});

test('lượt Admin ghi là Đã chấm công dù giờ thế nào; giờ Admin ghi từ yêu cầu điều chỉnh đã duyệt là Được phê duyệt', async () => {
  const declared = closed(await at('10:00'), await at('15:00'), {
    src: 'admin',
    origin: ADMIN_ORIGIN,
    attendanceApproved: true
  });
  assert.deepEqual(await of(declared), { status: 'admin', statusNote: '' });
  const rejected = { sessionId: 2, status: 'rejected', decidedAt: await at('20:00') };
  assert.equal((await of(declared, { explanations: [rejected] })).status, 'admin');
  const edited = closed(await at('09:00'), await at('17:00'), { src: 'admin' });
  assert.equal((await of(edited)).status, 'admin');
  const fromRequest = { status: 'approved', created_at: await at('18:00'), decided_at: await at('19:00') };
  assert.deepEqual(await of({ ...edited, corrections: [fromRequest] }), {
    status: 'approved',
    statusNote: 'Yêu cầu điều chỉnh giờ · Quên Check-in'
  });
});

test('Admin xác nhận thiếu giờ (attendanceApproved) là Được phê duyệt', async () => {
  const s = closed(await plus('08:00', 40), await at('17:00'), { attendanceApproved: true });
  assert.deepEqual(await of(s), { status: 'approved', statusNote: 'Quên Check-in' });
});

test('các lý do chờ khác: nhiều lượt trong một ca, ngoài ca, cần đối soát, quên Check-in', async () => {
  const multi = closed(await at('08:00'), await at('17:00'), { kind: 'pending', reason: 'multiple-sessions' });
  assert.deepEqual(await of(multi), { status: 'pending', statusNote: 'Nhiều lượt trong một ca' });
  const off = closed(await at('19:00'), await at('21:00'), {
    kind: 'pending',
    reason: 'off-shift',
    outsideShift: true
  });
  assert.deepEqual(await of(off), { status: 'pending', statusNote: 'Ngoài ca' });
  const legacy = closed(await at('08:00'), await at('17:00'), {
    kind: 'pending',
    reason: 'legacy-review',
    plannedShift: undefined
  });
  assert.deepEqual(await of(legacy), { status: 'pending', statusNote: 'Cần đối soát giờ chấm' });
  const forgotIn = closed(undefined, await at('17:00'), { kind: 'pending', reason: 'forgot-in' });
  assert.deepEqual(await of(forgotIn), { status: 'pending', statusNote: 'Quên Check-in' });
});

test('OT / làm thêm / đi làm lễ không phải trạng thái: giờ vào / ra hợp lệ thì vẫn checked-out', async () => {
  const ot = closed(await at('08:00'), await at('19:00'), {
    extraKind: 'ot',
    extraIn: '17:00',
    extraOut: '19:00',
    otReview: true
  });
  assert.deepEqual(await of(ot), { status: 'checked-out', statusNote: '' });
});

test('Check-out muộn đúng 30 phút cần giải trình; 29 phút không, và OT đã duyệt nới mốc', async () => {
  const { needsExplanation } = require('../../src/domain/explanation/late-checkout');
  const session = {
    entry: { plannedShift: { date: DATE, in: '08:00', out: '17:00', startIso: at('08:00'), endIso: at('17:00') } }
  };
  assert.equal(needsExplanation(session, await plus('17:00', 29)), false);
  assert.equal(needsExplanation(session, await plus('17:00', 30)), true);
  assert.equal(needsExplanation(session, await plus('18:00', 29), { extraOut: '18:00' }), false);
  assert.equal(needsExplanation(session, await plus('18:00', 30), { extraOut: '18:00' }), true);
});

test('trễ trên 30 phút có cờ Quên Check-in riêng nhưng giữ nguyên giờ thực và cờ đi trễ', async () => {
  for (const late of [15, 16, 30, 31]) {
    const session = await open(await plus('08:00', late));
    const { statusNote } = await of(session);
    assert.equal(session.entry.presIn, await plus('08:00', late));
    assert.equal(statusNote.includes('Quên Check-in'), late > 30, `${late}: ${statusNote}`);
    assert.equal(statusNote.includes(`Vào trễ ${late} phút`), late > GRACE && late <= 30, `${late}: ${statusNote}`);
  }
});
