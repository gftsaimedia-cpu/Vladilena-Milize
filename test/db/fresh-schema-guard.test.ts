'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { PostgresDatabase } = require('../../src/data/postgres-database');
const { TemporaryPostgres } = require('../../scripts/dev/temporary-postgres');

const { testControlUrl: testUrl } = require('../helpers/postgres-control');
const MARKER = '@schema:luong-postgres-fresh-v1';

// Each case owns a randomly named DB on the explicitly configured test server.
async function withDatabase(run: (context: { url: string; pool: any }) => Promise<void>) {
  await TemporaryPostgres.using(testUrl, 'test', async temporary => {
    const pool = new Pool({ connectionString: temporary.url, max: 2 });
    try {
      await run({ url: temporary.url, pool });
    } finally {
      await pool.end();
    }
  });
}

async function open(url: string) {
  const db = new PostgresDatabase({ url, max: 1 });
  try {
    await db.ready;
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function expectIncompatible(url: string) {
  const db = new PostgresDatabase({ url, max: 1 });
  try {
    await assert.rejects(db.ready, /SCHEMA_INCOMPATIBLE/);
  } finally {
    await db.close();
  }
}

test('an empty database is initialized once and can be reopened', async () => {
  await withDatabase(async ({ url, pool }) => {
    const first = await open(url);
    await first.close();
    const second = await open(url);
    await second.close();
    const migrations = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(
      migrations.rows.map((row: any) => row.name),
      ['0001_baseline.sql', '0002_seed.sql', '0003_advance_approvals.sql', MARKER].sort()
    );
  });
});

test('an unrelated nonempty database is rejected without any schema or data change', async () => {
  await withDatabase(async ({ url, pool }) => {
    await pool.query('CREATE TABLE unrelated_data (value TEXT NOT NULL)');
    await pool.query("INSERT INTO unrelated_data (value) VALUES ('keep')");
    await expectIncompatible(url);
    assert.equal((await pool.query('SELECT value FROM unrelated_data')).rows[0].value, 'keep');
    assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
  });
});

test('a database with a separate user schema is rejected without creating public tables', async () => {
  await withDatabase(async ({ url, pool }) => {
    await pool.query('CREATE SCHEMA legacy');
    await pool.query('CREATE TABLE legacy.staff (username TEXT NOT NULL)');
    await pool.query("INSERT INTO legacy.staff VALUES ('keep')");
    const target = new URL(url);
    target.searchParams.set('options', '-c search_path=legacy,public');
    await expectIncompatible(target.toString());
    assert.equal((await pool.query('SELECT username FROM legacy.staff')).rows[0].username, 'keep');
    assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
  });
});

test('a database containing only a user-defined function is not considered empty', async () => {
  await withDatabase(async ({ url, pool }) => {
    await pool.query('CREATE FUNCTION public.legacy_value() RETURNS INTEGER LANGUAGE SQL AS $$ SELECT 7 $$');
    await expectIncompatible(url);
    assert.equal((await pool.query('SELECT public.legacy_value() AS value')).rows[0].value, 7);
    assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
  });
});

test('runtime connections use the checked public schema even when the URL specifies another search path', async () => {
  await withDatabase(async ({ url }) => {
    const target = new URL(url);
    target.searchParams.set('options', '-c search_path=legacy,public');
    const db = await open(target.toString());
    try {
      const row = await db.prepare('SHOW search_path').get();
      assert.deepEqual(
        row.search_path.split(',').map((part: string) => part.trim()),
        ['public', 'pg_catalog']
      );
    } finally {
      await db.close();
    }
  });
});

test('a legacy database with old migration records is rejected unchanged', async () => {
  await withDatabase(async ({ url, pool }) => {
    await pool.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    await pool.query("INSERT INTO schema_migrations VALUES ('0001_baseline.sql', 'old'), ('0002_seed.sql', 'old')");
    await pool.query('CREATE TABLE legacy_data (value TEXT NOT NULL)');
    await pool.query("INSERT INTO legacy_data VALUES ('keep')");
    await expectIncompatible(url);
    assert.equal((await pool.query('SELECT value FROM legacy_data')).rows[0].value, 'keep');
    const migrations = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(
      migrations.rows.map((row: any) => row.name),
      ['0001_baseline.sql', '0002_seed.sql']
    );
  });
});

test('a database with an unknown migration is rejected without changing its records', async () => {
  await withDatabase(async ({ url, pool }) => {
    const db = await open(url);
    await db.close();
    await pool.query("INSERT INTO schema_migrations (name, applied_at) VALUES ('9999_future.sql', 'future')");
    const before = await pool.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    await expectIncompatible(url);
    const after = await pool.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    assert.deepEqual(after.rows, before.rows);
  });
});

test('migration refuses unexpected old advance documents instead of silently ignoring them', async () => {
  await withDatabase(async ({ url, pool }) => {
    const db = await open(url);
    await db.close();
    await pool.query('DROP TABLE advance_approval_entries, advance_approval_months');
    await pool.query("DELETE FROM schema_migrations WHERE name = '0003_advance_approvals.sql'");
    await pool.query("INSERT INTO settings (key, value_json) VALUES ('advance_approvals_2026-11', '{\"rev\":1}')");
    await expectIncompatible(url);
    assert.equal(
      (await pool.query("SELECT value_json FROM settings WHERE key = 'advance_approvals_2026-11'")).rows[0].value_json,
      '{"rev":1}'
    );
    assert.equal(
      (await pool.query("SELECT to_regclass('public.advance_approval_entries') AS name")).rows[0].name,
      null
    );
    assert.equal(
      (await pool.query("SELECT 1 FROM schema_migrations WHERE name = '0003_advance_approvals.sql'")).rowCount,
      0
    );
  });
});

test('two connections can initialize the same empty database concurrently', async () => {
  await withDatabase(async ({ url, pool }) => {
    const first = new PostgresDatabase({ url, max: 1 });
    const second = new PostgresDatabase({ url, max: 1 });
    try {
      await Promise.all([first.ready, second.ready]);
      const rows = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
      assert.deepEqual(
        rows.rows.map((row: any) => row.name),
        ['0001_baseline.sql', '0002_seed.sql', '0003_advance_approvals.sql', MARKER].sort()
      );
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
