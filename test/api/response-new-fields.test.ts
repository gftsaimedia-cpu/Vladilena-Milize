'use strict';
// Trường trong phản hồi của máy chủ để app nhân viên không tự tính lại quy tắc:
//   GET /api/me               serverNow (ISO, giờ máy chủ)
//   GET và POST /api/punch    serverNow, cutRule { graceMin, stepMin, shiftWorkMin, rounding, table[] }, checkoutPreview (null hoặc { early, cutEnd, cutStart, paidMin })
//   GET /api/sheet            leaveBalance { asOf, accrued, start, months, birthdays, adjust, used, remaining, balance } (null cho Admin), actualReport
//                             { report, missing, absent }, cutRule
// Đồng hồ giả của api-fixture; người bịa qa_*. 07/10/2026 là Thứ Tư.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;
const WORKER = 'qa_fields';

before(async () => {
  await F.start();
  await F.at('2026-10-07T07:30:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person(WORKER, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05', leaveAdjust: 5 });
});
after(F.stop);

const isIso = (value?) => typeof value === 'string' && new Date(value).toISOString() === value;
const nowIso = () => new Date(Date.now()).toISOString();
function assertCutRule(rule?) {
  assert.equal(typeof rule, 'object');
  for (const key of ['graceMin', 'stepMin', 'shiftWorkMin'])
    assert.ok(Number.isInteger(rule[key]) && rule[key] >= 0, `${key} là số nguyên không âm`);
  assert.equal(typeof rule.rounding, 'string');
  assert.ok(Array.isArray(rule.table));
  assert.equal(rule.table.length, rule.shiftWorkMin + 1, 'một phần tử cho mỗi phút từ 0 đến shiftWorkMin');
  assert.equal(rule.table[0], 0, 'đi đúng giờ thì không bị trừ');
  assert.ok(rule.table.every(n => Number.isInteger(n) && n >= 0));
  assert.ok(
    rule.table.every((n, i) => i === 0 || n >= rule.table[i - 1]),
    'bảng không giảm'
  );
}

test('GET /api/me có serverNow là giờ ISO của máy chủ (đồng hồ giả), cho cả nhân sự và Admin', async () => {
  await F.at('2026-10-07T07:30:00');
  for (const who of [WORKER, 'admin']) {
    const res = await F.call('GET', '/me', { who });
    assert.equal(res.status, 200);
    assert.ok(isIso(res.data.serverNow), `${who}: ${res.data.serverNow}`);
    assert.equal(res.data.serverNow, nowIso());
  }
});

test('GET /api/punch: có serverNow, cutRule đúng kiểu và checkoutPreview là null khi chưa có ca mở', async () => {
  await F.at('2026-10-07T07:30:00');
  const res = await F.call('GET', '/punch', { who: WORKER });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  assert.equal(res.data.serverNow, nowIso());
  assertCutRule(res.data.cutRule);
  assert.equal(res.data.checkoutPreview, null);
  assert.equal(res.data.openSession, null);
});

test('GET /api/punch của Admin: không dùng Check-in/out nhưng vẫn có serverNow', async () => {
  const res = await F.call('GET', '/punch', { who: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.data.enabled, false);
  assert.ok(isIso(res.data.serverNow));
});

test('POST /api/punch: Check-in có serverNow, cutRule, checkoutPreview; ca đang mở thì checkoutPreview là bản xem trước đồng nhất kiểu, serverNow theo lúc gửi', async () => {
  await F.at('2026-10-07T08:00:00');
  const inRes = await F.call('POST', '/punch', {
    who: WORKER,
    body: { type: 'in', requestId: 'qa-fields-in-1' }
  });
  assert.equal(inRes.status, 200, JSON.stringify(inRes.data).slice(0, 300));
  assert.ok(inRes.data.openSession, 'ca đã mở');
  assert.equal(inRes.data.serverNow, nowIso());
  assertCutRule(inRes.data.cutRule);
  assert.ok('checkoutPreview' in inRes.data);
  // giữa ca: GET /punch xem trước "nếu Check-out bây giờ"
  await F.at('2026-10-07T12:00:00');
  const mid = await F.call('GET', '/punch', { who: WORKER });
  assert.equal(mid.data.serverNow, nowIso());
  assert.notEqual(mid.data.serverNow, inRes.data.serverNow, 'serverNow không bị giữ lại từ lần trước');
  const preview = mid.data.checkoutPreview;
  assert.equal(typeof preview, 'object', 'ca n1 đang mở lúc 12:00: có bản xem trước');
  assert.notEqual(preview, null);
  for (const key of ['early', 'cutEnd', 'cutStart', 'paidMin'])
    assert.ok(Number.isFinite(preview[key]) && preview[key] >= 0, `${key}: ${preview[key]}`);
  assert.ok(preview.early > 0, 'về trước giờ ra ca');
  assert.ok(preview.paidMin > 0);
  // gửi lại cùng requestId: kết quả cũ nhưng serverNow vẫn là giờ lúc gửi lại
  await F.at('2026-10-07T12:05:00');
  const replay = await F.call('POST', '/punch', { who: WORKER, body: { type: 'in', requestId: 'qa-fields-in-1' } });
  assert.equal(replay.status, 200, JSON.stringify(replay.data).slice(0, 200));
  assert.equal(replay.data.serverNow, nowIso());
  assert.equal(replay.data.openSession.id, inRes.data.openSession.id);
  // đóng ca cho các test sau
  await F.at('2026-10-07T17:00:00');
  const out = await F.call('POST', '/punch', {
    who: WORKER,
    body: { type: 'out', sessionId: inRes.data.openSession.id, requestId: 'qa-fields-out-1' }
  });
  assert.equal(out.status, 200, JSON.stringify(out.data).slice(0, 300));
  assert.equal(out.data.checkoutPreview, null, 'đã đóng ca thì không còn bản xem trước');
});

test('GET /api/sheet: leaveBalance đúng kiểu cho nhân sự có tài khoản phép; null cho Admin; cutRule đúng kiểu', async () => {
  await F.at('2026-10-14T12:00:00');
  const res = await F.call('GET', '/sheet?month=2026-10', { who: WORKER });
  assert.equal(res.status, 200);
  const leave = res.data.leaveBalance;
  assert.equal(leave.asOf, '2026-10-14');
  for (const key of ['accrued', 'start', 'months', 'birthdays', 'adjust', 'used', 'remaining', 'balance'])
    assert.equal(typeof leave[key], 'number', key);
  assert.equal(leave.adjust, 5);
  assert.equal(leave.used, 0);
  assert.equal(leave.remaining, leave.accrued);
  assert.equal(leave.balance, leave.accrued);
  assertCutRule(res.data.cutRule);
  const admin = await F.call('GET', '/sheet?month=2026-10', { who: 'admin' });
  assert.equal(admin.status, 200);
  assert.equal(admin.data.leaveBalance, null);
});

test('GET /api/sheet: actualReport có report, missing, absent của tháng, không còn from và actualFrom', async () => {
  await F.at('2026-10-14T12:00:00');
  const on = await F.call('GET', '/sheet?month=2026-10', { who: WORKER });
  const report = on.data.actualReport;
  assert.equal(typeof report, 'object');
  assert.notEqual(report, null);
  assert.equal('from' in report, false);
  assert.equal('actualFrom' in report, false);
  assert.equal(typeof report.report, 'object');
  assert.ok(Array.isArray(report.missing) || typeof report.missing === 'object');
  assert.ok('absent' in report);
  // phiên 07/10 đã Check-in/out ở test trước: có dòng báo cáo của ngày đó
  assert.ok(report.report['2026-10-07'], 'có báo cáo ngày 07/10');
});
