'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const helper = path.join(root, 'test/helpers/require-isolated-database.ts');
const name = `luong_test_${'a'.repeat(24)}`;
const control = 'postgresql://tester:private-password@example.invalid:5432/luong_test_control?sslmode=require';
const target = `postgresql://tester:private-password@example.invalid:5432/${name}?sslmode=require`;

function check(overrides: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', '--import', 'tsx', '-e', 'require(process.argv[1])', helper],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: target,
        TEST_PG_CONTROL_URL: control,
        TEST_PG_DATABASE_NAME: name,
        PG_TEST_URL: '',
        DB_PATH: '',
        ...overrides
      }
    }
  );
}

test('accepts a runner-owned database on the explicitly configured test server', () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a legacy test control URL without an owned database marker', () => {
  const result = check({ DATABASE_URL: '', TEST_PG_CONTROL_URL: '', TEST_PG_DATABASE_NAME: '', PG_TEST_URL: control });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database test/i);
  assert.doesNotMatch(result.stderr, /private-password|postgresql:\/\//);
});

for (const [label, override] of [
  ['missing marker', { TEST_PG_DATABASE_NAME: '' }],
  [
    'different database',
    { DATABASE_URL: 'postgresql://tester:private-password@example.invalid:5432/luong_dev?sslmode=require' }
  ],
  [
    'different host',
    { DATABASE_URL: `postgresql://tester:private-password@other.invalid:5432/${name}?sslmode=require` }
  ],
  [
    'different credentials',
    { DATABASE_URL: `postgresql://other:private-password@example.invalid:5432/${name}?sslmode=require` }
  ],
  [
    'wrong control database',
    { TEST_PG_CONTROL_URL: 'postgresql://tester:private-password@example.invalid:5432/luong_dev?sslmode=require' }
  ],
  ['inherited DB_PATH', { DB_PATH: '/fake/dev' }],
  ['inherited PG_TEST_URL', { PG_TEST_URL: control }]
] as [string, Record<string, string>][]) {
  test(`rejects ${label} without printing connection secrets`, () => {
    const result = check(override);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /database test/i);
    assert.doesNotMatch(result.stderr, /private-password|postgresql:\/\//);
  });
}
