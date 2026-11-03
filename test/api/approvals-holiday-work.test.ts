// Khoản thứ sáu "Đi làm ngày lễ" ở phía máy chủ: nhận diện khi lưu lịch, đổi lịch lễ làm khoản xuất hiện hoặc biến mất,
// hàng chờ, quyền, và di chuyển dữ liệu cũ (dấu sheet_approvals_v2).
process.env.SESSION_SECRET = 'approvals-holiday-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base;
const realNow = Date.now;
const CLOCK = Date.parse('2026-10-14T12:00:00+07:00');

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
async function call(method?, route?, body?, who = 'admin') {
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const rowsOf = async (username?) =>
  await store.db.prepare('SELECT * FROM sheet_approvals WHERE username = ? ORDER BY date').all(username);
const rowAt = async (username?, date?) => (await rowsOf(username)).find(row => row.date === date);

// 1/10/2026 là Thứ 5: 20/10 Thứ 3, 17/10 Thứ 7, 18/10 Chủ nhật; 2/9/2026 Thứ 4; 2/11/2026 Thứ 2
const TUE = '2026-10-20',
  SAT = '2026-10-17',
  SUN = '2026-10-18',
  SEP2 = '2026-09-02',
  NOV2 = '2026-11-02';
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const saveSheet = async (who?, days?, month?) =>
  await call('PUT', '/sheet', { month: month || Object.keys(days)[0].slice(0, 7), days }, who);
const setHolidays = async (dates?) => await call('PUT', '/holidays', { dates });
const sheetApprovals = async (who?, month = '2026-10') =>
  (await call('GET', `/sheet?month=${month}`, undefined, who)).data.approvals;
const queue = async (params = '') => (await call('GET', '/approvals' + params)).data;

before(async () => {
  Date.now = () => CLOCK;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of [
    'sheet_approvals',
    'punch_requests',
    'corrections',
    'punches',
    'attendance_sessions',
    'attendance_days',
    'timesheets',
    'staff',
    'settings'
  ]) {
    try {
      await store.db.exec('DELETE FROM ' + table);
    } catch (error) {
      if (!/no such table/.test(error.message)) throw error;
    }
  }
  await person('admin', { role: 'admin', type: 'tts', level: 0 });
  await person('worker');
  await person('intern', { type: 'tts', level: 1 });
  await person('free', { shiftCode: null }); // chưa gán ca cố định: tự khai giờ
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// ================= lib/approvals.declaredItems =================

test('declaredItems: không có ctx thì ngày lễ đi làm không phải khoản (như cũ), có ctx thì là holiday_work', () => {
  const days = { [TUE]: { ...WORK }, '2026-10-21': { ...WORK } };
  assert.deepEqual(store.approvals.declaredItems(days), {});
  assert.deepEqual(store.approvals.declaredItems(days, { holidays: [TUE], staffType: 'nv' }), {
    [TUE]: { item: 'ot', fingerprint: 'holiday_work|08:00-17:00' }
  });
});
test('declaredItems: bỏ qua trường ngoài danh sách khai tay và ngày chờ của Check-in/out', () => {
  const days = { [TUE]: { ...WORK, src: 'admin' }, '2026-10-21': { kind: 'pending' } };
  assert.deepEqual(store.approvals.declaredItems(days, { holidays: [TUE, '2026-10-21'], staffType: 'nv' }), {
    [TUE]: { item: 'ot', fingerprint: 'holiday_work|08:00-17:00' }
  });
});

// ================= PUT /sheet =================

test('khai đi làm ngày lễ: tạo dòng chờ duyệt holiday_work, GET /sheet, GET /team và GET /approvals đều thấy', async () => {
  await store.setSetting('holidays', [TUE]);
  const saved = await saveSheet('worker', { [TUE]: { ...WORK } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.approvals[TUE].item, 'ot');
  assert.equal(saved.data.approvals[TUE].status, 'pending');
  const row = await rowAt('worker', TUE);
  assert.equal(row.item, 'ot');
  assert.equal(row.fingerprint, 'holiday_work|08:00-17:00');
  assert.equal(row.status, 'pending');
  assert.equal(row.rev, 1);

  const sheet = (await call('GET', '/sheet?month=2026-10', undefined, 'worker')).data;
  assert.equal(sheet.approvals[TUE].item, 'ot');
  assert.equal(sheet.approvals[TUE].status, 'pending');
  assert.equal(sheet.approvals[TUE].fingerprint, 'holiday_work|08:00-17:00');

  const team = (await call('GET', '/team?month=2026-10')).data;
  const mine = team.rows.find(r => r.staff.username === 'worker');
  assert.equal(mine.approvals[TUE].item, 'ot');
  assert.equal(mine.pendingApprovals, 1);

  const q = await queue();
  assert.equal(q.counts.pending, 1);
  assert.equal(q.items[0].item, 'ot');
  assert.equal(q.items[0].date, TUE);
  assert.deepEqual(q.items[0].declared, {
    kind: 'work',
    in: '08:00',
    out: '17:00',
    extraKind: '',
    extraIn: '',
    extraOut: ''
  });
  assert.equal(q.sheets['worker|2026-10'].approvals[TUE].item, 'ot');
  assert.equal((await call('GET', '/approvals/count')).data.pending, 1);
});

test('đi làm ngày thường không tạo dòng duyệt dù lịch lễ có ngày khác', async () => {
  await store.setSetting('holidays', [TUE, SUN]);
  const saved = await saveSheet('worker', { '2026-10-21': { ...WORK }, '2026-10-22': { ...WORK } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(await rowsOf('worker'), []);
});

test('TTS không có quyền lợi OT: khai làm ngày lễ vẫn lưu kèm cảnh báo BENEFIT_NOT_ALLOWED, không có dòng duyệt; NV Thứ 7 thì có', async () => {
  await store.setSetting('holidays', [TUE, SAT]);
  const refused = await saveSheet('intern', { [TUE]: { ...WORK } });
  assert.equal(refused.status, 200, JSON.stringify(refused.data));
  const warning = refused.data.warnings.find(w => w.code === 'BENEFIT_NOT_ALLOWED');
  assert.ok(warning, JSON.stringify(refused.data.warnings));
  assert.match(warning.message, /không có overtime/);
  assert.equal(await rowAt('intern', TUE), undefined);
  assert.equal((await saveSheet('worker', { [SAT]: { ...WORK } })).status, 200);
  assert.equal((await rowAt('worker', SAT)).item, 'ot');
});

test('Admin duyệt rồi lưu lại y nguyên thì vẫn đã duyệt; sửa giờ thì về chờ duyệt (rev + 1); xoá ngày thì mất dòng', async () => {
  await store.setSetting('holidays', [TUE]);
  await saveSheet('free', { [TUE]: { ...WORK } });
  const item = (await queue()).items[0];
  const decided = await call('PUT', '/approvals/decide', {
    action: 'approve',
    items: [{ username: 'free', date: TUE, rev: item.rev, fingerprint: item.fingerprint }]
  });
  assert.equal(decided.status, 200, JSON.stringify(decided.data));
  assert.equal((await rowAt('free', TUE)).status, 'approved');
  assert.equal((await sheetApprovals('free'))[TUE].status, 'approved');

  const again = await saveSheet('free', { [TUE]: { ...WORK } });
  assert.deepEqual(again.data.reset, []);
  assert.equal((await rowAt('free', TUE)).status, 'approved');

  const edited = await saveSheet('free', { [TUE]: { ...WORK, in: '09:00', out: '18:00' } });
  assert.deepEqual(edited.data.reset, [TUE]);
  const row = await rowAt('free', TUE);
  assert.equal(row.status, 'pending');
  assert.equal(row.fingerprint, 'holiday_work|09:00-18:00');
  assert.equal(row.rev, 3);

  const removed = await saveSheet('free', {}, '2026-10');
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.deepEqual(removed.data.removed, [TUE]);
  assert.equal(await rowAt('free', TUE), undefined);
});

test('nhân sự không tự duyệt được: trường approvals / status gửi kèm bị bỏ qua, route duyệt trả 403', async () => {
  await store.setSetting('holidays', [TUE]);
  const saved = await call(
    'PUT',
    '/sheet',
    {
      month: '2026-10',
      days: { [TUE]: { ...WORK, status: 'approved', approved: true } },
      approvals: { [TUE]: { status: 'approved' } },
      status: 'approved'
    },
    'worker'
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.approvals[TUE].status, 'pending');
  assert.equal((await rowAt('worker', TUE)).status, 'pending');
  const item = await rowAt('worker', TUE);
  const attempt = await call(
    'PUT',
    '/approvals/decide',
    {
      action: 'approve',
      status: 'approved',
      items: [{ username: 'worker', date: TUE, rev: item.rev, fingerprint: item.fingerprint }]
    },
    'worker'
  );
  assert.equal(attempt.status, 403);
  assert.equal((await rowAt('worker', TUE)).status, 'pending');
});

// OT ngày lễ được khai và trả; làm bù ngày lễ bị chặn
test('ngày lễ trong lịch: khai làm bù vẫn bị 400 SHEET_MAKEUP_ON_HOLIDAY và không lưu gì; khai OT thì lưu được', async () => {
  await store.setSetting('holidays', [TUE]);
  const bad = await saveSheet('worker', { [TUE]: { ...WORK, extraKind: 'makeup', extraOut: '19:00' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'SHEET_MAKEUP_ON_HOLIDAY');
  assert.deepEqual(await rowsOf('worker'), []);
  assert.deepEqual((await store.getSheet('worker', '2026-10')).days, {});
  const ok = await saveSheet('worker', { [TUE]: { ...WORK, extraKind: 'ot', extraOut: '19:00' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getSheet('worker', '2026-10')).days[TUE].extraKind, 'ot');
});

// ================= PUT /holidays đổi lịch lễ =================

test('Admin thêm ngày lễ sau khi nhân sự đã khai đi làm: ngày đó thành chờ duyệt ngay trong hàng chờ', async () => {
  await saveSheet('worker', { [TUE]: { ...WORK }, '2026-10-21': { ...WORK } });
  assert.deepEqual(await rowsOf('worker'), []);
  const r = await setHolidays([TUE]);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = await rowAt('worker', TUE);
  assert.equal(row.item, 'ot');
  assert.equal(row.status, 'pending');
  assert.equal(row.fingerprint, 'holiday_work|08:00-17:00');
  assert.equal((await rowsOf('worker')).length, 1, 'ngày thường 21/10 không có dòng');
  const q = await queue();
  assert.deepEqual(
    q.items.map(x => `${x.username}:${x.date}:${x.item}:${x.status}`),
    [`worker:${TUE}:ot:pending`]
  );
  assert.equal((await sheetApprovals('worker'))[TUE].status, 'pending');
});

test('Admin bỏ ngày lễ: khoản đi làm ngày lễ biến mất khỏi hàng chờ, kể cả khi đã được duyệt', async () => {
  await saveSheet('worker', { [TUE]: { ...WORK } });
  await setHolidays([TUE]);
  const item = (await queue()).items[0];
  await call('PUT', '/approvals/decide', {
    action: 'approve',
    items: [{ username: 'worker', date: TUE, rev: item.rev, fingerprint: item.fingerprint }]
  });
  assert.equal((await rowAt('worker', TUE)).status, 'approved');
  const r = await setHolidays([]);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(await rowAt('worker', TUE), undefined);
  assert.equal((await queue('?status=all')).items.length, 0);
  assert.deepEqual(await sheetApprovals('worker'), {});
  // thêm lại: khoản trở lại là chờ duyệt, quyết định cũ không sống lại
  await setHolidays([TUE]);
  assert.equal((await rowAt('worker', TUE)).status, 'pending');
  assert.equal((await rowAt('worker', TUE)).rev, 1);
});

test('đổi lịch lễ chỉ đồng bộ các tháng bị ảnh hưởng và mọi nhân sự, không đụng khoản khác', async () => {
  await person('other');
  await saveSheet('worker', { [TUE]: { ...WORK }, '2026-10-24': { kind: 'isat' } });
  await saveSheet('other', { [TUE]: { ...WORK } });
  await saveSheet('worker', { [NOV2]: { ...WORK } });
  const isat = await rowAt('worker', '2026-10-24');
  assert.equal(isat.item, 'isat');
  await setHolidays([TUE]);
  assert.equal((await rowAt('worker', TUE)).item, 'ot');
  assert.equal((await rowAt('other', TUE)).item, 'ot');
  assert.equal(await rowAt('worker', NOV2), undefined, 'tháng 11 không bị ảnh hưởng');
  assert.deepEqual(await rowAt('worker', '2026-10-24'), isat, 'dòng iSAT không đổi');
  await setHolidays([TUE, NOV2]);
  assert.equal((await rowAt('worker', NOV2)).item, 'ot');
});

test('thêm ngày lễ Thứ 7 / Chủ nhật: TTS không có khoản, NV Thứ 7 có, Chủ nhật không ai có', async () => {
  await saveSheet('worker', { [SAT]: { ...WORK } });
  await setHolidays([SAT, SUN, '2026-10-16']);
  assert.equal((await rowAt('worker', SAT)).item, 'ot');
  assert.equal(await rowAt('intern', '2026-10-16'), undefined);
  assert.equal(await rowAt('intern', SAT), undefined);
  assert.equal(await rowAt('worker', SUN), undefined);
});

test('đổi lịch lễ cho tháng ≤ 09/2026: khoản mới được duyệt sẵn bởi system (quy tắc tháng cũ), pay giữ nguyên ×3', async () => {
  await saveSheet('worker', { [SEP2]: { ...WORK } });
  assert.deepEqual(await rowsOf('worker'), []);
  await setHolidays([SEP2]);
  const row = await rowAt('worker', SEP2);
  assert.equal(row.item, 'ot');
  assert.equal(row.status, 'approved');
  assert.equal(row.decided_by, 'system');
  assert.ok(row.decided_at);
  assert.equal((await sheetApprovals('worker', '2026-09'))[SEP2].status, 'approved');
  assert.equal((await queue()).items.length, 0, 'không vào hàng chờ');
});
test('tháng 09/2026 duyệt sẵn nhưng tháng 10/2026 trong cùng lần đổi lịch lễ vẫn chờ duyệt; bỏ ngày lễ thì khoản biến mất', async () => {
  await saveSheet('worker', { [SEP2]: { ...WORK } });
  await saveSheet('worker', { [TUE]: { ...WORK } });
  await setHolidays([SEP2, TUE]);
  assert.equal((await rowAt('worker', SEP2)).status, 'approved');
  assert.equal((await rowAt('worker', TUE)).status, 'pending');
  await setHolidays([TUE]);
  assert.equal(await rowAt('worker', SEP2), undefined);
  assert.equal((await rowAt('worker', TUE)).status, 'pending');
});

test('đổi lịch lễ bị từ chối (409 xung đột) thì không có dòng duyệt nào thay đổi', async () => {
  await saveSheet('worker', { [TUE]: { ...WORK } });
  assert.equal((await call('PUT', '/holidays', { dates: ['không phải ngày'] })).status, 400);
  assert.deepEqual(await rowsOf('worker'), []);
  assert.deepEqual(await store.getSetting('holidays', []), []);
});

test('nhân sự không đổi được lịch lễ: 403 và không tạo khoản', async () => {
  await saveSheet('worker', { [TUE]: { ...WORK } });
  assert.equal((await call('PUT', '/holidays', { dates: [TUE] }, 'worker')).status, 403);
  assert.equal((await call('PUT', '/holidays', { dates: [TUE] }, null)).status, 401);
  assert.deepEqual(await rowsOf('worker'), []);
});
