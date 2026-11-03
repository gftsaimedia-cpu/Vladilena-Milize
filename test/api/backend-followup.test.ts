// Đổi loại nhân sự thì dòng duyệt "đi làm ngày lễ" theo kịp; dữ liệu lịch có khoá ngày lạ không làm hỏng việc lưu.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'backend-followup-tests';
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
// Lịch ghi thẳng vào DB (bỏ qua kiểm tra của PUT /sheet): dựng dữ liệu cũ hoặc dữ liệu hỏng
const putSheet = (username?, month?, days?) => store.setSheet(username, month, days, null, null);

// 2026-10: 1/10 là Thứ 5, 17/10 Thứ 7, 20/10 Thứ 3. 2026-09: 5/9 Thứ 7.
const SAT = '2026-10-17',
  TUE = '2026-10-20',
  SEP_SAT = '2026-09-05';
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const putStaff = (username?, type?, extra: any = {}) =>
  call('PUT', '/staff/' + username, {
    name: username,
    role: 'staff',
    type,
    level: 1,
    shiftCode: null,
    startDate: '2026-01-01',
    ...extra
  });
const approve = async (username?, date?) => {
  const row = await rowAt(username, date);
  return store.approvals.decide([{ username, date, rev: row.rev, fingerprint: row.fingerprint }], 'approved', 'admin');
};

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
  await person('worker', { shiftCode: null });
  await person('intern', { type: 'tts', shiftCode: null });
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// ================= (2) PUT /settings/checkin: không có route (Check-in luôn bật; test ở checkin.test.ts) =================

// ================= (3) Đổi loại nhân sự: dòng duyệt theo kịp =================

test('NV sang TTS: dòng OT ngày lễ Thứ 7 biến mất (TTS không có lịch Thứ 7)', async () => {
  await store.setSetting('holidays', [SAT]);
  const saved = await call('PUT', '/sheet', { month: '2026-10', days: { [SAT]: { ...WORK } } }, 'worker');
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await rowAt('worker', SAT)).item, 'ot');
  const res = await putStaff('worker', 'tts');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('worker')).type, 'tts');
  assert.equal(await rowAt('worker', SAT), undefined);
});
test('TTS sang NV: ngày Thứ 7 lễ đã khai có dòng chờ duyệt (từ 10/2026) và decide duyệt được', async () => {
  await store.setSetting('holidays', [SAT]);
  await putSheet('intern', '2026-10', { [SAT]: { ...WORK } });
  assert.equal(await rowAt('intern', SAT), undefined, 'TTS: Thứ 7 không phải ngày lễ trong lịch');
  const res = await putStaff('intern', 'nv');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const row = await rowAt('intern', SAT);
  assert.equal(row.item, 'ot');
  assert.equal(row.fingerprint, 'holiday_work|08:00-17:00');
  assert.equal(row.status, 'pending');
  assert.equal(row.decided_by, null);
  assert.equal((await approve('intern', SAT))[0].status, 'approved');
  assert.equal((await rowAt('intern', SAT)).status, 'approved');
});
test('TTS sang NV: tháng ≤ 09/2026 thì dòng mới tạo được duyệt sẵn bởi system (mốc giống đổi lịch lễ)', async () => {
  await putSheet('intern', '2026-09', { [SEP_SAT]: { ...WORK } });
  await putSheet('intern', '2026-10', { [SAT]: { ...WORK } });
  await store.setSetting('holidays', [SEP_SAT, SAT]);
  assert.equal((await putStaff('intern', 'nv')).status, 200);
  assert.equal((await rowAt('intern', SEP_SAT)).status, 'approved');
  assert.equal((await rowAt('intern', SEP_SAT)).decided_by, 'system');
  assert.equal((await rowAt('intern', SAT)).status, 'pending');
});
test('đổi loại nhân sự dùng đúng danh sách lễ đang lưu: ngày không phải lễ thì không có dòng', async () => {
  await putSheet('intern', '2026-10', { [SAT]: { ...WORK } });
  assert.equal((await putStaff('intern', 'nv')).status, 200);
  assert.deepEqual(await rowsOf('intern'), []);
});
test('không đổi loại thì dòng duyệt đang có (kể cả đã duyệt) giữ nguyên', async () => {
  await store.setSetting('holidays', [SAT]);
  assert.equal((await call('PUT', '/sheet', { month: '2026-10', days: { [SAT]: { ...WORK } } }, 'worker')).status, 200);
  await approve('worker', SAT);
  const res = await putStaff('worker', 'nv', { jobTitle: 'Chuyên viên' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await rowAt('worker', SAT)).status, 'approved');
});
test('đổi loại và dòng duyệt cùng hoàn tác: yêu cầu bị từ chối thì loại và dòng duyệt đều giữ nguyên', async () => {
  await store.setSetting('holidays', [SAT]);
  assert.equal((await call('PUT', '/sheet', { month: '2026-10', days: { [SAT]: { ...WORK } } }, 'worker')).status, 200);
  const res = await putStaff('worker', 'tts', { shiftCode: 'khong-co' });
  assert.equal(res.status, 400);
  assert.equal((await store.getStaff('worker')).type, 'nv');
  assert.equal((await rowAt('worker', SAT)).status, 'pending');
});

// ================= (4) Khoá ngày ngoài tháng trong lịch đã lưu =================

test('đổi lịch lễ khi lịch đã lưu có khoá ngày ngoài tháng: bỏ qua khoá lạ, vẫn lưu lễ và tạo dòng đúng', async () => {
  // 8 giờ mỗi ngày lễ (OT ngày lễ tính nguyên giờ, không trừ nghỉ): hai ngày vừa đủ trần 16 giờ/tháng
  const eight = { kind: 'work', in: '08:00', out: '16:00' };
  await putSheet('worker', '2026-10', {
    [TUE]: { ...eight },
    '2026-11-02': { ...eight },
    '2026-10-99': { ...eight },
    junk: { ...eight }
  });
  const res = await call('PUT', '/holidays', { dates: [TUE, '2026-11-02'] });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(await store.getSetting('holidays', []), [TUE, '2026-11-02']);
  assert.equal((await rowAt('worker', TUE)).status, 'pending');
  assert.equal(await rowAt('worker', '2026-11-02'), undefined, 'ngày tháng 11 trong lịch tháng 10 không tạo dòng');
  assert.equal(await rowAt('worker', '2026-10-99'), undefined);
});
test('đổi loại nhân sự khi lịch đã lưu có khoá ngày ngoài tháng: không lỗi, dòng của ngày hợp lệ vẫn đúng', async () => {
  await store.setSetting('holidays', [SAT, '2026-11-07']);
  await putSheet('intern', '2026-10', { [SAT]: { ...WORK }, '2026-11-07': { ...WORK }, junk: { ...WORK } });
  const res = await putStaff('intern', 'nv');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('intern')).type, 'nv');
  assert.equal((await rowAt('intern', SAT)).status, 'pending');
  assert.equal(await rowAt('intern', '2026-11-07'), undefined);
});
