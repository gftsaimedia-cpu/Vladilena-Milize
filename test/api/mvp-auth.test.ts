// Kiểm tra đăng nhập và tài khoản: giới hạn đoán mật khẩu, đăng xuất thu hồi phiên, khoá thay vì xoá tài khoản,
// bắt buộc ngày vào làm cho CTV và NV.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'mvp-auth-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');
const { insertLegacyAttendanceDay } = require('../helpers/legacy-attendance');
let base;
// đồng hồ giả: không phụ thuộc ngày thật; mỗi test nhảy 20 phút để cửa sổ giới hạn của test trước đã hết hạn
const realNow = Date.now;
let clock = Date.parse('2026-10-14T09:00:00+07:00');
const MINUTE = 60 * 1000;
const freshWindow = () => {
  clock += 20 * MINUTE;
};

async function person(username?, { role = 'staff', type = 'nv', startDate = '2026-01-01' }: any = {}) {
  await store.upsertStaff({
    username,
    name: username,
    role,
    type,
    level: 1,
    shiftCode: 'n1',
    startDate,
    passHash: auth.hashPassword('test-pass')
  });
}
const HISTORY_TABLES = [
  'timesheets',
  'slip_overrides',
  'attendance_days',
  'attendance_sessions',
  'punches',
  'corrections',
  'punch_requests'
];
async function history(username?) {
  return Object.fromEntries(
    await Promise.all(
      HISTORY_TABLES.map(async table => [
        table,
        await store.db.prepare('SELECT * FROM ' + table + ' WHERE username = ? ORDER BY ctid').all(username)
      ])
    )
  );
}
async function seedHistory(username?) {
  await store.setSheet(username, '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } }, 80, 1000000);
  await store.setSlipOverride(username, '2026-10', { tax: 12345 }, 'admin');
  await insertLegacyAttendanceDay(store, username, '2026-10-07', { kind: 'work', in: '08:00', out: '17:00' });
  await store.createSession(username, '2026-10-06', 'closed', { kind: 'work', in: '08:00', out: '17:00' });
  await store.addPunch(username, '2026-10-07T01:00:00.000Z', 'in', null, false, null);
  await store.addCorrection({
    username,
    date: '2026-10-07',
    reqIn: '2026-10-07T01:00:00.000Z',
    reqOut: '2026-10-07T10:00:00.000Z',
    reason: 'Quên bấm'
  });
  await store.savePunchRequest(username, 'req-1', 'in', null, { ok: true });
}
async function call(method?, route?, { who = 'admin', cookie, body }: any = {}) {
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (cookie !== undefined) headers.Cookie = cookie;
  else if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    data: (await response.json()) as any,
    cookie: (response.headers.get('set-cookie') || '').split(';')[0]
  };
}
const login = (username?, password?) => call('POST', '/login', { who: null, body: { username, password } });
const wrong = (username?) => login(username, 'sai-mat-khau');
const right = (username?) => login(username, 'test-pass');
const staffEntry = async (username?) => (await call('GET', '/staff')).data.staff.find(s => s.username === username);
const profile = {
  name: 'Updated worker',
  role: 'staff',
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  startDate: '2026-01-01'
};

before(async () => {
  Date.now = () => clock;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of [...HISTORY_TABLES, 'staff', 'settings']) await store.db.exec('DELETE FROM ' + table);
  await person('admin', { role: 'admin', type: 'tts', startDate: null });
  await person('worker');
  freshWindow();
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

/* ---------- giới hạn đoán mật khẩu ---------- */
test('N6: sau 5 lần sai mật khẩu cùng tên đăng nhập, cùng địa chỉ, lần thứ 6 nhận 429 kể cả khi nhập đúng', async () => {
  for (let i = 1; i <= 5; i++) {
    const r = await wrong('worker');
    assert.equal(r.status, 401, `lần sai thứ ${i}: ${JSON.stringify(r.data)}`);
  }
  const blocked = await wrong('worker');
  assert.equal(blocked.status, 429, JSON.stringify(blocked.data));
  assert.equal(typeof blocked.data.error, 'string');
  assert.ok(blocked.data.error.length > 0);
  const correct = await right('worker');
  assert.equal(correct.status, 429, 'đang bị khoá thì mật khẩu đúng cũng không vào được');
  assert.equal(correct.cookie, '', 'không cấp cookie khi bị chặn');
});
test('N6: khoá 15 phút — còn bị chặn sau 10 phút, đăng nhập lại được sau 15 phút', async () => {
  for (let i = 0; i < 5; i++) await wrong('worker');
  assert.equal((await right('worker')).status, 429);
  clock += 10 * MINUTE;
  assert.equal((await right('worker')).status, 429, 'sau 10 phút vẫn trong thời gian khoá');
  clock += 5 * MINUTE + 1000;
  const r = await right('worker');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.cookie.startsWith('luong_sid='));
});
test('N6 (giữ nguyên): lần sai cũ hơn 15 phút không cộng dồn (4 lần sai, chờ 16 phút, 4 lần sai nữa vẫn là 401)', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await wrong('worker')).status, 401);
  clock += 16 * MINUTE;
  for (let i = 0; i < 4; i++) assert.equal((await wrong('worker')).status, 401, `lần sai mới thứ ${i + 1}`);
  assert.equal((await right('worker')).status, 200);
});
test('N6: tên đăng nhập không tồn tại cũng bị chặn sau 5 lần (không lộ tên nào có thật qua mã 429)', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await wrong('khong-co-nguoi-nay')).status, 401);
  assert.equal((await wrong('khong-co-nguoi-nay')).status, 429);
});
test('N6: đổi chữ hoa / thêm khoảng trắng vào tên đăng nhập không lách được giới hạn', async () => {
  for (const name of ['worker', 'WORKER', ' worker', 'Worker ', 'worker'])
    assert.equal((await wrong(name)).status, 401);
  assert.equal((await wrong('wOrKeR')).status, 429);
  assert.equal((await right(' WORKER ')).status, 429);
});
test('N6: khoá một tên đăng nhập không chặn tên đăng nhập khác từ cùng địa chỉ', async () => {
  await person('other');
  for (let i = 0; i < 5; i++) await wrong('worker');
  assert.equal((await wrong('worker')).status, 429);
  const r = await right('other');
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
test('N6: tên đăng nhập không tồn tại vẫn chạy băm mật khẩu (không đoán được tên có thật qua thời gian phản hồi)', async () => {
  // đếm số lần gọi hàm băm scrypt trong lúc xử lý đăng nhập; không đo thời gian nên không chập chờn
  let calls = 0;
  const original = { scryptSync: crypto.scryptSync, scrypt: crypto.scrypt };
  crypto.scryptSync = (...args) => {
    calls++;
    return original.scryptSync(...args);
  };
  crypto.scrypt = (...args) => {
    calls++;
    return original.scrypt(...args);
  };
  let known, unknown;
  try {
    calls = 0;
    known = await wrong('worker');
    const knownCalls = calls;
    calls = 0;
    unknown = await wrong('khong-co-nguoi-nay');
    const unknownCalls = calls;
    assert.ok(knownCalls >= 1, 'tên có thật phải chạy băm');
    assert.ok(unknownCalls >= 1, 'tên không có thật cũng phải chạy băm, hiện tại bỏ qua nên trả lời nhanh hơn rõ rệt');
  } finally {
    crypto.scryptSync = original.scryptSync;
    crypto.scrypt = original.scrypt;
  }
  assert.equal(known.status, 401);
  assert.equal(unknown.status, 401);
});
test('N6 (giữ nguyên): tên không có thật và mật khẩu sai cho cùng một thông báo 401', async () => {
  const known = await wrong('worker');
  const unknown = await wrong('khong-co-nguoi-nay');
  assert.equal(known.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.data, known.data);
});
test('N6 (giữ nguyên): đăng nhập đúng mật khẩu vẫn cấp cookie phiên dùng được', async () => {
  const r = await right('worker');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.username, 'worker');
  assert.equal((await call('GET', '/sheet?month=2026-10', { cookie: r.cookie })).status, 200);
});

/* ---------- đăng xuất thu hồi phiên ---------- */
test('N6: sau POST /api/logout cookie cũ không dùng được nữa (401)', async () => {
  const session = (await right('worker')).cookie;
  assert.equal((await call('GET', '/sheet?month=2026-10', { cookie: session })).status, 200);
  const out = await call('POST', '/logout', { cookie: session, body: {} });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  const replay = await call('GET', '/sheet?month=2026-10', { cookie: session });
  assert.equal(replay.status, 401, 'cookie bị đánh cắp / giữ lại vẫn dùng được sau khi đăng xuất');
});
test('N6 (giữ nguyên): đăng xuất một trình duyệt không làm hỏng cookie của người khác', async () => {
  const mine = (await right('worker')).cookie;
  const adminSession = (await right('admin')).cookie;
  await call('POST', '/logout', { cookie: mine, body: {} });
  assert.equal((await call('GET', '/sheet?month=2026-10', { cookie: adminSession })).status, 200);
});
test('N6 (giữ nguyên): POST /api/logout không có cookie vẫn trả 200', async () => {
  const r = await call('POST', '/logout', { who: null, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

/* ---------- khoá tài khoản thay cho xoá ---------- */
test('Q5: PUT /staff/:username với locked:true khoá tài khoản và giữ nguyên toàn bộ lịch sử lương', async () => {
  await seedHistory('worker');
  const before = await history('worker');
  for (const table of HISTORY_TABLES) assert.ok(before[table].length > 0, 'dữ liệu mẫu thiếu bảng ' + table);
  const r = await call('PUT', '/staff/worker', { body: { locked: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(await store.getStaff('worker'), 'tài khoản vẫn còn trong DB');
  assert.deepEqual(await history('worker'), before);
});
test('Q5: GET /api/staff cho thấy tài khoản đã khoá (locked: true), tài khoản khác thì không', async () => {
  await call('PUT', '/staff/worker', { body: { locked: true } });
  const worker = await staffEntry('worker');
  assert.ok(worker, 'tài khoản bị khoá vẫn có trong danh sách');
  assert.equal(worker.locked, true);
  assert.ok(!(await staffEntry('admin')).locked);
});
test('Q5: Admin vẫn đọc được bảng chấm công của tài khoản đã khoá', async () => {
  await seedHistory('worker');
  await call('PUT', '/staff/worker', { body: { locked: true } });
  const r = await call('GET', '/sheet?month=2026-10&user=worker');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.days['2026-10-07'], 'lịch sử chấm công phải còn');
  assert.equal(r.data.days['2026-10-07'].in, '08:00');
  assert.equal(r.data.kpiPct, 80);
});
test('Q5: tài khoản bị khoá đăng nhập đúng mật khẩu nhận 403 kèm thông báo tiếng Việt và không có cookie', async () => {
  await call('PUT', '/staff/worker', { body: { locked: true } });
  const r = await right('worker');
  assert.equal(r.status, 403, JSON.stringify(r.data));
  assert.match(String(r.data.error).normalize('NFC'), /kh[oó][aá]/i);
  assert.equal(r.cookie, '');
});
// tài khoản bị khoá vẫn còn trong DB nên phiên phải tự từ chối cookie cấp trước đó
test('Q5 (giữ nguyên): cookie cấp trước khi khoá bị từ chối (401) sau khi khoá', async () => {
  const session = (await right('worker')).cookie;
  assert.equal((await call('GET', '/sheet?month=2026-10', { cookie: session })).status, 200);
  await call('PUT', '/staff/worker', { body: { locked: true } });
  const r = await call('GET', '/sheet?month=2026-10', { cookie: session });
  assert.equal(r.status, 401, JSON.stringify(r.data));
});
test('Q5: PUT /staff/:username với locked:false mở khoá, giữ lịch sử, và đăng nhập lại được', async () => {
  await seedHistory('worker');
  const before = await history('worker');
  await call('PUT', '/staff/worker', { body: { locked: true } });
  const r = await call('PUT', '/staff/worker', { body: { ...profile, locked: false } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(!(await staffEntry('worker')).locked);
  assert.deepEqual(await history('worker'), before);
  const again = await right('worker');
  assert.equal(again.status, 200, JSON.stringify(again.data));
});
test('Q5: PUT chỉ có {locked:false} mở khoá được kể cả khi tài khoản chưa có ngày vào làm', async () => {
  await person('no.start', { startDate: null });
  await call('PUT', '/staff/no.start', { body: { locked: true } });
  const r = await call('PUT', '/staff/no.start', { body: { locked: false } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(!(await staffEntry('no.start')).locked);
  assert.equal((await store.getStaff('no.start')).startDate, null, 'không đổi gì khác trong hồ sơ');
  assert.equal((await store.getStaff('no.start')).name, 'no.start');
  assert.equal((await right('no.start')).status, 200);
});
test('Q5: PUT chỉ có {locked:true} khoá được tài khoản, không đổi gì khác và không cần ngày vào làm', async () => {
  await person('no.start2', { startDate: null });
  const r = await call('PUT', '/staff/no.start2', { body: { locked: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await staffEntry('no.start2')).locked, true);
  assert.equal((await store.getStaff('no.start2')).name, 'no.start2');
  assert.equal((await right('no.start2')).status, 403);
});
test('Q5: Admin gửi chỉ {locked:true} cho chính mình cũng bị từ chối (400)', async () => {
  const r = await call('PUT', '/staff/admin', { body: { locked: true } });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.ok(!(await staffEntry('admin')).locked);
});
test('Q5: sửa hồ sơ bình thường (không gửi locked) không mở khoá tài khoản đang khoá', async () => {
  await call('PUT', '/staff/worker', { body: { locked: true } });
  const r = await call('PUT', '/staff/worker', { body: { ...profile, name: 'Đổi tên' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await staffEntry('worker')).locked, true);
  assert.equal((await right('worker')).status, 403);
});
test('Q5 (giữ nguyên): Admin không tự khoá được tài khoản của mình (400) và vẫn dùng được hệ thống', async () => {
  const r = await call('PUT', '/staff/admin', { body: { locked: true } });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.ok(!(await staffEntry('admin')).locked);
  assert.equal((await call('GET', '/staff')).status, 200);
  assert.equal((await right('admin')).status, 200);
});
test('Q5: Admin gửi locked:true cho chính mình qua PUT cũng bị từ chối (400)', async () => {
  const r = await call('PUT', '/staff/admin', {
    body: { name: 'admin', role: 'admin', type: 'tts', level: 0, locked: true }
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.ok(!(await staffEntry('admin')).locked);
});
test('Q5 (giữ nguyên): nhân sự thường không khoá được ai (403)', async () => {
  await person('peer');
  const lock = await call('PUT', '/staff/peer', { who: 'worker', body: { locked: true } });
  assert.equal(lock.status, 403, JSON.stringify(lock.data));
  assert.ok(!(await staffEntry('peer')).locked);
});
test('Q5: nhân sự thường không tự mở khoá được tài khoản đã khoá (403, vẫn khoá)', async () => {
  await person('peer');
  await call('PUT', '/staff/peer', { body: { locked: true } });
  const unlock = await call('PUT', '/staff/peer', { who: 'worker', body: { ...profile, locked: false } });
  assert.equal(unlock.status, 403, JSON.stringify(unlock.data));
  assert.equal((await staffEntry('peer'))?.locked, true);
});
test('Q5 (giữ nguyên): khoá tài khoản không tồn tại trả 404', async () => {
  const r = await call('PUT', '/staff/khong-co', { body: { locked: true } });
  assert.equal(r.status, 404, JSON.stringify(r.data));
});
test('Q5 (giữ nguyên): khoá một tài khoản không ảnh hưởng lịch sử và đăng nhập của người khác', async () => {
  await person('peer');
  await seedHistory('peer');
  const peerBefore = await history('peer');
  await call('PUT', '/staff/worker', { body: { locked: true } });
  assert.deepEqual(await history('peer'), peerBefore);
  assert.equal((await right('peer')).status, 200);
});

/* ---------- bắt buộc ngày vào làm cho CTV và NV ---------- */
const newcomer = (type?, extra: any = {}) => ({
  name: 'Người mới',
  role: 'staff',
  type,
  level: 1,
  shiftCode: 'n1',
  password: 'secret1',
  ...extra
});
const startDateWarned = (r?) => (r.data.warnings || []).some(w => w.code === 'START_DATE_REQUIRED');
for (const type of ['ctv', 'nv']) {
  for (const [label, extra] of [
    ['bỏ trống trường startDate', {}],
    ['startDate là chuỗi rỗng', { startDate: '' }],
    ['startDate là null', { startDate: null }]
  ]) {
    test(`Q6: tạo tài khoản ${type.toUpperCase()} mà ${label} vẫn tạo được, kèm cảnh báo START_DATE_REQUIRED`, async () => {
      const r = await call('PUT', '/staff/new.' + type, { body: newcomer(type, extra) });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.ok(startDateWarned(r), JSON.stringify(r.data.warnings));
      assert.equal((await store.getStaff('new.' + type)).startDate, null);
    });
  }
  test(`Q6 (giữ nguyên): tạo tài khoản ${type.toUpperCase()} có startDate không hợp lệ bị từ chối 400`, async () => {
    const r = await call('PUT', '/staff/new.' + type, { body: newcomer(type, { startDate: '2026-13-45' }) });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.equal(await store.getStaff('new.' + type), undefined);
  });
  test(`Q6: tạo tài khoản ${type.toUpperCase()} có startDate hợp lệ thành công, không cảnh báo`, async () => {
    const r = await call('PUT', '/staff/new.' + type, { body: newcomer(type, { startDate: '2026-10-01' }) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(startDateWarned(r), false);
    assert.equal((await store.getStaff('new.' + type)).startDate, '2026-10-01');
  });
}
for (const type of ['ctv', 'nv']) {
  for (const [label, extra] of [
    ['bỏ trống trường startDate', 'omit'],
    ['startDate là chuỗi rỗng', ''],
    ['startDate là null', null]
  ]) {
    test(`Q6: sửa tài khoản ${type.toUpperCase()} hiện có mà ${label} vẫn lưu, kèm cảnh báo START_DATE_REQUIRED`, async () => {
      await person('veteran', { type, startDate: '2026-02-02' });
      const body = { ...profile, type, ...(extra === 'omit' ? {} : { startDate: extra }) };
      if (extra === 'omit') delete body.startDate;
      const r = await call('PUT', '/staff/veteran', { body });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.ok(startDateWarned(r), JSON.stringify(r.data.warnings));
      assert.equal((await store.getStaff('veteran')).startDate, null);
    });
  }
}
test('Q6 (giữ nguyên): sửa tài khoản NV với startDate mới hợp lệ vẫn thành công', async () => {
  const r = await call('PUT', '/staff/worker', { body: { ...profile, startDate: '2026-03-03' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await store.getStaff('worker')).startDate, '2026-03-03');
});
test('Q6: TTS được bỏ trống ngày vào làm (tạo mới và sửa)', async () => {
  const created = await call('PUT', '/staff/new.intern', { body: newcomer('tts') });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal((await store.getStaff('new.intern')).startDate, null);
  const updated = await call('PUT', '/staff/new.intern', {
    body: { name: 'Đổi tên', role: 'staff', type: 'tts', level: 1 }
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
});
