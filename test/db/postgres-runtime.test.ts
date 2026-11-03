'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const store = require('../../src/platform/db');

const suffix = `${process.pid}_${Date.now()}`;
const timestamp = '2026-11-03T00:00:00.000Z';
const insertStaff = async (username: string) =>
  store.db.prepare('INSERT INTO staff (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(username, username, 'x', timestamp);
const exists = async (username: string) =>
  Boolean(await store.db.prepare('SELECT 1 FROM staff WHERE username = ?').get(username));

after(async () => store.db.close());

test('application database uses migrated PostgreSQL data and translates query parameters', async () => {
  assert.equal(store.db.concurrent, true);
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS n FROM settings').get()).n, 12);
  assert.equal((await store.db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name LIKE '000%'").get()).n, 4);
  const saved = await store.db
    .prepare('INSERT INTO staff (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(`adapter_${suffix}`, 'adapter', 'x', timestamp);
  assert.equal(saved.changes, 1);
  const count = await store.db.prepare('SELECT COUNT(*) AS n FROM staff WHERE username = ?').get(`adapter_${suffix}`);
  assert.equal(count.n, 1);
  assert.equal(typeof count.n, 'number');
});

test('append-only audit trigger rejects deletion on PostgreSQL', async () => {
  await store.db
    .prepare(
      'INSERT INTO audit_log (actor, action, entity_kind, entity_id, at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run('pg-runtime', 'pg-runtime.test', 'test', suffix, timestamp, '', 'hash');
  await assert.rejects(() => store.db.prepare('DELETE FROM audit_log WHERE actor = ?').run('pg-runtime'), /audit_log chỉ được thêm dòng/);
});

test('nested transaction rollback preserves the outer transaction on PostgreSQL', async () => {
  const outer = `nested_outer_${suffix}`;
  const inner = `nested_inner_${suffix}`;
  await store.transaction(async () => {
    await insertStaff(outer);
    await assert.rejects(
      () => store.transaction(async () => {
        await insertStaff(inner);
        throw new Error('rollback nested unit');
      }),
      /rollback nested unit/
    );
    assert.equal(await exists(outer), true);
    assert.equal(await exists(inner), false);
  });
  assert.equal(await exists(outer), true);
  assert.equal(await exists(inner), false);
});

test('independent transactions use separate pooled connections and can progress concurrently', async () => {
  const first = `concurrent_first_${suffix}`;
  const second = `concurrent_second_${suffix}`;
  let announceStarted!: () => void;
  let releaseFirst!: () => void;
  const started = new Promise<void>(resolve => (announceStarted = resolve));
  const blocked = new Promise<void>(resolve => (releaseFirst = resolve));
  const firstTransaction = store.transaction(async () => {
    await insertStaff(first);
    announceStarted();
    await blocked;
    await insertStaff(`${first}_tail`);
  });
  await started;
  try {
    await Promise.race([
      store.transaction(async () => insertStaff(second)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('second transaction waited for the first')), 2000))
    ]);
  } finally {
    releaseFirst();
  }
  await firstTransaction;
  assert.equal(await exists(first), true);
  assert.equal(await exists(`${first}_tail`), true);
  assert.equal(await exists(second), true);
});
