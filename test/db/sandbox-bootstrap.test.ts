'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Pool, Client } = require('pg');
const { testControlUrl } = require('../helpers/postgres-control');

const root = path.resolve(__dirname, '../..');
const bootstrap = path.join(root, 'scripts/dev/sandbox-bootstrap.ts');
let admin: any;
before(() => (admin = new Pool({ connectionString: testControlUrl, max: 1 })));
after(async () => await admin.end());

function launch(extra: Record<string, string> = {}) {
  const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', '--import', 'tsx', bootstrap], {
    cwd: root,
    env: {
      ...process.env,
      SANDBOX_PG_CONTROL_URL: testControlUrl,
      DATABASE_URL: 'postgresql://private-user:private-password@example.invalid/application',
      DB_PATH: '/fake/application',
      PG_TEST_URL: 'postgresql://private-user:private-password@example.invalid/wrong',
      SANDBOX_PORT: '0',
      NODE_OPTIONS: '',
      ...extra
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => (output += chunk.toString()));
  child.stderr.on('data', chunk => (output += chunk.toString()));
  const finished = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  return { child, finished, output: () => output };
}

async function waitForOutput(processInfo, pattern: RegExp) {
  for (let attempt = 0; attempt < 1800; attempt++) {
    const match = pattern.exec(processInfo.output());
    if (match) return match;
    if (processInfo.child.exitCode !== null || processInfo.child.signalCode !== null)
      throw new Error('Sandbox exited before reaching the expected state: ' + processInfo.output());
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Sandbox did not reach the expected state: ' + processInfo.output());
}

async function cleanup(processInfo, name?: string) {
  if (processInfo.child.exitCode === null && processInfo.child.signalCode === null) processInfo.child.kill('SIGTERM');
  await processInfo.finished;
  if (name) {
    assert.match(name, /^luong_sandbox_[0-9a-f]{24}$/);
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  }
}

test('bootstrap uses its own PostgreSQL database and removes it when stopped', { timeout: 120000 }, async () => {
  const processInfo = launch();
  let name: string | undefined;
  try {
    name = (await waitForOutput(processInfo, /^SANDBOX_DB_CREATED (luong_sandbox_[0-9a-f]{24})$/m))[1];
    const ready = JSON.parse((await waitForOutput(processInfo, /^SANDBOX_READY (.+)$/m))[1]);
    assert.equal((await fetch(`${ready.url}/__sandbox/state`)).status, 200);
    const target = new URL(testControlUrl);
    target.pathname = `/${name}`;
    const client = new Client({ connectionString: target.toString() });
    try {
      await client.connect();
      assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM staff')).rows[0].n, 7);
      const controlHeaders = { Origin: ready.url, 'X-Sandbox-Control': '1', 'Content-Type': 'application/json' };
      const selected = await fetch(`${ready.url}/__sandbox/user`, {
        method: 'POST',
        headers: controlHeaders,
        body: JSON.stringify({ username: 'qa_admin' })
      });
      assert.equal(selected.status, 200);
      const cookie = selected.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      const changed = await fetch(`${ready.url}/api/holidays`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ dates: ['2026-10-07'] })
      });
      assert.equal(changed.status, 200);
      const auditBefore = (await client.query('SELECT id, hash FROM audit_log ORDER BY id')).rows;
      assert.ok(auditBefore.length > 0, 'the test must create an audit record before reset');
      const reset = await fetch(`${ready.url}/__sandbox/reset`, {
        method: 'POST',
        headers: controlHeaders,
        body: JSON.stringify({ confirm: true })
      });
      assert.equal(reset.status, 200);
      const lastId = auditBefore.at(-1).id;
      const auditAfter = (await client.query('SELECT id, hash FROM audit_log WHERE id <= $1 ORDER BY id', [lastId]))
        .rows;
      assert.deepEqual(auditAfter, auditBefore, 'sandbox reset must preserve existing audit records');
    } finally {
      await client.end();
    }
    processInfo.child.kill('SIGTERM');
    await processInfo.finished;
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount, 0);
    assert.doesNotMatch(processInfo.output(), /private-user|private-password/);
  } finally {
    await cleanup(processInfo, name);
  }
});

test('bootstrap rejects an application control database without disclosing credentials', async () => {
  const processInfo = launch({
    SANDBOX_PG_CONTROL_URL: 'postgresql://private-user:private-password@example.invalid/luong_dev'
  });
  try {
    const result = await processInfo.finished;
    assert.notEqual(result.code, 0);
    assert.match(processInfo.output(), /sandbox/i);
    assert.doesNotMatch(processInfo.output(), /private-user|private-password|SANDBOX_DB_CREATED/);
  } finally {
    await cleanup(processInfo);
  }
});

test('bootstrap removes its database if the server fails during startup', { timeout: 120000 }, async () => {
  const processInfo = launch({ SANDBOX_PORT: 'invalid' });
  let name: string | undefined;
  try {
    name = (await waitForOutput(processInfo, /^SANDBOX_DB_CREATED (luong_sandbox_[0-9a-f]{24})$/m))[1];
    const result = await processInfo.finished;
    assert.notEqual(result.code, 0);
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount, 0);
  } finally {
    await cleanup(processInfo, name);
  }
});
