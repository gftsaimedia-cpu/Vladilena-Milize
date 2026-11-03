'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');
const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const { testControlUrl } = require('../helpers/postgres-control');

const ROOT = path.join(__dirname, '../..');
const SEED = path.join(ROOT, 'scripts/seed.ts');
const seedPassword = 'seed-password-must-not-be-printed';
const adminPassword = 'admin-password-must-not-be-printed';

function runSeed(overrides = {}) {
  return spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SEED], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      DATABASE_URL: '',
      DB_PATH: undefined,
      PG_TEST_URL: undefined,
      SEED_ALLOW_REAL_DB: undefined,
      SEED_PASSWORD: seedPassword,
      ADMIN_PASSWORD: adminPassword,
      ...overrides
    }
  });
}

test('seed requires an explicit PostgreSQL DATABASE_URL and rejects legacy selectors before loading the app', () => {
  const missing = runSeed();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /DATABASE_URL.*PostgreSQL/i);

  const invalid = runSeed({ DATABASE_URL: 'http://not-postgres.invalid/db', SEED_ALLOW_REAL_DB: '1' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /DATABASE_URL.*PostgreSQL/i);

  const dbPath = runSeed({ DATABASE_URL: 'postgres://seed:secret@127.0.0.1:1/seed', DB_PATH: ':memory:' });
  assert.equal(dbPath.status, 1);
  assert.match(dbPath.stderr, /DB_PATH.*đã bị gỡ/i);
  assert.doesNotMatch(dbPath.stderr, /secret/);

  const pgTestUrl = runSeed({
    DATABASE_URL: 'postgres://seed:secret@127.0.0.1:1/seed',
    PG_TEST_URL: 'postgres://test:secret@127.0.0.1:1/control'
  });
  assert.equal(pgTestUrl.status, 1);
  assert.match(pgTestUrl.stderr, /PG_TEST_URL.*dành riêng cho test/i);
  assert.doesNotMatch(pgTestUrl.stderr, /secret/);
});

test('seed keeps the real-database guard ahead of application imports and never prints passwords', () => {
  const secret = 'connection-secret-must-not-appear';
  const result = runSeed({ DATABASE_URL: `postgres://seed:${secret}@127.0.0.1:1/seed` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SEED_ALLOW_REAL_DB=1/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(seedPassword));
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(adminPassword));
  assert.doesNotMatch(result.stderr, /Chưa chọn cơ sở dữ liệu/);
});

test('seed is idempotent on its own temporary PostgreSQL database', async () => {
  const temporary = await TemporaryPostgres.create(testControlUrl, 'test');
  const pool = new Pool({ connectionString: temporary.url, max: 1 });
  try {
    const first = runSeed({ DATABASE_URL: temporary.url, SEED_ALLOW_REAL_DB: '1' });
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.doesNotMatch(first.stdout + first.stderr, new RegExp(seedPassword));
    assert.doesNotMatch(first.stdout + first.stderr, new RegExp(adminPassword));
    const staff = await pool.query("SELECT count(*)::int AS count FROM staff WHERE username = ANY($1)", [
      ['admin', 'minhanh', 'quocbao', 'thuha', 'giahuy', 'ngoclinh']
    ]);
    assert.equal(staff.rows[0].count, 6);

    const second = runSeed({ DATABASE_URL: temporary.url, SEED_ALLOW_REAL_DB: '1' });
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /thêm 0 tài khoản mẫu/);
    assert.doesNotMatch(second.stdout + second.stderr, new RegExp(seedPassword));
    assert.doesNotMatch(second.stdout + second.stderr, new RegExp(adminPassword));
  } finally {
    await pool.end();
    await temporary.close();
  }
});
