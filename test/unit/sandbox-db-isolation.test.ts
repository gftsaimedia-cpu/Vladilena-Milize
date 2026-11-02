'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

// Execute the actual sandbox startup until it attempts to load the DB. The boundary
// is intercepted before a connection or reset can occur, even if isolation fails.
function environmentAtDatabaseLoad(initial: Record<string, string> = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/dev/sandbox-server.ts'), 'utf8');
  const environment: Record<string, string> = { ...initial };
  const stopped = new Error('database load intercepted');
  let observed: Record<string, string> | undefined;
  const context = {
    process: { env: environment },
    global: {},
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

test('sandbox ignores inherited application and test PostgreSQL URLs', () => {
  const env = environmentAtDatabaseLoad({
    DATABASE_URL: 'postgres://example.invalid/real',
    PG_TEST_URL: 'postgres://example.invalid/test',
    DB_PATH: '/fake/old',
    KEEP_ME: 'yes'
  });
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PG_TEST_URL, undefined);
  assert.equal(env.DB_PATH, ':memory:');
  assert.equal(env.KEEP_ME, 'yes');
});

test('sandbox ignores an inherited PostgreSQL test URL on its own', () => {
  const env = environmentAtDatabaseLoad({ PG_TEST_URL: 'postgres://example.invalid/test' });
  assert.equal(env.PG_TEST_URL, undefined);
  assert.equal(env.DB_PATH, ':memory:');
});

test('sandbox replaces an inherited DB path with its in-memory DB', () => {
  const env = environmentAtDatabaseLoad({ DB_PATH: '/fake/old' });
  assert.equal(env.DB_PATH, ':memory:');
});

test('sandbox uses an in-memory DB when no DB configuration is inherited', () => {
  const env = environmentAtDatabaseLoad();
  assert.equal(env.DB_PATH, ':memory:');
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PG_TEST_URL, undefined);
});
