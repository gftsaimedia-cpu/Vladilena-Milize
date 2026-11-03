// GET /api/punch trả shiftConfig cho nhân viên (họ không có config.read nên không đọc được /api/settings/shifts): giờ từng ca và hai ngưỡng
// Check-in lấy từ tham số của tháng, để màn nhân viên không phải chép tay các con số này.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  paramsStore = require('../../src/params/store'),
  { rulesFor } = require('../../src/platform/request-rules'),
  server = require('../helpers/server');

let base, cookie;
const clock = Date.parse('2026-10-07T07:55:00+07:00');
const realNow = Date.now;
async function call(method?, url?) {
  const r = await fetch(base + url, { method, headers: { Cookie: cookie } });
  return { status: r.status, data: (await r.json().catch(() => ({}))) as any };
}

before(async () => {
  Date.now = () => clock;
  await store.upsertStaff({
    username: 'an',
    name: 'An',
    role: 'staff',
    type: 'nv',
    level: 1,
    nightPct: 40,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    passHash: auth.hashPassword('test-pass')
  });
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'an', password: 'test-pass' })
  });
  cookie = login.headers.get('set-cookie').split(';')[0];
});
after(() => {
  Date.now = realNow;
  server.closeAllConnections();
  server.close();
});

test('shiftConfig: nhân viên (không có config.read) nhận giờ sáu ca và hai ngưỡng Check-in từ tham số của tháng', async () => {
  const denied = await call('GET', '/api/settings/shifts?month=2026-10');
  assert.equal(denied.status, 403, 'nhân viên vẫn không đọc được /api/settings/shifts');

  const punch = await call('GET', '/api/punch');
  assert.equal(punch.status, 200, JSON.stringify(punch.data));
  const cfg = punch.data.shiftConfig;
  assert.ok(cfg && typeof cfg === 'object', 'có shiftConfig');

  const hours = (await rulesFor('2026-10')).punch.SHIFT;
  // shiftConfig đặt khoá theo mã ca Normal1 …; bảng giờ của tham số khoá theo mã ngắn (n1 …)
  const canon = async (code?) => (await rulesFor('2026-10')).punch.canonicalOf(code);
  assert.deepEqual(Object.keys(cfg.shifts).sort(), (await Promise.all(Object.keys(hours).map(canon))).sort());
  for (const [preset, [start, end]] of Object.entries<any>(hours)) {
    const code = await canon(preset);
    assert.deepEqual(
      { start: cfg.shifts[code].start, end: cfg.shifts[code].end },
      { start, end },
      `giờ ca ${code} khớp tham số`
    );
  }
  assert.equal(cfg.shifts.Normal1.name, 'Normal 1');

  const { params } = await paramsStore.resolve('2026-10');
  assert.equal(cfg.earlyCheckinHours, params['attendance.earlyCheckinMaxHours']);
  assert.equal(cfg.openSessionMaxHours, params['attendance.openSessionMaxHours']);
  assert.ok(Number.isFinite(cfg.earlyCheckinHours) && Number.isFinite(cfg.openSessionMaxHours));
});
