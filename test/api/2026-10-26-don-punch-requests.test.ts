// Dọn bảng punch_requests (~3,7 KB/dòng, 2 dòng/người/ngày).
// src/domain/attendance/attendance-sessions.ts → purgePunchRequests(olderThanDays) chạy trong store.transaction, xoá theo created_at;
// server.js gọi một lần lúc khởi động rồi mỗi config.PUNCH_REQUEST_PURGE_MS (chỉ khi require.main === module).
// CHỈ xoá bản ghi cũ hơn hạn.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../../src/platform/db');
const config = require('../../src/platform/config');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const realExec = store.db.exec;
const rowCount = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM punch_requests').get()).n;
const addRow = async (requestId?, createdAt?) => {
  await store.savePunchRequest('qa_nv1', requestId, '{"type":"in","sessionId":null}', null, { ok: true });
  await store.db.prepare('UPDATE punch_requests SET created_at=? WHERE request_id=?').run(createdAt, requestId);
};

test('purgePunchRequests chỉ xoá bản ghi cũ hơn hạn, giữ bản ghi mới và bản ghi chưa có created_at; chạy trong MỘT giao dịch', async () => {
  const day = DEFAULTS['unit.msPerDay'];
  const iso = (msAgo?) => new Date(Date.now() - msAgo).toISOString();
  await addRow('cu-40-ngay', iso(40 * day));
  await addRow('moi-1-ngay', iso(1 * day));
  // Bản ghi created_at NULL (chưa biết tuổi): không bao giờ bị xoá
  await store.db
    .prepare('INSERT INTO punch_requests(username,request_id,operation,session_id,response_json) VALUES(?,?,?,?,?)')
    .run('qa_nv1', 'cu-chua-co-ngay', '{"type":"in","sessionId":null}', null, '{}');
  assert.equal(await rowCount(), 3);

  let opened = 0;
  // store.transaction của src/platform/db dựng bằng SAVEPOINT/RELEASE: đếm qua db.exec để thấy cả đợt dọn nằm trong một giao dịch
  // PostgreSQL: giao dịch ngoài cùng là runTransaction (BEGIN … COMMIT), giao dịch lồng mới là SAVEPOINT; đếm cả hai
  const realRun = store.db.runTransaction;
  store.db.runTransaction = async function (...args) {
    opened += 1;
    return await realRun.apply(this, args);
  };
  store.db.exec = async (sql?) => {
    if (/^\s*SAVEPOINT/i.test(String(sql))) opened += 1;
    return await realExec.call(store.db, sql);
  };
  try {
    const removed = await store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
    assert.equal(opened, 1, 'cả đợt dọn nằm trong đúng một giao dịch');
    assert.equal(removed, 1, 'chỉ xoá đúng bản ghi quá hạn');
  } finally {
    store.db.exec = realExec;
    store.db.runTransaction = realRun;
  }
  const left = (await store.db.prepare('SELECT request_id FROM punch_requests ORDER BY request_id').all()).map(
    r => r.request_id
  );
  assert.deepEqual(left, ['cu-chua-co-ngay', 'moi-1-ngay']);
});

test('purgePunchRequests từ chối số ngày không hợp lệ (không xoá gì)', async () => {
  const before = await rowCount();
  for (const bad of [0, -1, NaN, 'ba muoi', undefined, null])
    await assert.rejects(async () => store.purgePunchRequests(bad), /số ngày lớn hơn 0/, String(bad));
  assert.equal(await rowCount(), before);
});

test('punch_requests có cột created_at và savePunchRequest ghi thời điểm (để dọn theo tuổi)', async () => {
  const columns = (
    await store.db
      .prepare(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'punch_requests'"
      )
      .all()
  ).map(c => c.name);
  assert.ok(columns.includes('created_at'), 'thiếu cột created_at');
  await store.savePunchRequest('qa_nv2', 'co-ngay-0001', '{"type":"in","sessionId":null}', null, {});
  const row = await store.db.prepare("SELECT created_at FROM punch_requests WHERE request_id='co-ngay-0001'").get();
  assert.ok(Number.isFinite(Date.parse(row.created_at)), `created_at phải là ISO: ${row.created_at}`);
});
