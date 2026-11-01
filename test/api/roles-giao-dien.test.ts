'use strict';
// Hợp đồng gọi của màn Phân quyền: perms khong|xem|sua, approve, extras, active:false, rev tuỳ chọn (src/domain/roles/roles.ts; cùng nguồn với levels, approvals, deprecate).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const REASON = 'Phân quyền theo quyết định tháng này';
before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
});
after(F.stop);

const make = async (body?) => await F.call('POST', '/roles', { body });
const edit = async (code?, body?) => await F.call('PUT', `/roles/${code}`, { body });
// rev là bắt buộc: lấy rev hiện tại của vai trò rồi sửa
const editR = async (code?, body?) =>
  await edit(code, { rev: (await F.call('GET', '/roles')).data.roles.find(r => r.code === code).rev, ...body });

test('hợp đồng giao diện: perms, approve, extras, active, editable, system khớp tên gọi của màn Phân quyền', async () => {
  const created = await make({
    label: 'Vai trò theo giao diện',
    perms: { profile: 'xem', pay: 'sua', kpi: 'khong' },
    approve: ['ot', 'leave'],
    reason: REASON
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const role = created.data.role;
  assert.deepEqual([role.system, role.custom, role.active, role.editable], [false, true, true, true]);
  assert.deepEqual([role.perms.profile, role.perms.pay, role.perms.kpi], ['xem', 'sua', 'khong']);
  assert.deepEqual(role.approve, ['leave', 'ot']);
  assert.deepEqual(role.extras, []);
  const withExtra = await editR(role.code, {
    perms: { attendance: 'xem' },
    extras: ['attendance.lock'],
    reason: REASON
  });
  assert.equal(withExtra.status, 200, JSON.stringify(withExtra.data));
  assert.deepEqual(withExtra.data.role.extras, ['attendance.lock']);
  assert.equal(
    (await editR(role.code, { perms: { pay: 'rat_nhieu' }, reason: REASON })).data.code,
    'ROLE_LEVELS_INVALID'
  );
  assert.equal(
    (await editR(role.code, { perms: { pay: 'sua' }, reason: 'x'.repeat(301) })).data.code,
    'REASON_REQUIRED'
  );
  const builtin = (await F.call('GET', '/roles')).data.roles.find(r => r.code === 'accounting');
  assert.deepEqual([builtin.system, builtin.editable, builtin.active], [true, false, true]);
  assert.equal(builtin.perms.settings_tax, 'sua');
  const off = await editR(role.code, { active: false, reason: REASON });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.deepEqual([off.data.role.active, off.data.role.deprecated, off.data.role.editable], [false, true, false]);
  assert.equal(
    (await editR(role.code, { active: true, label: 'Bật lại', reason: REASON })).data.code,
    'ROLE_DEPRECATED'
  );
});

test('hợp đồng giao diện: gửi rev lệch thì 409, không gửi rev thì 400 ROLE_REV_REQUIRED (khoá lạc quan bắt buộc)', async () => {
  const created = await make({ label: 'Vai trò thử rev' });
  const code = created.data.role.code;
  assert.equal((await edit(code, { rev: 99, label: 'Thử rev sai', reason: REASON })).status, 409);
  assert.equal((await edit(code, { label: 'Thử rev bỏ trống', reason: REASON })).status, 400);
  assert.equal(
    (await edit(code, { rev: 'abc', label: 'Rev sai kiểu', reason: REASON })).data.code,
    'ROLE_REV_REQUIRED'
  );
});
