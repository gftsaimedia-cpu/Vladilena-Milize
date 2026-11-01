'use strict';
// PUT /api/staff/:u không đổi ngầm giá trị lạ thành mặc định. server.js → PUT /staff/:u:
//   - type ngoài tts, ctv, nv (kể cả 'NV' viết hoa, chuỗi rỗng, số) là 400 "Loại nhân sự phải là một trong: tts, ctv, nv";
//   - role ngoài admin, staff (kể cả 'ADMIN', true) là 400 "Vai trò phải là admin hoặc staff";
//   - NV với nightPct ngoài type.nv.nightOptions (40, 60) là 400 "Phụ cấp đêm phải là một trong: 40, 60 (%)";
//   - đầu vào hợp lệ giữ nguyên hành vi: thiếu nightPct của NV lấy 40; '60' và 60 đều thành 60; CTV bỏ qua nightPct (null);
//     thiếu type là tts, thiếu role là staff.
// Mọi lần 400 không được ghi gì (không dòng staff nào đổi, không bảng nào đổi).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;

before(async () => {
  await F.start();
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_exist', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
});
after(F.stop);

const profile = (extra: any = {}) => ({
  name: 'Người thử T8',
  role: 'staff',
  type: 'nv',
  level: 1,
  nightPct: 40,
  shiftCode: 'n1',
  startDate: '2026-01-05',
  password: 'mat-khau-thu',
  ...extra
});
// Tài khoản đã có không nhận mật khẩu qua hồ sơ (400 USE_PASSWORD_RESET): bỏ trường password khi tài khoản đã tồn tại
const put = async (username?, body?, who = 'admin') => {
  const { password, ...withoutPassword } = body;
  return F.call('PUT', `/staff/${username}`, {
    who,
    body: (await store.getStaffRow(username)) ? withoutPassword : body
  });
};
const staffCount = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM staff').get()).n;

// Gửi hồ sơ sai cho tài khoản mới và cho tài khoản đã có; 400 đúng câu lỗi và không bảng nào đổi
async function rejects(extra?, message?) {
  for (const username of ['qa_new_t8', 'qa_exist']) {
    const before = await F.snapshot();
    const count = await staffCount();
    const prev = JSON.stringify((await store.getStaff(username)) || null);
    const res = await put(username, await profile(extra));
    assert.equal(res.status, 400, `${username} ${JSON.stringify(extra)}: ${res.status} ${JSON.stringify(res.data)}`);
    if (message instanceof RegExp) assert.match(res.data.error, message, JSON.stringify(extra));
    else assert.equal(res.data.error, message, JSON.stringify(extra));
    assert.deepEqual(F.changedTables(before, await F.snapshot()), [], `${JSON.stringify(extra)} không được ghi gì`);
    assert.equal(await staffCount(), count, 'số nhân sự không đổi');
    assert.equal(JSON.stringify((await store.getStaff(username)) || null), prev, `${username} nguyên vẹn`);
  }
}

// Danh sách trong câu lỗi lấy từ các chức vụ của tháng (thứ tự theo bảng chữ cái), nên kiểm đủ ba mã chứ không ghim thứ tự
test('T8: loại nhân sự lạ (xyz, NV viết hoa, chuỗi rỗng, số 5, true) là 400 "Loại nhân sự phải là một trong: …" nêu đủ tts, ctv, nv và không lưu gì', async () => {
  for (const type of ['xyz', 'NV', '', 5, true, 'tts ', ['nv']])
    await rejects({ type }, /^Loại nhân sự phải là một trong: (?=.*tts)(?=.*ctv)(?=.*nv)/);
});

test('T8: vai trò lạ (boss, ADMIN viết hoa, true, chuỗi rỗng) là 400 "Vai trò phải là admin hoặc staff", không tạo tài khoản và không đổi vai trò tài khoản có sẵn', async () => {
  for (const role of ['boss', 'ADMIN', 'Staff', true, '', 1])
    await rejects({ role }, 'Vai trò phải là admin hoặc staff');
  assert.equal((await store.getStaff('qa_exist')).role, 'staff');
  assert.equal(await store.getStaff('qa_new_t8'), undefined);
});

test('T8: NV với phụ cấp đêm ngoài lựa chọn (55, "abc", 0, "0", -40, 100) là 400 "Phụ cấp đêm phải là một trong: 40, 60 (%)" và không lưu gì', async () => {
  for (const nightPct of [55, 'abc', 0, '0', -40, 100, '40%'])
    await rejects({ type: 'nv', nightPct }, 'Phụ cấp đêm phải là một trong: 40, 60 (%)');
});

test('T8: đầu vào hợp lệ giữ nguyên: NV không có nightPct lưu 40; 60 và "60" lưu 60; 40 lưu 40', async () => {
  const noPct = await profile();
  delete noPct.nightPct;
  const created = await put('qa_new_t8', noPct);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal((await store.getStaff('qa_new_t8')).nightPct, 40, 'thiếu nightPct: lấy lựa chọn đầu tiên');
  assert.equal((await store.getStaff('qa_new_t8')).type, 'nv');
  for (const [given, stored] of [
    [60, 60],
    ['60', 60],
    [40, 40],
    ['40', 40],
    [null, 40],
    ['', 40]
  ]) {
    const res = await put('qa_plain', await profile({ nightPct: given }));
    assert.equal(res.status, 200, `nightPct ${JSON.stringify(given)}: ${JSON.stringify(res.data)}`);
    assert.equal((await store.getStaff('qa_plain')).nightPct, stored, `nightPct ${JSON.stringify(given)}`);
  }
});

test('T8: CTV gửi nightPct 60 vẫn 200 và nightPct lưu null (loại không có bảng phụ cấp đêm bỏ qua trường này); ngay cả giá trị lạ cũng không bị từ chối', async () => {
  const res = await put('qa_ctv_t8', await profile({ type: 'ctv', nightPct: 60 }));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('qa_ctv_t8')).type, 'ctv');
  assert.equal((await store.getStaff('qa_ctv_t8')).nightPct, null);
  const odd = await put('qa_ctv_t8', await profile({ type: 'ctv', nightPct: 55 }));
  assert.equal(odd.status, 200, JSON.stringify(odd.data));
  assert.equal((await store.getStaff('qa_ctv_t8')).nightPct, null);
});

test('T8: thiếu type thì là tts, thiếu role thì là staff, type/role null cũng vậy (thiếu trường khác với giá trị lạ)', async () => {
  const body = await profile({ startDate: '2026-01-05' });
  delete body.type;
  delete body.role;
  delete body.nightPct;
  const res = await put('qa_default_t8', body);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const saved = await store.getStaff('qa_default_t8');
  assert.equal(saved.type, 'tts');
  assert.equal(saved.role, 'staff');
  assert.equal(saved.nightPct, null, 'TTS không có phụ cấp đêm');
  const nulls = await put('qa_null_t8', await profile({ type: null, role: null }));
  assert.equal(nulls.status, 200, JSON.stringify(nulls.data));
  assert.equal((await store.getStaff('qa_null_t8')).type, 'tts');
  assert.equal((await store.getStaff('qa_null_t8')).role, 'staff');
});

test('T8: nhân sự thường (staff) vẫn không sửa được hồ sơ người khác dù gửi giá trị đúng hay sai (403), và chưa đăng nhập là 401', async () => {
  const before = await F.snapshot();
  assert.equal((await put('qa_exist', await profile(), 'qa_plain')).status, 403);
  assert.equal((await put('qa_exist', await profile({ type: 'xyz' }), 'qa_plain')).status, 403);
  assert.equal((await put('qa_exist', await profile(), null)).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});
