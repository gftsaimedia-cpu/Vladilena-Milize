'use strict';
// scripts/db/migrate-sqlite-to-pg.ts: chuyển một DB SQLite (file fixture của lược đồ cũ) sang PostgreSQL trong
// tiến trình (PGlite, --to=memory) và đối chiếu số dòng, dấu vân tay từng bảng, tổng tiền từng kỳ lương. Không đụng DB thật.
// Chạy giống nhau ở hai chế độ DB_DIALECT vì mọi thứ chạy trong tiến trình con có môi trường riêng.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { fingerprintOf } = require('../../scripts/db/migrate-sqlite-to-pg');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'db', 'migrate-sqlite-to-pg.js');

let tmp;
let source;
const env = { ...process.env };
delete env.DATABASE_URL;

// Nguồn: bản cắt nhỏ của bộ dữ liệu demo khi lược đồ còn là SQLite (test/fixtures/legacy-demo.sqlite.gz): 73 nhân sự, 6 kỳ lương, 408 phiếu.
// Giữ làm bằng chứng cho công cụ chuyển dữ liệu cũ; ứng dụng không còn mở SQLite.
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'legacy-demo.sqlite.gz');

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-migrate-'));
  source = path.join(tmp, 'source.sqlite');
  fs.writeFileSync(source, zlib.gunzipSync(fs.readFileSync(FIXTURE)));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const migrate = (extra: any[] = []) =>
  spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', SCRIPT, `--from=${source}`, '--to=memory', ...extra],
    {
      env,
      encoding: 'utf8',
      timeout: 120000
    }
  );

test('chuyển SQLite sang PostgreSQL: mọi bảng khớp số dòng và dấu vân tay, tổng tiền kỳ lương khớp', () => {
  const report = path.join(tmp, 'report.json');
  const r = migrate([`--report=${report}`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ĐỐI CHIẾU: KHỚP/);
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(data.ok, true);
  assert.deepEqual(data.problems, []);
  assert.equal(data.tables.staff.rows, 73);
  assert.equal(data.tables.payslips.rows, 408);
  assert.equal(data.tables.payslips.same, true, 'cột snapshot_gz (BLOB) cũng khớp từng byte');
  assert.equal(data.tables.audit_log.same, true);
  assert.deepEqual(data.payroll, { runs: 6, same: true });
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
  const missing = spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', SCRIPT, `--from=${path.join(tmp, 'khong-co.sqlite')}`, '--to=memory'],
    {
      env,
      encoding: 'utf8'
    }
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Không thấy file nguồn/);
});

test('dấu vân tay bảng nhạy với từng ô, không nhạy với thứ tự dòng', () => {
  const a = [
    { id: 1, v: 'x' },
    { id: 2, v: 'y', b: new Uint8Array([1, 2]) }
  ];
  assert.equal(fingerprintOf(a), fingerprintOf([...a].reverse()));
  assert.notEqual(
    fingerprintOf(a),
    fingerprintOf([
      { id: 1, v: 'x' },
      { id: 2, v: 'z', b: new Uint8Array([1, 2]) }
    ])
  );
  assert.notEqual(
    fingerprintOf(a),
    fingerprintOf([
      { id: 1, v: 'x' },
      { id: 2, v: 'y', b: new Uint8Array([1, 3]) }
    ])
  );
});
