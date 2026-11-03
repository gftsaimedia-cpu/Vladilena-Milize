// Khoá lạc quan của lịch khai: GET /api/sheet trả rev; PUT /api/sheet nhận expectedRev tuỳ chọn (lệch → 409 SHEET_STALE, không ghi gì;
// thiếu → ghi đè không kiểm). rev = số lần lưu lịch khai; Admin duyệt KPI không làm rev tăng.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');

const MONTH = '2026-10';
const DAY = '2026-10-03';
const DECLARED = { [DAY]: { kind: 'isat' } };

let base, cookie;
const clock = Date.parse('2026-10-07T07:55:00+07:00');
const realNow = Date.now;
async function call(method?, url?, body?) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: (await r.json().catch(() => ({}))) as any };
}
const getSheet = async () => (await call('GET', `/api/sheet?month=${MONTH}`)).data;
const putSheet = (days?, expectedRev?) =>
  call('PUT', '/api/sheet', { month: MONTH, days, ...(expectedRev === undefined ? {} : { expectedRev }) });

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

test('rev: chưa lưu gì thì GET /sheet trả rev 0; lưu không kèm expectedRev vẫn được (như trước) và trả rev mới', async () => {
  assert.equal((await getSheet()).rev, 0);
  const put = await putSheet(DECLARED);
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.rev, 1);
  assert.equal((await getSheet()).rev, 1);
});

test('rev: lưu kèm đúng expectedRev thì được và rev tăng; lưu kèm expectedRev cũ thì 409 SHEET_STALE và lịch giữ nguyên', async () => {
  const put = await putSheet({}, 1);
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.rev, 2);

  const stale = await putSheet(DECLARED, 1); // máy khác đã lưu (rev 2), máy này vẫn cầm rev 1
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'SHEET_STALE');
  assert.equal(stale.data.rev, 2, 'báo rev hiện tại để máy khách tải lại');
  const sheet = await getSheet();
  assert.equal(sheet.rev, 2, 'lần lưu bị từ chối không tăng rev');
  assert.equal(sheet.days[DAY], undefined, 'lần lưu bị từ chối không ghi gì');
});

test('rev: tải lại rồi lưu bằng rev mới thì được; không gửi expectedRev vẫn ghi đè (tương thích ngược)', async () => {
  const put = await putSheet(DECLARED, (await getSheet()).rev);
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.rev, 3);
  const overwrite = await putSheet({});
  assert.equal(overwrite.status, 200, JSON.stringify(overwrite.data));
  assert.equal(overwrite.data.rev, 4);
});

test('rev: expectedRev sai kiểu hoặc âm là 400 và không ghi gì', async () => {
  const before = (await getSheet()).rev;
  for (const bad of ['1', -1, 1.5, null]) {
    const put = await putSheet(DECLARED, bad);
    assert.equal(put.status, 400, `expectedRev=${JSON.stringify(bad)}: ${JSON.stringify(put.data)}`);
  }
  assert.equal((await getSheet()).rev, before);
});

test('rev: Admin duyệt KPI (setKpiApproval) không làm rev của lịch khai tăng', async () => {
  const before = (await getSheet()).rev;
  await store.setKpiApproval('an', MONTH, 5000, null);
  assert.equal((await getSheet()).rev, before);
});
