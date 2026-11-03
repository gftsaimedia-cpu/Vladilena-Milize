'use strict';
// Khai ngày "Nghỉ phép năm" vượt số phép còn lại: lịch được lưu (200), không có cảnh báo nào về số phép,
// ngày phép vẫn là khoản chờ duyệt và tính vào phép đã dùng (số dư âm), còn bộ máy lương không xét số dư.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'sheet-leave-over-balance-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base;
const realNow = Date.now;
// 14/10/2026 12:00 giờ Việt Nam (Thứ 4)
const CLOCK = Date.parse('2026-10-14T12:00:00+07:00');
const LEAVE = '2026-10-05', // Thứ 2
  LEAVE2 = '2026-10-06'; // Thứ 3

const person = async (username?, overrides: any = {}) =>
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
async function call(method?, route?, body?, who?) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(who), 86400) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const leaveOf = async (username?) =>
  (await call('GET', '/staff', undefined, 'admin')).data.staff.find(s => s.username === username).leave;

before(async () => {
  Date.now = () => CLOCK;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of ['sheet_approvals', 'timesheets', 'staff', 'settings'])
    await store.db.exec('DELETE FROM ' + table);
  await person('admin', { role: 'admin', type: 'tts', level: 0 });
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

test('NV vào làm 01/09/2026 chỉ có 1 ngày phép: khai 2 ngày phép vẫn lưu được, không cảnh báo số phép, số dư −1', async () => {
  await person('newbie', { startDate: '2026-09-01' });
  const days = { [LEAVE]: { kind: 'leave' }, [LEAVE2]: { kind: 'leave' } };
  const res = await call('PUT', '/sheet', { month: '2026-10', days }, 'newbie');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(
    (res.data.warnings || []).filter(w => /đủ phép|đã được cộng|số dư/i.test(w.message)),
    []
  );
  const saved = (await call('GET', '/sheet?month=2026-10', undefined, 'newbie')).data;
  assert.equal(saved.days[LEAVE].kind, 'leave');
  assert.equal(saved.days[LEAVE2].kind, 'leave');
  const leave = await leaveOf('newbie');
  assert.equal(leave.used, 2);
  assert.equal(leave.balance, leave.total - 2);
  assert.equal(leave.balance, -1);
});
