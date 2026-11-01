'use strict';
// Tự sửa hồ sơ của chính mình ở các trường tiền, ca, điều chỉnh phép: PUT /api/staff/:u và PUT /api/staff/shift-bulk vẫn lưu, kèm cảnh báo
// SELF_DECISION_FORBIDDEN nêu trường; tự đặt mật khẩu qua hồ sơ là 403 SELF_DECISION_FORBIDDEN (không lưu). Tài khoản đã có không đặt mật khẩu qua hồ sơ (400 USE_PASSWORD_RESET);
// tạo tài khoản mới vẫn nhận password. Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store, auth } = F;

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_cb_self', 'staff'); // C&B cũng là nhân sự được trả lương: người dùng "self" của các test
  await F.person('qa_other', 'staff');
  await store.roles.grant('qa_cb_self', 'cb', 'admin');
  await store.roles.grant('qa_cb_self', 'hr', 'admin');
});
after(F.stop);

const put = async (who?, username?, body?) => await F.call('PUT', `/staff/${username}`, { who, body });
// Hồ sơ đầy đủ như giao diện gửi, giá trị hiện tại, over ghi đè
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
    birthday: s.birthday,
    leaveAdjust: s.leaveAdjust,
    insured: s.insured,
    dependants: s.dependants,
    contract: s.contract,
    taxOn: s.taxOn,
    deductOn: s.deductOn,
    advanceOn: s.advanceOn,
    jobTitle: s.jobTitle,
    ...over
  };
};
const snap = async (username?) => JSON.stringify(await store.getStaff(username));
const hashOf = async (username?) => (await store.getStaffRow(username)).pass_hash;

test('tự sửa trường tiền, ca, điều chỉnh phép của chính mình: vẫn lưu, kèm cảnh báo SELF_DECISION_FORBIDDEN nêu trường', async () => {
  const cases: any[] = [
    [{ level: 2 }, 'level'],
    [{ dependants: 5 }, 'dependants'],
    [{ taxOn: false }, 'taxOn'],
    [{ contract: 'short' }, 'contract'],
    [{ shiftCode: 'n2' }, 'shiftCode'],
    [{ leaveAdjust: 3 }, 'leaveAdjust']
  ];
  for (const [over, field] of cases) {
    const res = await put('qa_cb_self', 'qa_cb_self', await formOf('qa_cb_self', over));
    assert.equal(res.status, 200, `${field}: ${JSON.stringify(res.data)}`);
    const warning = res.data.warnings.find(w => w.code === 'SELF_DECISION_FORBIDDEN');
    assert.ok(warning, `${field}: ${JSON.stringify(res.data.warnings)}`);
    assert.ok(warning.message.includes(field), `${field} có trong câu cảnh báo`);
    if (field !== 'shiftCode')
      assert.equal((await store.getStaff('qa_cb_self'))[field], over[field], `${field} đã lưu`);
    else assert.notEqual((await store.getStaff('qa_cb_self')).shiftCode, 'n1', 'ca đã đổi');
  }
});

test('tự gửi mật khẩu cho chính mình qua hồ sơ: 403 SELF_DECISION_FORBIDDEN, mật khẩu giữ nguyên', async () => {
  const hash = await hashOf('qa_cb_self');
  const res = await put('qa_cb_self', 'qa_cb_self', await formOf('qa_cb_self', { password: 'mat-khau-moi-1' }));
  assert.equal(res.status, 403, JSON.stringify(res.data));
  assert.equal(res.data.code, 'SELF_DECISION_FORBIDDEN');
  assert.equal(await hashOf('qa_cb_self'), hash);
});

test('sửa trường tiền của NGƯỜI KHÁC vẫn được khi có salary.write (không đổi hành vi)', async () => {
  const res = await put('qa_cb_self', 'qa_other', await formOf('qa_other', { level: 2 }));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('qa_other')).level, 2);
});

test('Admin cũ (không thuộc diện lương) vẫn sửa hồ sơ của mình như cũ: đổi tên được', async () => {
  const res = await put('admin', 'admin', await formOf('admin', { name: 'Quản trị thử', role: 'admin' }));
  assert.equal(res.status, 200, JSON.stringify(res.data));
});

test('shift-bulk: gán ca cho danh sách có chính mình vẫn đổi ca cả hai, kèm cảnh báo SELF_DECISION_FORBIDDEN; ca trùng ca hiện có của mình thì không cảnh báo', async () => {
  const body = (usernames?, preset?) => ({ usernames, preset, reason: 'Gán ca cho nhóm theo kế hoạch tuần này' });
  const call = async (b?) => await F.call('PUT', '/staff/shift-bulk', { who: 'qa_cb_self', body: b });
  const mine = (await store.getStaff('qa_cb_self')).shiftCode;
  const other = (await store.getStaff('qa_other')).shiftCode;
  const target = ['n2', 'Normal2'].includes(mine) ? 'f1' : 'n2';
  const res = await call(body(['qa_cb_self', 'qa_other'], target));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(
    res.data.warnings.some(w => w.code === 'SELF_DECISION_FORBIDDEN'),
    JSON.stringify(res.data.warnings)
  );
  assert.notEqual((await store.getStaff('qa_other')).shiftCode, other);
  const same = await call(body(['qa_cb_self'], (await store.getStaff('qa_cb_self')).shiftCode));
  assert.equal(same.status, 200, JSON.stringify(same.data));
  assert.ok(!(same.data.warnings || []).some(w => w.code === 'SELF_DECISION_FORBIDDEN'));
});

test('mật khẩu qua hồ sơ: tài khoản ĐÃ có bị 400 USE_PASSWORD_RESET (Admin cũng vậy), mật khẩu giữ nguyên; người không có roles.manage vẫn 403', async () => {
  const hash = await hashOf('qa_other');
  const res = await put('admin', 'qa_other', await formOf('qa_other', { password: 'mat-khau-moi-1' }));
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'USE_PASSWORD_RESET');
  assert.equal(await hashOf('qa_other'), hash);
  const denied = await put('qa_cb_self', 'qa_other', await formOf('qa_other', { password: 'mat-khau-moi-1' }));
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  assert.equal(await hashOf('qa_other'), hash);
});

test('tạo tài khoản mới vẫn nhận password như cũ; tài khoản mới đăng nhập được bằng mật khẩu đó', async () => {
  const res = await put('admin', 'qa_new_acc', {
    name: 'Người mới thử',
    role: 'staff',
    type: 'nv',
    level: 1,
    startDate: '2026-11-01',
    password: 'mat-khau-moi-1'
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.created, true);
  assert.equal(auth.verifyPassword('mat-khau-moi-1', await hashOf('qa_new_acc')), true);
});
