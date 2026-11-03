'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

test('Windows native is rejected before any temporary database is created', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/test/postgres-runner.ts'), 'utf8');
  let databaseCreated = false;
  const context = {
    process: {
      platform: 'win32',
      argv: ['node', 'postgres-runner.ts', 'fake-test.ts'],
      env: { PG_TEST_URL: 'postgresql://example.invalid/luong_test_control' },
      on() {},
      off() {}
    },
    console: { error() {} },
    URL,
    require(name: string) {
      if (name === '../dev/temporary-postgres')
        return {
          TemporaryPostgres: {
            using() {
              databaseCreated = true;
              throw new Error('unexpected database creation');
            }
          }
        };
      if (name.startsWith('node:')) return require(name);
      throw new Error(`Unexpected module: ${name}`);
    }
  };
  let error: any;
  try {
    vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context, { filename: 'postgres-runner.ts' });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'runner must reject the unsupported platform before starting');
  assert.match(error.message, /WSL|Linux/);
  assert.equal(databaseCreated, false);
});
