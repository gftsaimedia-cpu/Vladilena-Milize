'use strict';
// scripts/db/migrate-sqlite-to-pg.js: chuyển một DB SQLite (dựng bằng chính lib/db.js trong tiến trình con) sang PostgreSQL trong
// tiến trình (PGlite, --to=memory) và đối chiếu số dòng, dấu vân tay từng bảng, tổng tiền từng kỳ lương. Không đụng DB thật.
// Chạy giống nhau ở hai chế độ DB_DIALECT vì mọi thứ chạy trong tiến trình con có môi trường riêng.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fingerprintOf } = require('../../scripts/db/migrate-sqlite-to-pg');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'db', 'migrate-sqlite-to-pg.js');
const LIB_DB = JSON.stringify(path.join(ROOT, 'lib', 'db'));

let tmp;
let source;
const env = { ...process.env };
delete env.DB_DIALECT;
delete env.DATABASE_URL;

// Dựng DB SQLite nguồn bằng lib/db.js: nhân sự, lịch, nhật ký, vai trò, một kỳ lương có phiếu
const SEED = `
const store = require(${LIB_DB});
(async () => {
  await store.ready;
  for (const [username, type] of [['mg_a', 'nv'], ['mg_b', 'ctv'], ['mg_admin', 'tts']])
    await store.upsertStaff({ username, name: 'Người ' + username, role: username === 'mg_admin' ? 'admin' : 'staff', type, level: 1,
      shiftCode: 'n1', startDate: '2026-01-05', passHash: 'x' });
  await store.setSheet('mg_a', '2026-10', { '2026-10-05': { kind: 'work', in: '08:00', out: '17:00' } }, null, null);
  await store.setSetting('holidays', ['2026-10-10']);
  await store.audit.write({ actor: 'mg_admin', action: 'seed.test', entityKind: 'test', entityId: 'x', sensitivity: 'normal', reason: 'Dữ liệu thử' });
  await store.roles.grant('mg_a', 'hr', 'mg_admin');
  await store.periods.lockAttendance('2026-10', { rev: 0, by: 'mg_admin' });
  const run = await store.payroll.createRun('2026-10', { engineVersion: 'test', paramsHash: 'h', paramsRev: 0, params: { a: 1 }, switches: {}, by: 'mg_admin' });
  await store.payroll.addPayslip(run.id, { username: 'mg_a', status: 'draft', gross: 12345678, insurance: 1000000, tax: 200000, advance: 0, net: 11145678, staffTerms: { type: 'nv' }, snapshot: { x: 1 } });
  await store.payroll.addPayslip(run.id, { username: 'mg_b', status: 'draft', gross: 8000000, insurance: 0, tax: 0, advance: 100000, net: 7900000, staffTerms: { type: 'ctv' }, snapshot: { y: 2 } });
  await store.payroll.finishRun(run.id, { total: 20345678, errors: 0 });
  store.db.close();
})().catch(error => { console.error(error); process.exit(1); });
`;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-migrate-'));
  source = path.join(tmp, 'source.sqlite');
  const seeded = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', '-e', SEED], {
    env: { ...env, DB_PATH: source, SESSION_SECRET: 'migrate-test' },
    encoding: 'utf8'
  });
  assert.equal(seeded.status, 0, seeded.stderr);
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const migrate = (extra = []) =>
  spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT, `--from=${source}`, '--to=memory', ...extra], {
    env,
    encoding: 'utf8',
    timeout: 120000
  });

test('chuyển SQLite sang PostgreSQL: mọi bảng khớp số dòng và dấu vân tay, tổng tiền kỳ lương khớp', () => {
  const report = path.join(tmp, 'report.json');
  const r = migrate([`--report=${report}`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ĐỐI CHIẾU: KHỚP/);
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(data.ok, true);
  assert.deepEqual(data.problems, []);
  assert.equal(data.tables.staff.rows, 3);
  assert.equal(data.tables.payslips.rows, 2);
  assert.equal(data.tables.payslips.same, true, 'cột snapshot_gz (BLOB) cũng khớp từng byte');
  assert.equal(data.tables.audit_log.same, true);
  assert.deepEqual(data.payroll, { runs: 1, same: true });
});

test('nguồn không bị ghi: file SQLite giữ nguyên nội dung sau khi chuyển', () => {
  const before = fs.readFileSync(source);
  const r = migrate();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(Buffer.compare(before, fs.readFileSync(source)), 0, 'file nguồn không đổi một byte');
});

test('thiếu --from hoặc --to, hoặc file nguồn không có: dừng với mã 1 và nói rõ', () => {
  const none = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT], { env, encoding: 'utf8' });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /--from=.*--to=/);
  const missing = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT, `--from=${path.join(tmp, 'khong-co.sqlite')}`, '--to=memory'], {
    env,
    encoding: 'utf8'
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Không thấy file nguồn/);
});

test('dấu vân tay bảng nhạy với từng ô, không nhạy với thứ tự dòng', () => {
  const a = [{ id: 1, v: 'x' }, { id: 2, v: 'y', b: new Uint8Array([1, 2]) }];
  assert.equal(fingerprintOf(a), fingerprintOf([...a].reverse()));
  assert.notEqual(fingerprintOf(a), fingerprintOf([{ id: 1, v: 'x' }, { id: 2, v: 'z', b: new Uint8Array([1, 2]) }]));
  assert.notEqual(fingerprintOf(a), fingerprintOf([{ id: 1, v: 'x' }, { id: 2, v: 'y', b: new Uint8Array([1, 3]) }]));
});
