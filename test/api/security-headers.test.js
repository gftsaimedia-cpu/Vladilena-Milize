// Tiêu đề bảo mật có trên mọi phản hồi (trang chính, file tĩnh, API, 401, 404).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_PATH = ':memory:';
const server = require('../../server');

let base;
before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  delete process.env.COOKIE_SECURE;
  server.closeAllConnections();
  server.close();
});

const csp = res => res.headers.get('content-security-policy') || '';
const directive = (res, name) =>
  csp(res)
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(name + ' ')) || '';

function assertBase(res, where) {
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', where);
  assert.equal(res.headers.get('referrer-policy'), 'same-origin', where);
  assert.equal(res.headers.get('x-frame-options'), 'DENY', where);
  assert.equal(res.headers.get('permissions-policy'), 'geolocation=(self), camera=(), microphone=()', where);
  assert.ok(csp(res), `${where}: thiếu Content-Security-Policy`);
}

test('NEW-5: trang chính / có đủ tiêu đề bảo mật', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assertBase(res, '/');
});

test('NEW-5: file tĩnh có đủ tiêu đề bảo mật', async () => {
  const res = await fetch(base + '/punch.js');
  assert.equal(res.status, 200);
  assertBase(res, '/punch.js');
});

test('NEW-5: API (kể cả 401 và 404) có đủ tiêu đề bảo mật', async () => {
  const me = await fetch(base + '/api/me');
  assert.equal(me.status, 200);
  assertBase(me, '/api/me');
  const denied = await fetch(base + '/api/holidays/x');
  assertBase(denied, '/api/holidays (chưa đăng nhập)');
  const none = await fetch(base + '/khong-co-file.js');
  assert.equal(none.status, 404);
  assertBase(none, '404 tĩnh');
});

test('NEW-5: CSP khoá các nguồn ngoài nhưng vẫn cho trang hiện tại chạy', async () => {
  const res = await fetch(base + '/');
  assert.match(directive(res, 'default-src'), /^default-src 'self'$/);
  assert.match(directive(res, 'script-src'), /^script-src 'self' 'unsafe-inline'$/); // trang có script nội tuyến
  assert.match(directive(res, 'style-src'), /'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com$/);
  assert.match(directive(res, 'font-src'), /https:\/\/fonts\.gstatic\.com/);
  assert.equal(directive(res, 'img-src'), "img-src 'self' data:");
  assert.equal(directive(res, 'connect-src'), "connect-src 'self'");
  assert.equal(directive(res, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(res, 'base-uri'), "base-uri 'self'");
  assert.equal(directive(res, 'form-action'), "form-action 'self'");
  assert.equal(directive(res, 'object-src'), "object-src 'none'");
  assert.ok(!/\*/.test(csp(res)), 'không dùng ký tự đại diện *');
});

test('NEW-5: Strict-Transport-Security chỉ có khi COOKIE_SECURE=1', async () => {
  delete process.env.COOKIE_SECURE;
  assert.equal((await fetch(base + '/api/me')).headers.get('strict-transport-security'), null);
  process.env.COOKIE_SECURE = '0';
  assert.equal((await fetch(base + '/')).headers.get('strict-transport-security'), null);
  process.env.COOKIE_SECURE = '1';
  for (const p of ['/', '/api/me']) {
    const hsts = (await fetch(base + p)).headers.get('strict-transport-security');
    assert.match(hsts, /^max-age=\d+/, p);
  }
  delete process.env.COOKIE_SECURE;
});
