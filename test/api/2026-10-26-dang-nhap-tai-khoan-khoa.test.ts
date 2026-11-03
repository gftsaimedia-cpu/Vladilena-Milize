// Mật khẩu đúng của một tài khoản ĐÃ BỊ KHOÁ không được xoá bộ đếm dò mật khẩu.
// server.js → POST /login kiểm row.locked_at TRƯỚC auth.loginSucceeded; câu lỗi, mã HTTP và hạn mức 429 giữ nguyên.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'qa-dang-nhap-tai-khoan-khoa';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base;
async function login(username?, password?) {
  const r = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return { status: r.status, data: (await r.json()) as any, cookie: r.headers.get('set-cookie') || '' };
}
const wrong = (username?) => login(username, 'sai-mat-khau');

before(async () => {
  await store.upsertStaff({
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: auth.hashPassword('test-pass')
  });
  await store.upsertStaff({
    username: 'khoa',
    name: 'Bị khoá',
    role: 'staff',
    type: 'nv',
    level: 1,
    passHash: auth.hashPassword('test-pass')
  });
  await store.lockStaff('khoa', 'admin');
  assert.ok((await store.getStaffRow('khoa')).locked_at, 'tài khoản đã bị khoá');
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(r => server.close(r));
});

test('mật khẩu đúng của tài khoản bị khoá trả 403 và KHÔNG xoá bộ đếm dò: lần sai kế tiếp vẫn bị khoá 15 phút (429)', async () => {
  // 4 lần sai: chưa tới hạn khoá cặp (địa chỉ, tên) nên bộ đếm còn 4 lần
  for (let i = 0; i < 4; i += 1) assert.equal((await wrong('khoa')).status, 401, `lần sai thứ ${i + 1}`);
  // Mật khẩu ĐÚNG nhưng tài khoản bị khoá: vẫn 403, không cấp phiên
  const blocked = await login('khoa', 'test-pass');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.cookie, '');
  // Nếu bộ đếm bị xoá thì lần sai thứ 5 chỉ là lần sai đầu của cửa sổ mới: 401 rồi 401
  assert.equal((await wrong('khoa')).status, 401, 'lần sai thứ 5 vẫn 401 như trước');
  assert.equal((await wrong('khoa')).status, 429, 'sang lần thứ 6 phải bị khoá: bộ đếm 4 lần cũ còn nguyên');
});

test('đăng nhập bình thường của tài khoản không bị khoá vẫn 200 (đổi thứ tự kiểm không làm hỏng đường đăng nhập)', async () => {
  await store.upsertStaff({
    username: 'mo',
    name: 'Mở',
    role: 'staff',
    type: 'nv',
    level: 1,
    passHash: auth.hashPassword('test-pass')
  });
  // Cùng địa chỉ với bài trước nhưng tên khác nên không dính khoá của cặp (địa chỉ, 'khoa')
  const ok = await login('mo', 'test-pass');
  assert.equal(ok.status, 200);
  assert.match(ok.cookie, /luong_sid=/);
  assert.equal((await login('mo', 'sai-mat-khau')).status, 401);
  assert.equal((await login('mo', 'test-pass')).status, 200, 'đăng nhập lại được: bộ đếm của tên này sạch');
});
