// GET /api/approvals trả limits { decideMax, noteMax }: màn Duyệt cắt lô và đặt độ dài ô lý do theo số của máy chủ, không chép tay.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  paramsStore = require('../../src/params/store'),
  { DEFAULTS } = require('../../src/engine/payroll-params'),
  server = require('../helpers/server');

let base, cookie;
async function call(method?, url?) {
  const r = await fetch(base + url, { method, headers: { Cookie: cookie } });
  return { status: r.status, data: (await r.json().catch(() => ({}))) as any };
}

before(async () => {
  await store.upsertStaff({
    username: 'boss',
    name: 'Sếp',
    role: 'admin',
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
    body: JSON.stringify({ username: 'boss', password: 'test-pass' })
  });
  cookie = login.headers.get('set-cookie').split(';')[0];
});
after(() => {
  server.closeAllConnections();
  server.close();
});

test('limits: số khoản tối đa mỗi lần duyệt lấy từ tham số hệ thống, độ dài lý do từ control.reasonMaxLength', async () => {
  const res = await call('GET', '/api/approvals?status=pending');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { params } = await paramsStore.resolve('2026-10');
  assert.equal(res.data.limits.decideMax, params['system.approval.maxDecideItems']);
  assert.equal(res.data.limits.noteMax, DEFAULTS['control.reasonMaxLength']);
  assert.ok(Number.isInteger(res.data.limits.decideMax) && res.data.limits.decideMax > 0);
  assert.ok(Number.isInteger(res.data.limits.noteMax) && res.data.limits.noteMax > 0);
});
