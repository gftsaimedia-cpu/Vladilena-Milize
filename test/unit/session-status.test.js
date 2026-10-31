'use strict';
// Trạng thái hiển thị của một lượt chấm công (lib/domain/attendance/session-status.js): mỗi mã, các mốc 15 phút trễ / 30 phút Check-out muộn,
// thứ tự ưu tiên và quyết định mới nhất thắng. Ca n1 08:00–17:00.
process.env.DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ActualHours = require('../../public/actual-hours.js');
const config = require('../../lib/config');
const { lateCheckoutMin } = require('../../lib/domain/explanation/late-checkout');
const { SessionStatus } = require('../../lib/domain/attendance/session-status');
const { ADMIN_ORIGIN } = require('../../lib/attendance-sessions');

const GRACE = ActualHours.RULE.GRACE_MIN;
const classifier = new SessionStatus({
  rules: () => ({ graceMin: GRACE, lateMinutes: ActualHours.lateMinutes }),
  checkoutGraceMin: config.CHECKOUT_GRACE_MIN,
  lateCheckoutMin,
  adminOrigin: ADMIN_ORIGIN
});
const DATE = '2026-10-20';
const at = hhmm => new Date(`${DATE}T${hhmm}:00+07:00`).toISOString();
const plus = (hhmm, min) => new Date(Date.parse(at(hhmm)) + min * 60000).toISOString();
const plannedShift = {
  code: 'Normal1',
  date: DATE,
  in: '08:00',
  out: '17:00',
  startIso: at('08:00'),
  endIso: at('17:00'),
  kind: 'work'
};
const open = (presIn, extra = {}) => ({
  id: 1,
  username: 'chi',
  date: DATE,
  state: 'open',
  entry: { kind: 'pending', reason: 'open', src: 'punch', presIn, plannedShift, ...extra },
  corrections: []
});
const closed = (presIn, presOut, extra = {}) => ({
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
const of = (session, options) => classifier.classify(session, options);

test('lượt đang mở: Check-in đúng giờ là checked-in; trễ đúng mức cho phép vẫn hợp lệ, trễ hơn 1 phút là chờ xử lý', () => {
  assert.deepEqual(of(open(at('08:00'))), { status: 'checked-in', statusNote: '' });
  assert.deepEqual(of(open(at('07:40'))), { status: 'checked-in', statusNote: '' });
  assert.equal(GRACE, 15);
  assert.deepEqual(of(open(plus('08:00', GRACE))), { status: 'checked-in', statusNote: '' });
  assert.deepEqual(of(open(plus('08:00', GRACE + 1))), { status: 'pending', statusNote: 'Vào trễ 16 phút' });
});

test('lượt đang mở ngoài ca hoặc ngoài vùng GPS là chờ xử lý', () => {
  const off = open(at('20:00'), { outsideShift: true, plannedShift: undefined, assignedShift: plannedShift });
  assert.deepEqual(of(off), { status: 'pending', statusNote: 'Ngoài ca' });
  assert.deepEqual(of(open(at('08:00'), { outsideZone: true })), { status: 'pending', statusNote: 'Ngoài vùng GPS' });
});

test('lượt đã đóng hợp lệ là checked-out; trễ 15 phút (lượt thiếu giờ) vẫn checked-out, trễ 16 phút là chờ xử lý', () => {
  assert.deepEqual(of(closed(at('08:00'), at('17:00'))), { status: 'checked-out', statusNote: '' });
  const short = (inIso, outIso) => closed(inIso, outIso, { kind: 'pending', reason: 'incomplete-shift' });
  assert.deepEqual(of(short(plus('08:00', 15), at('17:00'))), { status: 'checked-out', statusNote: '' });
  assert.deepEqual(of(short(plus('08:00', 16), at('17:00'))), { status: 'pending', statusNote: 'Vào trễ 16 phút' });
});

test('về sớm dù 1 phút là chờ xử lý', () => {
  const early = closed(at('08:00'), plus('17:00', -1), { kind: 'pending', reason: 'incomplete-shift' });
  assert.deepEqual(of(early), { status: 'pending', statusNote: 'Về sớm 1 phút' });
});

test('Check-out muộn: đúng 30 phút sau giờ ra là hợp lệ, 31 phút là chờ xử lý; phần làm thêm đã khai nới giờ ra được phép', () => {
  assert.equal(config.CHECKOUT_GRACE_MIN, 30);
  assert.deepEqual(of(closed(at('08:00'), plus('17:00', 30))), { status: 'checked-out', statusNote: '' });
  assert.deepEqual(of(closed(at('08:00'), plus('17:00', 31))), {
    status: 'pending',
    statusNote: 'Check-out muộn 31 phút'
  });
  const sheetDay = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraIn: '17:00', extraOut: '19:00' };
  assert.deepEqual(of(closed(at('08:00'), at('19:20')), { sheetDay }), { status: 'checked-out', statusNote: '' });
});

test('Quên Check-out, Check-out muộn chờ duyệt, quyết định của Admin về giải trình', () => {
  const forgot = closed(at('08:00'), undefined, { kind: 'pending', reason: 'forgot-out' });
  assert.deepEqual(of(forgot), { status: 'pending', statusNote: 'Quên Check-out' });
  const late = closed(at('08:00'), undefined, { kind: 'pending', reason: 'forgot-out', requestedOut: at('18:10') });
  assert.deepEqual(of(late), { status: 'pending', statusNote: 'Check-out muộn 70 phút' });
  const answered = { sessionId: 2, status: 'answered', requestedAt: at('18:10'), answeredAt: at('18:10') };
  assert.deepEqual(of(late, { explanations: [answered] }), {
    status: 'pending',
    statusNote: 'Đã gửi giải trình, chờ Admin'
  });
  const rejected = { ...answered, status: 'rejected', decidedAt: at('20:00') };
  assert.deepEqual(of(late, { explanations: [rejected] }), {
    status: 'rejected',
    statusNote: 'Check-out muộn 70 phút'
  });
  const applied = closed(at('08:00'), at('18:10'), { requestedOut: at('18:10') });
  assert.deepEqual(of(applied, { explanations: [{ ...rejected, status: 'approved' }] }), {
    status: 'approved',
    statusNote: 'Check-out muộn 70 phút'
  });
});

test('quyết định mới nhất thắng giữa giải trình và yêu cầu điều chỉnh', () => {
  const s = closed(plus('08:00', 30), at('17:00'), { kind: 'pending', reason: 'incomplete-shift' });
  const approved = { sessionId: 2, status: 'approved', answeredAt: at('18:00'), decidedAt: at('19:00') };
  const correction = { status: 'rejected', created_at: at('18:30'), decided_at: at('20:00') };
  assert.equal(of({ ...s, corrections: [correction] }, { explanations: [approved] }).status, 'rejected');
  const earlier = { ...correction, decided_at: at('18:45') };
  assert.equal(of({ ...s, corrections: [earlier] }, { explanations: [approved] }).status, 'approved');
  assert.deepEqual(
    of({ ...s, corrections: [correction] }, { explanations: [approved] }).statusNote,
    'Yêu cầu điều chỉnh giờ · Vào trễ 30 phút'
  );
  // yêu cầu điều chỉnh chưa quyết định hoặc đã bị thay thế không tính: lượt theo quyết định khác, không có thì theo giờ
  const waiting = { status: 'pending', created_at: at('21:00') };
  assert.equal(of({ ...s, corrections: [waiting] }, { explanations: [approved] }).status, 'approved');
  const valid = closed(at('08:00'), at('17:00'));
  assert.deepEqual(of({ ...valid, corrections: [waiting] }), { status: 'checked-out', statusNote: '' });
  assert.equal(of({ ...s, corrections: [{ ...waiting, status: 'replaced' }] }).status, 'pending');
});

test('lượt Admin ghi là Đã chấm công dù giờ thế nào; giờ Admin ghi từ yêu cầu điều chỉnh đã duyệt là Được phê duyệt', () => {
  const declared = closed(at('10:00'), at('15:00'), { src: 'admin', origin: ADMIN_ORIGIN, attendanceApproved: true });
  assert.deepEqual(of(declared), { status: 'admin', statusNote: '' });
  const rejected = { sessionId: 2, status: 'rejected', decidedAt: at('20:00') };
  assert.equal(of(declared, { explanations: [rejected] }).status, 'admin');
  const edited = closed(at('09:00'), at('17:00'), { src: 'admin' });
  assert.equal(of(edited).status, 'admin');
  const fromRequest = { status: 'approved', created_at: at('18:00'), decided_at: at('19:00') };
  assert.deepEqual(of({ ...edited, corrections: [fromRequest] }), {
    status: 'approved',
    statusNote: 'Yêu cầu điều chỉnh giờ · Vào trễ 60 phút'
  });
});

test('Admin xác nhận thiếu giờ (attendanceApproved) là Được phê duyệt', () => {
  const s = closed(plus('08:00', 40), at('17:00'), { attendanceApproved: true });
  assert.deepEqual(of(s), { status: 'approved', statusNote: 'Vào trễ 40 phút' });
});

test('các lý do chờ khác: nhiều lượt trong một ca, ngoài ca, cần đối soát, quên Check-in', () => {
  const multi = closed(at('08:00'), at('17:00'), { kind: 'pending', reason: 'multiple-sessions' });
  assert.deepEqual(of(multi), { status: 'pending', statusNote: 'Nhiều lượt trong một ca' });
  const off = closed(at('19:00'), at('21:00'), { kind: 'pending', reason: 'off-shift', outsideShift: true });
  assert.deepEqual(of(off), { status: 'pending', statusNote: 'Ngoài ca' });
  const legacy = closed(at('08:00'), at('17:00'), {
    kind: 'pending',
    reason: 'legacy-review',
    plannedShift: undefined
  });
  assert.deepEqual(of(legacy), { status: 'pending', statusNote: 'Cần đối soát giờ chấm' });
  const forgotIn = closed(undefined, at('17:00'), { kind: 'pending', reason: 'forgot-in' });
  assert.deepEqual(of(forgotIn), { status: 'pending', statusNote: 'Quên Check-in' });
});

test('OT / làm thêm / đi làm lễ không phải trạng thái: giờ vào / ra hợp lệ thì vẫn checked-out', () => {
  const ot = closed(at('08:00'), at('19:00'), { extraKind: 'ot', extraIn: '17:00', extraOut: '19:00', otReview: true });
  assert.deepEqual(of(ot), { status: 'checked-out', statusNote: '' });
});
