'use strict';
// Ngày trả lương (period.payDay, Cài đặt › Kỳ lương & chấm công): Admin ghi qua PUT /api/settings/params có tháng áp dụng và lý do; số ngoài 1 đến 31 bị từ chối.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const REASON = 'Đổi ngày trả lương theo thông báo của công ty';
before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
});
after(F.stop);

const save = async (value?) => {
  const rev = (await F.call('GET', '/settings/params?month=2027-03')).data.paramsRev;
  return await F.call('PUT', '/settings/params', {
    body: {
      changes: [{ key: 'period.payDay', value }],
      effectiveMonth: '2027-03',
      reason: REASON,
      expectedRev: rev
    }
  });
};

test('ngày trả lương: Admin đổi từ ngày 10 sang ngày 21 có tháng áp dụng; số ngoài khoảng bị từ chối', async () => {
  const ok = await save(21);
  assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 300));
  assert.equal(ok.data.saved[0].value, 21);
  assert.equal(ok.data.saved[0].effectiveMonth, '2027-03');
  for (const bad of [0, 32, 10.5, 'mười']) assert.equal((await save(bad)).status, 400, String(bad));
});
