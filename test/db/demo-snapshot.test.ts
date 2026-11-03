'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const { PostgresDatabase } = require('../../src/data/postgres-database');
const pgBackup = require('../../src/ops/pg-backup');
const { demoInfo, withDemoSnapshot, saveDemoSnapshot } = require('../../scripts/db/demo/demo-dir');
const { testControlUrl } = require('../helpers/postgres-control');

const ROOT = path.join(__dirname, '..', '..');
const testResults = path.join(ROOT, 'test-results');
let source;
let snapshot;
let snapshotHeader;
let sourcePool;
let snapshotDir;

async function withDemoControl(run) {
  const previous = process.env.DEMO_PG_CONTROL_URL;
  process.env.DEMO_PG_CONTROL_URL = testControlUrl;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.DEMO_PG_CONTROL_URL;
    else process.env.DEMO_PG_CONTROL_URL = previous;
  }
}

function tableFingerprints(header) {
  return header.tables.map(({ name, rows, sha256 }) => [name, rows, sha256]);
}

before(async () => {
  fs.mkdirSync(testResults, { recursive: true });
  source = await TemporaryPostgres.create(testControlUrl, 'demo');
  const schema = new PostgresDatabase({ url: source.url, max: 1 });
  await schema.ready;
  await schema.close();
  sourcePool = new Pool({ connectionString: source.url, max: 1 });
  await sourcePool.query("INSERT INTO settings (key, value_json) VALUES ('demo_dataset', $1)", [
    JSON.stringify({ version: 1, today: '2026-11-26' })
  ]);
  snapshotDir = fs.mkdtempSync(path.join(testResults, '.demo-snapshot-test-'));
  snapshot = await pgBackup.backup(source.url, snapshotDir, { now: 1795712400000 });
  snapshotHeader = (await pgBackup.verifyFile(snapshot.file)).header;
});

after(async () => {
  if (sourcePool) await sourcePool.end();
  if (source) await source.close();
  if (snapshotDir) fs.rmSync(snapshotDir, { recursive: true, force: true });
});

test('recognizes a demo marker from a verified PostgreSQL backup without opening its source database', async () => {
  assert.deepEqual(await demoInfo(snapshot.file), { marked: true, today: '2026-11-26' });
  assert.deepEqual(await demoInfo(snapshot.file + '.missing'), { marked: false, today: null });
});

test('rejects a corrupt snapshot and never overwrites an existing snapshot file', async () => {
  const invalid = path.join(snapshotDir, 'corrupt.pgbak.gz');
  fs.writeFileSync(invalid, 'not a gzip backup');
  await withDemoControl(() =>
    assert.rejects(() => withDemoSnapshot(invalid, async () => {}), /file \.pgbak\.gz hợp lệ/i)
  );
  const original = fs.readFileSync(snapshot.file);
  await assert.rejects(() => saveDemoSnapshot('not-a-database-url', snapshot.file), /đã tồn tại/);
  assert.deepEqual(fs.readFileSync(snapshot.file), original);
});

test('snapshot restore requires an explicit recognized DEMO_PG_CONTROL_URL', async () => {
  await withDemoControl(async () => {
    delete process.env.DEMO_PG_CONTROL_URL;
    await assert.rejects(() => withDemoSnapshot(snapshot.file, async () => {}), /DEMO_PG_CONTROL_URL/);
  });
  await withDemoControl(async () => {
    process.env.DEMO_PG_CONTROL_URL = 'postgres://invalid.invalid/luong_app';
    await assert.rejects(() => withDemoSnapshot(snapshot.file, async () => {}), /được nhận diện riêng/i);
  });
});

test('cleans the owned snapshot copy after failure and leaves the source unchanged', async () => {
  let ownedName;
  await withDemoControl(() =>
    assert.rejects(
      () =>
        withDemoSnapshot(snapshot.file, async ({ store, database }) => {
          ownedName = database.name;
          assert.match(ownedName, /^luong_demo_[0-9a-f]{24}$/);
          assert.deepEqual(await store.getSetting('demo_dataset'), { version: 1, today: '2026-11-26' });
          await store.setSetting('copy_only_test_setting', { changed: true });
          throw new Error('demo operation failed');
        }),
      /demo operation failed/
    )
  );
  const admin = new Pool({ connectionString: testControlUrl, max: 1 });
  try {
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [ownedName])).rowCount, 0);
  } finally {
    await admin.end();
  }
  const current = await pgBackup.backup(source.url, path.dirname(snapshot.file), { now: 1795712401000 });
  assert.deepEqual(
    tableFingerprints((await pgBackup.verifyFile(current.file)).header),
    tableFingerprints(snapshotHeader)
  );
});
