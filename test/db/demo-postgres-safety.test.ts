'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const { testControlUrl } = require('../helpers/postgres-control');

const ROOT = require('node:path').join(__dirname, '..', '..');
const SEED = require('node:path').join(ROOT, 'scripts', 'db', 'seed-demo.ts');

function runSeed(env, args = []) {
  return spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SEED, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: '',
      DB_PATH: undefined,
      PG_TEST_URL: undefined,
      TEST_PG_CONTROL_URL: undefined,
      ...env
    },
    timeout: 30000
  });
}

test('demo seed requires an explicit PostgreSQL target instead of a file or memory database', () => {
  const result = runSeed({ DATABASE_URL: '', DB_PATH: ':memory:' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL.*PostgreSQL/i);
});

test('demo seed refuses a populated target before migration and preserves its data', async () => {
  const temporary = await TemporaryPostgres.create(testControlUrl, 'test');
  const client = new Pool({ connectionString: temporary.url, max: 1 });
  try {
    await client.query('CREATE TABLE user_owned_sentinel (value TEXT NOT NULL)');
    await client.query("INSERT INTO user_owned_sentinel VALUES ('keep')");
    const result = runSeed({ DATABASE_URL: temporary.url }, ['--confirm-demo-db', '--today=not-a-date']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Từ chối.*(trống|mới|đã có)/i);
    assert.equal((await client.query('SELECT value FROM user_owned_sentinel')).rows[0].value, 'keep');
    assert.equal((await client.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
  } finally {
    await client.end();
    await temporary.close();
  }
});

test('demo seed asks for explicit confirmation before connecting to a PostgreSQL target', () => {
  const secret = 'demo-test-secret-never-print';
  const result = runSeed({ DATABASE_URL: `postgres://demo:${secret}@127.0.0.1:1/luong_demo` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--confirm-demo-db/);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});
