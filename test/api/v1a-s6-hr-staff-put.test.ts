'use strict';
// PUT /api/staff/:u với vai trò `hr` (có `profile.write`, không có `salary.write`). HR bị 403 FORBIDDEN_CAP khi:
//   - đặt lại mật khẩu của Admin (hoặc tài khoản có vai trò cb/accounting): nếu lọt, HR đăng nhập được thành họ;
//   - đổi level, type, insured, dependants, contract, taxOn, deductOn, advanceOn: các trường đổi tiền, thuộc `salary.write`
//     (HR không xem lương).
// Mong đợi: 403 FORBIDDEN_CAP và không đổi gì. Đối chứng: HR lưu hồ sơ với trường đổi tiền GIỮ NGUYÊN,
// HR đổi tên và vị trí công việc, người có cả hr và cb (salary.write) đổi level được.
// Vai trò gán bằng store.roles.grant (bảng staff_roles). Mỗi test dùng tài khoản riêng. Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_hr', 'staff');
  await F.person('qa_cb', 'staff');
  await F.person('qa_hrcb', 'staff');
  await store.roles.grant('qa_hr', 'hr', 'admin');
  await store.roles.grant('qa_cb', 'cb', 'admin');
  await store.roles.grant('qa_hrcb', 'hr', 'admin');
  await store.roles.grant('qa_hrcb', 'cb', 'admin');
});
after(F.stop);

const put = async (who?, username?, body?) => await F.call('PUT', `/staff/${username}`, { who, body });
// Biểu mẫu hồ sơ đầy đủ như giao diện gửi; trường đổi tiền lấy từ hồ sơ hiện tại, over ghi đè
const formOf = async (username?, over: any = {}) => {
  const s = await store.getStaff(username);
  return {
    name: s.name,
    role: s.role,
    type: s.type,
    level: s.level,
    nightPct: s.nightPct,
    shiftCode: s.shiftCode,
    startDate: s.startDate,
    insured: s.insured,
    dependants: s.dependants,
    contract: s.contract,
    taxOn: s.taxOn,
    deductOn: s.deductOn,
    advanceOn: s.advanceOn,
    ...over
  };
};
const PAY_FIELDS = ['type', 'level', 'insured', 'dependants', 'contract', 'taxOn', 'deductOn', 'advanceOn'];
const payOf = async (username?) => {
  const s = await store.getStaff(username);
  return Object.fromEntries(PAY_FIELDS.map(k => [k, s[k] ?? null]));
};
const hashOf = async (username?) => (await store.getStaffRow(username)).pass_hash;
const sessionOf = async (username?) => (await store.getStaffRow(username)).session_version;

/* ---------- mật khẩu ---------- */

test('V1A-S6-3: HR không đặt lại được mật khẩu của Admin (403), mật khẩu và phiên của Admin giữ nguyên', async () => {
  const hash = await hashOf('admin'),
    version = await sessionOf('admin');
  const res = await put('qa_hr', 'admin', {
    name: (await store.getStaff('admin')).name,
    role: 'admin',
    password: 'hacked-pass1'
  });
  assert.equal(res.status, 403, JSON.stringify(res.data).slice(0, 300));
  assert.equal(await hashOf('admin'), hash, 'mật khẩu Admin không đổi');
  assert.equal(await sessionOf('admin'), version, 'phiên của Admin không bị thu hồi');
});

test('V1A-S6-3: HR không đặt lại được mật khẩu của tài khoản có vai trò cb (403)', async () => {
  const hash = await hashOf('qa_cb');
  const res = await put('qa_hr', 'qa_cb', await formOf('qa_cb', { password: 'hacked-pass2' }));
  assert.equal(res.status, 403, JSON.stringify(res.data).slice(0, 300));
  assert.equal(await hashOf('qa_cb'), hash);
});

test('V1A-S6-3 (đối chứng): Admin không đặt mật khẩu của tài khoản đã có qua hồ sơ (400 USE_PASSWORD_RESET); đặt lại bằng POST /staff/:u/password được', async () => {
  const hash = await hashOf('qa_cb');
  const viaProfile = await put('admin', 'qa_cb', await formOf('qa_cb', { password: 'new-pass-ok1' }));
  assert.equal(viaProfile.status, 400, JSON.stringify(viaProfile.data).slice(0, 300));
  assert.equal(viaProfile.data.code, 'USE_PASSWORD_RESET');
  assert.equal(await hashOf('qa_cb'), hash);
  const reset = await F.call('POST', '/staff/qa_cb/password', {
    who: 'admin',
    body: { password: 'new-pass-ok1', reason: 'Đặt lại mật khẩu theo yêu cầu của người dùng' }
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.data).slice(0, 300));
  assert.notEqual(await hashOf('qa_cb'), hash);
});

/* ---------- trường đổi tiền ---------- */

const CHANGES = {
  level: 2,
  type: 'ctv',
  insured: false,
  dependants: 3,
  contract: 'short',
  taxOn: false,
  deductOn: false,
  advanceOn: false
};
for (const [field, value] of Object.entries<any>(CHANGES))
  test(`V1A-S6-3: HR đổi trường đổi tiền "${field}" bị 403 FORBIDDEN_CAP (cần salary.write) và hồ sơ giữ nguyên`, async () => {
    const user = `qa_pay_${field.toLowerCase()}`;
    await F.person(user, 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
    const was = await payOf(user);
    const res = await put('qa_hr', user, await formOf(user, { [field]: value }));
    assert.equal(res.status, 403, `${field}: ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
    assert.equal(res.data.code, 'FORBIDDEN_CAP');
    assert.deepEqual(await payOf(user), was, 'hồ sơ không đổi');
  });

/* ---------- đối chứng: những việc HR được làm ---------- */

test('V1A-S6-3b: HR lưu hồ sơ đầy đủ như biểu mẫu gửi (giá trị hiệu lực của GET) với mọi trường đổi tiền GIỮ NGUYÊN thì được (200)', async () => {
  await F.person('qa_same', 'staff', { type: 'nv', level: 2, startDate: '2026-01-05' });
  const was = await payOf('qa_same');
  const res = await put('qa_hr', 'qa_same', await formOf('qa_same'));
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.deepEqual(await payOf('qa_same'), was);
});

test('V1A-S6-3b: HR đổi tên và vị trí công việc (biểu mẫu đầy đủ, không đổi tiền) thì được (200)', async () => {
  await F.person('qa_names', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  const res = await put(
    'qa_hr',
    'qa_names',
    await formOf('qa_names', { name: 'Tên mới của người thử', jobTitle: 'Chuyên viên' })
  );
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal((await store.getStaff('qa_names')).name, 'Tên mới của người thử');
});

test('V1A-S6-3 (đối chứng): người có cả hr và cb (salary.write) đổi được level; Admin đổi được mọi trường đổi tiền', async () => {
  await F.person('qa_lvl', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  const byBoth = await put('qa_hrcb', 'qa_lvl', await formOf('qa_lvl', { level: 2 }));
  assert.equal(byBoth.status, 200, JSON.stringify(byBoth.data).slice(0, 300));
  assert.equal((await store.getStaff('qa_lvl')).level, 2);
  const byAdmin = await put('admin', 'qa_lvl', await formOf('qa_lvl', { level: 3, dependants: 2, contract: 'short' }));
  assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.data).slice(0, 300));
  assert.equal((await store.getStaff('qa_lvl')).level, 3);
});
