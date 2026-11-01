'use strict';
// An toàn khoá tài khoản: `staff.lock` gán được cho vai trò tuỳ chỉnh, nhưng khoá hay mở khoá một tài khoản đang giữ vai trò Admin
// cần `roles.manage` (403 FORBIDDEN_CAP), nếu không người có staff.lock khoá lần lượt mọi Admin và không ai còn roles.manage để mở lại.
// Khoá Admin chưa khoá cuối cùng là 409 LAST_ADMIN (lớp phòng thủ thứ hai; người có roles.manage luôn là Admin chưa khoá nên đường HTTP không chạm tới).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../src/platform/authz');

const { store } = F;

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_admin2', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_admin3', 'staff', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await store.roles.grant('qa_admin3', 'admin', 'admin'); // Admin gán qua bảng vai trò (không qua staff.role)
  await F.person('qa_locker', 'staff');
  await F.person('qa_plain1', 'staff');
  const saved = (await store.getSetting(authz.CUSTOM_ROLES_KEY, null)) || { rev: 0, roles: [] };
  await store.setSetting(authz.CUSTOM_ROLES_KEY, {
    rev: saved.rev + 1,
    roles: [
      ...saved.roles,
      {
        code: 'qa_khoa_tk',
        label: 'Khoá tài khoản',
        // PUT /staff/:u cần profile.write ở cổng; locked cần thêm staff.lock
        caps: ['staff.lock', 'profile.read', 'profile.write'],
        approvals: [],
        scope: 'all',
        rev: 1
      }
    ]
  });
  await store.roles.grant('qa_locker', 'qa_khoa_tk', 'admin');
});
after(F.stop);

const lockedAt = async (username?) => (await store.getStaffRow(username)).locked_at;
const lock = async (who?, username?, locked?) => await F.call('PUT', `/staff/${username}`, { who, body: { locked } });

test('khoá Admin: vai trò tuỳ chỉnh chỉ có staff.lock bị 403 FORBIDDEN_CAP (cap roles.manage) cho Admin cũ lẫn Admin gán qua bảng vai trò; không khoá được ai', async () => {
  assert.equal(await authz.can(await store.getStaff('qa_locker'), 'staff.lock'), true);
  assert.equal(await authz.can(await store.getStaff('qa_locker'), 'roles.manage'), false);
  for (const target of ['qa_admin2', 'qa_admin3', 'admin']) {
    const put = await lock('qa_locker', target, true);
    assert.equal(put.status, 403, `${target}: ${JSON.stringify(put.data)}`);
    assert.equal(put.data.code, 'FORBIDDEN_CAP');
    assert.equal(put.data.cap, 'roles.manage');
    assert.equal(await lockedAt(target), null, `${target} chưa bị khoá`);
  }
});

test('mở khoá Admin đã bị khoá cũng cần roles.manage: người chỉ có staff.lock bị 403, Admin mở được', async () => {
  assert.equal((await lock('admin', 'qa_admin2', true)).status, 200, 'Admin khoá Admin khác (còn Admin chưa khoá)');
  assert.ok(await lockedAt('qa_admin2'));
  const denied = await lock('qa_locker', 'qa_admin2', false);
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  assert.equal(denied.data.cap, 'roles.manage');
  assert.ok(await lockedAt('qa_admin2'), 'vẫn khoá');
  assert.equal((await lock('admin', 'qa_admin2', false)).status, 200);
  assert.equal(await lockedAt('qa_admin2'), null);
});

test('người có staff.lock vẫn khoá và mở khoá được nhân sự thường (không đổi hành vi cũ)', async () => {
  const locked = await lock('qa_locker', 'qa_plain1', true);
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.ok(await lockedAt('qa_plain1'));
  assert.equal((await lock('qa_locker', 'qa_plain1', false)).status, 200);
  assert.equal(await lockedAt('qa_plain1'), null);
});

test('Admin vẫn khoá được Admin khác khi còn Admin chưa khoá, và không tự khoá mình (400)', async () => {
  assert.equal((await lock('admin', 'qa_admin3', true)).status, 200);
  assert.ok(await lockedAt('qa_admin3'));
  assert.equal((await lock('admin', 'qa_admin3', false)).status, 200);
  assert.equal((await lock('admin', 'admin', true)).status, 400, 'tự khoá');
  assert.equal(await lockedAt('admin'), null);
  assert.equal((await store.roles.countAdmins()) >= 2, true);
});
