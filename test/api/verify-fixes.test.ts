// Kiểm: ngày làm bù kiểu cũ (thiếu extraKind) không bị chặn khi lưu lại, chống thử mật khẩu hàng loạt
// theo địa chỉ, cảnh báo TRUST_PROXY, đóng file khi khách ngắt kết nối, extraKind của bản ghi cũ, mật khẩu Admin production.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'verify-fixes-tests';
// Giao diện Vue đã build giả (web/dist): máy chủ chỉ phục vụ thư mục này
const distFs = require('node:fs');
const distDir = distFs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'luong-dist-'));
distFs.mkdirSync(require('node:path').join(distDir, 'assets'));
distFs.writeFileSync(
  require('node:path').join(distDir, 'index.html'),
  '<!doctype html><title>Vue</title><div id="app"></div>'
);
distFs.writeFileSync(require('node:path').join(distDir, 'assets', 'app.js'), 'export default 1;');
distFs.writeFileSync(require('node:path').join(distDir, 'assets', 'logo.png'), Buffer.alloc(4096, 1));
process.env.WEB_DIST = distDir;
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { Readable } = require('node:stream');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base, port;
const realNow = Date.now;
const MINUTE = 60 * 1000;
let clock = Date.parse('2026-10-14T12:00:00+07:00');

async function person(username?, overrides: any = {}) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass'),
    ...overrides
  });
}
async function call(method?, route?, body?, who = 'admin', headers: any = {}) {
  const h: Record<string, any> = { 'Content-Type': 'application/json', ...headers };
  if (who) h.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers: h,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const putSheet = async (who?, days?, month = '2026-10') => await call('PUT', '/sheet', { month, days }, who);
const savedDays = async (who?, month = '2026-10') => (await store.getSheet(who, month)).days;
const logOf = (xff?, username?, password = 'sai-mat-khau') =>
  call('POST', '/login', { username, password }, null, { 'X-Forwarded-For': xff });

before(async () => {
  Date.now = () => clock;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = 'http://127.0.0.1:' + port;
});
beforeEach(async () => {
  delete process.env.TRUST_PROXY;
  clock += 20 * MINUTE;
  for (const table of ['sheet_approvals', 'punches', 'attendance_sessions', 'timesheets', 'staff', 'settings'])
    await store.db.exec('DELETE FROM ' + table);
  await person('admin', { role: 'admin', type: 'tts', level: 0, startDate: null, shiftCode: null });
  await person('worker');
  await person('intern', { type: 'tts', shiftCode: null, startDate: null });
});
after(async () => {
  Date.now = realNow;
  delete process.env.TRUST_PROXY;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

/* ---------- lưu lại ngày làm bù kiểu cũ (thiếu extraKind) không đổi gì thì không bị chặn ---------- */
const OTHER = { '2026-10-08': { kind: 'work', in: '08:00', out: '17:00' } };
test('B2: ngày làm bù kiểu cũ có giờ ra làm thêm rơi vào 22h–6h, lưu lại nguyên vẹn kèm ngày khác: 200, không mất giờ', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', shift: 'normal', in: '08:00', out: '17:00', extraOut: '23:00' }
  });
  const got = await call('GET', '/sheet?month=2026-10', undefined, 'worker');
  const r = await putSheet('worker', { ...got.data.days, ...OTHER });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const day = (await savedDays('worker'))['2026-10-07'];
  assert.equal(day.extraOut, '23:00');
  assert.equal(day.extraKind, 'makeup');
  assert.ok((await savedDays('worker'))['2026-10-08']);
});
test('B2: gửi lại đúng bản ghi cũ (không có extraKind) cũng không bị chặn', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '23:00' }
  });
  const r = await putSheet('worker', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '23:00' },
    ...OTHER
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await savedDays('worker'))['2026-10-07'].extraOut, '23:00');
});
test('B2: ngày kind "makeup" kiểu cũ nằm trong lịch làm việc và có giờ ra làm thêm, lưu lại không đổi: 200', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'makeup', in: '08:00', out: '17:00', extraOut: '18:00' }
  });
  const r = await putSheet('worker', {
    '2026-10-07': { kind: 'makeup', in: '08:00', out: '17:00', extraOut: '18:00' },
    ...OTHER
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await savedDays('worker'))['2026-10-07'].kind, 'makeup');
  assert.equal((await savedDays('worker'))['2026-10-07'].extraOut, '18:00');
});
test('B2: ngày lễ đã có giờ làm bù kiểu cũ, lưu lại không đổi kèm ngày khác: 200', async () => {
  await store.setSetting('holidays', ['2026-10-07']);
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '19:00' }
  });
  const r = await putSheet('worker', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '19:00' },
    ...OTHER
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await savedDays('worker'))['2026-10-07'].extraOut, '19:00');
});
test('B2: ngày lễ đã có làm bù ghi đủ extraKind, lưu lại không đổi kèm ngày khác: 200', async () => {
  await store.setSetting('holidays', ['2026-10-07']);
  const day = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '19:00' };
  await store.setSheet('worker', '2026-10', { '2026-10-07': day });
  const r = await putSheet('worker', { '2026-10-07': day, ...OTHER });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
test('B2: ngày làm bù cả ngày rơi vào ngày lễ đã lưu, lưu lại không đổi: 200 (TTS làm bù Thứ 7)', async () => {
  await store.setSetting('holidays', ['2026-10-10']);
  await store.setSheet('intern', '2026-10', { '2026-10-10': { kind: 'makeup', in: '08:00', out: '17:00' } });
  const r = await putSheet('intern', {
    '2026-10-10': { kind: 'makeup', in: '08:00', out: '17:00' },
    '2026-10-08': { kind: 'work', in: '08:00', out: '17:00' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await savedDays('intern'))['2026-10-10'].kind, 'makeup');
});
test('B2 (giữ nguyên): khai MỚI làm bù / giờ làm thêm vào ngày lễ vẫn bị 400', async () => {
  await store.setSetting('holidays', ['2026-10-07', '2026-10-10']);
  const extra = await putSheet('worker', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '19:00' }
  });
  assert.equal(extra.status, 400, JSON.stringify(extra.data));
  const day = await putSheet('intern', { '2026-10-10': { kind: 'makeup', in: '08:00', out: '17:00' } });
  assert.equal(day.status, 400, JSON.stringify(day.data));
  assert.deepEqual(await savedDays('worker'), {});
});
test('B2: sửa giờ làm thêm của ngày làm bù kiểu cũ sang khung 22h–6h vẫn lưu, kèm cảnh báo SHEET_EXTRA_NIGHT', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '19:00' }
  });
  const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraIn: '05:30' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(
    r.data.warnings.some(w => w.code === 'SHEET_EXTRA_NIGHT'),
    JSON.stringify(r.data.warnings)
  );
  assert.equal((await savedDays('worker'))['2026-10-07'].extraIn, '05:30');
});

/* ---------- GET /sheet trả extraKind hiệu lực của bản ghi cũ ---------- */
test('5: GET /sheet trả extraKind "makeup" cho ngày cũ có giờ ra làm thêm; lưu lại nguyên bản giữ giờ; dấu vân tay không đổi', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '19:00' }
  });
  const got = await call('GET', '/sheet?month=2026-10', undefined, 'worker');
  assert.equal(got.status, 200);
  assert.equal(got.data.days['2026-10-07'].extraKind, 'makeup');
  assert.equal(got.data.approvals['2026-10-07'].fingerprint, 'makeup_hours||17:00-19:00');
  const r = await putSheet('worker', got.data.days);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await savedDays('worker'))['2026-10-07'].extraOut, '19:00');
  assert.equal((await savedDays('worker'))['2026-10-07'].extraKind, 'makeup');
  assert.equal(r.data.approvals['2026-10-07'].fingerprint, 'makeup_hours||17:00-19:00');
});
test('5 (giữ nguyên): ngày cũ chỉ có giờ vào làm thêm vẫn để extraKind rỗng', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraIn: '06:30' }
  });
  const got = await call('GET', '/sheet?month=2026-10', undefined, 'worker');
  assert.ok(!got.data.days['2026-10-07'].extraKind);
  assert.equal(got.data.days['2026-10-07'].extraIn, '06:30');
});

/* ---------- GET /approvals: declared.extraKind giống cleanDays và approval-view ---------- */
test('4: declared.extraKind chỉ suy ra "makeup" từ extraOut, không từ extraIn', async () => {
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraIn: '06:30' }
  });
  await store.db
    .prepare(
      "INSERT INTO sheet_approvals (username, date, item, fingerprint, status, rev, submitted_at) VALUES ('worker', '2026-10-07', 'makeup_hours', 'makeup_hours|06:30-08:00|', 'pending', 1, ?)"
    )
    .run(new Date(clock).toISOString());
  const r = await call('GET', '/approvals');
  assert.equal(r.status, 200);
  const item = r.data.items.find(x => x.date === '2026-10-07');
  assert.equal(item.declared.extraKind, '');
  assert.equal(item.declared.extraIn, '06:30');
});

/* ---------- Thử mật khẩu hàng loạt theo địa chỉ ---------- */
test('1: 29 tên đăng nhập khác nhau sai mật khẩu từ một địa chỉ vẫn 401; tên thứ 30 nhận 429; người ở địa chỉ khác không bị ảnh hưởng', async () => {
  process.env.TRUST_PROXY = '1';
  for (let i = 1; i <= 29; i++) assert.equal((await logOf('9.9.9.9', 'nguoi' + i)).status, 401, 'tên thứ ' + i);
  const thirtieth = await logOf('9.9.9.9', 'nguoi30');
  assert.equal(thirtieth.status, 429, JSON.stringify(thirtieth.data));
  const fromSame = await logOf('9.9.9.9', 'worker', 'test-pass');
  assert.equal(fromSame.status, 429, 'địa chỉ đang bị khoá: kể cả mật khẩu đúng');
  const elsewhere = await logOf('8.8.8.8', 'worker', 'test-pass');
  assert.equal(elsewhere.status, 200, JSON.stringify(elsewhere.data));
});
test('1: một người sai nhiều lần chỉ tính là một tên; khoá địa chỉ hết sau 15 phút', async () => {
  process.env.TRUST_PROXY = '1';
  for (let i = 0; i < 4; i++) assert.equal((await logOf('9.9.9.9', 'worker')).status, 401);
  for (let i = 1; i <= 28; i++) assert.equal((await logOf('9.9.9.9', 'nguoi' + i)).status, 401, 'tên thứ ' + i);
  assert.equal((await logOf('9.9.9.9', 'nguoi29')).status, 429, 'tên khác nhau thứ 30 (worker + 28 + 1)');
  clock += 15 * MINUTE + 1000;
  assert.equal((await logOf('9.9.9.9', 'worker', 'test-pass')).status, 200);
});
test('1: khoá địa chỉ còn hiệu lực không bị đẩy ra bởi 5001 địa chỉ khác', () => {
  const locked = '203.0.113.50';
  let result;
  for (let i = 0; i < 30; i++) result = auth.loginFailed(auth.loginKey(locked, 'u' + i));
  assert.ok(result && result.addressWait > 0, 'lần thứ 30 khoá địa chỉ');
  assert.ok(auth.loginWait(auth.loginKey(locked, 'ai-do-moi')) > 0);
  for (let i = 0; i < 5001; i++) auth.loginFailed(auth.loginKey(`198.51.${Math.floor(i / 250)}.${i % 250}`, 'x'));
  assert.ok(auth.loginWait(auth.loginKey(locked, 'ai-do-moi')) > 0, 'khoá địa chỉ vẫn còn');
});

/* ---------- Cảnh báo TRUST_PROXY ---------- */
test('2: trustProxyWarning cảnh báo khi TRUST_PROXY đặt mà không phải số nguyên 1–10, không in giá trị', () => {
  for (const TRUST_PROXY of ['abc', '0', '11', '1.5', '-1', 'true', ' yes ']) {
    const message = auth.trustProxyWarning({ TRUST_PROXY });
    assert.match(message, /TRUST_PROXY/, TRUST_PROXY);
    assert.ok(!message.includes(TRUST_PROXY.trim()) || /^\d+$/.test(TRUST_PROXY.trim()), 'không in lại giá trị');
  }
  for (const TRUST_PROXY of [undefined, '', '  ', '1', '2', '10'])
    assert.equal(auth.trustProxyWarning({ TRUST_PROXY }), null);
});

/* ---------- File tĩnh: khách ngắt kết nối giữa chừng thì đóng luồng đọc ---------- */
// File chữ nhỏ (html, js, css...) được nạp một lần vào bộ nhớ nên không có luồng đọc; file ảnh đi qua createReadStream, nên thử bằng ảnh
test('3: khách ngắt kết nối giữa chừng khi tải file tĩnh thì luồng đọc file bị huỷ (không giữ file mở)', async () => {
  const original = fs.createReadStream;
  let destroyed = false;
  fs.createReadStream = () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.alloc(64 * 1024, 97));
      }
    });
    stream.on('close', () => (destroyed = true));
    return stream;
  };
  try {
    await new Promise<any>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () =>
        socket.write('GET /assets/logo.png HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
      );
      socket.once('data', () => socket.destroy());
      socket.on('close', resolve);
      socket.on('error', () => {});
      setTimeout(reject, 3000, new Error('không nhận được dữ liệu'));
    });
    for (let i = 0; i < 40 && !destroyed; i++) await new Promise<any>(resolve => setTimeout(resolve, 25));
  } finally {
    fs.createReadStream = original;
  }
  assert.equal(destroyed, true);
  assert.equal((await call('GET', '/me', undefined, 'worker')).status, 200);
});

/* ---------- Mật khẩu Admin production ---------- */
test('6: production từ chối ADMIN_PASSWORD ngắn hơn 12 ký tự, thông báo không chứa mật khẩu', () => {
  const short = 'ngan-11-kt';
  assert.equal(short.length < 12, true);
  assert.throws(
    () => auth.bootstrapAdminPassword({ NODE_ENV: 'production', ADMIN_PASSWORD: short }),
    error => /ADMIN_PASSWORD/.test(error.message) && /12/.test(error.message) && !error.message.includes(short)
  );
  assert.throws(() => auth.bootstrapAdminPassword({ NODE_ENV: 'production', ADMIN_PASSWORD: 'admin123' }), /12/);
});
test('6: production nhận ADMIN_PASSWORD đủ 12 ký tự; ngoài production mật khẩu ngắn vẫn được (giữ nguyên)', () => {
  assert.equal(
    auth.bootstrapAdminPassword({ NODE_ENV: 'production', ADMIN_PASSWORD: '123456789012' }).password,
    '123456789012'
  );
  assert.equal(auth.bootstrapAdminPassword({ ADMIN_PASSWORD: 'ngan' }).password, 'ngan');
  assert.equal(auth.bootstrapAdminPassword({ NODE_ENV: 'development', ADMIN_PASSWORD: 'ngan' }).password, 'ngan');
});
