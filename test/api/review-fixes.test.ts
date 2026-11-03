// Máy chủ: khoản bị xoá rồi khai lại, địa chỉ sau proxy, request hỏng, giới hạn đăng nhập, khoá tài khoản, mật khẩu Admin.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'review-fixes-tests';
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
// who = null: không đăng nhập; headers: thêm header (ví dụ X-Forwarded-For)
async function call(method?, route?, body?, who = 'admin', headers: any = {}) {
  const h: Record<string, any> = { 'Content-Type': 'application/json', ...headers };
  if (who) h.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers: h,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    data: (await response.json().catch(() => ({}))) as any,
    cookie: (response.headers.get('set-cookie') || '').split(';')[0]
  };
}
const saveSheet = async (who?, days?, month = '2026-10') => await call('PUT', '/sheet', { month, days }, who);
const rowsOf = async (username?) =>
  await store.db.prepare('SELECT * FROM sheet_approvals WHERE username = ? ORDER BY date').all(username);
const queue = async (params = '') => {
  const r = await call('GET', '/approvals' + params);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const OT = '2026-10-07';
const otDay = (extraOut?) => ({ kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut });
const refOf = (item?) => ({ username: item.username, date: item.date, rev: item.rev, fingerprint: item.fingerprint });

before(async () => {
  Date.now = () => clock;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = 'http://127.0.0.1:' + port;
});
beforeEach(async () => {
  delete process.env.TRUST_PROXY;
  clock += 20 * MINUTE; // cửa sổ giới hạn đăng nhập của test trước đã hết hạn
  for (const table of [
    'sheet_approvals',
    'punch_requests',
    'punches',
    'attendance_sessions',
    'timesheets',
    'staff',
    'settings'
  ])
    await store.db.exec('DELETE FROM ' + table);
  await person('admin', { role: 'admin', type: 'tts', level: 0, startDate: null, shiftCode: null });
  await person('worker');
  await person('other');
});
after(async () => {
  Date.now = realNow;
  delete process.env.TRUST_PROXY;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

/* ---------- 1. Khoản bị xoá rồi khai lại không được nhận quyết định cũ ---------- */
test('1: xoá khoản rồi khai lại khoản khác (rev lại là 1): quyết định mang rev + dấu vân tay cũ nhận 409 và không lưu gì', async () => {
  assert.equal((await saveSheet('worker', { [OT]: otDay('18:00') })).status, 200);
  const seen = (await queue()).items.find(x => x.date === OT);
  assert.equal(seen.rev, 1);
  assert.equal((await saveSheet('worker', {})).status, 200, 'nhân sự xoá khoản');
  assert.equal((await rowsOf('worker')).length, 0);
  assert.equal((await saveSheet('worker', { [OT]: otDay('21:00') })).status, 200, 'khai lại OT 4 giờ');
  const fresh = (await rowsOf('worker'))[0];
  assert.equal(fresh.rev, 1, 'dòng mới: rev bắt đầu lại, nên chỉ có dấu vân tay phân biệt được');
  assert.notEqual(fresh.fingerprint, seen.fingerprint);
  const before = await rowsOf('worker');
  const r = await call('PUT', '/approvals/decide', { action: 'approve', items: [refOf(seen)] });
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.code, 'APPROVAL_STALE');
  assert.deepEqual(await rowsOf('worker'), before, 'không lưu gì');
  assert.equal((await rowsOf('worker'))[0].status, 'pending');
});
test('1: duyệt đúng rev và dấu vân tay Admin đã thấy vẫn được (200)', async () => {
  await saveSheet('worker', { [OT]: otDay('18:00') });
  const seen = (await queue()).items.find(x => x.date === OT);
  const r = await call('PUT', '/approvals/decide', { action: 'approve', items: [refOf(seen)] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await rowsOf('worker'))[0].status, 'approved');
});
test('1: thiếu fingerprint hoặc fingerprint không phải chữ thì 400, không lưu gì', async () => {
  await saveSheet('worker', { [OT]: otDay('18:00') });
  const seen = (await queue()).items.find(x => x.date === OT);
  const before = await rowsOf('worker');
  for (const fingerprint of [undefined, '', 5, null, {}]) {
    const item: Record<string, any> = { username: seen.username, date: seen.date, rev: seen.rev };
    if (fingerprint !== undefined) item.fingerprint = fingerprint;
    const r = await call('PUT', '/approvals/decide', { action: 'approve', items: [item] });
    assert.equal(r.status, 400, `fingerprint=${JSON.stringify(fingerprint)}: ${JSON.stringify(r.data)}`);
  }
  assert.deepEqual(await rowsOf('worker'), before);
});
test('1: lô có một khoản cũ thì cả lô bị từ chối (tất cả hoặc không gì cả)', async () => {
  await saveSheet('worker', { [OT]: otDay('18:00'), '2026-10-08': otDay('18:00') });
  const [a, b] = (await queue()).items;
  await saveSheet('worker', { [OT]: otDay('18:00'), '2026-10-08': otDay('21:00') });
  const r = await call('PUT', '/approvals/decide', { action: 'approve', items: [refOf(a), refOf(b)] });
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.ok((await rowsOf('worker')).every(row => row.status === 'pending'));
});

/* ---------- 2. Địa chỉ máy khách sau proxy ---------- */
test('2: TRUST_PROXY=1, X-Forwarded-For giả ở đầu chuỗi không lách được giới hạn đăng nhập (lấy mục bên phải nhất)', async () => {
  process.env.TRUST_PROXY = '1';
  for (let i = 1; i <= 5; i++) {
    const r = await call('POST', '/login', { username: 'worker', password: 'sai-mat-khau' }, null, {
      'X-Forwarded-For': `10.0.0.${i}, 9.9.9.9`
    });
    assert.equal(r.status, 401, `lần sai thứ ${i}`);
  }
  const blocked = await call('POST', '/login', { username: 'worker', password: 'test-pass' }, null, {
    'X-Forwarded-For': '10.0.0.200, 9.9.9.9'
  });
  assert.equal(blocked.status, 429, JSON.stringify(blocked.data));
});
test('2: TRUST_PROXY=1, địa chỉ khác sau proxy là khoá khác (người khác không bị liên đới)', async () => {
  process.env.TRUST_PROXY = '1';
  for (let i = 0; i < 5; i++)
    await call('POST', '/login', { username: 'worker', password: 'sai' }, null, { 'X-Forwarded-For': '9.9.9.9' });
  const other = await call('POST', '/login', { username: 'worker', password: 'test-pass' }, null, {
    'X-Forwarded-For': '8.8.8.8'
  });
  assert.equal(other.status, 200, JSON.stringify(other.data));
});
test('2: không bật TRUST_PROXY thì X-Forwarded-For bị bỏ qua (giữ nguyên)', async () => {
  for (let i = 1; i <= 5; i++) {
    const r = await call('POST', '/login', { username: 'worker', password: 'sai-mat-khau' }, null, {
      'X-Forwarded-For': `10.0.0.${i}`
    });
    assert.equal(r.status, 401);
  }
  const blocked = await call('POST', '/login', { username: 'worker', password: 'test-pass' }, null, {
    'X-Forwarded-For': '10.0.0.99'
  });
  assert.equal(blocked.status, 429);
});
test('2: TRUST_PROXY=1 mà chuỗi cuối không phải địa chỉ IP thì dùng địa chỉ kết nối, không dùng chuỗi tuỳ ý', async () => {
  process.env.TRUST_PROXY = '1';
  for (let i = 1; i <= 5; i++)
    await call('POST', '/login', { username: 'worker', password: 'sai' }, null, { 'X-Forwarded-For': `rac-${i}` });
  const blocked = await call('POST', '/login', { username: 'worker', password: 'test-pass' }, null, {
    'X-Forwarded-For': 'rac-khac'
  });
  assert.equal(blocked.status, 429, 'cùng quy về địa chỉ kết nối');
});
async function punchIp(forwarded?) {
  const r = await call(
    'POST',
    '/punch',
    { type: 'in', requestId: 'req-ip-' + forwarded.length + '-' + clock, explanation: 'Giải trình lúc bấm' },
    'worker',
    {
      'X-Forwarded-For': forwarded
    }
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return (await store.db.prepare('SELECT ip FROM punches WHERE username = ? ORDER BY id DESC').get('worker')).ip;
}
test('2: punches.ip dùng cùng hàm địa chỉ: không tin X-Forwarded-For khi chưa bật TRUST_PROXY', async () => {
  const ip = await punchIp('6.6.6.6, 9.9.9.9');
  assert.match(ip, /127\.0\.0\.1$/);
});
test('2: punches.ip với TRUST_PROXY=1 là mục bên phải nhất, không phải mục đầu do máy khách gửi', async () => {
  process.env.TRUST_PROXY = '1';
  assert.equal(await punchIp('6.6.6.6, 9.9.9.9'), '9.9.9.9');
});

/* ---------- 3. Request hỏng không làm sập máy chủ ---------- */
const rawRequest = (text?) =>
  new Promise<any>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(text));
    let data = '';
    socket.on('data', chunk => (data += chunk));
    socket.on('end', () => resolve(data));
    socket.on('close', () => resolve(data));
    socket.on('error', reject);
    setTimeout(() => {
      socket.destroy();
      resolve(data);
    }, 3000);
  });
test('3: dòng yêu cầu "GET // HTTP/1.1" nhận 400 và máy chủ vẫn phục vụ tiếp', async () => {
  const text = await rawRequest('GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
  assert.match(text, /^HTTP\/1\.1 400/);
  const alive = await call('GET', '/me', undefined, 'worker');
  assert.equal(alive.status, 200);
  assert.equal(alive.data.user.username, 'worker');
});
test('3: lỗi đọc file tĩnh không làm sập máy chủ', async () => {
  const original = fs.createReadStream;
  fs.createReadStream = () =>
    new Readable({
      read() {
        this.destroy(new Error('loi doc file gia'));
      }
    });
  try {
    await fetch(base + '/admin.html').catch(() => {});
  } finally {
    fs.createReadStream = original;
  }
  const alive = await call('GET', '/me', undefined, 'worker');
  assert.equal(alive.status, 200);
});

/* ---------- 4. Khoá đăng nhập không bị đẩy ra bởi tên giả ---------- */
test('4: 5001 tên đăng nhập giả không đẩy khoá còn hiệu lực ra khỏi bộ nhớ', () => {
  const lockedKey = auth.loginKey('203.0.113.7', 'victim');
  for (let i = 0; i < 5; i++) auth.loginFailed(lockedKey);
  assert.ok(auth.loginWait(lockedKey) > 0, 'đang bị khoá');
  for (let i = 0; i < 5001; i++) auth.loginFailed(auth.loginKey('198.51.100.1', 'fake' + i));
  assert.ok(auth.loginWait(lockedKey) > 0, 'khoá vẫn còn sau khi tràn bộ nhớ');
});

/* ---------- 5. Nhân sự bị khoá vẫn có khoản trong hàng chờ, có đánh dấu ---------- */
test('5: khoản của nhân sự bị khoá vẫn hiện trong hàng chờ kèm locked: true; người khác không có cờ này', async () => {
  await saveSheet('worker', { [OT]: otDay('18:00') });
  await saveSheet('other', { [OT]: otDay('18:00') });
  await store.lockStaff('worker', 'admin');
  const items = (await queue()).items;
  assert.equal(items.length, 2);
  assert.equal(items.find(x => x.username === 'worker').locked, true);
  assert.notEqual(items.find(x => x.username === 'other').locked, true);
});

/* ---------- 6. sessionVersion không rời máy chủ ---------- */
test('6: login, /me, /staff, /team và PUT /staff không trả sessionVersion của tài khoản', async () => {
  const leaks = (label?, value?) => {
    const text = JSON.stringify(value);
    assert.ok(!/sessionVersion|session_version/i.test(text), `${label} lộ số phiên bản phiên`);
  };
  await store.bumpSessionVersion('worker');
  const login = await call('POST', '/login', { username: 'worker', password: 'test-pass' }, null);
  assert.equal(login.status, 200);
  leaks('login', login.data);
  const me = await call('GET', '/me', undefined, 'worker');
  assert.equal(me.status, 200);
  leaks('/me', me.data);
  const staff = await call('GET', '/staff');
  assert.equal(staff.status, 200);
  leaks('/staff', staff.data);
  const team = await call('GET', '/team?month=2026-10');
  assert.equal(team.status, 200);
  leaks(
    '/team',
    team.data.rows.map(r => r.staff)
  );
  const put = await call('PUT', '/staff/worker', { locked: true });
  assert.equal(put.status, 200);
  leaks('PUT /staff (khoá)', put.data);
  const putFull = await call('PUT', '/staff/worker', {
    name: 'worker',
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01'
  });
  assert.equal(putFull.status, 200, JSON.stringify(putFull.data));
  leaks('PUT /staff (đủ hồ sơ)', putFull.data);
});

/* ---------- 7. giờ vào làm thêm kiểu cũ giữ nguyên, không đoán loại ---------- */
test('7: ngày chỉ có extraIn mà thiếu extraKind giữ nguyên giờ và để extraKind rỗng như calcDay đọc', async () => {
  const r = await saveSheet('worker', { [OT]: { kind: 'work', in: '08:00', out: '17:00', extraIn: '06:30' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const saved = (await store.getSheet('worker', '2026-10')).days[OT];
  assert.equal(saved.extraKind, '', 'không đoán thành làm bù: calcDay chỉ hiểu extraOut');
  assert.equal(saved.extraIn, '06:30', 'không mất dữ liệu');
  assert.equal((await rowsOf('worker')).length, 0, 'không có khoản cần duyệt');
});
test('7: ngày có extraOut mà thiếu extraKind vẫn là làm bù (giữ nguyên)', async () => {
  const r = await saveSheet('worker', { [OT]: { kind: 'work', in: '08:00', out: '17:00', extraOut: '19:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const saved = (await store.getSheet('worker', '2026-10')).days[OT];
  assert.equal(saved.extraKind, 'makeup');
  assert.equal(saved.extraOut, '19:00');
});

/* ---------- 8. Admin tự đặt lại mật khẩu qua PUT /staff vẫn đăng nhập ---------- */
test('8: Admin gửi mật khẩu cho tài khoản đã có qua PUT /staff bị 400 USE_PASSWORD_RESET, phiên và cookie giữ nguyên (đặt lại dùng POST /staff/:u/password)', async () => {
  const oldCookie = auth.cookieHeader(await auth.createSession('admin'), 86400);
  const r = await fetch(base + '/api/staff/admin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: oldCookie },
    body: JSON.stringify({ name: 'Admin', role: 'admin', type: 'tts', password: 'mat-khau-moi-1' })
  });
  assert.equal(r.status, 400);
  assert.equal(((await r.json()) as any).code, 'USE_PASSWORD_RESET');
  assert.equal(r.headers.get('set-cookie'), null);
  const still = await fetch(base + '/api/me', { headers: { Cookie: oldCookie.split(';')[0] } });
  assert.equal(((await still.json()) as any).user.username, 'admin', 'phiên cũ còn hiệu lực');
});
test('8: Admin đặt lại mật khẩu của người khác (POST /staff/:u/password) thì không đổi cookie của Admin (giữ nguyên)', async () => {
  const r = await fetch(base + '/api/staff/worker/password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: auth.cookieHeader(await auth.createSession('admin'), 86400)
    },
    body: JSON.stringify({ password: 'mat-khau-moi-2', reason: 'Đặt lại mật khẩu theo yêu cầu của người dùng' })
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('set-cookie'), null);
});

/* ---------- 9. Admin đầu tiên: không bao giờ có mật khẩu mặc định đoán được, không in mật khẩu ---------- */
test('9: ADMIN_PASSWORD có giá trị thì dùng đúng giá trị đó', () => {
  assert.deepEqual(auth.bootstrapAdminPassword({ ADMIN_PASSWORD: 'mat-khau-manh-1' }), {
    password: 'mat-khau-manh-1',
    generated: false
  });
  assert.deepEqual(auth.bootstrapAdminPassword({ ADMIN_PASSWORD: 'mat-khau-manh-1', NODE_ENV: 'production' }), {
    password: 'mat-khau-manh-1',
    generated: false
  });
});
test('9: ADMIN_PASSWORD trống ngoài production sinh mật khẩu ngẫu nhiên, khác nhau mỗi lần, không phải admin123', () => {
  for (const env of [{}, { ADMIN_PASSWORD: '' }, { ADMIN_PASSWORD: '   ' }, { NODE_ENV: 'development' }]) {
    const a = auth.bootstrapAdminPassword(env),
      b = auth.bootstrapAdminPassword(env);
    assert.equal(a.generated, true);
    assert.ok(a.password.length >= 12 && a.password !== 'admin123');
    assert.notEqual(a.password, b.password);
  }
});
test('9: ADMIN_PASSWORD trống trong production thì từ chối, thông báo tiếng Việt nêu rõ biến cần đặt', () => {
  for (const ADMIN_PASSWORD of [undefined, '', '  '])
    assert.throws(() => auth.bootstrapAdminPassword({ NODE_ENV: 'production', ADMIN_PASSWORD }), /ADMIN_PASSWORD/);
});
