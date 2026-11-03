// GET /api/alerts?month=YYYY-MM: việc Admin cần xử lý (quên Check-in/out, khoản chờ duyệt) để giao diện hiện huy hiệu.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');

let base,
  clock = Date.parse('2026-10-07T07:55:00+07:00');
const realNow = Date.now;
async function call(cookie?, method?, url?, body?) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: (await r.json().catch(() => ({}))) as any };
}
const cookieOf = async (u?) =>
  (
    await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: 'test-pass' })
    })
  ).headers
    .get('set-cookie')
    .split(';')[0];
const iso = (s?) => new Date(Date.parse(s + '+07:00')).toISOString();
const alerts = (cookie?, month = '2026-10') => call(cookie, 'GET', `/api/alerts?month=${month}`);

before(async () => {
  Date.now = () => clock;
  for (const s of [
    { username: 'admin', name: 'Admin', role: 'admin', type: 'tts', level: 0 },
    {
      username: 'an',
      name: 'An',
      role: 'staff',
      type: 'nv',
      level: 1,
      nightPct: 40,
      shiftCode: 'n1',
      startDate: '2026-01-05'
    },
    {
      username: 'binh',
      name: 'Bình',
      role: 'staff',
      type: 'nv',
      level: 1,
      nightPct: 40,
      shiftCode: 'n1',
      startDate: '2026-01-05'
    }
  ])
    await store.upsertStaff({ ...s, passHash: auth.hashPassword('test-pass') });
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  Date.now = realNow;
  server.closeAllConnections();
  server.close();
});

test('cảnh báo: chỉ Admin xem được; thiếu hoặc sai tháng thì 400', async () => {
  const adm = await cookieOf('admin'),
    an = await cookieOf('an');
  assert.equal((await alerts(null)).status, 401);
  assert.equal((await alerts(an)).status, 403);
  assert.equal((await call(adm, 'GET', '/api/alerts')).status, 400);
  assert.equal((await alerts(adm, '2026-13')).status, 400);
  assert.equal((await alerts(adm, '26-10')).status, 400);
  const empty = await alerts(adm);
  assert.equal(empty.status, 200);
  const { absentNoExplanation, ...rest } = empty.data; // ngày vắng chưa giải trình: test/api/staff-self-explanation.test.ts
  assert.deepEqual(rest, { missingPunches: [], pendingApprovals: 0 });
  assert.ok(Array.isArray(absentNoExplanation));
});

test('cảnh báo: lượt đang mở chưa quá 16 giờ thì chưa báo', async () => {
  const adm = await cookieOf('admin'),
    an = await cookieOf('an');
  const r = await call(an, 'POST', '/api/punch', { type: 'in', requestId: 'alert-test-in-1' });
  assert.equal(r.status, 200);
  clock = Date.parse('2026-10-07T20:00:00+07:00'); // mở 12 giờ
  assert.deepEqual((await alerts(adm)).data.missingPunches, []);
});

test('cảnh báo: lượt mở quá 16 giờ bị đóng "quên check-out" và Admin được báo', async () => {
  const adm = await cookieOf('admin');
  clock = Date.parse('2026-10-08T00:30:00+07:00'); // mở 16 giờ 35 phút
  const r = await alerts(adm);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.missingPunches, [{ username: 'an', name: 'An', date: '2026-10-07', kind: 'forgot-out' }]);
  assert.equal(await store.openSession('an'), null, 'lượt đã được đóng');
  // gọi lần nữa vẫn đúng một mục, không nhân đôi
  assert.equal((await alerts(adm)).data.missingPunches.length, 1);
  // tháng khác không có
  assert.deepEqual((await alerts(adm, '2026-09')).data.missingPunches, []);
  assert.deepEqual((await alerts(adm, '2026-11')).data.missingPunches, []);
});

test('cảnh báo: ngày quên check-in (chỉ có giờ ra) và ngày quên check-out của tháng đang xem đều được báo, mỗi mục một lần', async () => {
  const adm = await cookieOf('admin');
  clock = Date.parse('2026-10-08T09:00:00+07:00');
  // Chỉ có giờ ra, thiếu giờ vào: Admin xử lý. Dựng thẳng để không phụ thuộc đường bấm của nhân sự.
  await store.createSession('binh', '2026-10-05', 'closed', {
    kind: 'pending',
    reason: 'forgot-in',
    src: 'punch',
    presOut: iso('2026-10-05T17:02:00'),
    plannedShift: {
      code: 'n1',
      date: '2026-10-05',
      in: '08:00',
      out: '17:00',
      startIso: iso('2026-10-05T08:00:00'),
      endIso: iso('2026-10-05T17:00:00')
    }
  });
  const r = (await alerts(adm)).data;
  assert.ok(
    r.missingPunches.some(x => x.username === 'binh' && x.date === '2026-10-05' && x.kind === 'forgot-in'),
    JSON.stringify(r.missingPunches)
  );
  assert.ok(r.missingPunches.some(x => x.username === 'an' && x.date === '2026-10-07' && x.kind === 'forgot-out'));
  assert.deepEqual(
    r.missingPunches.map(x => Object.keys(x).sort().join()),
    r.missingPunches.map(() => 'date,kind,name,username')
  );
  // không có mục trùng (cùng người, ngày, loại), gọi lại vẫn đúng các mục đó
  const keys = r.missingPunches.map(x => `${x.username}|${x.date}|${x.kind}`);
  assert.equal(new Set<any>(keys).size, keys.length);
  assert.deepEqual((await alerts(adm)).data.missingPunches, r.missingPunches);
  // tháng khác không có mục nào
  assert.deepEqual((await alerts(adm, '2026-09')).data.missingPunches, []);
  assert.deepEqual((await alerts(adm, '2026-11')).data.missingPunches, []);
});

test('cảnh báo: pendingApprovals là số khoản chờ Admin duyệt (khớp /approvals/count)', async () => {
  const adm = await cookieOf('admin'),
    an = await cookieOf('an');
  const before = (await alerts(adm)).data.pendingApprovals;
  assert.equal(before, (await call(adm, 'GET', '/api/approvals/count')).data.pending);
  const put = await call(an, 'PUT', '/api/sheet', { month: '2026-10', days: { '2026-10-03': { kind: 'isat' } } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const after = (await alerts(adm)).data.pendingApprovals;
  assert.equal(after, before + 1);
  assert.equal(after, (await call(adm, 'GET', '/api/approvals/count')).data.pending);
});

test('cảnh báo: tài khoản Admin không có mục cảnh báo', async () => {
  const adm = await cookieOf('admin');
  const r = (await alerts(adm)).data;
  assert.ok(!r.missingPunches.some(x => x.username === 'admin'));
});
