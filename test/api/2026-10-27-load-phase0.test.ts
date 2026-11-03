// Chịu tải: /api/health, nén gzip (API và file tĩnh), ETag/304, nhật ký truy cập + X-Request-Id.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
// File tĩnh là giao diện Vue đã build (web/dist): dựng một bản giả đủ lớn để nén gzip có lợi
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-load-dist-'));
fs.writeFileSync(
  path.join(dist, 'index.html'),
  '<!doctype html><title>Vue</title>' + '<div class="dong-lap-lai">noi dung</div>'.repeat(200)
);
process.env.WEB_DIST = dist;
const F = require('../helpers/api-fixture');
const { RuntimeMonitor } = require('../../src/ops/runtime-monitor');
const { attachAccessLog } = require('../../src/ops/access-log');

const lines: any[] = [];
let base;
const get = (route?, headers: any = {}) => fetch(base + route, { headers });

before(async () => {
  await F.start();
  base = `http://127.0.0.1:${F.server.address().port}`;
  attachAccessLog(F.server, new RuntimeMonitor(), line => lines.push(JSON.parse(line)));
  await F.person('admin', 'admin');
  for (let i = 0; i < 40; i++) await F.person(`nv${i}`);
});
after(async () => {
  await F.stop();
  fs.rmSync(dist, { recursive: true, force: true });
});

test('GET /api/health công khai, trả ok và số đo, không lộ dữ liệu nghiệp vụ', async () => {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.ok, true);
  assert.deepEqual(Object.keys(body).sort(), ['heapMb', 'loopLagMs', 'ok', 'rssMb', 'uptimeSec']);
});

test('phản hồi JSON lớn được nén gzip khi khách chấp nhận, và giải nén ra đúng nội dung', async () => {
  const cookie = F.auth.cookieHeader(await F.auth.createSession('admin'), 86400);
  const plain = await fetch(`${base}/api/staff`, { headers: { Cookie: cookie, 'Accept-Encoding': 'identity' } });
  const packed = await fetch(`${base}/api/staff`, { headers: { Cookie: cookie, 'Accept-Encoding': 'gzip' } });
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get('content-encoding'), null);
  assert.equal(packed.headers.get('content-encoding'), 'gzip');
  assert.equal(packed.headers.get('vary'), 'Accept-Encoding');
  assert.deepEqual((await packed.json()) as any, (await plain.json()) as any); // fetch tự giải nén gzip
});

test('file tĩnh có ETag; hỏi lại với If-None-Match nhận 304; file chữ được nén gzip', async () => {
  const first = await get('/', { 'Accept-Encoding': 'gzip' });
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.equal(first.headers.get('content-encoding'), 'gzip');
  const second = await get('/', { 'If-None-Match': etag });
  assert.equal(second.status, 304);
});

test('nhật ký truy cập: mã yêu cầu ở tiêu đề khớp dòng log, không chứa chuỗi truy vấn', async () => {
  lines.length = 0;
  const res = await get('/api/health?secret=abc', { 'X-Request-Id': 'test-req-1' });
  await res.text();
  await new Promise<any>(resolve => setTimeout(resolve, 50)); // 'close' của phản hồi đến sau
  assert.equal(res.headers.get('x-request-id'), 'test-req-1');
  const line = lines.find(l => l.id === 'test-req-1');
  assert.ok(line, 'có dòng log');
  assert.equal(line.p, '/api/health');
  assert.equal(line.s, 200);
  assert.ok(!JSON.stringify(line).includes('secret'));
});

test('số lần ghi của DB (khoá bộ nhớ đệm): đọc không làm đổi, mọi lệnh ghi đều làm tăng', async () => {
  const { dataRevision } = require('../../src/ops/shared-cache');
  const before = await dataRevision();
  await F.store.getSetting('holidays', []);
  await F.store.listStaff();
  assert.equal(await dataRevision(), before);
  await F.store.setSetting('cache_probe', 1); // ghi lẻ ngoài transaction cũng phải được tính
  assert.ok((await dataRevision()) > before);
});

// ---------- giới hạn tải ----------
const limits = () => F.server.limits;
const as = async (who?, route?, init: any = {}) =>
  fetch(base + route, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: F.auth.cookieHeader(await F.auth.createSession(who), 86400),
      ...init.headers
    }
  });

test('quá tải: route nặng nhận 503 + Retry-After, route thiết yếu vẫn chạy', async () => {
  const { shedder } = limits();
  const saved = shedder.maxInflight;
  shedder.maxInflight = 0; // coi như luôn quá tải
  try {
    const heavy = await as('admin', '/api/staff');
    assert.equal(heavy.status, 503);
    assert.ok(Number(heavy.headers.get('retry-after')) > 0);
    assert.equal(((await heavy.json()) as any).code, 'OVERLOADED');
    assert.equal((await as('admin', '/api/me')).status, 200);
    assert.equal((await get('/api/health')).status, 200);
  } finally {
    shedder.maxInflight = saved;
  }
  assert.equal((await as('admin', '/api/staff')).status, 200);
});

test('giới hạn tốc độ ghi theo người: quá số lệnh/phút thì 429, đọc không bị ảnh hưởng, người khác không bị ảnh hưởng', async () => {
  const { writeLimiter } = limits();
  const saved = { capacity: writeLimiter.capacity, refillPerMs: writeLimiter.refillPerMs };
  writeLimiter.capacity = 2;
  writeLimiter.refillPerMs = 0; // không nạp lại token giữa các yêu cầu: kết quả không phụ thuộc tốc độ máy/DB
  writeLimiter.buckets.clear();
  try {
    const put = async (who?) =>
      await as(who, '/api/sheet', { method: 'PUT', body: JSON.stringify({ month: '2026-10', days: {} }) });
    assert.notEqual((await put('nv0')).status, 429);
    assert.notEqual((await put('nv0')).status, 429);
    const blocked = await put('nv0');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
    assert.equal((await as('nv0', '/api/me')).status, 200);
    assert.notEqual((await put('nv1')).status, 429);
  } finally {
    Object.assign(writeLimiter, saved);
    writeLimiter.buckets.clear();
  }
});

test('đăng nhập: cổng băm mật khẩu hết chỗ thì 503 + Retry-After, không phải 500', async () => {
  const { hashGate } = limits();
  const saved = { limit: hashGate.limit, maxQueue: hashGate.maxQueue };
  hashGate.limit = 0;
  hashGate.maxQueue = 0;
  try {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nv2', password: 'test-pass' })
    });
    assert.equal(res.status, 503);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
  } finally {
    Object.assign(hashGate, saved);
  }
  const ok = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nv2', password: 'test-pass' })
  });
  assert.equal(ok.status, 200);
});
