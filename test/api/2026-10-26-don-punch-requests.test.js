// Dọn bảng punch_requests (~3,7 KB/dòng, 2 dòng/người/ngày).
// lib/attendance-sessions.js → purgePunchRequests(olderThanDays) chạy trong store.transaction, xoá theo created_at;
// server.js gọi một lần lúc khởi động rồi mỗi config.PUNCH_REQUEST_PURGE_MS (chỉ khi require.main === module).
// CHỈ xoá bản ghi cũ hơn hạn.
process.env.DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../../lib/db');
const config = require('../../lib/config');
const { DEFAULTS } = require('../../public/payroll-params.js');

const realExec = store.db.exec;
const rowCount = () => store.db.prepare('SELECT COUNT(*) AS n FROM punch_requests').get().n;
const addRow = (requestId, createdAt) => {
  store.savePunchRequest('qa_nv1', requestId, '{"type":"in","sessionId":null}', null, { ok: true });
  store.db.prepare('UPDATE punch_requests SET created_at=? WHERE request_id=?').run(createdAt, requestId);
};

test('purgePunchRequests chỉ xoá bản ghi cũ hơn hạn, giữ bản ghi mới và bản ghi chưa có created_at; chạy trong MỘT giao dịch', () => {
  const day = DEFAULTS['unit.msPerDay'];
  const iso = msAgo => new Date(Date.now() - msAgo).toISOString();
  addRow('cu-40-ngay', iso(40 * day));
  addRow('moi-1-ngay', iso(1 * day));
  // Bản ghi created_at NULL (chưa biết tuổi): không bao giờ bị xoá
  store.db
    .prepare('INSERT INTO punch_requests(username,request_id,operation,session_id,response_json) VALUES(?,?,?,?,?)')
    .run('qa_nv1', 'cu-chua-co-ngay', '{"type":"in","sessionId":null}', null, '{}');
  assert.equal(rowCount(), 3);

  let opened = 0;
  // store.transaction của lib/db dựng bằng SAVEPOINT/RELEASE: đếm qua db.exec để thấy cả đợt dọn nằm trong một giao dịch
  store.db.exec = sql => {
    if (/^\s*SAVEPOINT/i.test(String(sql))) opened += 1;
    return realExec.call(store.db, sql);
  };
  try {
    const removed = store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
    assert.equal(opened, 1, 'cả đợt dọn nằm trong đúng một giao dịch');
    assert.equal(removed, 1, 'chỉ xoá đúng bản ghi quá hạn');
  } finally {
    store.db.exec = realExec;
  }
  const left = store.db.prepare('SELECT request_id FROM punch_requests ORDER BY request_id').all().map(r => r.request_id);
  assert.deepEqual(left, ['cu-chua-co-ngay', 'moi-1-ngay']);
});

test('purgePunchRequests từ chối số ngày không hợp lệ (không xoá gì)', () => {
  const before = rowCount();
  for (const bad of [0, -1, NaN, 'ba muoi', undefined, null])
    assert.throws(() => store.purgePunchRequests(bad), /số ngày lớn hơn 0/, String(bad));
  assert.equal(rowCount(), before);
});

test('hạn giữ punch_requests LỚN HƠN cửa sổ thử lại của phía khách, nếu không sẽ chấm công hai lần', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../public/nhan-vien/punch.js'), 'utf8');
  const ttlMs = Number(/const ATTEMPT_TTL_MS = ([^;]+);/.exec(source)?.[1]?.trim().split('*').map(Number).reduce((a, b) => a * b));
  assert.ok(ttlMs > 0, 'punch.js phải có hằng ATTEMPT_TTL_MS');
  const keepMs = config.PUNCH_REQUEST_KEEP_DAYS * DEFAULTS['unit.msPerDay'];
  assert.ok(keepMs > ttlMs, `hạn giữ (${keepMs} ms) phải lớn hơn cửa sổ thử lại (${ttlMs} ms)`);
  assert.ok(config.PUNCH_REQUEST_PURGE_MS > 0, 'nhịp dọn phải là số dương');
});

test('punch_requests có cột created_at và savePunchRequest ghi thời điểm (để dọn theo tuổi)', () => {
  const columns = store.db.prepare('PRAGMA table_info(punch_requests)').all().map(c => c.name);
  assert.ok(columns.includes('created_at'), 'thiếu cột created_at');
  store.savePunchRequest('qa_nv2', 'co-ngay-0001', '{"type":"in","sessionId":null}', null, {});
  const row = store.db.prepare("SELECT created_at FROM punch_requests WHERE request_id='co-ngay-0001'").get();
  assert.ok(Number.isFinite(Date.parse(row.created_at)), `created_at phải là ISO: ${row.created_at}`);
});
