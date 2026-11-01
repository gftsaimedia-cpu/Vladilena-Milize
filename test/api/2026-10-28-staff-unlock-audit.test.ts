'use strict';
// Nhật ký khoá / mở khoá tài khoản: PUT /api/staff/:u với locked chỉ ghi dòng staff.lock / staff.unlock khi trạng thái khoá
// THẬT SỰ đổi; lưu hồ sơ kèm locked:false cho tài khoản đang dùng không ghi dòng "Mở khoá tài khoản".
// Người bịa qa_*, đồng hồ giả của api-fixture.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;
const USER = 'qa_unlock';

before(async () => {
  await F.start();
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person(USER, 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
});
after(F.stop);

const lockRows = async () =>
  (
    await store.db
      .prepare(
        "SELECT action FROM audit_log WHERE action IN ('staff.lock', 'staff.unlock') AND subject = ? ORDER BY id"
      )
      .all(USER)
  ).map(r => r.action);
const revOf = async () => {
  const res = await F.call('GET', '/staff');
  assert.equal(res.status, 200);
  return res.data.staff.find(s => s.username === USER).rev;
};
// Hồ sơ gửi lại y nguyên (như màn Hồ sơ) kèm các trường truyền thêm
const profile = async (patch: any = {}) => {
  const staff = await store.getStaff(USER);
  return {
    name: staff.name,
    role: staff.role,
    type: staff.type,
    level: staff.level,
    shiftCode: staff.shiftCode,
    startDate: staff.startDate,
    nightPct: staff.nightPct,
    ...patch
  };
};
const put = async (body?) => await F.call('PUT', `/staff/${USER}`, { body });

test('Lưu hồ sơ kèm locked:false cho tài khoản đang dùng: không ghi dòng mở khoá', async () => {
  const start = (await lockRows()).length;
  for (const jobTitle of ['Thủ kho', 'Trưởng ca']) {
    const res = await put(await profile({ jobTitle, locked: false, expectedRev: await revOf() }));
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.staff.locked, false);
  }
  assert.deepEqual(
    (await lockRows()).slice(start),
    [],
    'không đổi trạng thái khoá thì không có dòng staff.lock / staff.unlock'
  );
});

test('Chỉ gửi locked:false cho tài khoản đang dùng: 200, không ghi dòng mở khoá', async () => {
  const start = (await lockRows()).length;
  const res = await put({ locked: false, expectedRev: await revOf() });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual((await lockRows()).slice(start), []);
});

test('Khoá rồi mở khoá thật: mỗi lần đổi đúng một dòng; khoá lại khi đã khoá không ghi thêm', async () => {
  const start = (await lockRows()).length;
  let res = await put({ locked: true, expectedRev: await revOf() });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.staff.locked, true);
  assert.deepEqual((await lockRows()).slice(start), ['staff.lock']);
  res = await put({ locked: true, expectedRev: await revOf() });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual((await lockRows()).slice(start), ['staff.lock'], 'đã khoá thì khoá lại không ghi thêm dòng');
  res = await put(await profile({ jobTitle: 'Kế toán', locked: false, expectedRev: await revOf() }));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.staff.locked, false);
  assert.deepEqual(
    (await lockRows()).slice(start),
    ['staff.lock', 'staff.unlock'],
    'mở khoá thật thì đúng một dòng staff.unlock'
  );
});
