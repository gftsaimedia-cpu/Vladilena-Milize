require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'ha-tang-2026-10-26';
// Trang chủ về trang đăng nhập khi chưa build giao diện Vue: không để web/dist có sẵn trên máy dev (npm run build) đổi kết quả
process.env.WEB_DIST = require('node:path').join(require('node:os').tmpdir(), 'luong-no-web-dist');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const store = require('../../src/platform/db');
const server = require('../helpers/server');
const config = require('../../src/platform/config');
const { send } = require('../../src/platform/http');

after(() => {
  server.closeAllConnections?.();
  server.close();
  store.db.close();
});

function miniServer(handler?) {
  return new Promise<any>(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
const get = (port?) =>
  new Promise<any>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/' }, res => {
        const chunks: any[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      })
      .on('error', reject);
  });

test('trả lời lần hai sau khi đã trả lời là bỏ qua, không ném ERR_HTTP_HEADERS_SENT', async () => {
  let secondThrew: any = null;
  const { srv, port } = await miniServer((req, res) => {
    send(res, 200, { ok: true });
    try {
      send(res, 500, { error: 'lỗi phụ sau khi đã trả lời' });
    } catch (e) {
      secondThrew = e;
    }
  });
  const r = await get(port);
  srv.close();
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), { ok: true });
  assert.equal(secondThrew, null, 'lần gửi thứ hai không được ném');
});

test('máy chủ giữ kết nối 65 giây và headersTimeout lớn hơn keepAliveTimeout', () => {
  assert.equal(server.keepAliveTimeout, config.HTTP_KEEP_ALIVE_MS);
  assert.equal(server.headersTimeout, config.HTTP_HEADERS_TIMEOUT_MS);
  assert.ok(server.headersTimeout > server.keepAliveTimeout, 'Node yêu cầu headersTimeout lớn hơn keepAliveTimeout');
  assert.ok(server.keepAliveTimeout > 5000, 'phải dài hơn mặc định 5 giây của Node');
});

test('máy chủ thật vẫn trả lời bình thường sau khi áp cấu hình mới', async () => {
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const home = await get(port);
  assert.ok(
    [200, 503].includes(home.status),
    'trang chủ trả lời (200 khi đã build giao diện, 503 khi chưa), không chuyển hướng'
  );
  const login = await new Promise<any>((resolve, reject) => {
    const body = JSON.stringify({ username: 'khong-co', password: 'sai-mat-khau' });
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/login',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
      },
      res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  assert.ok(login === 401 || login === 429, 'đăng nhập sai bị từ chối, không treo');
});
