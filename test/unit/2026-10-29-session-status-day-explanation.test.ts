'use strict';
// Nhãn của lượt khi ngày công có giải trình ngày (Admin yêu cầu / AI đề nghị, không có session_id) đã quyết định:
// lượt Admin chỉ thắng khi quyết định mới nhất của ngày không phải "không duyệt"; chữ nhỏ theo loại giải trình.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');
const ActualHours = require('../../src/engine/actual-hours');
const config = require('../../src/platform/config');
const { lateCheckoutMin } = require('../../src/domain/explanation/late-checkout');
const { SessionStatus } = require('../../src/domain/attendance/session-status');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');

const DATE = '2026-10-20';
const at = (hhmm?) => new Date(`${DATE}T${hhmm}:00+07:00`).toISOString();
const staff = { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] };
const classifier = new SessionStatus({
  rules: () => ({ graceMin: ActualHours.RULE.GRACE_MIN, lateMinutes: ActualHours.lateMinutes }),
  checkoutGraceMin: config.CHECKOUT_GRACE_MIN,
  lateCheckoutMin,
  adminOrigin: ADMIN_ORIGIN
});
const session = async (inHm?, outHm?, extra: any = {}) => {
  const plannedShift = P.planShift(staff, DATE);
  const { entry } = P.buildDay(staff, await at(inHm), await at(outHm), 'in-out', {
    plannedShift,
    approveIncomplete: true
  });
  return { id: 1, username: 'a', date: DATE, state: 'closed', entry: { ...entry, ...extra }, version: 1 };
};
const adminSession = () => session('08:00', '17:00', { origin: ADMIN_ORIGIN, declaredBy: 'admin' });
const day = (status?, decidedAt?, sessionId: any = null) => ({
  status,
  sessionId,
  requestedAt: '2026-10-20T01:00:00.000Z',
  answeredAt: '2026-10-20T02:00:00.000Z',
  decidedAt
});
const classify = async (s?, explanations?) => {
  const { status, statusNote } = await classifier.classify(s, { explanations });
  return [status, statusNote];
};

test('Lượt Admin không có giải trình ngày, hoặc giải trình ngày mới nhất được duyệt: "Đã chấm công"', async () => {
  assert.deepEqual(await classify(await adminSession(), []), ['admin', '']);
  assert.deepEqual(await classify(await adminSession(), [await day('approved', '2026-10-21T01:00:00.000Z')]), [
    'admin',
    ''
  ]);
});

test('Giải trình ngày mới nhất bị từ chối: lượt Admin là "Bị từ chối", chữ nhỏ "Giải trình"', async () => {
  assert.deepEqual(await classify(await adminSession(), [await day('rejected', '2026-10-21T01:00:00.000Z')]), [
    'rejected',
    'Giải trình'
  ]);
});

test('Quyết định mới nhất thắng: từ chối rồi duyệt lại là "Đã chấm công"; duyệt rồi từ chối là "Bị từ chối"', async () => {
  const rejectedThenApproved = [
    await day('rejected', '2026-10-21T01:00:00.000Z'),
    await day('approved', '2026-10-22T01:00:00.000Z')
  ];
  assert.deepEqual(await classify(await adminSession(), rejectedThenApproved), ['admin', '']);
  const approvedThenRejected = [
    await day('approved', '2026-10-21T01:00:00.000Z'),
    await day('rejected', '2026-10-22T01:00:00.000Z')
  ];
  assert.deepEqual(await classify(await adminSession(), approvedThenRejected), ['rejected', 'Giải trình']);
});

test('Lượt bấm thật đi trễ 20 phút: giải trình ngày được duyệt là "Được phê duyệt" kèm lý do trễ, bị từ chối là "Bị từ chối"', async () => {
  const late = async () => {
    const real = await session('08:20', '17:00');
    delete real.entry.attendanceApproved; // lượt bấm thật chưa được Admin xác nhận thiếu giờ
    return real;
  };
  assert.deepEqual(await classify(await late(), []), ['pending', 'Vào trễ 20 phút']);
  assert.deepEqual(await classify(await late(), [await day('approved', '2026-10-21T01:00:00.000Z')]), [
    'approved',
    'Vào trễ 20 phút'
  ]);
  assert.deepEqual(await classify(await late(), [await day('rejected', '2026-10-21T01:00:00.000Z')]), [
    'rejected',
    'Vào trễ 20 phút'
  ]);
});

test('Giải trình gắn lượt (Check-out muộn) giữ chữ nhỏ cũ; không có giải trình nào thì giữ nhãn theo giờ', async () => {
  const lateOut = await day('rejected', '2026-10-21T01:00:00.000Z', 1);
  assert.deepEqual(await classify(await session('08:00', '17:00'), [lateOut]), [
    'rejected',
    'Giải trình Check-out muộn'
  ]);
  assert.deepEqual(await classify(await session('08:00', '17:00'), []), ['checked-out', '']);
});
