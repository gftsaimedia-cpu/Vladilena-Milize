'use strict';
// Không còn công tắc theo tháng trên API: /me và /login không trả ngày bật Check-in/out hay tháng bật KPI 5 thành phần,
// kỳ lương không có "tháng chưa quản lý", và không có route đặt ngày bắt đầu tính theo giờ thực tế.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const WORKER = 'qa_noswitch';
const GONE = ['actualFrom', 'checkinFrom', 'kpiFrom'];

before(async () => {
  await F.start();
  await F.at('2026-10-07T07:30:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person(WORKER, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
});
after(F.stop);

test('GET /api/me không trả actualFrom, checkinFrom, kpiFrom (nhân sự và Admin)', async () => {
  for (const who of [WORKER, 'admin']) {
    const res = await F.call('GET', '/me', { who });
    assert.equal(res.status, 200);
    for (const key of GONE) assert.equal(Object.hasOwn(res.data, key), false, `${who}: ${key}`);
  }
});

test('GET /api/sheet và /api/punch không trả ngày bật Check-in/out', async () => {
  const sheet = await F.call('GET', '/sheet?month=2026-10', { who: WORKER });
  assert.equal(sheet.status, 200);
  for (const key of GONE) assert.equal(Object.hasOwn(sheet.data, key), false, `sheet: ${key}`);
  assert.equal(Object.hasOwn(sheet.data.actualReport || {}, 'actualFrom'), false);
  const punch = await F.call('GET', '/punch', { who: WORKER });
  assert.equal(punch.status, 200);
  for (const key of ['from', 'before']) assert.equal(Object.hasOwn(punch.data, key), false, `punch: ${key}`);
});

test('không còn route PUT /api/settings/actual-hours', async () => {
  const res = await F.call('PUT', '/settings/actual-hours', { who: 'admin', body: { from: '2026-11-01' } });
  assert.ok([403, 404].includes(res.status), 'route không còn: ' + res.status);
  assert.equal(await F.store.getSetting('actual_hours_from', null), null, 'không ghi cài đặt nào');
});

test('kỳ lương: tháng nào cũng chốt được như nhau, không có mã PERIOD_UNMANAGED', async () => {
  const detail = await F.call('GET', '/periods/2026-08', { who: 'admin' });
  assert.notEqual(detail.data && detail.data.code, 'PERIOD_UNMANAGED');
  assert.equal(Object.hasOwn(detail.data || {}, 'firstManagedMonth'), false);
});
