// Khoản thứ bảy "Nghỉ phép năm" (kind leave) ở phía máy chủ: nhận diện khi lưu lịch, hàng chờ, quyền, số dư phép theo
// trạng thái duyệt (chờ duyệt giữ chỗ, bị từ chối trả lại phép), đồng bộ khi đổi lịch lễ hoặc loại nhân sự, và di chuyển dữ liệu cũ (dấu sheet_approvals_v3).
// Mốc di chuyển giữ như v1: tháng ≤ 09/2026 đã duyệt bởi 'system', từ 10/2026 chờ duyệt.
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'approvals-leave-tests';
const { test, before, beforeEach, after } = require('node:test');
const { sqliteOnly } = require('../helpers/dialect');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../../lib/db');
const auth = require('../../lib/auth');
const server = require('../../server');

let base;
const realNow = Date.now;
// 14/10/2026 12:00 giờ Việt Nam (Thứ 4)
const CLOCK = Date.parse('2026-10-14T12:00:00+07:00');

async function person(username, overrides = {}) {
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
async function call(method, route, body, who = 'admin') {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const rowsOf = async username =>
  await store.db.prepare('SELECT * FROM sheet_approvals WHERE username = ? ORDER BY date').all(username);
const rowAt = async (username, date) => (await rowsOf(username)).find(row => row.date === date);
const snapshot = async () => ({
  approvals: await store.db.prepare('SELECT * FROM sheet_approvals ORDER BY username, date').all(),
  timesheets: await store.db.prepare('SELECT * FROM timesheets ORDER BY rowid').all()
});

// 1/10/2026 là Thứ 5: 5/10 Thứ 2, 6/10 Thứ 3, 7/10 Thứ 4; 8/9/2026 Thứ 3; 3/11/2026 Thứ 3
const LEAVE = '2026-10-05',
  LEAVE2 = '2026-10-06',
  SEP_LEAVE = '2026-09-08',
  NOV_LEAVE = '2026-11-03';
const saveSheet = async (who, days, month) =>
  await call('PUT', '/sheet', { month: month || Object.keys(days)[0].slice(0, 7), days }, who);
const sheetOf = async (who, month = '2026-10') => (await call('GET', `/sheet?month=${month}`, undefined, who)).data;
const queue = async (params = '') => (await call('GET', '/approvals' + params)).data;
const refsOf = items =>
  items.map(x => ({ username: x.username, date: x.date, rev: x.rev, fingerprint: x.fingerprint }));
const leaveOf = async username => (await call('GET', '/staff')).data.staff.find(s => s.username === username).leave;

before(async () => {
  Date.now = () => CLOCK;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
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
  await person('other');
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  store.db.close();
});

// ================= Lưu lịch, GET /sheet, GET /team, GET /approvals =================

test('Phép năm: lưu một ngày "Nghỉ phép năm" tạo dòng chờ duyệt item leave, dấu vân tay "leave"', async () => {
  const r = await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = await rowAt('worker', LEAVE);
  assert.equal(row.item, 'leave');
  assert.equal(row.fingerprint, 'leave');
  assert.equal(row.status, 'pending');
  assert.equal(row.rev, 1);
  assert.equal(row.decided_by, null);
  assert.equal(r.data.approvals[LEAVE].item, 'leave');
  assert.equal(r.data.approvals[LEAVE].status, 'pending');
});

test('Phép năm: GET /sheet mang khoản leave với trạng thái hiệu lực (kể cả khi lịch có sẵn mà chưa có dòng duyệt)', async () => {
  await store.setSheet('worker', '2026-10', { [LEAVE]: { kind: 'leave' } }, null, null);
  assert.equal((await rowsOf('worker')).length, 0, 'không có dòng duyệt: chưa qua PUT /sheet');
  const got = await sheetOf('worker');
  assert.deepEqual(
    { item: got.approvals[LEAVE].item, status: got.approvals[LEAVE].status, rev: got.approvals[LEAVE].rev },
    { item: 'leave', status: 'pending', rev: 0 }
  );
});

test('Phép năm: GET /team mang khoản leave và tính vào pendingApprovals', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' }, [LEAVE2]: { kind: 'leave' } });
  const r = await call('GET', '/team?month=2026-10');
  assert.equal(r.status, 200);
  const row = (r.data.rows || r.data).find(x => x.staff.username === 'worker');
  assert.equal(row.approvals[LEAVE].item, 'leave');
  assert.equal(row.approvals[LEAVE2].status, 'pending');
  assert.equal(row.pendingApprovals, 2);
});

test('Phép năm: GET /approvals liệt kê khoản leave kèm ngày đã khai, đếm trong /approvals/count', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  const data = await queue();
  const item = data.items.find(x => x.date === LEAVE);
  assert.equal(item.username, 'worker');
  assert.equal(item.item, 'leave');
  assert.equal(item.status, 'pending');
  assert.equal(item.declared.kind, 'leave');
  assert.equal(data.counts.pending, 1);
  assert.equal((await call('GET', '/approvals/count')).data.pending, 1);
  assert.equal(data.sheets['worker|2026-10'].approvals[LEAVE].item, 'leave');
});

test('Phép năm: lưu lại lịch không đổi ngày phép thì dòng giữ nguyên rev; đổi sang ngày đi làm thì dòng biến mất', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  assert.equal((await rowAt('worker', LEAVE)).rev, 1);
  const r = await saveSheet('worker', { [LEAVE]: { kind: 'work', in: '08:00', out: '17:00' } }, '2026-10');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(await rowAt('worker', LEAVE), undefined);
  assert.deepEqual(r.data.removed, [LEAVE]);
});

// ================= Quyền và duyệt =================

test('Phép năm: Admin duyệt khoản leave: đã duyệt, rev tăng, GET /sheet thấy approved', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  const items = (await queue()).items;
  const r = await call('PUT', '/approvals/decide', { action: 'approve', items: refsOf(items) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.decided, 1);
  const row = await rowAt('worker', LEAVE);
  assert.equal(row.status, 'approved');
  assert.equal(row.rev, 2);
  assert.equal(row.decided_by, 'admin');
  assert.equal((await sheetOf('worker')).approvals[LEAVE].status, 'approved');
});

test('Phép năm: Admin từ chối khoản leave có lý do hoặc không có lý do đều thành rejected (lý do tuỳ chọn)', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  const items = refsOf((await queue()).items);
  const r = await call('PUT', '/approvals/decide', { action: 'reject', items, note: 'Trùng đợt cao điểm' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await rowAt('worker', LEAVE)).status, 'rejected');
  assert.equal((await sheetOf('worker')).approvals[LEAVE].status, 'rejected');
  await saveSheet('worker', { [LEAVE2]: { kind: 'leave' } });
  const second = refsOf((await queue()).items.filter(x => x.date === LEAVE2));
  const noNote = await call('PUT', '/approvals/decide', { action: 'reject', items: second });
  assert.equal(noNote.status, 200, JSON.stringify(noNote.data));
  assert.equal((await rowAt('worker', LEAVE2)).status, 'rejected');
});

test('Phép năm: nhân sự gọi route duyệt khoản leave của chính mình: 403, kể cả gửi thêm status; không lưu gì', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  const items = refsOf((await queue()).items);
  const before = await snapshot();
  for (const body of [
    { action: 'approve', items },
    { action: 'approve', items, status: 'approved', user: 'admin' },
    { action: 'reject', items, note: 'x' }
  ])
    assert.equal((await call('PUT', '/approvals/decide', body, 'worker')).status, 403);
  assert.equal((await call('GET', '/approvals', undefined, 'worker')).status, 403);
  assert.equal((await call('GET', '/approvals/count', undefined, 'worker')).status, 403);
  assert.deepEqual(await snapshot(), before);
});

test('Phép năm: nhân sự gửi trường approve / status trong PUT /sheet thì không tự duyệt được ngày phép', async () => {
  const body = {
    month: '2026-10',
    days: { [LEAVE]: { kind: 'leave', status: 'approved', approved: true } },
    approvals: { [LEAVE]: { status: 'approved' } }
  };
  // PUT /api/sheet nhận user của người khác. Nhân sự không có quyền duyệt gửi user của người
  // khác thì bị 403 và không lưu gì.
  const foreign = await call('PUT', '/sheet', { ...body, user: 'other' }, 'worker');
  assert.equal(foreign.status, 403, JSON.stringify(foreign.data));
  assert.equal((await rowsOf('other')).length, 0);
  assert.equal((await rowsOf('worker')).length, 0, 'bị từ chối thì lịch của chính họ cũng không được lưu');
  // trường approve / status trong lịch của chính mình không tự duyệt được ngày phép
  const r = await call('PUT', '/sheet', body, 'worker');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await rowAt('worker', LEAVE)).status, 'pending');
  assert.equal((await rowsOf('other')).length, 0);
});

test('Phép năm: duyệt xong rồi nhân sự lưu lại đúng ngày phép đó thì vẫn đã duyệt', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  await call('PUT', '/approvals/decide', { action: 'approve', items: refsOf((await queue()).items) });
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' }, [LEAVE2]: { kind: 'leave' } });
  assert.equal((await rowAt('worker', LEAVE)).status, 'approved');
  assert.equal((await rowAt('worker', LEAVE)).rev, 2);
  assert.equal((await rowAt('worker', LEAVE2)).status, 'pending');
});

// ================= Số dư phép theo trạng thái duyệt =================
// Chờ duyệt và đã duyệt giữ chỗ (tính là đã dùng); bị từ chối thì trả lại phép; lương không đổi.

test('Phép năm: ngày phép chờ duyệt và đã duyệt tính là đã dùng, bị từ chối thì trả lại phép; duyệt lại sau khi từ chối lại trừ phép', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  const pendingLeave = await leaveOf('worker');
  assert.equal(pendingLeave.used, 1, 'ngày chờ duyệt đã tính là đã dùng (giữ chỗ)');
  assert.equal(pendingLeave.balance, pendingLeave.total - 1);
  const items = refsOf((await queue()).items);
  await call('PUT', '/approvals/decide', { action: 'reject', items, note: 'Không đủ người' });
  assert.equal((await rowAt('worker', LEAVE)).status, 'rejected');
  const rejectedLeave = await leaveOf('worker');
  assert.equal(rejectedLeave.used, 0, 'ngày bị từ chối trả lại phép');
  assert.equal(rejectedLeave.balance, rejectedLeave.total);
  const rejected = refsOf((await queue('?status=rejected')).items);
  await call('PUT', '/approvals/decide', { action: 'approve', items: rejected, note: 'Đổi ý' });
  assert.equal((await rowAt('worker', LEAVE)).status, 'approved');
  assert.deepEqual(await leaveOf('worker'), pendingLeave, 'duyệt lại: phép bị trừ như lúc chờ duyệt');
});

test('Phép năm: GET /api/sheet trả leaveBalance theo trạng thái duyệt: chờ duyệt vẫn trừ, bị từ chối thì phép còn lại tăng lại', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } }); // 05/10 đã qua so với 14/10
  const waiting = (await sheetOf('worker')).leaveBalance;
  assert.equal(waiting.asOf, '2026-10-14');
  assert.equal(typeof waiting.accrued, 'number');
  assert.equal(waiting.used, 1, 'chờ duyệt vẫn trừ');
  assert.equal(waiting.balance, waiting.accrued - 1);
  assert.equal(waiting.remaining, waiting.balance);
  await call('PUT', '/approvals/decide', {
    action: 'reject',
    items: refsOf((await queue()).items),
    note: 'Không đủ người'
  });
  const after = (await sheetOf('worker')).leaveBalance;
  assert.equal(after.used, 0, 'bị từ chối thì không tính là đã dùng');
  assert.equal(after.balance, waiting.balance + 1, 'phép còn lại tăng lại 1 ngày');
  assert.equal(after.accrued, waiting.accrued, 'phép được cộng không đổi');
});

test('Phép năm: PUT /api/sheet nhận ngày phép khi phép đã trả lại: ngày bị từ chối không giữ chỗ nên khai được ngày khác', async () => {
  await person('newbie2', { startDate: '2026-09-01' });
  assert.equal((await saveSheet('newbie2', { [LEAVE]: { kind: 'leave' } })).status, 200);
  assert.equal((await leaveOf('newbie2')).balance, 0);
  const items = refsOf((await queue()).items.filter(x => x.username === 'newbie2'));
  assert.equal((await call('PUT', '/approvals/decide', { action: 'reject', items, note: 'x' })).status, 200);
  assert.equal((await leaveOf('newbie2')).balance, 1, 'phép trả lại');
  const again = await saveSheet('newbie2', { [LEAVE]: { kind: 'leave' }, [LEAVE2]: { kind: 'leave' } });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal((await rowAt('newbie2', LEAVE)).status, 'rejected', 'ngày bị từ chối khai y nguyên vẫn bị từ chối');
  assert.equal((await rowAt('newbie2', LEAVE2)).status, 'pending');
  assert.equal((await leaveOf('newbie2')).balance, 0);
});

// ================= Đồng bộ khi đổi lịch lễ hoặc loại nhân sự =================

test('Phép năm: PUT /holidays đồng bộ dòng leave còn thiếu: tháng 09/2026 đã duyệt bởi system, tháng 10/2026 chờ duyệt', async () => {
  await store.setSheet('worker', '2026-09', { [SEP_LEAVE]: { kind: 'leave' } }, null, null);
  await store.setSheet('worker', '2026-10', { [LEAVE]: { kind: 'leave' } }, null, null);
  assert.equal((await rowsOf('worker')).length, 0);
  const r = await call('PUT', '/holidays', { dates: ['2026-09-02', '2026-10-20'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sep = await rowAt('worker', SEP_LEAVE),
    oct = await rowAt('worker', LEAVE);
  assert.deepEqual([sep.item, sep.status, sep.decided_by], ['leave', 'approved', 'system']);
  assert.deepEqual([oct.item, oct.status, oct.decided_by], ['leave', 'pending', null]);
});

test('Phép năm: PUT /holidays không đặt lại ngày phép đã được Admin duyệt', async () => {
  await saveSheet('worker', { [LEAVE]: { kind: 'leave' } });
  await call('PUT', '/approvals/decide', { action: 'approve', items: refsOf((await queue()).items) });
  const before = await rowAt('worker', LEAVE);
  assert.equal((await call('PUT', '/holidays', { dates: ['2026-10-20'] })).status, 200);
  assert.deepEqual(await rowAt('worker', LEAVE), before);
});

test('Phép năm: đổi loại nhân sự (NV sang CTV) đồng bộ dòng leave còn thiếu của mọi tháng theo cùng mốc 10/2026', async () => {
  await person('mover');
  await store.setSheet('mover', '2026-09', { [SEP_LEAVE]: { kind: 'leave' } }, null, null);
  await store.setSheet('mover', '2026-10', { [LEAVE]: { kind: 'leave' } }, null, null);
  await store.setSheet('mover', '2026-11', { [NOV_LEAVE]: { kind: 'leave' } }, null, null);
  assert.equal((await rowsOf('mover')).length, 0);
  const r = await call('PUT', '/staff/mover', {
    name: 'mover',
    role: 'staff',
    type: 'ctv',
    level: 1,
    startDate: '2026-01-01'
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await store.getStaff('mover')).type, 'ctv');
  const summary = Object.fromEntries(
    (await rowsOf('mover')).map(x => [x.date, `${x.item}:${x.status}:${x.decided_by}`])
  );
  assert.deepEqual(summary, {
    [SEP_LEAVE]: 'leave:approved:system',
    [LEAVE]: 'leave:pending:null',
    [NOV_LEAVE]: 'leave:pending:null'
  });
});

// ================= Di chuyển (sheet_approvals_v3) =================

const LIB_DB = JSON.stringify(path.join(__dirname, '../../lib/db'));
const { wrapScript } = require('../helpers/child-script');
async function runChild(dbPath, script) {
  const out = execFileSync(process.execPath, ['--no-warnings=ExperimentalWarning', '-e', wrapScript(script)], {
    env: { ...process.env, DB_PATH: dbPath, SESSION_SECRET: 'approvals-leave-migration' },
    encoding: 'utf8'
  });
  return JSON.parse(await out.trim().split('\n').at(-1));
}
const DUMP = `
  const rows = store.db.prepare('SELECT username, date, item, fingerprint, status, rev, decided_by, note FROM sheet_approvals ORDER BY username, date').all();
  const markers = store.db.prepare("SELECT key FROM settings WHERE key LIKE 'sheet_approvals_v%' ORDER BY key").all().map(r => r.key);
  console.log(JSON.stringify({ rows, markers }));
`;
const summaryOf = rows => Object.fromEntries(rows.map(r => [r.date, `${r.item}:${r.status}:${r.decided_by}`]));
const LEGACY = {
  '2026-08': { '2026-08-11': { kind: 'leave' } },
  '2026-09': { [SEP_LEAVE]: { kind: 'leave' }, '2026-09-16': { kind: 'isat' } },
  '2026-10': { [LEAVE]: { kind: 'leave' }, [LEAVE2]: { kind: 'leave' }, '2026-10-17': { kind: 'unpaid' } },
  '2026-11': { [NOV_LEAVE]: { kind: 'leave' } }
};
const PERSON_SQL = `store.upsertStaff({ username: 'worker', name: 'worker', role: 'staff', type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-01', passHash: 'x' });`;
const SHEETS_SQL = `for (const [month, days] of Object.entries(${JSON.stringify(LEGACY)})) store.setSheet('worker', month, days, null, null);`;

// DB đang chạy thật: v1 và v2 đã chạy, các khoản cũ đã có dòng, nhưng chưa có dòng nào cho ngày phép (chưa có khoản thứ bảy)
async function buildProductionDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-leave-'));
  const dbPath = path.join(dir, 'prod.sqlite');
  await runChild(
    dbPath,
    `
    const store = require(${LIB_DB});
    ${PERSON_SQL}
    ${SHEETS_SQL}
    // dòng của khoản cũ (iSAT) như v1 đã tạo; riêng ngày phép 6/10 Admin đã duyệt tay (rev 3) trước khi chạy v3
    store.db.prepare("INSERT INTO sheet_approvals (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at) VALUES ('worker', '2026-09-16', 'isat', 'isat', 'approved', 1, '2026-09-16T00:00:00.000Z', 'system', '2026-10-14T00:00:00.000Z')").run();
    store.db.prepare("INSERT INTO sheet_approvals (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at) VALUES ('worker', '${LEAVE2}', 'leave', 'leave', 'approved', 3, '2026-10-01T00:00:00.000Z', 'admin', '2026-10-02T00:00:00.000Z')").run();
    store.db.prepare("DELETE FROM sheet_approvals WHERE item = 'leave' AND date <> '${LEAVE2}'").run();
    store.db.prepare("DELETE FROM settings WHERE key = 'sheet_approvals_v3'").run();
    console.log('{}');
  `
  );
  return dbPath;
}

sqliteOnly(
  'di chuyển v3 (DB đã chạy v1, v2): ngày phép tháng ≤ 09/2026 đã duyệt bởi system, từ 10/2026 chờ duyệt; dòng cũ giữ nguyên',
  async () => {
    const dbPath = await buildProductionDb();
    const { rows, markers } = await runChild(dbPath, `const store = require(${LIB_DB});${DUMP}`);
    assert.deepEqual(markers.slice(0, 3), ['sheet_approvals_v1', 'sheet_approvals_v2', 'sheet_approvals_v3']); // ba dấu đầu; các dấu v4 trở đi do đợt di chuyển sau
    assert.deepEqual(summaryOf(rows), {
      '2026-08-11': 'leave:approved:system',
      [SEP_LEAVE]: 'leave:approved:system',
      '2026-09-16': 'isat:approved:system',
      [LEAVE]: 'leave:pending:null',
      [LEAVE2]: 'leave:approved:admin', // đã có dòng cùng mục và dấu vân tay: không bị đặt lại
      [NOV_LEAVE]: 'leave:pending:null'
    });
    assert.equal(rows.find(r => r.date === LEAVE2).rev, 3);
    for (const row of rows.filter(r => r.item === 'leave')) assert.equal(row.fingerprint, 'leave', row.date);
    assert.equal(
      rows.find(r => r.date === '2026-10-17'),
      undefined,
      'nghỉ không lương không cần duyệt'
    );
  }
);

sqliteOnly('di chuyển v3: chạy lại không đổi gì, kể cả khi một dòng bị xoá hoặc đã được quyết định lại', async () => {
  const dbPath = await buildProductionDb();
  const first = await runChild(dbPath, `const store = require(${LIB_DB});${DUMP}`);
  const changed = await runChild(
    dbPath,
    `
    const store = require(${LIB_DB});
    store.db.prepare("UPDATE sheet_approvals SET status = 'rejected', rev = 5, decided_by = 'admin', note = 'sai' WHERE date = '${LEAVE}'").run();
    store.db.prepare("DELETE FROM sheet_approvals WHERE date = '${NOV_LEAVE}'").run();
    ${DUMP}
  `
  );
  assert.equal(first.rows.length, 6);
  assert.equal(changed.rows.length, 5);
  assert.deepEqual(await runChild(dbPath, `const store = require(${LIB_DB});${DUMP}`), changed);
  assert.deepEqual(await runChild(dbPath, `const store = require(${LIB_DB});${DUMP}`), changed);
});

sqliteOnly('di chuyển v3: DB cũ chưa từng chạy v1 chạy cả ba đợt, mỗi ngày phép đúng một dòng', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-leave-'));
  const dbPath = path.join(dir, 'legacy.sqlite');
  await runChild(
    dbPath,
    `
    const store = require(${LIB_DB});
    ${PERSON_SQL}
    ${SHEETS_SQL}
    store.db.exec('DROP TABLE IF EXISTS sheet_approvals');
    store.db.exec("DELETE FROM settings WHERE key LIKE 'sheet_approvals_v%'");
    console.log('{}');
  `
  );
  const { rows, markers } = await runChild(dbPath, `const store = require(${LIB_DB});${DUMP}`);
  assert.deepEqual(markers.slice(0, 3), ['sheet_approvals_v1', 'sheet_approvals_v2', 'sheet_approvals_v3']); // ba dấu đầu; các dấu v4 trở đi do đợt di chuyển sau
  assert.deepEqual(summaryOf(rows), {
    '2026-08-11': 'leave:approved:system',
    [SEP_LEAVE]: 'leave:approved:system',
    '2026-09-16': 'isat:approved:system',
    [LEAVE]: 'leave:pending:null',
    [LEAVE2]: 'leave:pending:null',
    [NOV_LEAVE]: 'leave:pending:null'
  });
  assert.equal(rows.length, 6);
});

sqliteOnly('di chuyển v3 trên DB trống: không tạo dòng nào, đặt đủ ba dấu v1, v2, v3', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-leave-'));
  const { rows, markers } = await runChild(path.join(dir, 'empty.sqlite'), `const store = require(${LIB_DB});${DUMP}`);
  assert.deepEqual(rows, []);
  assert.deepEqual(markers.slice(0, 3), ['sheet_approvals_v1', 'sheet_approvals_v2', 'sheet_approvals_v3']); // ba dấu đầu; các dấu v4 trở đi do đợt di chuyển sau
});
