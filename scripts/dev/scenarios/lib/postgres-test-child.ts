'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { PostgresDatabase } = require('../../../../src/data/postgres-database');
const pgBackup = require('../../../../src/ops/pg-backup');
const scenarios = require('./postgres');

const controlUrl = process.env.TEST_PG_CONTROL_URL;
if (!controlUrl) throw new Error('PostgreSQL test runner control URL is required.');

async function namesWithPrefix(admin: any) {
  const { rows } = await admin.query("SELECT datname FROM pg_database WHERE datname LIKE 'luong_scenario_%' ORDER BY datname");
  return rows.map(row => row.datname);
}

async function testSnapshot() {
  const admin = new Pool({ connectionString: controlUrl, max: 1 });
  scenarios.ensureOutputDirectory();
  const directory = path.join(scenarios.OUT, `scenario-test-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  const snapshot = path.join(directory, 'scenario.pgbak.gz');
  let source: any;
  let target: any;
  let targetDb: any;
  const before = await namesWithPrefix(admin);
  try {
    fs.mkdirSync(directory, { recursive: false });
    source = await scenarios.openScenarioDatabase({ controlUrl, initialLocal: '2027-01-01T00:00' });
    const probeKey = `scenario_restore_probe_${crypto.randomBytes(8).toString('hex')}`;
    const probeValue = `loaded-before-app-${crypto.randomBytes(8).toString('hex')}`;
    await source.app.store.setSetting(probeKey, { marker: probeValue });
    await scenarios.writeSnapshot(source.app.store.db, snapshot);
    const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex');
    const bootstrap = spawnSync(process.execPath, [__filename, 'restore-before-boot', snapshot, probeKey, probeValue], {
      cwd: process.cwd(),
      env: { ...process.env, SCENARIO_PG_CONTROL_URL: controlUrl },
      encoding: 'utf8',
      timeout: 120000
    });
    assert.equal(bootstrap.status, 0, (bootstrap.stderr || bootstrap.error?.message || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[URL]'));
    assert.doesNotMatch(bootstrap.stdout + bootstrap.stderr, /postgres(?:ql)?:\/\//i);

    target = await require('../../../../src/data/temporary-postgres').TemporaryPostgres.create(controlUrl, 'scenario');
    targetDb = new PostgresDatabase({ url: target.url, max: 1 });
    await targetDb.ready;
    await pgBackup.restore(snapshot, targetDb);
    const migrations = await targetDb.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get();
    assert.ok(migrations.n > 0);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex'), sourceHash);
  } finally {
    try {
      if (targetDb) await targetDb.close();
    } finally {
      try {
        if (target) await target.close();
      } finally {
        try {
          if (source) await source.close();
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
          await admin.end();
        }
      }
    }
  }
  const after = await (async () => {
    const check = new Pool({ connectionString: controlUrl, max: 1 });
    try {
      return await namesWithPrefix(check);
    } finally {
      await check.end();
    }
  })();
  assert.deepEqual(after, before, `owned databases: ${source.temporary.name}, ${target.name}; after: ${after.join(',')}`);
}

async function testFailedRestore() {
  const admin = new Pool({ connectionString: controlUrl, max: 1 });
  scenarios.ensureOutputDirectory();
  const directory = path.join(scenarios.OUT, `scenario-test-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  const snapshot = path.join(directory, 'invalid.pgbak.gz');
  try {
    fs.mkdirSync(directory, { recursive: false });
    fs.writeFileSync(snapshot, 'not a PostgreSQL backup');
    const before = await namesWithPrefix(admin);
    await assert.rejects(
      () => scenarios.openScenarioDatabase({ controlUrl, snapshot, initialLocal: '2027-01-01T00:00' }),
      /không toàn vẹn|backup/i
    );
    assert.deepEqual(await namesWithPrefix(admin), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    await admin.end();
  }
}

async function testCallbackFailure() {
  const admin = new Pool({ connectionString: controlUrl, max: 1 });
  const before = await namesWithPrefix(admin);
  let ownedName: string | undefined;
  try {
    await assert.rejects(
      () =>
        scenarios.withScenarioDatabase({ controlUrl, initialLocal: '2027-01-01T00:00' }, async (_app, temporary) => {
          ownedName = temporary.name;
          throw new Error('intentional scenario callback failure');
        }),
      /intentional scenario callback failure/
    );
    assert.match(ownedName || '', /^luong_scenario_[0-9a-f]{24}$/);
    assert.deepEqual(await namesWithPrefix(admin), before);
  } finally {
    await admin.end();
  }
}

async function testRestoreBeforeBoot() {
  const [, , , snapshot, key, marker] = process.argv;
  let beforeAppImport = false;
  let scenario: any;
  try {
    scenario = await scenarios.openScenarioDatabase({
      controlUrl,
      snapshot,
      initialLocal: '2027-01-01T00:00',
      beforeAppImport: async (store: any) => {
        const row = await store.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
        assert.ok(row, 'snapshot marker must be present before src/server is imported');
        assert.deepEqual(JSON.parse(row.value_json), { marker });
        beforeAppImport = true;
      }
    });
    assert.equal(beforeAppImport, true, 'bootstrap checkpoint must run before importing src/server');
    assert.deepEqual(await scenario.app.store.getSetting(key), { marker });
  } finally {
    if (scenario) await scenario.close();
  }
}

const mode = process.argv[2];
const run =
  mode === 'snapshot'
    ? testSnapshot
    : mode === 'failed-restore'
      ? testFailedRestore
      : mode === 'restore-before-boot'
        ? testRestoreBeforeBoot
        : testCallbackFailure;
run().catch(error => {
  console.error(String(error && error.stack || error).replace(/postgres(?:ql)?:\/\/\S+/gi, '[URL]'));
  process.exitCode = 1;
});
