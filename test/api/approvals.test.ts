// Khoản tự khai "chờ duyệt" trong Lịch ước tính: quyền, tạo/giữ/đặt lại dòng duyệt khi lưu lịch, duyệt theo lô,
// mốc di chuyển 09/2026 | 10/2026, và hai luồng (Lịch ước tính, Check-in/out) vẫn tách nhau.
process.env.SESSION_SECRET = 'approvals-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const punch = require('../../src/engine/punch');
const ApprovalView = require('../../src/engine/approval-view');
const server = require('../helpers/server');

let base;
// Đồng hồ giả: không phụ thuộc ngày thật. 14/10/2026 12:00 giờ Việt Nam.
const realNow = Date.now;
const CLOCK = Date.parse('2026-10-14T12:00:00+07:00');
const CLOCK_ISO = new Date(CLOCK).toISOString();

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
// who = null: không đăng nhập
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
const allRows = async () => await store.db.prepare('SELECT * FROM sheet_approvals ORDER BY username, date').all();
const snapshot = async () => ({
  approvals: await allRows(),
  timesheets: await store.db.prepare('SELECT * FROM timesheets ORDER BY ctid').all(),
  sessions: await store.db.prepare('SELECT * FROM attendance_sessions ORDER BY ctid').all()
});

// ---------- lịch mẫu tháng 10/2026 (1/10 là Thứ 5; Thứ 7: 3, 10, 17, 24, 31) ----------
const workDay = (more: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', ...more });
const otDay = (extraOut = '19:00', more: any = {}) => workDay({ extraKind: 'ot', extraOut, ...more });
const makeupHoursDay = (extraOut = '19:00', more: any = {}) => workDay({ extraKind: 'makeup', extraOut, ...more });
const ISAT = '2026-10-03';
const APPROVED_LEAVE = '2026-10-05';
const OT = '2026-10-07';
const MAKEUP_HOURS = '2026-10-08';
const INTERN_MAKEUP = '2026-10-09';
// 'worker' (NV) khai bốn loại, 'intern' (TTS) khai giờ làm bù sau ca ở ngày đi làm của mình.
const fourItems = () => ({
  [ISAT]: { kind: 'isat' },
  [APPROVED_LEAVE]: { kind: 'approved' },
  [OT]: otDay(),
  [MAKEUP_HOURS]: makeupHoursDay()
});
const internItems = () => ({ [INTERN_MAKEUP]: makeupHoursDay('20:00') });
const saveSheet = (who?, days?, month = '2026-10', extra: any = {}) =>
  call('PUT', '/sheet', { month, days, ...extra }, who);
const readSheet = (who?, month = '2026-10', user?) =>
  call('GET', `/sheet?month=${month}${user ? '&user=' + user : ''}`, undefined, who);
const approvalsOf = async (who?, month = '2026-10') => (await readSheet(who, month)).data.approvals;
const queue = async (params = '') => {
  const r = await call('GET', '/approvals' + params);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const refsOf = (items?, { only }: any = {}) =>
  items
    .filter(x => !only || only.includes(x.date))
    .map(x => ({ username: x.username, date: x.date, rev: x.rev, fingerprint: x.fingerprint }));
// dấu vân tay trông như thật, để yêu cầu qua bước kiểm dạng và tới bước tìm khoản
const FP_UNKNOWN = 'f'.repeat(64);
const decide = (action?, items?, note?, who = 'admin') =>
  call('PUT', '/approvals/decide', { action, items, ...(note === undefined ? {} : { note }) }, who);
// Khai đủ 5 khoản (4 của 'worker' và giờ làm bù của 'intern'), trả về hàng chờ của cả hai (đã có rev)
async function declareFive() {
  for (const [who, days] of [
    ['worker', fourItems()],
    ['intern', internItems()]
  ]) {
    const r = await saveSheet(who, days);
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return (await queue()).items;
}
const byDate = (items?, date?) => items.find(x => x.date === date);

// ---------- Check-in/out (copy từ holiday-ot-guard.test.ts) ----------
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();
async function attendance(date?, options: any = {}) {
  const code = options.code || 'n1',
    plan = punch.planShift({ shiftCode: code, sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = punch.buildDay(
    { shiftCode: code },
    T(date, options.in || '08:00'),
    T(date, options.out || '21:00'),
    'punch',
    {
      plannedShift: plan,
      approveIncomplete: true
    }
  ).entry;
  return store.createSession(options.username || 'worker', date, 'closed', { ...entry, ...options.entry });
}

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
  await person('other');
  await person('intern', { type: 'tts', level: 1 });
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// ================= Quyền =================

test('chưa đăng nhập: ba route duyệt trả 401', async () => {
  assert.equal((await call('GET', '/approvals', undefined, null)).status, 401);
  assert.equal((await call('GET', '/approvals/count', undefined, null)).status, 401);
  assert.equal((await call('PUT', '/approvals/decide', { action: 'approve', items: [] }, null)).status, 401);
});

test('nhân sự gọi GET /api/approvals và /count: 403', async () => {
  await declareFive();
  assert.equal((await call('GET', '/approvals', undefined, 'worker')).status, 403);
  assert.equal((await call('GET', '/approvals?user=worker', undefined, 'worker')).status, 403);
  assert.equal((await call('GET', '/approvals/count', undefined, 'worker')).status, 403);
});

test('nhân sự tự duyệt khoản của mình: 403, kể cả khi gửi thêm trường status, và khoản vẫn chờ duyệt', async () => {
  const items = await declareFive();
  const before = await snapshot();
  const body = { action: 'approve', status: 'approved', note: 'tự duyệt', items: refsOf(items) };
  const r = await call('PUT', '/approvals/decide', body, 'worker');
  assert.equal(r.status, 403, JSON.stringify(r.data));
  body.items.forEach(x => Object.assign(x, { status: 'approved', decidedBy: 'worker' }));
  assert.equal((await call('PUT', '/approvals/decide', body, 'worker')).status, 403);
  assert.deepEqual(await snapshot(), before, 'không có gì được lưu');
  const sheet = await approvalsOf('worker');
  for (const date of Object.keys(fourItems())) assert.equal(sheet[date].status, 'pending', date);
});

test('nhân sự này duyệt khoản của nhân sự khác: 403', async () => {
  const items = await declareFive();
  const before = await snapshot();
  assert.equal((await decide('approve', refsOf(items), undefined, 'other')).status, 403);
  assert.deepEqual(await snapshot(), before);
});

test('nhân sự không đọc được bảng ước tính của người khác (403), Admin đọc được', async () => {
  await declareFive();
  assert.equal((await readSheet('other', '2026-10', 'worker')).status, 403);
  const asAdmin = await readSheet('admin', '2026-10', 'worker');
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.data.approvals[OT].status, 'pending');
});

test('GET /api/team vẫn chỉ Admin (nhân sự 403)', async () => {
  assert.equal((await call('GET', '/team?month=2026-10', undefined, 'worker')).status, 403);
});

// ================= Không giả mạo =================

test('PUT /sheet với approval/status/rev trong ngày và approvals ở cấp ngoài: lưu bình thường, khoản vẫn chờ duyệt', async () => {
  const days = fourItems();
  for (const date of Object.keys(days))
    Object.assign(days[date], { approval: 'approved', status: 'approved', rev: 9, decidedBy: 'admin' });
  const forged = Object.fromEntries(
    Object.keys(days).map(date => [date, { item: 'ot', status: 'approved', rev: 9, fingerprint: 'x' }])
  );
  const r = await saveSheet('worker', days, '2026-10', { approvals: forged, status: 'approved', approval: 'approved' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const approvals = await approvalsOf('worker');
  assert.deepEqual(Object.keys(approvals).sort(), Object.keys(fourItems()).sort());
  for (const date of Object.keys(approvals)) {
    assert.equal(approvals[date].status, 'pending', date);
    assert.equal(approvals[date].decidedBy, null, date);
  }
  assert.equal((await rowsOf('worker')).length, 4);
  assert.ok((await rowsOf('worker')).every(row => row.status === 'pending' && row.rev === 1 && !row.decided_by));
  const stored = (await store.getSheet('worker', '2026-10')).days;
  assert.equal(stored[OT].status, undefined);
  assert.equal(stored[OT].approval, undefined);
});

test('lưu lịch hai lần liên tiếp cùng nội dung: mỗi mục chỉ một dòng pending, rev giữ 1', async () => {
  await saveSheet('worker', fourItems());
  await saveSheet('worker', fourItems());
  const rows = await rowsOf('worker');
  assert.equal(rows.length, 4);
  assert.ok(rows.every(row => row.status === 'pending' && row.rev === 1));
});

// ================= Tạo, giữ, đặt lại, xoá =================

test('khai 5 loại khoản: mỗi loại thành một dòng chờ duyệt đúng loại, chưa có người duyệt', async () => {
  assert.equal((await saveSheet('worker', fourItems())).status, 200);
  const r = await saveSheet('intern', internItems());
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const approvals = { ...(await approvalsOf('worker')), ...(await approvalsOf('intern')) };
  const expected = {
    [ISAT]: 'isat',
    [APPROVED_LEAVE]: 'approved',
    [OT]: 'ot',
    [MAKEUP_HOURS]: 'makeup_hours',
    [INTERN_MAKEUP]: 'makeup_hours'
  };
  for (const [date, item] of Object.entries<any>(expected)) {
    assert.equal(approvals[date].item, item, date);
    assert.equal(approvals[date].status, 'pending', date);
    assert.equal(approvals[date].rev, 1, date);
    assert.equal(approvals[date].decidedBy, null, date);
    assert.equal(approvals[date].decidedAt, null, date);
    assert.equal(approvals[date].note, null, date);
  }
  assert.equal((await rowsOf('worker')).length, 4);
  assert.equal((await rowsOf('intern')).length, 1);
});

test('ngày đi làm thường, nghỉ phép năm, nghỉ không lương không tạo dòng duyệt; nghỉ sẽ làm bù thì có', async () => {
  const r = await saveSheet('worker', {
    '2026-10-06': workDay(),
    '2026-10-12': {
      kind: 'willmakeup',
      makeupPlans: [{ date: '2026-10-13', from: '17:00', to: '19:00' }]
    },
    '2026-10-17': { kind: 'unpaid' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await approvalsOf('worker'))['2026-10-12'].item, 'willmakeup');
  assert.equal((await approvalsOf('worker'))['2026-10-12'].status, 'pending');
  assert.equal((await rowsOf('worker')).length, 1);
});

test('khoản không có dòng duyệt (ghi thẳng vào DB, không qua PUT /sheet) hiện là chờ duyệt', async () => {
  await store.setSheet('worker', '2026-10', { [OT]: otDay(), [ISAT]: { kind: 'isat' } }, null, null);
  assert.equal((await rowsOf('worker')).length, 0);
  const approvals = await approvalsOf('worker');
  assert.equal(approvals[OT].status, 'pending');
  assert.equal(approvals[ISAT].status, 'pending');
});

test('dòng đã duyệt nhưng lịch bị ghi thẳng vào DB với giờ OT khác: hiện chờ duyệt (dấu vân tay lệch)', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  assert.equal((await decide('approve', refsOf([item]))).status, 200);
  assert.equal((await approvalsOf('worker'))[OT].status, 'approved');
  await store.setSheet('worker', '2026-10', { [OT]: otDay('21:00') }, null, null);
  assert.equal((await approvalsOf('worker'))[OT].status, 'pending');
});

test('Admin xem GET /api/team: mỗi dòng có approvals của người đó', async () => {
  await declareFive();
  const r = await call('GET', '/team?month=2026-10');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const worker = r.data.rows.find(row => row.staff.username === 'worker');
  const other = r.data.rows.find(row => row.staff.username === 'other');
  assert.equal(worker.approvals[OT].item, 'ot');
  assert.equal(worker.approvals[OT].status, 'pending');
  assert.equal(Object.keys(worker.approvals).length, 4);
  const intern = r.data.rows.find(row => row.staff.username === 'intern');
  assert.equal(intern.approvals[INTERN_MAKEUP].item, 'makeup_hours');
  assert.deepEqual(other.approvals, {});
});

test('sau khi duyệt, lưu lại lịch không đổi gì: vẫn đã duyệt, rev không đổi', async () => {
  const items = await declareFive();
  assert.equal((await decide('approve', refsOf(items, { only: [OT, ISAT] }))).status, 200);
  const before = await rowsOf('worker');
  await saveSheet('worker', fourItems());
  assert.deepEqual(await rowsOf('worker'), before);
  const approvals = await approvalsOf('worker');
  assert.equal(approvals[OT].status, 'approved');
  assert.equal(approvals[ISAT].status, 'approved');
  assert.equal(approvals[MAKEUP_HOURS].status, 'pending');
  assert.equal((await approvalsOf('intern'))[INTERN_MAKEUP].status, 'pending');
});

test('duyệt OT 3 giờ rồi sửa còn 2 giờ: về chờ duyệt, rev tăng, người duyệt và lý do bị xoá', async () => {
  await saveSheet('worker', { [OT]: otDay('20:00') });
  const [item] = (await queue('?user=worker')).items;
  assert.equal((await decide('approve', refsOf([item]), 'đúng giờ')).status, 200);
  const approvedRev = (await rowsOf('worker'))[0].rev;
  assert.equal((await saveSheet('worker', { [OT]: otDay('19:00') })).status, 200);
  const [row] = await rowsOf('worker');
  assert.equal(row.status, 'pending');
  assert.ok(row.rev > approvedRev, `rev ${row.rev} phải lớn hơn ${approvedRev}`);
  assert.equal(row.decided_by, null);
  assert.equal(row.decided_at, null);
  assert.equal(row.note, null);
  assert.equal((await approvalsOf('worker'))[OT].status, 'pending');
});

test('duyệt OT rồi tăng giờ OT: cũng về chờ duyệt', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([item]));
  await saveSheet('worker', { [OT]: otDay('20:00') });
  assert.equal((await rowsOf('worker'))[0].status, 'pending');
});

test('duyệt OT rồi chỉ đổi preset hoặc breakMin: vẫn đã duyệt', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([item]));
  const before = await rowsOf('worker');
  assert.equal((await saveSheet('worker', { [OT]: otDay('19:00', { preset: 'n2', breakMin: 30 }) })).status, 200);
  assert.deepEqual(await rowsOf('worker'), before);
  assert.equal((await approvalsOf('worker'))[OT].status, 'approved');
});

test('duyệt OT sau ca rồi chỉ đổi giờ vào: vẫn đã duyệt (phần được trả tiền là 17:00-19:00)', async () => {
  await person('worker', { shiftCode: null }); // chưa gán ca cố định thì mới tự đổi giờ vào được
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([item]));
  assert.equal((await saveSheet('worker', { [OT]: otDay('19:00', { in: '08:30' }) })).status, 200);
  assert.equal((await rowsOf('worker'))[0].status, 'approved');
});

test('duyệt rồi xoá ngày (đổi sang ngày đi làm thường): dòng bị xoá; khai lại thì chờ duyệt, không tự đã duyệt', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([item]));
  await saveSheet('worker', { [OT]: workDay() });
  assert.equal((await rowsOf('worker')).length, 0);
  assert.deepEqual(await approvalsOf('worker'), {});
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [again] = await rowsOf('worker');
  assert.equal(again.status, 'pending');
  assert.equal(again.decided_by, null);
});

test('lưu lịch rỗng xoá hết dòng duyệt của tháng đó, tháng khác không đổi', async () => {
  await saveSheet('worker', { [OT]: otDay() });
  await saveSheet('worker', { '2026-11-07': { kind: 'isat' } }, '2026-11');
  assert.equal((await rowsOf('worker')).length, 2);
  await saveSheet('worker', {});
  assert.deepEqual(
    (await rowsOf('worker')).map(row => row.date),
    ['2026-11-07']
  );
});

test('khoản bị từ chối: lưu lại không đổi thì vẫn bị từ chối (còn lý do); đổi nội dung thì chờ duyệt mới', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  assert.equal((await decide('reject', refsOf([item]), 'thiếu minh chứng')).status, 200);
  await saveSheet('worker', { [OT]: otDay('19:00') });
  let approvals = await approvalsOf('worker');
  assert.equal(approvals[OT].status, 'rejected');
  assert.equal(approvals[OT].note, 'thiếu minh chứng');
  await saveSheet('worker', { [OT]: otDay('20:00') });
  approvals = await approvalsOf('worker');
  assert.equal(approvals[OT].status, 'pending');
  assert.equal(approvals[OT].note, null);
});

test('đổi OT thành làm bù theo giờ trong cùng ngày: dòng mới chờ duyệt với loại mới', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([item]));
  await saveSheet('worker', { [OT]: makeupHoursDay('19:00') });
  const [row] = await rowsOf('worker');
  assert.equal(row.item, 'makeup_hours');
  assert.equal(row.status, 'pending');
});

test('hai khoản khác ngày: duyệt một khoản, khoản kia không đổi', async () => {
  const items = await declareFive();
  assert.equal((await decide('approve', refsOf(items, { only: [OT] }))).status, 200);
  const approvals = { ...(await approvalsOf('worker')), ...(await approvalsOf('intern')) };
  assert.equal(approvals[OT].status, 'approved');
  for (const date of [ISAT, APPROVED_LEAVE, MAKEUP_HOURS, INTERN_MAKEUP])
    assert.equal(approvals[date].status, 'pending', date);
});

test('PUT /sheet với OT vào khung 22h–6h vẫn lưu, kèm cảnh báo SHEET_EXTRA_NIGHT; khoản đã duyệt của ngày đó quay về chờ duyệt', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [item] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([item]));
  const r = await saveSheet('worker', { [OT]: otDay('17:00', { extraIn: '05:30' }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(
    r.data.warnings.some(w => w.code === 'SHEET_EXTRA_NIGHT'),
    JSON.stringify(r.data.warnings)
  );
  const row = (await rowsOf('worker')).find(x => x.date === OT);
  assert.equal(row.status, 'pending');
  assert.equal((await store.getSheet('worker', '2026-10')).days[OT].extraIn, '05:30');
});

// ================= Hàng chờ =================

test('GET /api/approvals mặc định chỉ khoản chờ duyệt, mọi tháng, mọi nhân sự, có counts và sheets', async () => {
  await declareFive();
  await saveSheet('other', { '2026-11-07': { kind: 'isat' } }, '2026-11');
  const data = await queue();
  assert.equal(data.items.length, 6);
  assert.ok(data.items.every(x => x.status === 'pending'));
  assert.deepEqual(data.counts, { pending: 6, approved: 0, rejected: 0 });
  const first = byDate(data.items, OT);
  assert.equal(first.username, 'worker');
  assert.equal(first.item, 'ot');
  assert.equal(first.rev, 1);
  assert.equal(first.declared.extraKind, 'ot');
  assert.equal(first.declared.extraOut, '19:00');
  assert.ok(data.sheets['worker|2026-10']);
  assert.equal(data.sheets['worker|2026-10'].days[OT].extraOut, '19:00');
  assert.ok(data.sheets['other|2026-11']);
});

test('GET /api/approvals lọc theo status, month và user; counts đủ ba trạng thái', async () => {
  const items = await declareFive();
  await saveSheet('other', { '2026-11-07': { kind: 'isat' } }, '2026-11');
  assert.equal((await decide('approve', refsOf(items, { only: [OT] }))).status, 200);
  assert.equal((await decide('reject', refsOf(items, { only: [ISAT] }), 'không đúng thứ 7 làm việc')).status, 200);
  assert.deepEqual(
    (await queue('?status=approved')).items.map(x => x.date),
    [OT]
  );
  assert.deepEqual(
    (await queue('?status=rejected')).items.map(x => x.date),
    [ISAT]
  );
  assert.equal((await queue('?status=all')).items.length, 6);
  assert.equal((await queue('?status=pending')).items.length, 4);
  assert.deepEqual(
    (await queue('?month=2026-11')).items.map(x => `${x.username}|${x.date}`),
    ['other|2026-11-07']
  );
  assert.ok((await queue('?status=all&user=worker')).items.every(x => x.username === 'worker'));
  const counts = (await queue()).counts;
  assert.deepEqual(counts, { pending: 4, approved: 1, rejected: 1 });
});

test('GET /api/approvals?limit=1 trả một mục', async () => {
  await declareFive();
  assert.equal((await queue('?limit=1')).items.length, 1);
});

test('GET /api/approvals với status, month hoặc user sai dạng: 400', async () => {
  assert.equal((await call('GET', '/approvals?status=xyz')).status, 400);
  assert.equal((await call('GET', '/approvals?month=2026-13')).status, 400);
  assert.equal((await call('GET', '/approvals?user=' + encodeURIComponent('Bad User!'))).status, 400);
});

test('hàng chờ không có khoản của tài khoản Admin; duyệt khoản của Admin: 400', async () => {
  await person('admin2', { role: 'admin', type: 'nv', level: 0 });
  assert.equal((await saveSheet('admin2', { [OT]: otDay() })).status, 200);
  const data = await queue('?status=all');
  assert.equal(data.items.length, 0);
  const before = await snapshot();
  const r = await decide('approve', [{ username: 'admin2', date: OT, rev: 1, fingerprint: FP_UNKNOWN }]);
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.deepEqual(await snapshot(), before);
});

test('GET /api/approvals/count đếm khoản chờ duyệt và giảm khi duyệt', async () => {
  const items = await declareFive();
  assert.deepEqual((await call('GET', '/approvals/count')).data, { pending: 5 });
  await decide('approve', refsOf(items, { only: [OT, ISAT] }));
  assert.deepEqual((await call('GET', '/approvals/count')).data, { pending: 3 });
  await decide('reject', refsOf(items, { only: [INTERN_MAKEUP] }), 'sai giờ');
  assert.deepEqual((await call('GET', '/approvals/count')).data, { pending: 2 });
});

// ================= Duyệt / từ chối =================

test('duyệt một khoản: đã duyệt, ghi Admin và thời điểm, rev tăng; nhân sự thấy trạng thái mới', async () => {
  const items = await declareFive();
  const target = byDate(items, OT);
  const r = await decide('approve', refsOf([target]));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ok, true);
  assert.equal(r.data.decided, 1);
  const [row] = (await rowsOf('worker')).filter(x => x.date === OT);
  assert.equal(row.status, 'approved');
  assert.equal(row.decided_by, 'admin');
  assert.equal(row.decided_at, CLOCK_ISO);
  assert.ok(row.rev > target.rev);
  const seen = (await approvalsOf('worker'))[OT];
  assert.equal(seen.status, 'approved');
  assert.equal(seen.decidedBy, 'admin');
  assert.equal(seen.decidedAt, CLOCK_ISO);
});

test('duyệt nhiều khoản của nhiều người trong một lô: tất cả đổi', async () => {
  await declareFive();
  await saveSheet('other', { [OT]: otDay() });
  const items = (await queue()).items;
  const r = await decide('approve', refsOf(items, { only: [OT] }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.decided, 2);
  assert.equal((await rowsOf('worker')).find(x => x.date === OT).status, 'approved');
  assert.equal((await rowsOf('other'))[0].status, 'approved');
  assert.equal((await rowsOf('worker')).filter(x => x.status === 'pending').length, 3);
});

test('duyệt theo lô: một khoản sai rev thì cả lô không lưu (409 APPROVAL_STALE), dù khoản sai ở đầu hay cuối', async () => {
  const items = await declareFive();
  const before = await snapshot();
  for (const position of ['last', 'first']) {
    const refs = refsOf(items, { only: [ISAT, OT, INTERN_MAKEUP] });
    const bad = position === 'last' ? refs.length - 1 : 0;
    refs[bad] = { ...refs[bad], rev: refs[bad].rev + 7 };
    const r = await decide('approve', refs);
    assert.equal(r.status, 409, `${position}: ${JSON.stringify(r.data)}`);
    assert.equal(r.data.code, 'APPROVAL_STALE', position);
    assert.deepEqual(await snapshot(), before, `${position}: không khoản nào được đổi`);
  }
});

test('duyệt đúng lúc nhân sự vừa sửa khoản (rev cũ): 409 APPROVAL_STALE, khoản vẫn là bản mới sửa', async () => {
  await saveSheet('worker', { [OT]: otDay('19:00') });
  const [seen] = (await queue('?user=worker')).items;
  await decide('approve', refsOf([seen]));
  await saveSheet('worker', { [OT]: otDay('20:00') });
  const before = await snapshot();
  const r = await decide('approve', refsOf([seen]));
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.code, 'APPROVAL_STALE');
  assert.deepEqual(await snapshot(), before);
});

test('từ chối không kèm lý do (thiếu, rỗng, chỉ khoảng trắng): vẫn từ chối được, lý do để trống', async () => {
  const items = await declareFive();
  for (const [i, note] of [undefined, '', '   '].entries()) {
    const date = [OT, ISAT, APPROVED_LEAVE][i];
    const r = await decide('reject', refsOf(items, { only: [date] }), note);
    assert.equal(r.status, 200, `${JSON.stringify(note)}: ${JSON.stringify(r.data)}`);
    const row = (await rowsOf('worker')).find(x => x.date === date);
    assert.equal(row.status, 'rejected');
    assert.ok(!row.note, 'không có lý do thì không lưu ghi chú');
  }
});

test('lý do dài hơn 300 ký tự: 400, đúng 300 ký tự thì được', async () => {
  const items = await declareFive();
  const before = await snapshot();
  assert.equal((await decide('reject', refsOf(items, { only: [OT] }), 'x'.repeat(301))).status, 400);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await decide('reject', refsOf(items, { only: [OT] }), 'x'.repeat(300))).status, 200);
});

test('từ chối có lý do: bị từ chối, nhân sự thấy lý do và người từ chối', async () => {
  const items = await declareFive();
  const r = await decide('reject', refsOf(items, { only: [ISAT] }), 'Thứ 7 này công ty làm việc');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const seen = (await approvalsOf('worker'))[ISAT];
  assert.equal(seen.status, 'rejected');
  assert.equal(seen.note, 'Thứ 7 này công ty làm việc');
  assert.equal(seen.decidedBy, 'admin');
});

test('duyệt khoản đang chờ không cần lý do; duyệt có lý do thì lý do được lưu', async () => {
  const items = await declareFive();
  assert.equal((await decide('approve', refsOf(items, { only: [OT] }))).status, 200);
  assert.equal((await decide('approve', refsOf(items, { only: [ISAT] }), 'đã đối chiếu')).status, 200);
  assert.equal((await rowsOf('worker')).find(x => x.date === ISAT).note, 'đã đối chiếu');
});

test('đặt lại đúng trạng thái đang có: 409 APPROVAL_NOOP', async () => {
  const items = await declareFive();
  await decide('approve', refsOf(items, { only: [OT] }));
  await decide('reject', refsOf(items, { only: [ISAT] }), 'sai');
  const now = (await queue('?status=all')).items;
  const before = await snapshot();
  let r = await decide('approve', refsOf(now, { only: [OT] }));
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.code, 'APPROVAL_NOOP');
  r = await decide('reject', refsOf(now, { only: [ISAT] }), 'sai lần nữa');
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.code, 'APPROVAL_NOOP');
  assert.deepEqual(await snapshot(), before);
});

test('đổi quyết định đã đưa ra: đã duyệt sang từ chối và từ chối sang duyệt đều được, lý do tuỳ chọn và được lưu khi có', async () => {
  const items = await declareFive();
  await decide('approve', refsOf(items, { only: [OT] }));
  await decide('reject', refsOf(items, { only: [ISAT] }), 'nhầm ngày');
  const now = (await queue('?status=all')).items;
  // duyệt lại khoản đã bị từ chối, không nói lý do
  assert.equal((await decide('approve', refsOf(now, { only: [ISAT] }))).status, 200);
  assert.equal((await rowsOf('worker')).find(x => x.date === ISAT).status, 'approved');
  // từ chối khoản đã duyệt, có lý do
  assert.equal((await decide('reject', refsOf(now, { only: [OT] }), 'phát hiện giờ sai')).status, 200);
  const rejected = (await rowsOf('worker')).find(x => x.date === OT);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.note, 'phát hiện giờ sai');
});

test('duyệt khoản không tồn tại: 404; không tìm thấy người hay ngày thì không đổi gì', async () => {
  const items = await declareFive();
  const before = await snapshot();
  const missing = await decide('approve', [
    { username: 'worker', date: '2026-10-20', rev: 1, fingerprint: FP_UNKNOWN }
  ]);
  assert.equal(missing.status, 404, JSON.stringify(missing.data));
  const nobody = await decide('approve', [{ username: 'nobody', date: OT, rev: 1, fingerprint: FP_UNKNOWN }]);
  assert.equal(nobody.status, 404, JSON.stringify(nobody.data));
  const mixed = await decide('approve', [
    ...refsOf(items, { only: [OT] }),
    { username: 'worker', date: '2026-10-20', rev: 1, fingerprint: FP_UNKNOWN }
  ]);
  assert.equal(mixed.status, 404, JSON.stringify(mixed.data));
  assert.deepEqual(await snapshot(), before, 'khoản hợp lệ trong cùng lô cũng không được lưu');
});

test('duyệt với dữ liệu sai dạng: 400 và không lưu gì', async () => {
  const items = await declareFive();
  const good = refsOf(items, { only: [OT] })[0];
  const before = await snapshot();
  const bodies = [
    { action: 'approve' },
    { action: 'approve', items: [] },
    { action: 'approve', items: 'worker' },
    { action: 'delete', items: [good] },
    { items: [good] },
    { action: 'approve', items: [good, good] },
    { action: 'approve', items: [{ ...good, date: '2026-13-40' }] },
    { action: 'approve', items: [{ ...good, date: 'hôm nay' }] },
    { action: 'approve', items: [{ ...good, username: 'Bad User!' }] },
    { action: 'approve', items: [{ ...good, rev: 'một' }] },
    { action: 'approve', items: [{ ...good, rev: 1.5 }] },
    { action: 'approve', items: [{ username: good.username, date: good.date }] },
    {
      action: 'approve',
      items: Array.from({ length: 201 }, (_, index) => ({
        username: 'worker',
        date: new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10),
        rev: index + 1
      }))
    }
  ];
  for (const body of bodies) {
    const r = await call('PUT', '/approvals/decide', body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 120) + ' -> ' + JSON.stringify(r.data));
  }
  assert.deepEqual(await snapshot(), before);
});

// ================= Tài khoản bị khoá =================

test('khoá tài khoản giữ nguyên các dòng duyệt và lịch của người đó', async () => {
  await saveSheet('worker', fourItems());
  await saveSheet('other', { [OT]: otDay() });
  const before = await allRows();
  assert.equal(before.length, 5, 'có năm dòng duyệt trước khi khoá');
  assert.equal(await store.lockStaff('worker', 'admin'), true);
  assert.deepEqual(await allRows(), before);
  assert.equal((await store.getSheet('worker', '2026-10')).days[OT].extraOut, '19:00');
});

test('xoá tài khoản (nay là khoá) trên API giữ nguyên các dòng duyệt của người đó', async () => {
  await saveSheet('worker', fourItems());
  const before = await rowsOf('worker');
  assert.equal(before.length, 4, 'có bốn dòng duyệt trước khi xoá');
  const r = await call('PUT', '/staff/worker', { locked: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(await rowsOf('worker'), before);
  assert.ok((await store.getSheet('worker', '2026-10')).days[OT], 'lịch của người đó vẫn còn');
});

// ================= Hai luồng tách nhau =================

async function declareCheckinOt(date?, out = '21:00') {
  const session = await attendance(date);
  let r = await call('POST', '/ot', {
    sessionId: session.id,
    version: 1,
    extraOut: out,
    reason: 'Confirmed extra work'
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return session;
}

test('Check-in/out: khai OT không tạo dòng duyệt; Duyệt OT thực tế ghi OT vào ngày và duyệt khoản của ngày đó', async () => {
  await saveSheet('worker', { [OT]: otDay() });
  const before = await allRows();
  assert.equal(before.length, 1, 'OT của Lịch ước tính có một dòng chờ duyệt');
  const session = await declareCheckinOt('2026-10-08');
  assert.deepEqual(await allRows(), before, 'khai OT Check-in/out');
  const r = await call('PUT', '/ot', { sessionId: session.id, version: 2, action: 'approve' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(
    (await allRows()).filter(row => row.date === OT),
    before,
    'khoản OT khác ngày giữ nguyên'
  );
  const added = (await allRows()).filter(row => row.date === '2026-10-08');
  assert.equal(added.length, 1);
  assert.equal(added[0].item, 'ot');
  assert.equal(added[0].status, 'approved');
  const stored = (await store.getSession(session.id)).entry;
  assert.equal(stored.otReview.ok, true);
  assert.equal(stored.otReview.by, 'admin');
});

test('Check-in/out: từ chối OT thực tế không cần lý do và không đụng sheet_approvals', async () => {
  const session = await declareCheckinOt('2026-10-08');
  const r = await call('PUT', '/ot', { sessionId: session.id, version: 2, action: 'reject' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await allRows()).length, 0);
  assert.equal((await store.getSession(session.id)).entry.otReview.ok, false);
});

test('OT của Check-in/out không hiện trong hàng chờ khai báo và không có trong approvals của lịch ước tính', async () => {
  await declareCheckinOt('2026-10-08');
  assert.equal((await queue('?status=all')).items.length, 0);
  assert.deepEqual(await approvalsOf('worker'), {});
  assert.deepEqual((await call('GET', '/approvals/count')).data, { pending: 0 });
  const ot = await call('GET', '/ot');
  assert.equal(ot.status, 200);
  assert.equal(ot.data.ot.length, 1, 'danh sách Duyệt OT thực tế vẫn thấy lượt này');
});

test('duyệt khoản tự khai không đổi lượt Check-in/out nào và không đổi lịch đã lưu', async () => {
  const session = await declareCheckinOt('2026-10-08');
  await saveSheet('worker', { [OT]: otDay() });
  const [item] = (await queue('?user=worker')).items;
  const before = await snapshot();
  assert.equal((await decide('approve', refsOf([item]))).status, 200);
  const after = await snapshot();
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.timesheets, before.timesheets);
  assert.equal((await store.getSession(session.id)).entry.otReview, undefined, 'OT thực tế vẫn chờ Duyệt OT riêng');
});

test('lưu lịch ước tính không mang trường chấm công vào approvals', async () => {
  await declareCheckinOt('2026-10-08');
  await saveSheet('worker', { [OT]: otDay() });
  const approvals = await approvalsOf('worker');
  assert.deepEqual(Object.keys(approvals), [OT]);
  assert.equal(JSON.stringify(approvals).includes('otReview'), false);
});

// ================= Không đổi các luật khác =================

test('OT rơi vào khung 22h–6h vẫn lưu, kèm cảnh báo SHEET_EXTRA_NIGHT và một dòng chờ duyệt', async () => {
  const r = await saveSheet('worker', { [OT]: otDay('17:00', { extraIn: '05:30' }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(
    r.data.warnings.some(w => w.code === 'SHEET_EXTRA_NIGHT'),
    JSON.stringify(r.data.warnings)
  );
  assert.equal((await rowsOf('worker')).length, 1);
  assert.equal((await rowsOf('worker'))[0].status, 'pending');
});

test('Admin duyệt KPI không đổi trạng thái duyệt của khoản tự khai', async () => {
  await declareFive();
  const before = await allRows();
  await store.setKpiApproval('worker', '2026-10', 80, null); // không có route PUT /api/kpi: dựng bằng store
  assert.deepEqual(await allRows(), before);
});
