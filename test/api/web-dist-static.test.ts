// Máy chủ phục vụ giao diện Vue đã build (web/dist) khi có: "/" và đường dẫn của router Vue trả index.html, /assets/ giữ được lâu,
// /api không bị index.html che. Giao diện duy nhất là bản Vue (web/dist): chưa build thì "/" trả 503 kèm cách build, file khác 404.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-web-dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>AiCB Vue</title><div id="app"></div>');
fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'export default 1;');
process.env.WEB_DIST = dist;
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'web-dist-tests';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const store = require('../../src/platform/db');
const server = require('../helpers/server');
let base;

// gọi qua node:http để giữ nguyên đường dẫn thô (fetch tự chuẩn hoá "..")
function raw(route?) {
  return new Promise<any>((resolve, reject) => {
    const req = http.request(base + route, res => {
      let text = '';
      res.on('data', chunk => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test('trang chủ trả index.html của giao diện Vue, luôn hỏi lại', async () => {
  const r = await raw('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /AiCB Vue/);
  assert.equal(r.headers['cache-control'], 'no-cache');
  assert.match(r.headers['content-type'], /text\/html/);
});

test('đường dẫn của router Vue (không có đuôi file) trả index.html', async () => {
  for (const route of ['/admin/staff', '/employee/today', '/login', '/admin/settings/audit-log']) {
    const r = await raw(route);
    assert.equal(r.status, 200, route);
    assert.match(r.text, /AiCB Vue/, route);
  }
});

test('/assets/ có băm trong tên được giữ lâu và đúng kiểu nội dung', async () => {
  const r = await raw('/assets/index-abc123.js');
  assert.equal(r.status, 200);
  assert.match(r.headers['cache-control'], /immutable/);
  assert.match(r.headers['content-type'], /text\/javascript/);
});

test('giao diện cũ trong public/ đã bỏ (404); file không có thì 404', async () => {
  assert.equal((await raw('/dang-nhap.html')).status, 404);
  assert.equal((await raw('/admin.html')).status, 404);
  assert.equal(
    (await raw('/payroll-engine.js')).status,
    404,
    'mô-đun tính lương của máy chủ không được phục vụ ra ngoài'
  );
  assert.equal((await raw('/khong-co-file-nay.js')).status, 404);
  assert.equal((await raw('/assets/khong-co.js')).status, 404);
});

test('/api không bị index.html che', async () => {
  const r = await raw('/api/me');
  assert.match(r.headers['content-type'], /application\/json/);
  assert.doesNotMatch(r.text, /AiCB Vue/);
});

test('đường dẫn đi ra ngoài web/dist và public/ không đọc được', async () => {
  for (const route of ['/../server.js', '/..%2fserver.js', '/%2e%2e/server.js', '/assets/../../server.js', '/%00']) {
    const r = await raw(route);
    assert.ok([400, 404].includes(r.status) || !/require\(|DatabaseSync|SESSION_SECRET/.test(r.text), route);
    assert.doesNotMatch(r.text, /require\(|DatabaseSync|SESSION_SECRET|SQLite format/, route);
  }
});

test('mọi phản hồi tĩnh vẫn mang tiêu đề bảo mật', async () => {
  const r = await raw('/');
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('chưa build web/dist: "/" trả 503 nói rõ cách build, file khác 404, không chuyển hướng', () => {
  const { spawnSync } = require('node:child_process');
  const code = `
    const { serveStatic } = require('./src/platform/http');
    const out = [];
    for (const p of ['/', '/admin/tong-quan', '/payroll-engine.js']) {
      const res = { writeHead(s, h) { this.s = s; this.h = h || {}; }, end(b) { out.push({ p, s: this.s, loc: this.h.Location || null, b: String(b || '') }); } };
      serveStatic({ headers: {}, method: 'GET' }, res, new URL('http://x' + p));
    }
    console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['-e', code], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, WEB_DIST: path.join(dist, 'khong-co-thu-muc-nay') },
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  const [root, spa, engine] = JSON.parse(r.stdout);
  assert.equal(root.s, 503);
  assert.equal(root.loc, null);
  assert.match(root.b, /npm run build/);
  assert.equal(spa.s, 404);
  assert.equal(engine.s, 404);
});
