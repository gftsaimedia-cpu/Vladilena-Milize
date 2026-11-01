'use strict';
// Khoá lạc quan bắt buộc (không tự điền, không ghi đè người khác): PUT /api/settings/shifts cần expectedRev (thiếu 400 PARAM_REV_REQUIRED, lệch 409 PARAMS_STALE);
// PUT /api/roles/:code và POST /api/roles/:code/deprecate cần rev (thiếu 400 ROLE_REV_REQUIRED, lệch 409 ROLE_STALE). Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { rulesFor } = require('../../src/platform/request-rules');

const REASON = 'Điều chỉnh theo quyết định của quản lý tháng này';
const MONTH = '2028-03';

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
});
after(F.stop);

const shifts = (body?) => F.call('PUT', '/settings/shifts', { body });
const change = (over: any = {}) => ({
  shifts: [{ code: 'n2', in: '10:30', out: '19:30' }],
  effectiveMonth: MONTH,
  reason: REASON,
  ...over
});

test('ca làm: thiếu expectedRev là 400 PARAM_REV_REQUIRED, không tự điền; giờ ca không đổi', async () => {
  const before = JSON.stringify((await rulesFor(MONTH)).punch.SHIFT.n2);
  const snapshot = await F.snapshot();
  const res = await shifts(change());
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'PARAM_REV_REQUIRED');
  assert.equal(JSON.stringify((await rulesFor(MONTH)).punch.SHIFT.n2), before);
  assert.deepEqual(F.changedTables(snapshot, await F.snapshot()), []);
});

test('ca làm: expectedRev lệch là 409 PARAMS_STALE, đúng thì 200', async () => {
  const rev = (await F.call('GET', `/settings/shifts?month=${MONTH}`)).data.paramsRev;
  const stale = await shifts(change({ expectedRev: rev + 5 }));
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'PARAMS_STALE');
  assert.deepEqual((await rulesFor(MONTH)).punch.SHIFT.n2, ['10:00', '19:00']);
  const ok = await shifts(change({ expectedRev: rev }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 300));
  assert.deepEqual((await rulesFor(MONTH)).punch.SHIFT.n2, ['10:30', '19:30']);
});

test('vai trò tuỳ chỉnh: PUT thiếu rev là 400 ROLE_REV_REQUIRED, rev lệch là 409 ROLE_STALE; ngưng dùng cũng vậy; không lưu gì khi bị từ chối', async () => {
  const made = await F.call('POST', '/roles', { body: { label: 'Vai trò thử khoá lạc quan', caps: ['report.read'] } });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const code = made.data.role.code;
  const rev = made.data.role.rev;
  const snapshot = await F.snapshot();
  const noRev = await F.call('PUT', `/roles/${code}`, { body: { label: 'Đổi tên không rev', reason: REASON } });
  assert.equal(noRev.status, 400, JSON.stringify(noRev.data));
  assert.equal(noRev.data.code, 'ROLE_REV_REQUIRED');
  const stale = await F.call('PUT', `/roles/${code}`, {
    body: { rev: rev + 3, label: 'Đổi tên rev lệch', reason: REASON }
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'ROLE_STALE');
  const stopNoRev = await F.call('POST', `/roles/${code}/deprecate`, { body: { reason: REASON } });
  assert.equal(stopNoRev.status, 400, JSON.stringify(stopNoRev.data));
  assert.equal(stopNoRev.data.code, 'ROLE_REV_REQUIRED');
  const stopStale = await F.call('POST', `/roles/${code}/deprecate`, { body: { rev: rev + 3, reason: REASON } });
  assert.equal(stopStale.status, 409, JSON.stringify(stopStale.data));
  assert.equal(stopStale.data.code, 'ROLE_STALE');
  assert.deepEqual(F.changedTables(snapshot, await F.snapshot()), []);
  const ok = await F.call('PUT', `/roles/${code}`, { body: { rev, label: 'Đổi tên đúng rev', reason: REASON } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const stopped = await F.call('POST', `/roles/${code}/deprecate`, {
    body: { rev: ok.data.role.rev, reason: REASON }
  });
  assert.equal(stopped.status, 200, JSON.stringify(stopped.data));
});
