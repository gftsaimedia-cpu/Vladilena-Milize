// Đường ĐỌC không được ghi DB. src/domain/attendance/index.ts → closeStaleFor lọc bằng SQL
// (state='open' + presIn trước mốc punch.staleBefore) nên chỉ mở một giao dịch cho người THẬT SỰ quá hạn 16 giờ.
// Test đếm SAVEPOINT/RELEASE: người có lượt mở chưa quá hạn (kể cả vừa Check-in 1 phút) không mở giao dịch nào.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'qa-doc-cham-cong-khong-ghi';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

const realNow = Date.now;
let base,
  clock = Date.parse('2026-10-07T10:00:00+07:00');
const at = (iso?) => (clock = Date.parse(iso + '+07:00'));
// Đếm số lần mở giao dịch (store.transaction = một SAVEPOINT/RELEASE) trong một lời gọi API
let opened = 0;
const realTransaction = store.transaction;
store.transaction = (fn?) => {
  opened += 1;
  return realTransaction(fn);
};
async function call(user?, method?, route?) {
  const r = await fetch(base + '/api' + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: auth.cookieHeader(await auth.createSession(user), 86400)
    }
  });
  return { status: r.status, data: (await r.json()) as any };
}
const openSession = (username?, presIn?) =>
  store.createSession(username, '2026-10-07', 'open', {
    kind: 'pending',
    reason: 'open',
    src: 'punch',
    presIn,
    plannedShift: { code: 'n1', date: '2026-10-07', in: '08:00', out: '17:00' }
  });

before(async () => {
  Date.now = () => clock;
  await store.upsertStaff({
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: auth.hashPassword('test-pass')
  });
  for (const username of ['moi', 'cu', 'khong'])
    await store.upsertStaff({
      username,
      name: username,
      role: 'staff',
      type: 'nv',
      level: 1,
      shiftCode: 'n1',
      passHash: auth.hashPassword('test-pass')
    });
  // 'moi' vừa Check-in 1 giờ trước (chưa quá hạn), 'cu' mở 20 giờ trước (quá hạn 16 giờ), 'khong' không có lượt nào
  await openSession('moi', new Date(clock - 60 * 60 * 1000).toISOString());
  await openSession('cu', new Date(clock - 20 * 60 * 60 * 1000).toISOString());
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  store.transaction = realTransaction;
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(r => server.close(r));
});

test('GET /attendance chỉ mở giao dịch cho người thật sự quá hạn: 2 người đang mở → 1 giao dịch (trước khi sửa là 2)', async () => {
  opened = 0;
  const r = await call('admin', 'GET', '/attendance?month=2026-10');
  assert.equal(r.status, 200);
  assert.equal(opened, 1, `số giao dịch phải bằng số lượt quá hạn (1), thực tế ${opened}`);
  const rows = r.data.rows.filter(s => ['moi', 'cu'].includes(s.username));
  assert.equal(rows.length, 2, 'phản hồi vẫn có cả hai lượt');
  const cu = rows.find(s => s.username === 'cu'),
    moi = rows.find(s => s.username === 'moi');
  assert.equal(cu.state, 'closed', 'lượt quá hạn được đóng như trước');
  assert.equal(cu.entry.reason, 'forgot-out');
  assert.equal(moi.state, 'open', 'lượt chưa quá hạn giữ nguyên');
  assert.equal(moi.version, 1, 'lượt chưa quá hạn không bị ghi (version không đổi)');
  assert.equal((await store.listSessions({ username: 'cu' })).length, 1);
  assert.equal((await store.openSession('moi')).id, moi.id);
});

test('GET /today khi không còn ai quá hạn: 0 giao dịch (đường đọc không ghi DB)', async () => {
  opened = 0;
  const r = await call('admin', 'GET', '/today');
  assert.equal(r.status, 200);
  assert.equal(opened, 0, `không ai quá hạn thì không mở giao dịch nào, thực tế ${opened}`);
  assert.ok(r.data.rows.some(row => row.username === 'moi' && row.open === true));
});

test('staleBefore của punch là đúng ranh giới forgotOut: trước mốc quá hạn, đúng mốc thì chưa', () => {
  const P = require('../../src/engine/punch');
  const now = new Date(clock).toISOString(),
    cutoff = P.staleBefore(now);
  assert.equal(P.forgotOut(cutoff, now), false);
  assert.equal(P.forgotOut(new Date(Date.parse(cutoff) - 60000).toISOString(), now), true);
});
