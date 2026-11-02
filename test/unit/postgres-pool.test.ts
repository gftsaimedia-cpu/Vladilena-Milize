'use strict';
// Đường kết nối pg.Pool của PostgresDatabase (máy chủ PostgreSQL thật) kiểm qua giao thức mạng thật: PGlite chạy sau một máy chủ socket
// (@electric-sql/pglite-socket) và PostgresDatabase kết nối bằng DATABASE_URL như với máy chủ thật. Máy chủ socket nhận một kết nối một lúc nên pool = 1.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { PostgresDatabase } = require('../../src/data/postgres-database');

let lite;
let server;
let db;

before(async () => {
  lite = await PGlite.create();
  server = new PGLiteSocketServer({ db: lite, port: 0, host: '127.0.0.1' });
  await server.start();
  const url = `postgresql://postgres:postgres@127.0.0.1:${server.port}/postgres?sslmode=disable`;
  db = new PostgresDatabase({ url, max: 1 });
  await db.ready;
});
after(async () => {
  await db.close();
  await server.stop();
  await lite.close();
});

const addStaff = (username?, name = username) =>
  db
    .prepare('INSERT INTO staff (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(username, name, 'x', '2026-10-31T00:00:00.000Z');

test('pool: migration đã chạy qua giao thức mạng, dữ liệu gieo sẵn và trigger uuid hoạt động', async () => {
  assert.equal(db.concurrent, true, 'pool: mỗi giao dịch một kết nối, không cần hàng đợi giao dịch');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM settings').get()).n, 12);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).n, 4);
  await addStaff('pool_a');
  assert.match((await db.prepare('SELECT uuid FROM staff WHERE username = ?').get('pool_a')).uuid, /^[0-9a-f-]{36}$/);
});

test('pool: BIGINT trả về dạng số, tham số ? được dịch sang $n', async () => {
  const run = await db.prepare('INSERT INTO benefit_types (code) VALUES (?)').run('pool_kind');
  assert.equal(run.changes, 1);
  const row = await db.prepare('SELECT COUNT(*) AS n FROM benefit_types WHERE code = ?').get('pool_kind');
  assert.equal(typeof row.n, 'number');
  assert.equal(row.n, 1);
});

test('pool: giao dịch hoàn tác khi ném lỗi, SAVEPOINT lồng hoàn tác riêng phần trong', async () => {
  await assert.rejects(
    () =>
      db.runTransaction(async () => {
        await addStaff('pool_rollback');
        throw new Error('hoàn tác');
      }),
    /hoàn tác/
  );
  assert.equal(await db.prepare('SELECT 1 AS ok FROM staff WHERE username = ?').get('pool_rollback'), undefined);

  await db.runTransaction(async () => {
    await addStaff('pool_keep');
    await db.exec('SAVEPOINT inner_1');
    await addStaff('pool_drop');
    await db.exec('ROLLBACK TO inner_1');
    await db.exec('RELEASE inner_1');
  });
  assert.ok(await db.prepare('SELECT 1 AS ok FROM staff WHERE username = ?').get('pool_keep'));
  assert.equal(await db.prepare('SELECT 1 AS ok FROM staff WHERE username = ?').get('pool_drop'), undefined);
});

test('pool: trigger PL/pgSQL báo lỗi qua giao thức mạng với đúng câu báo lỗi', async () => {
  await db
    .prepare(
      "INSERT INTO audit_log (actor, action, entity_kind, entity_id, at, prev_hash, hash) VALUES ('p', 'x', 'k', '1', '2026-10-31T00:00:00Z', '', 'h')"
    )
    .run();
  await assert.rejects(() => db.prepare('DELETE FROM audit_log').run(), /audit_log chỉ được thêm dòng/);
});
