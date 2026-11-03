'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

function databaseSelection(environment: Record<string, string>) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/platform/db.ts'), 'utf8');
  const opened: any[] = [];
  const intercepted = new Error('adapter constructor intercepted');
  const context = {
    process: { env: { ...environment } },
    require(name: string) {
      if (name === '../data/postgres-database') {
        return {
          PostgresDatabase: class {
            constructor(options: any) {
              opened.push({ ...options });
              throw intercepted;
            }
          }
        };
      }
      if (name.startsWith('node:')) return require(name);
      return {};
    }
  };
  let error: any;
  try {
    vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context, { filename: 'platform/db.ts' });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'entrypoint must either reject the configuration or reach the intercepted adapter');
  return { opened, error, intercepted };
}

for (const legacy of [
  { DB_PATH: ':memory:' },
  { DB_PATH: './data/dev' },
  { PG_TEST_URL: 'postgres://test:password@example.invalid/luong_test_control' }
]) {
  test(`rejects legacy ${Object.keys(legacy)[0]} before constructing a database`, () => {
    const { opened, error } = databaseSelection({ DATABASE_URL: 'postgres://db.example/app', ...legacy });
    assert.equal(opened.length, 0);
    assert.match(error.message, /DB_PATH|PG_TEST_URL/);
    assert.doesNotMatch(error.message, /password|db\.example/);
  });
}

test('rejects legacy variables even when DATABASE_URL is absent', () => {
  for (const legacy of [
    { DB_PATH: ':memory:' },
    { PG_TEST_URL: 'postgres://test:password@example.invalid/luong_test_control' }
  ]) {
    const { opened, error } = databaseSelection(legacy);
    assert.equal(opened.length, 0);
    assert.match(error.message, /DB_PATH|PG_TEST_URL/);
    assert.doesNotMatch(error.message, /password|example\.invalid/);
  }
});

test('accepts DATABASE_URL with empty legacy variables and opens only that URL', () => {
  const url = 'postgres://example.invalid/app';
  const { opened, error, intercepted } = databaseSelection({ DATABASE_URL: url, DB_PATH: '', PG_TEST_URL: '' });
  assert.equal(error, intercepted);
  assert.deepEqual(opened, [{ url }]);
});

test('rejects missing DATABASE_URL without constructing a database', () => {
  const { opened, error } = databaseSelection({});
  assert.equal(opened.length, 0);
  assert.match(error.message, /DATABASE_URL/);
});
