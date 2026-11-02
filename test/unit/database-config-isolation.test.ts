'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

// Execute the real DB entrypoint, intercepting the adapter before it can open a connection.
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

for (const extra of [{ DB_PATH: ':memory:' }, { PG_TEST_URL: 'postgres://example.invalid/test' }]) {
  test(`rejects DATABASE_URL with ${Object.keys(extra)[0]} before creating an adapter`, () => {
    const secretUrl = 'postgres://private-user:private-password@example.invalid/live';
    const { opened, error } = databaseSelection({ DATABASE_URL: secretUrl, ...extra });
    assert.equal(opened.length, 0, 'no adapter may be constructed from an ambiguous configuration');
    assert.match(error.message, /DATABASE_URL/);
    assert.match(error.message, new RegExp(Object.keys(extra)[0]));
    assert.doesNotMatch(error.message, /private-user|private-password|example\.invalid/);
  });
}

test('single configurations keep their existing selection during the transition', () => {
  for (const [env, expected] of [
    [{ DATABASE_URL: 'postgres://example.invalid/app' }, { url: 'postgres://example.invalid/app' }],
    [{ PG_TEST_URL: 'postgres://example.invalid/test' }, { isolatedFrom: 'postgres://example.invalid/test' }],
    [{ DB_PATH: ':memory:' }, { memory: true }],
    [
      { PG_TEST_URL: 'postgres://example.invalid/test', DB_PATH: ':memory:' },
      { isolatedFrom: 'postgres://example.invalid/test' }
    ],
    [
      { DATABASE_URL: 'postgres://example.invalid/app', DB_PATH: '', PG_TEST_URL: '' },
      { url: 'postgres://example.invalid/app' }
    ]
  ] as any[]) {
    const { opened, error, intercepted } = databaseSelection(env);
    assert.equal(error, intercepted);
    assert.deepEqual(opened, [expected]);
  }
});

test('missing configuration does not create an adapter', () => {
  const { opened, error } = databaseSelection({});
  assert.equal(opened.length, 0);
  assert.match(error.message, /Chưa chọn cơ sở dữ liệu/);
});
