'use strict';
// GET và PUT /api/settings/shifts bao quanh các khoá shift.preset.<mã>.in | out (src/domain/shifts.ts): cùng kiểm giờ ca và nhật ký với PUT /api/settings/params.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { rulesFor } = require('../../src/platform/request-rules');

const REASON = 'Đổi giờ ca theo thông báo của công ty tháng này';
before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_plain', 'staff');
});
after(F.stop);

test('ca làm: GET /api/settings/shifts trả sáu ca với tên, giờ vào, giờ ra và số giờ mỗi ca', async () => {
  const got = await F.call('GET', '/settings/shifts?month=2027-08');
  assert.equal(got.status, 200, JSON.stringify(got.data));
  assert.deepEqual(
    got.data.shifts.map(s => [s.code, s.name, s.in, s.out]),
    [
      // mã ca lấy từ danh mục ca trong DB; PUT nhận cả mã ngắn n1 … như bên dưới
      ['Normal1', 'Normal 1', '08:00', '17:00'],
      ['Normal2', 'Normal 2', '10:00', '19:00'],
      ['Flex1', 'Flex 1', '06:00', '15:00'],
      ['Flex2', 'Flex 2', '13:00', '22:00'],
      ['Night1', 'Night 1', '21:00', '06:00'],
      ['Night2', 'Night 2', '22:00', '07:00']
    ]
  );
  assert.equal(got.data.hours, 9);
  assert.equal(got.data.editable, true);
  assert.ok(Number.isInteger(got.data.paramsRev));
});

test('ca làm: PUT /api/settings/shifts đổi giờ từ tháng áp dụng, kiểm giờ ca như PUT /api/settings/params (ca không dài đúng 9 giờ vẫn lưu, kèm cảnh báo)', async () => {
  const rev = (await F.call('GET', '/settings/shifts?month=2027-08')).data.paramsRev; // expectedRev bắt buộc, không tự điền
  const put = await F.call('PUT', '/settings/shifts', {
    body: {
      shifts: [{ code: 'n2', in: '10:30', out: '19:30' }],
      effectiveMonth: '2027-08',
      reason: REASON,
      expectedRev: rev
    }
  });
  assert.equal(put.status, 200, JSON.stringify(put.data).slice(0, 300));
  assert.deepEqual((await rulesFor('2027-08')).punch.SHIFT.n2, ['10:30', '19:30']);
  assert.deepEqual((await rulesFor('2027-07')).punch.SHIFT.n2, ['10:00', '19:00']);
  const again = await F.call('GET', '/settings/shifts?month=2027-08');
  assert.deepEqual(again.data.shifts.find(s => s.code === 'Normal2').in, '10:30');
  const bad = await F.call('PUT', '/settings/shifts', {
    body: {
      shifts: [{ code: 'n2', in: '10:30', out: '20:30' }],
      effectiveMonth: '2027-09',
      reason: REASON,
      expectedRev: (await F.call('GET', '/settings/shifts?month=2027-09')).data.paramsRev
    }
  });
  assert.equal(bad.status, 200, JSON.stringify(bad.data).slice(0, 300));
  assert.ok(
    bad.data.warnings.some(w => w.code === 'PARAM_CROSS_CHECK_FAILED'),
    JSON.stringify(bad.data.warnings)
  );
  assert.match(JSON.stringify(bad.data.warnings), /dài đúng 9 giờ/);
  assert.deepEqual((await rulesFor('2027-09')).punch.SHIFT.n2, ['10:30', '20:30']);
});

test('ca làm: mã ca lạ 400, nhân sự 403, chưa đăng nhập 401', async () => {
  const unknown = await F.call('PUT', '/settings/shifts', {
    body: { shifts: [{ code: 'zz', in: '08:00', out: '17:00' }] }
  });
  assert.equal(unknown.data.code, 'SHIFT_UNKNOWN');
  assert.equal((await F.call('PUT', '/settings/shifts', { who: 'qa_plain', body: { shifts: [] } })).status, 403);
  assert.equal((await F.call('GET', '/settings/shifts', { who: 'qa_plain' })).status, 403);
  assert.equal((await F.call('GET', '/settings/shifts', { who: null })).status, 401);
});
