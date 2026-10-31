// Nâng cấp DB cũ lên schema có kpi_scores và kpi_score_log: mọi dòng cũ còn nguyên, chạy lại lần hai không đổi gì.
// DB thử là file tạm theo schema CŨ (trước KPI 5 thành phần); lib/db chạy trong tiến trình con để mỗi lần `require` là một lần khởi động thật.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const project = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-kpi-migration-'));
const file = path.join(dir, 'old.sqlite');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Schema cũ: các bảng và cột của bản trước, kèm dữ liệu KPI cũ (kpi_pct, kpi_adm_pct) phải sống sót.
function createOldDb() {
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE staff (username TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff',
      type TEXT NOT NULL DEFAULT 'tts', level INTEGER NOT NULL DEFAULT 1, night_pct INTEGER, idorm INTEGER NOT NULL DEFAULT 0,
      shift_code TEXT, pass_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE timesheets (username TEXT NOT NULL, month TEXT NOT NULL, days_json TEXT NOT NULL DEFAULT '{}',
      kpi_pct REAL, kpi_amt REAL, kpi_adm_pct REAL, kpi_adm_amt REAL, updated_at TEXT NOT NULL, PRIMARY KEY (username, month));
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    INSERT INTO staff VALUES ('nv1', 'Nhân viên thử', 'staff', 'nv', 1, 40, 0, 'n1', 'hash', '2026-01-01T00:00:00.000Z');
    INSERT INTO staff VALUES ('adm', 'Quản trị thử', 'admin', 'tts', 0, NULL, 0, NULL, 'hash', '2026-01-01T00:00:00.000Z');
    INSERT INTO timesheets VALUES ('nv1', '2026-09', '{"2026-09-01":{"kind":"work"}}', 90, 5000000, 85, 4500000, '2026-09-30T00:00:00.000Z');
    INSERT INTO timesheets VALUES ('nv1', '2026-10', '{}', 100, NULL, NULL, NULL, '2026-10-10T00:00:00.000Z');
    INSERT INTO settings VALUES ('holidays', '[]');
    INSERT INTO settings VALUES ('actual_hours_from', '{"from":"2026-11-01","setBy":"admin","setAt":"2026-10-14T00:00:00.000Z"}');
  `);
  old.close();
}
// Một lần khởi động: require('lib/db') migrate file này rồi thoát.
const boot = () =>
  execFileSync(process.execPath, ['--no-warnings=ExperimentalWarning', '-e', "require('./lib/db').db.close()"], {
    cwd: project,
    env: { ...process.env, DB_PATH: file },
    stdio: 'pipe'
  });
function snapshot() {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const schema = db
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
      .all()
      .map(r => ({ ...r }));
    const counts = Object.fromEntries(
      schema
        .filter(r => r.type === 'table')
        .map(r => [r.name, db.prepare(`SELECT COUNT(*) AS n FROM ${r.name}`).get().n])
    );
    return { schema, counts };
  } finally {
    db.close();
  }
}

test('DB cũ mở được với mã mới: hai bảng KPI mới và hai index xuất hiện, mọi dòng cũ giữ nguyên', () => {
  createOldDb();
  const before = snapshot();
  assert.ok(!before.schema.some(r => r.name === 'kpi_scores'));
  boot();
  const after = snapshot();
  const names = after.schema.map(r => r.name);
  for (const name of ['kpi_scores', 'kpi_score_log', 'kpi_scores_month', 'kpi_score_log_user_month'])
    assert.ok(names.includes(name), name);
  assert.equal(after.counts.kpi_scores, 0);
  assert.equal(after.counts.kpi_score_log, 0);
  assert.equal(after.counts.staff, before.counts.staff);
  assert.equal(after.counts.timesheets, before.counts.timesheets);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("SELECT * FROM timesheets WHERE username = 'nv1' AND month = '2026-09'").get();
    assert.equal(row.kpi_pct, 90);
    assert.equal(row.kpi_amt, 5000000);
    assert.equal(row.kpi_adm_pct, 85);
    assert.equal(row.kpi_adm_amt, 4500000);
    assert.equal(row.days_json, '{"2026-09-01":{"kind":"work"}}');
    assert.equal(db.prepare("SELECT value_json FROM settings WHERE key = 'holidays'").get().value_json, '[]');
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'kpi_five_from'").get().n,
      0,
      'migration không tạo dòng kpi_five_from (không còn công tắc)'
    );
  } finally {
    db.close();
  }
});

test('chạy migration lần hai và lần ba: schema và số dòng không đổi, dòng điểm đã ghi không mất', () => {
  const afterFirst = snapshot();
  // ghi một dòng điểm thật bằng kho (một lần khởi động riêng) rồi chạy lại migration
  execFileSync(
    process.execPath,
    [
      '--no-warnings=ExperimentalWarning',
      '-e',
      "const s = require('./lib/db'); s.setKpiScores('nv1', '2026-10', { wework: 9000, peer: 8000 }, 'admin', 'thử'); s.db.close()"
    ],
    { cwd: project, env: { ...process.env, DB_PATH: file }, stdio: 'pipe' }
  );
  const written = snapshot();
  assert.deepEqual(written.schema, afterFirst.schema);
  assert.equal(written.counts.kpi_scores, 1);
  assert.equal(written.counts.kpi_score_log, 2);
  boot();
  boot();
  const again = snapshot();
  assert.deepEqual(again.schema, written.schema);
  assert.deepEqual(again.counts, written.counts);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("SELECT wework, peer, user_score FROM kpi_scores WHERE username = 'nv1'").get();
    assert.deepEqual({ ...row }, { wework: 9000, peer: 8000, user_score: null });
  } finally {
    db.close();
  }
});

test('migration thêm bảng và index, không có cột nào bị xoá hay đổi tên ở các bảng cũ', () => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const columns = table =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map(c => c.name);
    for (const col of ['kpi_pct', 'kpi_amt', 'kpi_adm_pct', 'kpi_adm_amt', 'days_json', 'updated_at'])
      assert.ok(columns('timesheets').includes(col), col);
    assert.deepEqual(columns('kpi_scores'), [
      'username',
      'month',
      'wework',
      'user_score',
      'peer',
      'manager',
      'self_score',
      'created_by',
      'created_at',
      'updated_by',
      'updated_at'
    ]);
    assert.deepEqual(columns('kpi_score_log'), [
      'id',
      'username',
      'month',
      'field',
      'old_value',
      'new_value',
      'by',
      'at',
      'reason'
    ]);
  } finally {
    db.close();
  }
});
