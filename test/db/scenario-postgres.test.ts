'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../helpers/require-isolated-database');
const scenarios = require('../../scripts/dev/scenarios/lib/postgres');

const ROOT = path.resolve(__dirname, '../..');
const CHILD = path.join(ROOT, 'scripts/dev/scenarios/lib/postgres-test-child.ts');

function runChild(mode: string, args: string[] = []) {
  const result = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', CHILD, mode, ...args], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    timeout: 120000
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.doesNotMatch(result.stdout + result.stderr, /postgres(?:ql)?:\/\//i);
}

test('scenario commands refuse Windows before creating temporary databases', () => {
  assert.throws(
    () => scenarios.assertScenarioRuntimePlatform('win32'),
    error => error instanceof Error && /Linux, WSL, or macOS/.test(error.message)
  );
  assert.doesNotThrow(() => scenarios.assertScenarioRuntimePlatform('linux'));
  assert.doesNotThrow(() => scenarios.assertScenarioRuntimePlatform('darwin'));
});

test('scenario CLI error stacks redact PostgreSQL URL credentials', () => {
  const secretUrl = 'postgresql://test_user:do-not-print@db.example:5432/luong_scenario_test';
  const error = new Error(`connection failed: ${secretUrl}`);
  error.stack = `Error: connection failed: ${secretUrl}\n    at verifyScenario (verify.ts:1:1)`;
  const output = scenarios.safeErrorText(error);
  assert.match(output, /connection failed/);
  assert.match(output, /\[URL\]/);
  assert.doesNotMatch(output, /test_user|do-not-print|db\.example/);
});

test('scenario control is explicit and cannot fall back to app or legacy test URLs', () => {
  assert.throws(
    () => scenarios.scenarioControlUrl({ DATABASE_URL: 'postgresql://app:secret@db.invalid/app' }),
    error => error instanceof Error && /SCENARIO_PG_CONTROL_URL/.test(error.message) && !/secret|postgresql:\/\//.test(error.message)
  );
  assert.throws(
    () => scenarios.scenarioControlUrl({ PG_TEST_URL: 'postgresql://test:secret@db.invalid/luong_test_control' }),
    /SCENARIO_PG_CONTROL_URL/
  );
});

test('scenario control accepts only a PostgreSQL test or scenario control database', () => {
  for (const name of ['luong_test_control', 'luong_scenario_control']) {
    const value = `postgresql://user:secret@db.invalid/${name}`;
    assert.equal(scenarios.scenarioControlUrl({ SCENARIO_PG_CONTROL_URL: value }), value);
  }
  for (const value of [
    'postgresql://user:secret@db.invalid/app',
    'postgresql://user:secret@db.invalid/luong_sandbox_control',
    'http://db.invalid/luong_test_control'
  ]) {
    assert.throws(
      () => scenarios.scenarioControlUrl({ SCENARIO_PG_CONTROL_URL: value }),
      error => error instanceof Error && /control/i.test(error.message) && !/secret|postgresql:\/\//.test(error.message)
    );
  }
});

test('scenario snapshots must stay under the scenario output directory', () => {
  const root = scenarios.OUT;
  assert.equal(scenarios.snapshotPath(path.join(root, 'scenario-year.pgbak.gz')), path.join(root, 'scenario-year.pgbak.gz'));
  assert.throws(() => scenarios.snapshotPath(path.resolve(root, '..', 'app.pgbak.gz')), /out/);
  assert.throws(() => scenarios.snapshotPath(path.join(root, 'scenario-year.sqlite')), /pgbak\.gz/);
});

test('scenario startup cannot use DATABASE_URL or legacy PG_TEST_URL as its control URL', () => {
  assert.throws(() => scenarios.scenarioControlUrl({ DATABASE_URL: process.env.DATABASE_URL }), /SCENARIO_PG_CONTROL_URL/);
  assert.throws(() => scenarios.scenarioControlUrl({ PG_TEST_URL: process.env.TEST_PG_CONTROL_URL }), /SCENARIO_PG_CONTROL_URL/);
});

test('scenario PostgreSQL smoke covers owned cleanup, snapshot restore, and source immutability', () => {
  runChild('snapshot');
});

test('failed scenario restore removes only its newly-created temporary database', () => {
  runChild('failed-restore');
});

test('scenario temporary database is dropped after callback failure', () => {
  runChild('callback-failure');
});
