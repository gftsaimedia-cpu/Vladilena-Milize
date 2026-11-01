'use strict';
// POST /api/staff/:u/password { password, reason } (màn Tài khoản): Admin đặt lại mật khẩu của tài khoản KHÁC mà không gửi lại cả hồ sơ.
// Cần roles.manage; không dùng cho chính mình (400); mật khẩu tối thiểu như PUT /api/staff/:u (6 ký tự); mọi phiên cũ của người đó hết hiệu lực;
// nhật ký password.reset ghi lý do, không bao giờ ghi mật khẩu hay hàm băm. Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store, auth } = F;
const REASON = 'Nhân viên quên mật khẩu, đặt lại theo yêu cầu';
const NEW_PASS = 'mat-khau-moi-123';

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_admin2', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_target', 'staff');
  await F.person('qa_hr', 'staff');
  await F.person('qa_cb', 'staff');
  await F.person('qa_locker', 'staff');
  await store.roles.grant('qa_hr', 'hr', 'admin');
  await store.roles.grant('qa_cb', 'cb', 'admin');
  const authz = require('../../src/platform/authz');
  const saved = (await store.getSetting(authz.CUSTOM_ROLES_KEY, null)) || { rev: 0, roles: [] };
  await store.setSetting(authz.CUSTOM_ROLES_KEY, {
    rev: saved.rev + 1,
    roles: [
      ...saved.roles,
      {
        code: 'qa_chi_khoa',
        label: 'Chỉ khoá',
        caps: ['staff.lock', 'profile.write'],
        approvals: [],
        scope: 'all',
        rev: 1
      }
    ]
  });
  await store.roles.grant('qa_locker', 'qa_chi_khoa', 'admin');
});
after(F.stop);

const reset = async (who?, username?, body?) => await F.call('POST', `/staff/${username}/password`, { who, body });
const hashOf = async (username?) => (await store.getStaffRow(username)).pass_hash;
const good = (over: any = {}) => ({ password: NEW_PASS, reason: REASON, ...over });

test('Admin đặt lại mật khẩu của nhân sự: 200, mật khẩu mới dùng được, mật khẩu cũ hết, mọi phiên cũ hết hiệu lực, hồ sơ khác giữ nguyên', async () => {
  const oldCookie = auth.cookieHeader(await auth.createSession('qa_target'), 86400);
  assert.equal(await auth.readSession(oldCookie), 'qa_target');
  const profile = JSON.stringify(await store.getStaff('qa_target'));
  const res = await reset('admin', 'qa_target', good());
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data, { ok: true });
  assert.equal(auth.verifyPassword(NEW_PASS, await hashOf('qa_target')), true);
  assert.equal(auth.verifyPassword('test-pass', await hashOf('qa_target')), false);
  assert.equal(await auth.readSession(oldCookie), null, 'phiên cũ hết hiệu lực');
  assert.equal(JSON.stringify(await store.getStaff('qa_target')), profile, 'hồ sơ không đổi');
  assert.equal(JSON.stringify(res.data).includes(NEW_PASS), false);
});

test('nhật ký password.reset có người làm, người bị đặt lại, lý do; không có mật khẩu hay hàm băm ở bất kỳ cột nào', async () => {
  const rows = await store.db.prepare("SELECT * FROM audit_log WHERE action = 'password.reset'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, 'admin');
  assert.equal(rows[0].subject, 'qa_target');
  assert.equal(rows[0].reason, REASON);
  const text = JSON.stringify(rows);
  assert.equal(text.includes(NEW_PASS), false, 'không ghi mật khẩu');
  assert.equal(text.includes(await hashOf('qa_target')), false, 'không ghi hàm băm');
});

test('không đặt lại mật khẩu của chính mình ở route này (400 USE_OWN_PASSWORD), không đổi gì', async () => {
  const before = await hashOf('admin');
  const res = await reset('admin', 'admin', good());
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'USE_OWN_PASSWORD');
  assert.equal(await hashOf('admin'), before);
});

test('không có roles.manage thì 403 và không đổi gì: HR, C&B, người chỉ có staff.lock và profile.write, nhân sự thường; chưa đăng nhập 401', async () => {
  const before = await hashOf('qa_target');
  const snapshot = await F.snapshot();
  for (const who of ['qa_hr', 'qa_cb', 'qa_locker', 'qa_target']) {
    const res = await reset(who, who === 'qa_target' ? 'qa_hr' : 'qa_target', good());
    assert.equal(res.status, 403, `${who}: ${JSON.stringify(res.data)}`);
  }
  assert.equal((await reset(null, 'qa_target', good())).status, 401);
  assert.equal(await hashOf('qa_target'), before);
  assert.deepEqual(F.changedTables(snapshot, await F.snapshot()), []);
});

test('đầu vào sai: mật khẩu ngắn hơn 6 ký tự, không phải chuỗi, thiếu hoặc lý do quá dài là 400; tài khoản không có là 404; không đổi gì; lý do ngắn hoặc thiếu vẫn đặt lại được', async () => {
  const before = await hashOf('qa_target');
  const snapshot = await F.snapshot();
  for (const over of [
    { password: '12345' },
    { password: 123456 },
    { password: undefined },
    { reason: 'x'.repeat(301) }
  ]) {
    const res = await reset('admin', 'qa_target', good(over));
    assert.equal(res.status, 400, JSON.stringify(over));
  }
  assert.equal((await reset('admin', 'qa_khong_co', good())).status, 404);
  assert.equal(await hashOf('qa_target'), before);
  assert.deepEqual(F.changedTables(snapshot, await F.snapshot()), []);
  assert.equal((await reset('admin', 'qa_target', good({ password: '123456' }))).status, 200, 'đúng 6 ký tự là đủ');
  assert.equal((await reset('admin', 'qa_target', good({ reason: undefined }))).status, 200, 'thiếu lý do');
  assert.equal((await reset('admin', 'qa_target', good({ reason: 'ngắn' }))).status, 200, 'lý do ngắn');
});

test('Admin đặt lại mật khẩu của Admin khác được (cần roles.manage, người làm không phải chính người đó)', async () => {
  const res = await reset('admin', 'qa_admin2', good());
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(auth.verifyPassword(NEW_PASS, await hashOf('qa_admin2')), true);
});
