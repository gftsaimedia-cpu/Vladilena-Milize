'use strict';
// Sao lưu / kiểm / khôi phục trên các database PostgreSQL tạm do test này tạo và sở hữu.
process.env.SESSION_SECRET = 'pg-backup-test';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const { PostgresDatabase } = require('../../src/data/postgres-database');
const pgBackup = require('../../src/ops/pg-backup');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ops', 'pg-backup.js');
const SIGNAL_SCRIPT = path.join(ROOT, 'test', 'ops', 'pg-backup-signal-child.ts');
let tmp;
let file;
let controlUrl;
let admin;
let source;
let store;
let originalTemp;

async function withTarget(run) {
  const temporary = await TemporaryPostgres.create(controlUrl, 'test');
  const target = new PostgresDatabase({ url: temporary.url, max: 1 });
  try {
    await target.ready;
    return await run(target, temporary.url);
  } finally {
    try {
      await target.close();
    } finally {
      await temporary.close();
    }
  }
}

async function namesWithPrefix(prefix) {
  const { rows } = await admin.query('SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY datname', [
    prefix + '%'
  ]);
  return rows.map(row => row.datname);
}

before(async () => {
  controlUrl = process.env.PG_TEST_URL || process.env.TEST_PG_CONTROL_URL;
  assert.ok(controlUrl, 'cần control PostgreSQL dành riêng cho test');
  source = await TemporaryPostgres.create(controlUrl, 'test');
  process.env.DATABASE_URL = source.url;
  delete process.env.PG_TEST_URL;
  delete process.env.TEST_PG_CONTROL_URL;
  delete process.env.DB_PATH;
  delete process.env.DRILL_PG_CONTROL_URL;
  store = require('../../src/platform/db');
  admin = new Pool({ connectionString: controlUrl, max: 1 });
  const testResults = path.join(ROOT, 'test-results');
  fs.mkdirSync(testResults, { recursive: true });
  tmp = fs.mkdtempSync(path.join(testResults, '.test-tmp-pg-backup-'));
  originalTemp = { TEMP: process.env.TEMP, TMP: process.env.TMP };
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
  await store.ready;
  for (const [username, type] of [
    ['bk_a', 'nv'],
    ['bk_b', 'ctv'],
    ['bk_admin', 'tts']
  ])
    await store.upsertStaff({
      username,
      name: 'Người ' + username,
      role: username === 'bk_admin' ? 'admin' : 'staff',
      type,
      level: 1,
      shiftCode: 'n1',
      startDate: '2026-01-05',
      passHash: 'x'
    });
  await store.setSheet('bk_a', '2026-10', { '2026-10-05': { kind: 'work', in: '08:00', out: '17:00' } }, null, null);
  await store.setSetting('holidays', ['2026-10-10']);
  await store.audit.write({
    actor: 'bk_admin',
    action: 'seed.test',
    entityKind: 'test',
    entityId: 'x',
    sensitivity: 'normal',
    reason: 'Dữ liệu thử'
  });
  await store.roles.grant('bk_a', 'hr', 'bk_admin');
  await store.periods.lockAttendance('2026-10', { rev: 0, by: 'bk_admin' });
  const run = await store.payroll.createRun('2026-10', {
    engineVersion: 'test',
    paramsHash: 'h',
    paramsRev: 0,
    params: { a: 1 },
    switches: {},
    by: 'bk_admin'
  });
  await store.payroll.addPayslip(run.id, {
    username: 'bk_a',
    status: 'draft',
    gross: 12345678,
    insurance: 1000000,
    tax: 200000,
    advance: 0,
    net: 11145678,
    staffTerms: { type: 'nv' },
    snapshot: { x: 1, ten: 'Việt' }
  });
  await store.payroll.addPayslip(run.id, {
    username: 'bk_b',
    status: 'draft',
    gross: 8000000,
    insurance: 0,
    tax: 0,
    advance: 100000,
    net: 7900000,
    staffTerms: { type: 'ctv' },
    snapshot: { y: 2 }
  });
  await store.payroll.finishRun(run.id, { total: 20345678, errors: 0 });
});
after(async () => {
  try {
    if (store) await store.db.close();
    if (source) await source.close();
    if (admin) await admin.end();
  } finally {
    if (originalTemp?.TEMP === undefined) delete process.env.TEMP;
    else process.env.TEMP = originalTemp.TEMP;
    if (originalTemp?.TMP === undefined) delete process.env.TMP;
    else process.env.TMP = originalTemp.TMP;
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('sao lưu: ra một file gzip đúng tên, tự kiểm đạt, header đủ bảng và tổng tiền kỳ lương', async () => {
  const r = await pgBackup.backup(store.db, path.join(tmp, 'a'), { keep: 5 });
  file = r.file;
  assert.match(path.basename(file), pgBackup.NAME_PATTERN);
  assert.ok(r.tables >= 29 && r.rows > 20);
  const v = await pgBackup.verifyFile(file);
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.ok(v.header.migrations.includes('0001_baseline.sql'));
  assert.equal(v.header.payroll.length, 1);
  assert.equal(v.header.payroll[0].gross, 20345678);
  assert.equal(v.header.tables.find(t => t.name === 'staff').rows, 3);
  assert.equal(v.header.tables.find(t => t.name === 'payslips').rows, 2);
  assert.ok(!fs.readdirSync(path.join(tmp, 'a')).some(n => n.endsWith('.partial')), 'không để lại file tạm');
});

test('khôi phục: vào DB mới khớp từng bảng, BYTEA giữ nguyên từng byte, dãy số tự tăng chạy tiếp được', async () => {
  await withTarget(async target => {
    const r = await pgBackup.restore(file, target);
    assert.ok(r.rows > 20);
    const src = await store.db.prepare('SELECT username, uuid FROM staff ORDER BY username').all();
    const dst = await target.prepare('SELECT username, uuid FROM staff ORDER BY username').all();
    assert.deepEqual(dst, src, 'cả uuid sinh tự động cũng giữ nguyên');
    const a = await store.db.prepare('SELECT snapshot_gz FROM payslips ORDER BY id').all();
    const b = await target.prepare('SELECT snapshot_gz FROM payslips ORDER BY id').all();
    assert.equal(b.length, 2);
    assert.ok(Buffer.isBuffer(b[0].snapshot_gz) || b[0].snapshot_gz instanceof Uint8Array);
    assert.equal(Buffer.compare(Buffer.from(a[0].snapshot_gz), Buffer.from(b[0].snapshot_gz)), 0);
    assert.deepEqual(await target.prepare("SELECT value_json FROM settings WHERE key = 'holidays'").get(), {
      value_json: JSON.stringify(['2026-10-10'])
    });
    const before = await target.prepare('SELECT MAX(id) AS id FROM audit_log').get();
    const next = await target
      .prepare(
        "INSERT INTO audit_log (at, actor, action, entity_kind, entity_id, prev_hash, hash) VALUES ('2026-10-31T00:00:00Z', 'x', 'y', 'k', '1', '', 'h2')"
      )
      .run();
    assert.ok(Number(next.lastInsertRowid) > before.id, 'id mới nối tiếp sau id lớn nhất đã khôi phục');
  });
});

test('khôi phục từ chối đích không rỗng và không đổi gì ở đích', async () => {
  await assert.rejects(() => pgBackup.restore(file, store.db), /không rỗng/);
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS n FROM staff').get()).n, 3);
});

test('file hỏng bị phát hiện: cắt dở, sửa một ô, sai định dạng; khôi phục từ chối và không ghi gì', async () => {
  const bytes = fs.readFileSync(file);
  const truncated = path.join(tmp, 'truncated.pgbak.gz');
  fs.writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length / 2)));
  const t = await pgBackup.verifyFile(truncated);
  assert.equal(t.ok, false);

  const lines = zlib.gunzipSync(bytes).toString('utf8').split('\n');
  const at = lines.findIndex(l => l.includes('"t":"staff"'));
  const edited = path.join(tmp, 'edited.pgbak.gz');
  fs.writeFileSync(
    edited,
    zlib.gzipSync(
      lines.map((l, i) => (i === at ? l.replace('"name":"Người bk_a"', '"name":"Người khác"') : l)).join('\n')
    )
  );
  const e = await pgBackup.verifyFile(edited);
  assert.equal(e.ok, false);
  assert.match(e.problems.join(' '), /staff/);

  const garbage = path.join(tmp, 'garbage.pgbak.gz');
  fs.writeFileSync(garbage, Buffer.from('không phải gzip'));
  assert.equal((await pgBackup.verifyFile(garbage)).ok, false);

  await withTarget(async target => {
    await assert.rejects(() => pgBackup.restore(edited, target), /không toàn vẹn/);
    assert.equal((await target.prepare('SELECT COUNT(*) AS n FROM staff').get()).n, 0);
  });
});

test('xoay vòng: chỉ giữ keep bản mới nhất đúng mẫu tên, không đụng file khác', async () => {
  const dir = path.join(tmp, 'rotate');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'ghi-chu.txt'), 'không phải bản sao lưu');
  const base = Date.parse('2026-10-31T00:00:00Z');
  for (let i = 0; i < 4; i++) await pgBackup.backup(store.db, dir, { keep: 2, now: base + i * 60000 });
  const left = fs.readdirSync(dir).filter(n => pgBackup.NAME_PATTERN.test(n));
  assert.equal(left.length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'ghi-chu.txt')));
  assert.deepEqual(left, [...left].sort());
  await assert.rejects(() => pgBackup.backup(store.db, dir, { keep: 0 }), /keep/);
});

test('CLI: verify và drill đạt; restore đòi cờ xác nhận và khôi phục vào PostgreSQL mới', async () => {
  const run = (extra?, extraEnv: any = {}) =>
    spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT, ...extra], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, ...extraEnv }
    });
  const verify = run(['verify', `--backup=${file}`]);
  assert.equal(verify.status, 0, verify.stderr + verify.stdout);
  assert.match(verify.stdout, /KẾT QUẢ: ĐẠT/);
  const missingControl = run(['drill', `--backup=${file}`], { DRILL_PG_CONTROL_URL: '' });
  assert.equal(missingControl.status, 1);
  assert.match(missingControl.stderr, /DRILL_PG_CONTROL_URL|--control-url/);
  const drill = run(['drill', `--backup=${file}`], { DRILL_PG_CONTROL_URL: controlUrl });
  assert.equal(drill.status, 0, drill.stderr + drill.stdout);
  assert.match(drill.stdout, /KẾT QUẢ: ĐẠT/);
  const temporary = await TemporaryPostgres.create(controlUrl, 'test');
  try {
    const noConfirm = run(['restore', `--backup=${file}`, `--to=${temporary.url}`]);
    assert.equal(noConfirm.status, 1);
    assert.match(noConfirm.stderr, /confirm-new-empty-db/);
    const ok = run(['restore', `--backup=${file}`, `--to=${temporary.url}`, '--confirm-new-empty-db']);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /KHỚP/);
  } finally {
    await temporary.close();
  }
  const bad = run(['restore', `--backup=${file}`, '--to=mysql://x', '--confirm-new-empty-db']);
  assert.equal(bad.status, 1);
  assert.doesNotMatch(bad.stderr + bad.stdout, /Người bk_a/, 'không in dữ liệu');
});

test('openDatabase che mật khẩu trong thông báo lỗi và từ chối đích lạ', () => {
  assert.throws(
    () => pgBackup.openDatabase('mysql://user:matkhau@host/db'),
    err => !/matkhau/.test(err.message) && /postgres/.test(err.message)
  );
  assert.throws(() => pgBackup.openDatabase(''), /Thiếu/);
  assert.throws(() => pgBackup.openDatabase('memory'), /PostgreSQL|postgres/i);
  assert.throws(() => pgBackup.openDatabase('pglite:C:\\temp\\db'), /PostgreSQL|postgres/i);
});

test(
  'qua PostgreSQL thật: sao lưu từ pool, khôi phục vào database riêng và từ chối ghi đè lần hai',
  { timeout: 120000 },
  async () => {
    await withTarget(async (target, targetUrl) => {
      await store.db
        .prepare(
          "INSERT INTO staff (username, name, pass_hash, created_at) VALUES ('net_a', 'Mạng A', 'x', '2026-10-31T00:00:00.000Z')"
        )
        .run();
      await store.db
        .prepare(
          "INSERT INTO settings (key, value_json) VALUES ('net_thu', '{\"v\":1}') ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json"
        )
        .run();

      const r = await pgBackup.backup(source.url, path.join(tmp, 'net'));
      assert.equal((await pgBackup.verifyFile(r.file)).ok, true);
      const result = await pgBackup.restore(r.file, targetUrl);
      assert.ok(result.rows >= 2);
      assert.equal((await target.prepare("SELECT name FROM staff WHERE username = 'net_a'").get()).name, 'Mạng A');
      assert.equal(
        (await target.prepare("SELECT value_json FROM settings WHERE key = 'net_thu'").get()).value_json,
        '{"v":1}'
      );
      await assert.rejects(
        () => pgBackup.restore(r.file, targetUrl),
        /không rỗng/,
        'khôi phục lần hai vào đích đã có dữ liệu bị từ chối'
      );
    });
  }
);

test('drill yêu cầu control PostgreSQL an toàn, tạo database riêng, đối chiếu và dọn kể cả khi khôi phục lỗi', async () => {
  await assert.rejects(() => pgBackup.drill(file), /DRILL_PG_CONTROL_URL|control/i);
  const invalid = new URL(controlUrl);
  invalid.pathname = '/not_a_control_db';
  await assert.rejects(
    () => pgBackup.drill(file, invalid.toString()),
    error => /control database/i.test(error.message) && !error.message.includes(decodeURIComponent(invalid.password))
  );

  const before = await namesWithPrefix('luong_drill_');
  const result = await pgBackup.drill(file, controlUrl);
  assert.ok(result.tables >= 29);
  assert.ok(result.rows > 20);
  assert.equal(result.header.payroll[0].gross, 20345678);
  assert.deepEqual(await namesWithPrefix('luong_drill_'), before, 'database drill được dọn sau khi đạt');

  const damaged = path.join(tmp, 'invalid-drill.pgbak.gz');
  fs.writeFileSync(damaged, Buffer.from('not a backup'));
  await assert.rejects(() => pgBackup.drill(damaged, controlUrl), /không toàn vẹn/);
  assert.deepEqual(await namesWithPrefix('luong_drill_'), before, 'database drill được dọn sau khi restore lỗi');
});

test('sandbox drill chỉ dùng SANDBOX_PG_CONTROL_URL, không kế thừa DRILL_PG_CONTROL_URL', async () => {
  const { createOps } = require('../../scripts/dev/sandbox-ops');
  const ops = createOps({
    store,
    auth: {},
    project: ROOT,
    getPort: () => 1,
    getLocalMonth: () => '2026-10',
    limits: null
  });
  const previousSandbox = process.env.SANDBOX_PG_CONTROL_URL;
  const previousDrill = process.env.DRILL_PG_CONTROL_URL;
  try {
    await ops.post('backup');
    const name = (await ops.snapshot()).backups[0].name;
    process.env.SANDBOX_PG_CONTROL_URL = '';
    process.env.DRILL_PG_CONTROL_URL = controlUrl;
    const withoutSandboxControl = await ops.post('drill', { name });
    assert.equal(withoutSandboxControl.tool.exitCode, 1);

    process.env.SANDBOX_PG_CONTROL_URL = controlUrl;
    process.env.DRILL_PG_CONTROL_URL = new URL(controlUrl).origin + '/not_a_control_db';
    const withSandboxControl = await ops.post('drill', { name });
    assert.equal(withSandboxControl.tool.exitCode, 0, withSandboxControl.tool.lines.join('\n'));
  } finally {
    ops.close();
    if (previousSandbox === undefined) delete process.env.SANDBOX_PG_CONTROL_URL;
    else process.env.SANDBOX_PG_CONTROL_URL = previousSandbox;
    if (previousDrill === undefined) delete process.env.DRILL_PG_CONTROL_URL;
    else process.env.DRILL_PG_CONTROL_URL = previousDrill;
  }
});

async function databaseExists(name) {
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  return rows.length > 0;
}

async function runSignalCase(phase, signal, external = false) {
  const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', SIGNAL_SCRIPT, file], {
    cwd: ROOT,
    env: {
      ...process.env,
      DRILL_PG_CONTROL_URL: controlUrl,
      PG_BACKUP_TEST_SIGNAL: signal,
      PG_BACKUP_TEST_SIGNAL_PHASE: external ? 'external' : phase
    },
    stdio: ['ignore', 'pipe', 'ignore']
  });
  let output = '';
  child.stdout.on('data', chunk => (output += String(chunk)));
  const exited: Promise<{ code: number | null; receivedSignal: NodeJS.Signals | null }> = new Promise(resolve =>
    child.once('exit', (code, receivedSignal) => resolve({ code, receivedSignal }))
  );
  let ownedName;
  try {
    for (let attempt = 0; attempt < 400; attempt++) {
      ownedName = output.match(/DATABASE_NAME=(luong_drill_[0-9a-f]{24})/)?.[1];
      if (ownedName || child.exitCode !== null || child.signalCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(ownedName, 'child drill must report the database name it created');
    if (external) assert.equal(child.kill(signal), true, 'drill must still run when sent the signal');
    const exit = await Promise.race([exited, new Promise<null>(resolve => setTimeout(() => resolve(null), 15000))]);
    assert.ok(exit, 'drill must exit after processing the signal');
    assert.equal(exit.code, 1, 'an interrupted drill must report failure');
    assert.equal(exit.receivedSignal, null, 'the handler must run before the process exits');
    assert.equal(await databaseExists(ownedName), false, 'the interrupted drill database must be removed');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (ownedName && (await databaseExists(ownedName))) await admin.query(`DROP DATABASE "${ownedName}" WITH (FORCE)`);
  }
}

test('drill cleans its database for signals during CREATE, restore, and cleanup', { timeout: 45000 }, async () => {
  await runSignalCase('create', 'SIGTERM');
  await runSignalCase('restore', 'SIGINT');
  await runSignalCase('cleanup', 'SIGTERM');
});

test(
  'drill cleans its database when the child receives a real SIGTERM',
  { timeout: 30000, skip: process.platform === 'win32' ? 'Windows does not deliver POSIX SIGTERM to children' : false },
  () => runSignalCase('external', 'SIGTERM', true)
);
