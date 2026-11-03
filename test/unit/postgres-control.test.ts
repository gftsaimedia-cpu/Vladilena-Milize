'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const helper = path.join(root, 'test/helpers/postgres-control.ts');
const safe = 'postgresql://tester:private-password@example.invalid/luong_test_control';

function check(overrides: Record<string, string>) {
  return spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', '--import', 'tsx', '-e', 'require(process.argv[1])', helper],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TEST_PG_CONTROL_URL: '', PG_TEST_URL: '', ...overrides }
    }
  );
}

test('accepts the runner control URL and the temporary legacy test URL', () => {
  assert.equal(check({ TEST_PG_CONTROL_URL: safe }).status, 0);
  assert.equal(check({ PG_TEST_URL: safe }).status, 0);
});

for (const [label, overrides] of [
  ['missing URL', {}],
  ['application DB', { TEST_PG_CONTROL_URL: 'postgresql://tester:private-password@example.invalid/luong_dev' }],
  ['non-PostgreSQL URL', { TEST_PG_CONTROL_URL: 'https://example.invalid/luong_test_control' }],
  [
    'different control URLs',
    { TEST_PG_CONTROL_URL: safe, PG_TEST_URL: 'postgresql://other:private-password@example.invalid/luong_test_control' }
  ]
] as [string, Record<string, string>][]) {
  test(`rejects ${label} without printing secrets`, () => {
    const result = check(overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /control database test/i);
    assert.doesNotMatch(result.stderr, /private-password|postgresql:\/\//);
  });
}
