'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

// Execute startup only until the real DB module would load, before any connection or reset.
function environmentAtDatabaseLoad(initial: Record<string, string> = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/dev/sandbox-server.ts'), 'utf8');
  const environment: Record<string, string> = { ...initial };
  const stopped = new Error('database load intercepted');
  let observed: Record<string, string> | undefined;
  const context = {
    process: { env: environment },
    global: {},
    URL,
    require(name: string) {
      if (name === '../../src/platform/db') {
        observed = { ...environment };
        throw stopped;
      }
      if (name.startsWith('node:')) return require(name);
      throw new Error(`Unexpected module before sandbox database: ${name}`);
    }
  };
  try {
    vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context, { filename: 'sandbox-server.ts' });
  } catch (error) {
    if (error !== stopped) throw error;
  }
  assert.ok(observed, 'sandbox must reach the intercepted database boundary');
  return observed;
}

const name = 'luong_sandbox_0123456789abcdef01234567';
const valid = {
  SANDBOX_PG_CONTROL_URL: 'postgresql://sandbox:private-password@example.invalid/luong_sandbox_control?sslmode=require',
  SANDBOX_PG_DATABASE_NAME: name,
  DATABASE_URL: `postgresql://sandbox:private-password@example.invalid/${name}?sslmode=require`
};

test('sandbox preserves its generated PostgreSQL URL and clears inherited legacy DB settings', () => {
  const env = environmentAtDatabaseLoad({
    ...valid,
    PG_TEST_URL: 'postgres://example.invalid/real',
    DB_PATH: '/fake/old',
    KEEP_ME: 'yes'
  });
  assert.equal(env.DATABASE_URL, valid.DATABASE_URL);
  assert.equal(env.PG_TEST_URL, '');
  assert.equal(env.DB_PATH, '');
  assert.equal(env.KEEP_ME, 'yes');
});

test('sandbox refuses missing or incorrectly named temporary databases before loading the DB', () => {
  for (const override of [
    { SANDBOX_PG_DATABASE_NAME: '' },
    { SANDBOX_PG_DATABASE_NAME: 'luong_dev' },
    { SANDBOX_PG_DATABASE_NAME: 'luong_sandbox_0123456789abcdef0123456g' },
    { DATABASE_URL: '' },
    { SANDBOX_PG_CONTROL_URL: '' }
  ])
    assert.throws(() => environmentAtDatabaseLoad({ ...valid, ...override }), /sandbox/i);
});

test('sandbox refuses URLs that differ from its control connection or database name', () => {
  for (const override of [
    { SANDBOX_PG_CONTROL_URL: 'postgresql://sandbox:private-password@example.invalid/luong_dev?sslmode=require' },
    { DATABASE_URL: `postgresql://sandbox:private-password@elsewhere.invalid/${name}?sslmode=require` },
    { DATABASE_URL: `postgresql://sandbox:other-password@example.invalid/${name}?sslmode=require` },
    { DATABASE_URL: `postgresql://sandbox:private-password@example.invalid/${name}?sslmode=disable` },
    { DATABASE_URL: 'postgresql://sandbox:private-password@example.invalid/luong_dev?sslmode=require' },
    { DATABASE_URL: `mysql://sandbox:private-password@example.invalid/${name}?sslmode=require` }
  ]) {
    assert.throws(
      () => environmentAtDatabaseLoad({ ...valid, ...override }),
      (error: Error) => {
        assert.match(error.message, /sandbox/i);
        assert.doesNotMatch(error.message, /private-password/);
        return true;
      }
    );
  }
});
