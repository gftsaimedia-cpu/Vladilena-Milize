'use strict';

// Dựng bộ demo trên PostgreSQL thật, giữ nguyên độ phủ nghiệp vụ và chạy các công cụ từ snapshot.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const pgBackup = require('../../src/ops/pg-backup');
const { testControlUrl } = require('../helpers/postgres-control');

const ROOT = path.join(__dirname, '..', '..');
const testResults = path.join(ROOT, 'test-results');
const SEED = path.join(ROOT, 'scripts/db/seed-demo.ts');
const SERVE_CHILD = path.join(ROOT, 'test/db/demo-serve-child.ts');
let source;
let sourceSnapshot;
let sourceHeader;
let coverage;
let work;

function fingerprints(header) {
  return header.tables.map(({ name, rows, sha256 }) => [name, rows, sha256]);
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    DATABASE_URL: undefined,
    DB_PATH: undefined,
    PG_TEST_URL: undefined,
    TEST_PG_CONTROL_URL: undefined,
    ...extra
  };
}

before(async () => {
  fs.mkdirSync(testResults, { recursive: true });
  work = fs.mkdtempSync(path.join(testResults, '.demo-coverage-test-'));
  source = await TemporaryPostgres.create(testControlUrl, 'demo');
  const reportFile = path.join(work, 'coverage.json');
  const built = spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', SEED, '--confirm-demo-db', `--coverage-json=${reportFile}`],
    {
      encoding: 'utf8',
      cwd: ROOT,
      env: childEnv({ DATABASE_URL: source.url }),
      timeout: 840000
    }
  );
  assert.equal(built.status, 0, String(built.stdout).slice(-3000) + String(built.stderr).slice(-1500));
  assert.doesNotMatch(built.stdout, /\[LỖI\]/, 'lớp vận hành có bước lỗi');
  assert.match(built.stdout, /Ca \(case\) đã phủ\s+\d+\/\d+/);
  coverage = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  assert.deepEqual(coverage.gaps, []);
  assert.ok(Object.keys(coverage.counts).length >= 29);
  for (const [table, n] of Object.entries(coverage.counts as Record<string, number>))
    if (!require('../../scripts/db/demo/coverage.ts').TABLES_UNUSED[table]) assert.ok(n > 0, `bảng ${table} rỗng`);
  assert.ok(coverage.counts.staff >= 70 && coverage.counts.payslips > 300 && coverage.counts.audit_log > 50);
  sourceSnapshot = await pgBackup.backup(source.url, path.join(work, 'source'));
  sourceHeader = (await pgBackup.verifyFile(sourceSnapshot.file)).header;
});

after(async () => {
  if (source) await source.close();
  if (work) fs.rmSync(work, { recursive: true, force: true });
});

test('seeded demo covers every table, CHECK value, status, position/level and runtime route', () => {
  assert.deepEqual(coverage.gaps, []);
});

test(
  'period-check restores a snapshot, writes --keep as a verified backup, and never changes its source',
  { timeout: 900000 },
  async () => {
    const kept = path.join(work, 'period-check-kept.pgbak.gz');
    const checked = spawnSync(
      process.execPath,
      [
        '--no-warnings=ExperimentalWarning',
        path.join(ROOT, 'scripts/db/demo/period-check.ts'),
        `--snapshot=${sourceSnapshot.file}`,
        '--month=2026-10',
        `--keep=${kept}`
      ],
      {
        encoding: 'utf8',
        cwd: ROOT,
        env: childEnv({ DEMO_PG_CONTROL_URL: testControlUrl }),
        timeout: 840000
      }
    );
    assert.equal(checked.status, 0, String(checked.stdout).slice(-3000) + String(checked.stderr).slice(-1500));
    assert.match(checked.stdout, /mọi kỳ vọng đạt/);
    assert.equal(fs.existsSync(kept), true);
    const keptReport = await pgBackup.verifyFile(kept);
    assert.equal(keptReport.ok, true, keptReport.problems.join('; '));
    assert.deepEqual(await require('../../scripts/db/demo/demo-dir').demoInfo(kept), {
      marked: true,
      today: '2026-11-26'
    });
    const after = await pgBackup.backup(source.url, path.join(work, 'source-after'));
    const afterHeader = (await pgBackup.verifyFile(after.file)).header;
    assert.deepEqual(fingerprints(afterHeader), fingerprints(sourceHeader), 'period-check changed the source database');
  }
);

test(
  'serve-demo holds its owned snapshot database until SIGTERM, then removes only that database',
  { timeout: 60000, skip: process.platform === 'win32' ? 'Windows does not deliver POSIX SIGTERM to children' : false },
  async () => {
    const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', SERVE_CHILD, sourceSnapshot.file], {
      cwd: ROOT,
      env: childEnv({ DEMO_PG_CONTROL_URL: testControlUrl }),
      stdio: ['ignore', 'pipe', 'ignore']
    });
    let output = '';
    child.stdout.on('data', chunk => (output += String(chunk)));
    const exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }> = new Promise(resolve =>
      child.once('exit', (code, signal) => resolve({ code, signal }))
    );
    let ownedName;
    const admin = new Pool({ connectionString: testControlUrl, max: 1 });
    try {
      for (let attempt = 0; attempt < 1200; attempt++) {
        ownedName = output.match(/DATABASE_NAME=(luong_demo_[0-9a-f]{24})/)?.[1];
        if (ownedName && output.includes('Địa chỉ  http://127.0.0.1:')) break;
        if (child.exitCode !== null || child.signalCode !== null) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.ok(ownedName, 'server must report the exact database created by this child');
      assert.match(output, /Địa chỉ  http:\/\/127\.0\.0\.1:/);
      assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [ownedName])).rowCount, 1);
      assert.equal(child.kill('SIGTERM'), true);
      const exit = await Promise.race([exited, new Promise<null>(resolve => setTimeout(() => resolve(null), 30000))]);
      assert.ok(exit, 'server must exit after SIGTERM');
      assert.equal(exit.signal, null, 'the application handler must finish cleanup before exit');
      assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [ownedName])).rowCount, 0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      if (ownedName && (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [ownedName])).rowCount)
        await admin.query(`DROP DATABASE "${ownedName}" WITH (FORCE)`);
      await admin.end();
    }
    const after = await pgBackup.backup(source.url, path.join(work, 'source-after-serve'));
    assert.deepEqual(
      fingerprints((await pgBackup.verifyFile(after.file)).header),
      fingerprints(sourceHeader),
      'serve-demo changed the source database'
    );
  }
);

test('coverage measurement reports missing data on a separate empty PostgreSQL database', async () => {
  await TemporaryPostgres.using(testControlUrl, 'test', async database => {
    const previous = Object.fromEntries(['DATABASE_URL', 'DB_PATH', 'PG_TEST_URL'].map(k => [k, process.env[k]]));
    delete process.env.DB_PATH;
    delete process.env.PG_TEST_URL;
    process.env.DATABASE_URL = database.url;
    try {
      const store = require('../../src/platform/db');
      await store.ready;
      const { measure } = require('../../scripts/db/demo/coverage.ts');
      const result = await measure({ store, personas: [] });
      assert.ok(result.gaps.length > 40, `chỉ ${result.gaps.length} chỗ thiếu trên DB trống`);
      assert.ok(result.gaps.includes('bảng staff không có dòng nào'));
      assert.ok(
        result.gaps.some(
          g =>
            g.includes("payroll_periods.status chưa có giá trị 'paid'") || g.includes('payroll_periods không có dòng')
        ) || result.gaps.includes('bảng payroll_periods không có dòng nào')
      );
      await store.db.close();
      delete require.cache[require.resolve('../../src/platform/db')];
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

test('coverage exceptions still name real CHECK values and have a written reason', () => {
  const { schemaUniverse, EXCLUDED } = require('../../scripts/db/demo/coverage.ts');
  const { enums } = schemaUniverse();
  const universe = new Set(enums.flatMap(e => e.values.map(v => `${e.table}.${e.column}=${v}`)));
  for (const [key, reason] of Object.entries(EXCLUDED)) {
    assert.ok(universe.has(key), `ngoại lệ ${key} không còn là giá trị CHECK nào của lược đồ`);
    assert.ok(typeof reason === 'string' && reason.length >= 20, `ngoại lệ ${key} thiếu lý do`);
  }
  assert.ok(Object.keys(EXCLUDED).length <= 4, 'thêm ngoại lệ phải có chủ ý');
});
