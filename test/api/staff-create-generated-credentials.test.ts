'use strict';
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store, auth } = F;

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_hr', 'staff');
  await F.person('qa_adjusted', 'staff', { leaveAdjust: 2.5 });
  await store.roles.grant('qa_hr', 'hr', 'admin');
});

test('saving a profile without an adjustment field preserves its stored annual leave adjustment', async () => {
  const res = await F.call('PUT', '/staff/qa_adjusted', {
    body: {
      name: 'Người đã điều chỉnh phép',
      role: 'staff',
      type: 'nv',
      level: 1,
      startDate: '2026-10-01',
      shiftCode: 'n1'
    }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('qa_adjusted')).leaveAdjust, 2.5);
});
after(F.stop);

test('Admin creates staff with generated unique username/password, preserves contract status, and only returns the secret once', async () => {
  const body = {
    name: 'Nguyễn Thị An',
    role: 'admin',
    type: 'nv',
    level: 1,
    startDate: '2026-10-01',
    contractStatus: 'probation'
  };
  const first = await F.call('POST', '/staff', { body });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.created, true);
  assert.match(first.data.credentials.username, /^nguyen-thi-an-[a-f0-9]{8}$/);
  assert.ok(first.data.credentials.password.length >= 24);
  assert.equal(first.data.staff.username, first.data.credentials.username);
  assert.equal(first.data.staff.role, 'staff', 'POST tạo mới không thể cấp quyền Admin từ thân yêu cầu');
  assert.equal(first.data.staff.contractStatus, 'probation');
  assert.ok(first.data.staff.leave && Number.isFinite(first.data.staff.leave.balance));
  assert.equal(first.data.staff.leave.balance, first.data.staff.leaveBalance);
  const createdRow = await store.getStaffRow(first.data.credentials.username);
  assert.equal(createdRow.leave_balance, first.data.staff.leave.balance, 'số dư được lưu trong DB');
  assert.equal(createdRow.leave_balance_on, '2026-11-02', 'ngày tính số dư được lưu trong DB');
  assert.equal(auth.verifyPassword(first.data.credentials.password, createdRow.pass_hash), true);

  const login = await F.call('POST', '/login', {
    who: null,
    body: { username: first.data.credentials.username, password: first.data.credentials.password }
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));

  const second = await F.call('POST', '/staff', { body });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.notEqual(second.data.credentials.username, first.data.credentials.username);

  const list = await F.call('GET', '/staff');
  assert.equal(list.status, 200);
  assert.equal(JSON.stringify(list.data).includes(first.data.credentials.password), false);
  assert.equal(JSON.stringify(list.data).includes(second.data.credentials.password), false);
  const audit = await store.db
    .prepare('SELECT * FROM audit_log WHERE entity_id IN (?, ?) ORDER BY id')
    .all(first.data.credentials.username, second.data.credentials.username);
  assert.equal(JSON.stringify(audit).includes(first.data.credentials.password), false);
  assert.equal(JSON.stringify(audit).includes(second.data.credentials.password), false);
});

test('staff without profile.write cannot use generated-credential endpoint', async () => {
  const before = await store.db.prepare('SELECT COUNT(*) AS n FROM staff').get();
  const res = await F.call('POST', '/staff', { who: 'qa_hr', body: { name: 'Không được tạo' } });
  assert.equal(res.status, 403, JSON.stringify(res.data));
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS n FROM staff').get()).n, before.n);
  assert.equal((await F.call('POST', '/staff', { who: null, body: { name: 'Chưa đăng nhập' } })).status, 401);
});
