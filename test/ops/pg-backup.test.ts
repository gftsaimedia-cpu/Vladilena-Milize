'use strict';
// Sao lưu / kiểm / khôi phục PostgreSQL (lib/ops/pg-backup.ts, scripts/ops/pg-backup.ts) trên PGlite trong RAM.
// Luôn chạy ở chế độ PostgreSQL bất kể DB_DIALECT của lần chạy test (file này tự đặt), không đụng DB nào ngoài RAM.
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'pg-backup-test';
delete process.env.DATABASE_URL;
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const store = require('../../lib/db');
const { PostgresDatabase } = require('../../lib/data/postgres-database');
const pgBackup = require('../../lib/ops/pg-backup');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ops', 'pg-backup.js');
let tmp;
let file;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-pg-backup-'));
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
  await store.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
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
  const target = new PostgresDatabase({ memory: true });
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
  await target.close();
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

  const target = new PostgresDatabase({ memory: true });
  await assert.rejects(() => pgBackup.restore(edited, target), /không toàn vẹn/);
  assert.equal((await target.prepare('SELECT COUNT(*) AS n FROM staff').get()).n, 0);
  await target.close();
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

test('CLI: verify và drill đạt; restore đòi cờ xác nhận, rồi khôi phục vào DB mới trong RAM', () => {
  const run = (extra?) =>
    spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT, ...extra], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env }
    });
  const verify = run(['verify', `--backup=${file}`]);
  assert.equal(verify.status, 0, verify.stderr + verify.stdout);
  assert.match(verify.stdout, /KẾT QUẢ: ĐẠT/);
  const drill = run(['drill', `--backup=${file}`]);
  assert.equal(drill.status, 0, drill.stderr + drill.stdout);
  assert.match(drill.stdout, /KẾT QUẢ: ĐẠT/);
  const noConfirm = run(['restore', `--backup=${file}`, '--to=memory']);
  assert.equal(noConfirm.status, 1);
  assert.match(noConfirm.stderr, /confirm-new-empty-db/);
  const ok = run(['restore', `--backup=${file}`, '--to=memory', '--confirm-new-empty-db']);
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /KHỚP/);
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
});

test(
  'qua mạng thật (pg.Pool → máy chủ PostgreSQL giả bằng PGlite): sao lưu từ URL, khôi phục vào URL khác',
  { timeout: 120000 },
  async () => {
    const { PGlite } = require('@electric-sql/pglite');
    const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
    const servers: any[] = [];
    // Máy chủ socket của PGlite chỉ nhận một kết nối một lúc: chờ nó dọn kết nối cũ trước khi nối lại (chỉ là đặc điểm của đồ giả, không phải của PostgreSQL thật)
    const settle = () => new Promise<any>(resolve => setTimeout(resolve, 600));
    const start = async () => {
      const lite = await PGlite.create();
      const server = new PGLiteSocketServer({ db: lite, port: 0, host: '127.0.0.1' });
      await server.start();
      servers.push({ lite, server });
      return `postgresql://postgres:matkhau-that@127.0.0.1:${server.port}/postgres?sslmode=disable`;
    };
    try {
      const from = await start();
      const to = await start();
      const seed = new PostgresDatabase({ url: from, max: 1 });
      await seed.ready;
      await seed
        .prepare(
          "INSERT INTO staff (username, name, pass_hash, created_at) VALUES ('net_a', 'Mạng A', 'x', '2026-10-31T00:00:00.000Z')"
        )
        .run();
      await seed
        .prepare(
          "INSERT INTO settings (key, value_json) VALUES ('net_thu', '{\"v\":1}') ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json"
        )
        .run();
      await seed.close();
      await settle();

      const r = await pgBackup.backup(from, path.join(tmp, 'net'));
      assert.equal((await pgBackup.verifyFile(r.file)).ok, true);

      await settle();
      const result = await pgBackup.restore(r.file, to);
      assert.ok(result.rows >= 2);
      await settle();
      const check = new PostgresDatabase({ url: to, max: 1 });
      await check.ready;
      assert.equal((await check.prepare("SELECT name FROM staff WHERE username = 'net_a'").get()).name, 'Mạng A');
      assert.equal(
        (await check.prepare("SELECT value_json FROM settings WHERE key = 'net_thu'").get()).value_json,
        '{"v":1}'
      );
      await check.close();
      await settle();
      await assert.rejects(
        () => pgBackup.restore(r.file, to),
        /không rỗng/,
        'khôi phục lần hai vào đích đã có dữ liệu bị từ chối'
      );
    } finally {
      for (const { lite, server } of servers) {
        await server.stop();
        await lite.close();
      }
    }
  }
);
