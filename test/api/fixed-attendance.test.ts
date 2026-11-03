// Từng test dùng nhân sự riêng; DB tạm được đặt trước khi nạp máy chủ.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'fixed-attendance-isolated-tests';
const iso = (value?) => new Date(value + '+07:00').toISOString();
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');
// Đọc thẳng các ngày chấm công của tháng từ DB
const ATT = async (u?, month?) =>
  await store.db.prepare('SELECT date FROM attendance_days WHERE username = ? AND date LIKE ?').all(u, month + '-%');
const sessionBody = require('../helpers/session-contract-helper');
const recordedDay = async (u?, date?) =>
  (await (await store.listSessions({ username: u, date })).at(-1))?.entry || null;
let base, admin, clock;
const realNow = Date.now;
const at = (value?) => {
  clock = Date.parse(value + '+07:00');
};
async function call(cookie?, method?, url?, body?) {
  body = await sessionBody(store, await auth.readSession(cookie), method, url, body);
  const r = await fetch(base + '/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: (await r.json()) as any, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const login = async (username?) => (await call(null, 'POST', '/login', { username, password: 'test-pass' })).cookie;
const day = async (u?, date?) => await recordedDay(u, date);
const estimate = async (u?, date?) => (await store.getSheet(u, date.slice(0, 7))).days[date];
async function person(username?, shiftCode = 'n1') {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    nightPct: 40,
    shiftCode,
    passHash: auth.hashPassword('test-pass')
  });
  return login(username);
}
async function punch(cookie?, time?, type?) {
  await at(time);
  const r = await call(cookie, 'POST', '/punch', { type, explanation: 'Giải trình lúc bấm' }); // lần bấm trễ / sớm cần giải trình
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r;
}
before(async () => {
  await at('2026-10-07T07:00:00');
  Date.now = () => clock;
  await store.upsertStaff({
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: auth.hashPassword('test-pass')
  });
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin');
});
after(() => {
  Date.now = realNow;
  server.closeAllConnections();
  server.close();
});

test('đủ ca ghi nhận riêng cho Admin; giờ có mặt không ghi đè lịch ước tính', async () => {
  const u = await person('full');
  const manual = { kind: 'work', in: '08:00', out: '16:00', breakMin: 30 };
  // Giờ khác ca n1 không nhập được qua PUT /sheet (khoá theo ca) nên gieo thẳng vào DB, rồi lưu lại không đổi giờ
  await store.setSheet('full', '2026-10', { '2026-10-07': manual }, null, null);
  assert.equal(
    (await call(u, 'PUT', '/sheet', { month: '2026-10', days: { '2026-10-07': manual }, kpiPct: 75, kpiAmt: 1000000 }))
      .status,
    200
  );
  const original = await store.getSheet('full', '2026-10');
  await punch(u, '2026-10-07T07:00:00', 'in');
  // Check-out 19:00 muộn quá mức cho phép sau giờ hết ca 17:00: giải trình gửi kèm, giờ ra chỉ áp khi Admin duyệt
  await at('2026-10-07T19:00:00');
  const out = await call(u, 'POST', '/punch', { type: 'out', explanation: 'Làm thêm cuối ngày' });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal((await day('full', '2026-10-07')).reason, 'forgot-out');
  const late = (await call(admin, 'GET', '/explanations?status=answered&user=full')).data.items.find(
    x => x.kind === 'late-checkout'
  );
  assert.equal((await call(admin, 'POST', `/explanations/${late.id}/decide`, { approve: true })).status, 200);
  const d = await day('full', '2026-10-07');
  assert.equal(d.attendanceConfirmed, true);
  assert.equal(d.in, '08:00');
  assert.equal(d.out, '17:00');
  assert.equal(d.extraKind, '');
  assert.equal(d.extraIn, '');
  assert.equal(d.extraOut, '');
  assert.equal(d.presIn, iso('2026-10-07T07:00:00'));
  assert.equal(d.presOut, iso('2026-10-07T19:00:00'));
  assert.deepEqual(await store.getSheet('full', '2026-10'), original);
  const result = (await call(u, 'GET', '/sheet?month=2026-10')).data;
  assert.deepEqual(result.days, original.days);
  assert.deepEqual(result.attendanceSessions.find(s => s.date === '2026-10-07').entry, d);
  const changed = { ...manual, out: '17:00', breakMin: 0, extraKind: 'ot', extraOut: '19:30' };
  assert.equal((await call(u, 'PUT', '/sheet', { month: '2026-10', days: { '2026-10-07': changed } })).status, 200);
  assert.equal((await estimate('full', '2026-10-07')).extraOut, '19:30');
  assert.deepEqual(await day('full', '2026-10-07'), d);
});

test('vào trễ/về sớm gửi Admin chờ duyệt; lịch ước tính nhân viên tự nhập giữ nguyên', async () => {
  const u = await person('partial');
  await store.setSheet('partial', '2026-10', { '2026-10-08': { kind: 'work', in: '08:00', out: '15:00' } }, null, null); // dữ liệu lệch ca có sẵn
  assert.equal(
    (
      await call(u, 'PUT', '/sheet', {
        month: '2026-10',
        days: { '2026-10-08': { kind: 'work', in: '08:00', out: '15:00' } }
      })
    ).status,
    200
  );
  const original = await store.getSheet('partial', '2026-10');
  await punch(u, '2026-10-08T08:15:00', 'in');
  await punch(u, '2026-10-08T16:30:00', 'out');
  const pending = await day('partial', '2026-10-08');
  assert.equal(pending.reason, 'incomplete-shift');
  assert.equal(pending.in, undefined);
  assert.equal(pending.presIn, iso('2026-10-08T08:15:00'));
  assert.equal(pending.presOut, iso('2026-10-08T16:30:00'));
  assert.deepEqual(await store.getSheet('partial', '2026-10'), original);
  assert.equal((await call(u, 'GET', '/sheet?month=2026-10')).data.days['2026-10-08'].out, '15:00');
});

test('so giờ chính xác: trễ một giây hoặc về sớm một giây vẫn chờ duyệt', async () => {
  const late = await person('one-second-late'),
    early = await person('one-second-early');
  await punch(late, '2026-10-08T08:00:01', 'in');
  await punch(late, '2026-10-08T17:00:00', 'out');
  await punch(early, '2026-10-08T08:00:00', 'in');
  await punch(early, '2026-10-08T16:59:59', 'out');
  assert.equal((await day('one-second-late', '2026-10-08')).reason, 'incomplete-shift');
  assert.equal((await day('one-second-late', '2026-10-08')).presIn, iso('2026-10-08T08:00:01'));
  assert.equal((await day('one-second-early', '2026-10-08')).reason, 'incomplete-shift');
  assert.equal((await day('one-second-early', '2026-10-08')).presOut, iso('2026-10-08T16:59:59'));
});

test('đổi ca đang mở không đổi ca/ngày công của lần check-in', async () => {
  const u = await person('changed');
  await punch(u, '2026-10-09T08:00:00', 'in');
  const update = await call(admin, 'PUT', '/staff/changed', {
    name: 'changed',
    role: 'staff',
    type: 'nv',
    level: 1,
    nightPct: 40,
    shiftCode: 'g2',
    startDate: '2026-01-01'
  });
  assert.equal(update.status, 200);
  await punch(u, '2026-10-09T17:00:00', 'out');
  assert.equal((await day('changed', '2026-10-09')).in, '08:00');
  assert.equal((await day('changed', '2026-10-09')).plannedShift.code, 'Normal1'); // hồ sơ lưu mã ca dạng Normal1 …
  assert.ok(!(await day('changed', '2026-10-08')));
});

test('quên checkout sau khi đổi ca vẫn đánh dấu đúng ngày công cũ', async () => {
  const u = await person('changed-forgot');
  await punch(u, '2026-10-09T08:00:00', 'in');
  assert.equal(
    (
      await call(admin, 'PUT', '/staff/changed-forgot', {
        name: 'changed-forgot',
        role: 'staff',
        type: 'nv',
        level: 1,
        shiftCode: 'g2',
        startDate: '2026-01-01'
      })
    ).status,
    200
  );
  await at('2026-10-10T00:01:00');
  assert.equal((await call(u, 'GET', '/punch')).status, 200);
  assert.equal((await day('changed-forgot', '2026-10-09')).reason, 'forgot-out');
  assert.equal((await day('changed-forgot', '2026-10-09')).plannedShift.code, 'Normal1'); // hồ sơ lưu mã ca dạng Normal1 …
  assert.ok(!(await day('changed-forgot', '2026-10-08')));
});

test('đêm qua tháng, trễ sau 0h vẫn thuộc ngày ca cũ và không tạo ngày giả', async () => {
  await at('2026-09-29T21:00:00');
  const u = await person('overnight', 'g2');
  await punch(u, '2026-09-29T22:00:00', 'in');
  await punch(u, '2026-09-30T07:00:00', 'out');
  await punch(u, '2026-10-01T00:30:00', 'in');
  await punch(u, '2026-10-01T07:00:00', 'out');
  assert.equal((await day('overnight', '2026-09-30')).reason, 'incomplete-shift');
  assert.ok(!(await day('overnight', '2026-10-01')));
  assert.equal(
    (
      await call(u, 'PUT', '/sheet', {
        month: '2026-09',
        days: (await store.getSheet('overnight', '2026-09')).days,
        kpiPct: 75
      })
    ).status,
    200
  );
});

test('lịch ước tính chồng giờ thật giữa hai ngày vẫn lưu, kèm cảnh báo SHEET_DAYS_OVERLAP', async () => {
  const u = await person('manual-overlap', 'g2');
  const days = {
    '2026-10-06': { kind: 'work', in: '22:00', out: '07:00' },
    '2026-10-07': { kind: 'work', in: '06:30', out: '15:30' }
  };
  const res = await call(u, 'PUT', '/sheet', { month: '2026-10', days });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(
    res.data.warnings.some(w => w.code === 'SHEET_DAYS_OVERLAP'),
    JSON.stringify(res.data.warnings)
  );
  assert.deepEqual(Object.keys((await store.getSheet('manual-overlap', '2026-10')).days), ['2026-10-06', '2026-10-07']);
  assert.deepEqual(await ATT('manual-overlap', '2026-10'), []);
});
