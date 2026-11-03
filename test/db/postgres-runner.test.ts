'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

const { testControlUrl: testUrl } = require('../helpers/postgres-control');
const root = path.resolve(__dirname, '../..');
const runner = path.join(root, 'scripts/test/postgres-runner.ts');
const fixtures = path.join(root, 'test/fixtures/postgres-runner');
const inheritedUrl = 'postgresql://private-user:private-password@example.invalid/live';
let admin: any;

before(() => {
  admin = new Pool({ connectionString: testUrl, max: 1 });
});
after(async () => {
  await admin.end();
});

function launch(files: string[], trace: string, extraEnv: Record<string, string> = {}) {
  const child = spawn(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', '--import', 'tsx', runner, '--concurrency=2', ...files],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: inheritedUrl,
        DB_PATH: '/fake/development',
        PG_TEST_URL: testUrl,
        PG_RUNNER_TRACE: trace,
        NODE_OPTIONS: '',
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const completed = new Promise<{ code: number | null; signal: string | null; output: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, output }));
  });
  return { child, completed };
}

function namesAt(trace: string) {
  if (!fs.existsSync(trace)) return [];
  return fs
    .readFileSync(trace, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => line.split(':')[1]);
}

async function assertRemoved(names: string[]) {
  for (const name of names) {
    assert.match(name, /^luong_test_[0-9a-f]{24}$/);
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount, 0);
  }
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: NodeJS.Timeout;
  try {
    return await Promise.race([
      promise,
      new Promise<null>(resolve => (timer = setTimeout(() => resolve(null), milliseconds)))
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

test('runs files in parallel with distinct DBs and cleans both after success', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  try {
    const { completed } = launch([path.join(fixtures, 'alpha.cjs'), path.join(fixtures, 'beta.cjs')], trace, {
      PG_RUNNER_PEERS: '2'
    });
    const result = await completed;
    assert.equal(result.code, 0, result.output);
    assert.doesNotMatch(result.output, /private-user|private-password/);
    const names = namesAt(trace);
    assert.equal(names.length, 2);
    assert.equal(new Set(names).size, 2);
    await assertRemoved(names);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('expands a glob to every matching test file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-glob-'));
  const trace = path.join(directory, 'trace');
  try {
    const result = await launch([path.join(fixtures, 'alpha*.cjs')], trace, { PG_RUNNER_PEERS: '2' }).completed;
    assert.equal(result.code, 0, result.output);
    const names = namesAt(trace);
    assert.equal(names.length, 2);
    assert.equal(new Set(names).size, 2);
    await assertRemoved(names);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('subprocesses spawned by a test can load project TypeScript modules', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-loader-'));
  const trace = path.join(directory, 'trace');
  try {
    const result = await launch([path.join(fixtures, 'loader.cjs')], trace).completed;
    assert.equal(result.code, 0, result.output);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reports a failed test and cleans its DB', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  try {
    const result = await launch([path.join(fixtures, 'fail.cjs')], trace).completed;
    assert.notEqual(result.code, 0);
    assert.match(result.output, /intentional fixture failure/);
    const names = namesAt(trace);
    assert.equal(names.length, 1);
    await assertRemoved(names);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a non-test control database before starting a child', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  try {
    const result = await launch([path.join(fixtures, 'alpha.cjs')], trace, {
      PG_TEST_URL: 'postgresql://fake:private-password@127.0.0.1:1/luong_sandbox_control'
    }).completed;
    assert.notEqual(result.code, 0);
    assert.match(result.output, /control database test/i);
    assert.doesNotMatch(result.output, /private-password|postgresql:\/\//);
    assert.deepEqual(namesAt(trace), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SIGTERM stops all active work and cleans every owned DB', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  const { child, completed } = launch([path.join(fixtures, 'hold.cjs'), path.join(fixtures, 'hold.cjs')], trace);
  try {
    for (let attempt = 0; attempt < 400 && namesAt(trace).length < 2; attempt++)
      await new Promise(resolve => setTimeout(resolve, 25));
    const names = namesAt(trace);
    assert.equal(names.length, 2, 'both fixtures must start before sending SIGTERM');
    assert.equal(new Set(names).size, 2);
    child.kill('SIGTERM');
    const result = await completed;
    assert.notEqual(result.code, 0);
    await assertRemoved(names);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await completed;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SIGTERM escalates when a child does not stop and still cleans the DB', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  const pidFile = path.join(directory, 'pid');
  const { child, completed } = launch([path.join(fixtures, 'stubborn.cjs')], trace, { PG_RUNNER_PID_FILE: pidFile });
  let names: string[] = [];
  let cleanedByRunner = false;
  try {
    for (let attempt = 0; attempt < 400 && (!namesAt(trace).length || !fs.existsSync(pidFile)); attempt++)
      await new Promise(resolve => setTimeout(resolve, 25));
    names = namesAt(trace);
    assert.equal(names.length, 1, 'fixture must start before sending SIGTERM');
    child.kill('SIGTERM');
    const result = await withTimeout(completed, 4000);
    assert.ok(result, 'runner must stop a child that ignores SIGTERM');
    assert.notEqual(result.code, 0);
    await assertRemoved(names);
    cleanedByRunner = true;
  } finally {
    if (!cleanedByRunner && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (!cleanedByRunner && fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      try {
        const command = process.platform === 'linux' ? fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8') : '';
        if (command.includes('postgres-runner/stubborn.cjs')) process.kill(-pid, 'SIGKILL');
      } catch (error: any) {
        if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
      }
    }
    await completed;
    for (const name of cleanedByRunner ? [] : names) {
      assert.match(name, /^luong_test_[0-9a-f]{24}$/);
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SIGTERM also stops a descendant after the test process exits', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  const pidFile = path.join(directory, 'leader-pid');
  const grandchildPidFile = path.join(directory, 'grandchild-pid');
  const { child, completed } = launch([path.join(fixtures, 'leader.cjs')], trace, {
    PG_RUNNER_PID_FILE: pidFile,
    PG_RUNNER_GRANDCHILD_PID_FILE: grandchildPidFile
  });
  let names: string[] = [];
  let cleanedByRunner = false;
  try {
    for (let attempt = 0; attempt < 400 && (!namesAt(trace).length || !fs.existsSync(grandchildPidFile)); attempt++)
      await new Promise(resolve => setTimeout(resolve, 25));
    names = namesAt(trace);
    assert.equal(names.length, 1, 'fixture must start before sending SIGTERM');
    assert.ok(fs.existsSync(grandchildPidFile), 'grandchild must be running');
    child.kill('SIGTERM');
    const result = await withTimeout(completed, 4000);
    assert.ok(result, 'runner must terminate the descendant that inherited its output');
    assert.notEqual(result.code, 0);
    await assertRemoved(names);
    cleanedByRunner = true;
  } finally {
    if (!cleanedByRunner && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (!cleanedByRunner && fs.existsSync(pidFile) && fs.existsSync(grandchildPidFile)) {
      const group = Number(fs.readFileSync(pidFile, 'utf8'));
      const grandchild = Number(fs.readFileSync(grandchildPidFile, 'utf8'));
      try {
        const command = process.platform === 'linux' ? fs.readFileSync(`/proc/${grandchild}/cmdline`, 'utf8') : '';
        if (command.includes('postgres-runner/grandchild.cjs')) process.kill(-group, 'SIGKILL');
      } catch (error: any) {
        if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
      }
    }
    await completed;
    for (const name of cleanedByRunner ? [] : names) {
      assert.match(name, /^luong_test_[0-9a-f]{24}$/);
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a successful test cannot leave a descendant running after its DB is removed', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-runner-test-'));
  const trace = path.join(directory, 'trace');
  const pidFile = path.join(directory, 'leader-pid');
  const grandchildPidFile = path.join(directory, 'grandchild-pid');
  const { child, completed } = launch([path.join(fixtures, 'leader-exit.cjs')], trace, {
    PG_RUNNER_PID_FILE: pidFile,
    PG_RUNNER_GRANDCHILD_PID_FILE: grandchildPidFile
  });
  let cleanedByRunner = false;
  try {
    const result = await withTimeout(completed, 4000);
    assert.ok(result, 'runner must stop the remaining descendant');
    assert.equal(result.code, 0, result.output);
    const names = namesAt(trace);
    assert.equal(names.length, 1);
    assert.ok(fs.existsSync(grandchildPidFile));
    await assertRemoved(names);
    cleanedByRunner = true;
  } finally {
    if (!cleanedByRunner && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (!cleanedByRunner && fs.existsSync(pidFile) && fs.existsSync(grandchildPidFile)) {
      const group = Number(fs.readFileSync(pidFile, 'utf8'));
      const grandchild = Number(fs.readFileSync(grandchildPidFile, 'utf8'));
      try {
        const command = process.platform === 'linux' ? fs.readFileSync(`/proc/${grandchild}/cmdline`, 'utf8') : '';
        if (command.includes('postgres-runner/grandchild.cjs')) process.kill(-group, 'SIGKILL');
      } catch (error: any) {
        if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
      }
    }
    await completed;
    for (const name of cleanedByRunner ? [] : namesAt(trace)) {
      assert.match(name, /^luong_test_[0-9a-f]{24}$/);
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
