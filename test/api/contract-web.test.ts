// Hợp đồng giữa máy chủ và giao diện Vue (web/): mỗi endpoint giao diện đọc phải còn các trường nó dùng, đúng kiểu, và không lộ trường nội bộ.
// Chỉ kiểm hình dạng (tên trường, kiểu), không kiểm giá trị nghiệp vụ; muốn đổi tên hay kiểu một trường ở đây thì phải sửa giao diện cùng lúc.
// Bảng trường là các trường giao diện đọc ở /me, /punch, /sheet, /me/estimate, /advance-requests, /alerts, /approvals/count.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');

const MONTH = '2026-10';
const FORBIDDEN_KEYS = ['passHash', 'pass_hash', 'sessionVersion', 'session_version', 'password'];
const realNow = Date.now;
let base, staffCookie, adminCookie;

const get = async (cookie?, url?) => {
  const r = await fetch(base + url, { headers: { Cookie: cookie } });
  return { status: r.status, data: (await r.json().catch(() => null)) as any };
};
const cookieOf = async (username?) =>
  (
    await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'test-pass' })
    })
  ).headers
    .get('set-cookie')
    .split(';')[0];

// spec: { trường: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any' | { ...lồng nhau } }; kiểu thêm '?' ở cuối = cho phép null
async function check(data?, spec?, path = '') {
  for (const [key, want] of Object.entries<any>(spec)) {
    const here = `${path}${key}`;
    assert.ok(Object.hasOwn(data, key), `thiếu trường ${here}`);
    const value = data[key];
    if (typeof want === 'object') {
      assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${here} phải là object`);
      await check(value, want, here + '.');
      continue;
    }
    const nullable = want.endsWith('?'),
      kind = nullable ? want.slice(0, -1) : want;
    if (value === null && nullable) continue;
    if (kind === 'any') continue;
    if (kind === 'array') assert.ok(Array.isArray(value), `${here} phải là mảng`);
    else if (kind === 'object')
      assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${here} phải là object`);
    else assert.equal(typeof value, kind, `${here} phải là ${kind}, nhận ${JSON.stringify(value)}`);
  }
}
// Không trường nội bộ nào ở bất kỳ độ sâu nào của phản hồi
function assertNoInternals(value?, path = '$') {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoInternals(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries<any>(value)) {
    assert.ok(!FORBIDDEN_KEYS.includes(key), `${path}.${key} là trường nội bộ, không được gửi cho giao diện`);
    assertNoInternals(v, `${path}.${key}`);
  }
}
async function contract(cookie?, url?, spec?) {
  const r = await get(cookie, url);
  assert.equal(r.status, 200, `${url}: ${JSON.stringify(r.data)}`);
  await check(r.data, spec);
  assertNoInternals(r.data);
  return r.data;
}

before(async () => {
  Date.now = () => Date.parse('2026-10-07T07:55:00+07:00');
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
    }
  ])
    await store.upsertStaff({ ...s, passHash: auth.hashPassword('test-pass') });
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  staffCookie = await cookieOf('an');
  adminCookie = await cookieOf('admin');
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error?: Error) => (error ? reject(error) : resolve())));
  await store.db.close();
});

test('hợp đồng GET /api/me: phiên, năng lực, quyền lợi theo chức vụ', async () => {
  const me = await contract(staffCookie, '/api/me', {
    user: { username: 'string', name: 'string', role: 'string' },
    serverNow: 'string',
    roles: 'array',
    caps: 'array',
    payrollSubject: 'boolean',
    holidays: 'array',
    benefits: 'object',
    positionLabel: 'string',
    geofenceRequired: 'boolean'
  });
  assert.ok(
    Number.isFinite(Date.parse(me.serverNow)),
    'serverNow là thời điểm hợp lệ (giao diện đồng bộ đồng hồ theo đó)'
  );
});

test('hợp đồng GET /api/punch: trạng thái Check-in/out, quy tắc phút trừ và cấu hình ca', async () => {
  await contract(staffCookie, '/api/punch', {
    canCheckIn: 'boolean',
    openSession: 'any',
    lastSession: 'any',
    serverNow: 'string',
    cutRule: { graceMin: 'number', stepMin: 'number', shiftWorkMin: 'number', rounding: 'string', table: 'array' },
    shiftConfig: { shifts: 'object', earlyCheckinHours: 'number', openSessionMaxHours: 'number' },
    checkoutPreview: 'any'
  });
});

test('hợp đồng GET /api/sheet: lịch đã khai, duyệt, phiên chấm công, báo cáo từng ngày, rev', async () => {
  const sheet = await contract(staffCookie, `/api/sheet?month=${MONTH}`, {
    days: 'object',
    kpiPct: 'number?',
    kpiAmt: 'number?',
    rev: 'number',
    attendanceSessions: 'array',
    otherLeave: 'array',
    neighbors: 'object',
    approvals: 'object',
    corrections: 'array',
    kpiWeights: { wework: 'number', user: 'number', peer: 'number', manager: 'number', self: 'number' },
    kpiParts: { complete: 'boolean' },
    leaveBalance: 'object',
    actualReport: { report: 'object', missing: 'array', absent: 'array' },
    cutRule: 'object'
  });
  assert.ok(Number.isInteger(sheet.rev) && sheet.rev >= 0, 'rev là số nguyên không âm (gửi lại làm expectedRev)');
});

test('hợp đồng GET /api/me/estimate: kỳ lương, phiếu ước tính', async () => {
  await contract(staffCookie, `/api/me/estimate?month=${MONTH}`, {
    month: 'string',
    period: { status: 'string' },
    estimate: 'boolean',
    official: 'boolean',
    m: 'object',
    net: 'object'
  });
});

test('hợp đồng GET /api/advance-requests: mức tối đa, điều kiện, danh sách yêu cầu', async () => {
  await contract(staffCookie, `/api/advance-requests?month=${MONTH}`, {
    month: 'string',
    cap: 'number',
    granted: 'number',
    remaining: 'number',
    eligible: 'boolean',
    items: 'array'
  });
});

test('hợp đồng khung Admin: GET /api/alerts và GET /api/approvals/count', async () => {
  await contract(adminCookie, `/api/alerts?month=${MONTH}`, { missingPunches: 'array', pendingApprovals: 'number' });
  await contract(adminCookie, '/api/approvals/count', { pending: 'number' });
});

test('hợp đồng: nhân viên không đọc được /api/alerts của Admin (giao diện chỉ gọi khi có quyền)', async () => {
  const r = await get(staffCookie, `/api/alerts?month=${MONTH}`);
  assert.ok([401, 403].includes(r.status), `nhận ${r.status}`);
});
