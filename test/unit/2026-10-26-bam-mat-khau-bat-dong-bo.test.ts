// Băm mật khẩu bất đồng bộ không chặn event loop, dùng ở đường có người thật chờ.
// Bản đồng bộ (hashPassword/verifyPassword) dùng cho dựng dữ liệu, script và test;
// bản bất đồng bộ (hashPasswordAsync/verifyPasswordAsync) phải cho CÙNG kết quả băm/kiểm với bản đồng bộ.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'qa-bam-mat-khau-bat-dong-bo';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../../src/platform/auth');

test('băm bằng bản bất đồng bộ thì bản đồng bộ kiểm được, và ngược lại', async () => {
  const asyncHash = await auth.hashPasswordAsync('mat-khau-vi-du');
  assert.match(asyncHash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(auth.verifyPassword('mat-khau-vi-du', asyncHash), true, 'async băm → sync kiểm');
  assert.equal(auth.verifyPassword('sai-mat-khau', asyncHash), false);

  const syncHash = auth.hashPassword('mat-khau-vi-du');
  assert.equal(await auth.verifyPasswordAsync('mat-khau-vi-du', syncHash), true, 'sync băm → async kiểm');
  assert.equal(await auth.verifyPasswordAsync('sai-mat-khau', syncHash), false);
});

test('hai lần băm cùng một mật khẩu ra hai muối khác nhau; chuỗi rỗng hay hàm băm lạ bị từ chối', async () => {
  const a = await auth.hashPasswordAsync('trung'),
    b = await auth.hashPasswordAsync('trung');
  assert.notEqual(a, b, 'mỗi lần băm một muối mới');
  assert.equal(await auth.verifyPasswordAsync('trung', a), true);
  for (const stored of ['', null, undefined, 'plain-text', 'scrypt$abc$def'])
    assert.equal(await auth.verifyPasswordAsync('trung', stored), false, String(stored));
});

test('băm bất đồng bộ không chặn event loop: hẹn giờ 0 ms chạy trước khi băm xong', async () => {
  const order: any[] = [];
  const hashing = auth.hashPasswordAsync('khong-chan').then(() => order.push('bam-xong'));
  await new Promise<any>(r =>
    setTimeout(() => {
      order.push('hen-gio');
      r(undefined);
    }, 0)
  );
  await hashing;
  assert.deepEqual(order, ['hen-gio', 'bam-xong'], 'scrypt chạy trên thread pool nên hẹn giờ chen được vào');
});

test('verifyLoginAsync giữ nguyên luật của verifyLogin: tên không tồn tại vẫn chạy một lần băm và trả false', async () => {
  const row = { username: 'qa', pass_hash: await auth.hashPasswordAsync('dung') };
  assert.equal(await auth.verifyLoginAsync('dung', row), true);
  assert.equal(await auth.verifyLoginAsync('sai', row), false);
  assert.equal(await auth.verifyLoginAsync('dung', undefined), false, 'không có tài khoản thì luôn false');
});
