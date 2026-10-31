'use strict';
// Kiểm nâng cấp schema trên BẢN SAO của một DB cũ: mọi dòng cũ còn nguyên, migration chạy lần hai không đổi gì, tìm dòng mồ côi.
//   node scripts/db/migration-check.js <đường-dẫn-DB> [--orphans] [--pay] [--months=2026-10,2026-11] [--lib=<thư-mục-repo>]
//
//   (mặc định) sao DB ra thư mục tạm, chụp bảng/cột/số dòng/băm nội dung (chỉ đọc), cho lib/db của repo này migrate bản sao
//              (khởi động thật, hai lần), rồi so: bảng cũ không đổi dòng nào (settings chỉ được thêm khoá), cột cũ giữ nguyên,
//              lần chạy thứ hai không đổi lược đồ hay nội dung, PRAGMA integrity_check = ok.
//   --orphans  thêm: đếm dòng mồ côi (username không còn trong staff) ở các bảng theo người; chỉ in số đếm.
//   --pay      chỉ DB demo: tính lương mọi nhân sự demo các tháng --months bằng lib/db + bộ tạo demo của --lib (mặc định repo này),
//              in băm SHA-256 của kết quả. Chạy một lần với --lib là bản cũ trên DB cũ, một lần với repo mới trên DB đã migrate,
//              hai băm phải giống nhau (không đổi đồng nào).
// AN TOÀN: script KHÔNG BAO GIỜ mở DB gốc để ghi và từ chối data/luong.sqlite (đưa bản sao đã sao lưu bằng
// `sqlite3 data/luong.sqlite ".backup <bản-sao>"` nếu cần kiểm dữ liệu thật). File gốc chỉ được đọc (sao chép); mọi thứ chạy trên bản sao.
// Báo cáo chỉ gồm tên bảng, tên cột và số đếm: không in giá trị nào của dữ liệu.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v === undefined ? true : v];
    })
);
const source = args.find(a => !a.startsWith('--'));
const fail = message => {
  console.error(message);
  process.exit(1);
};
if (!source)
  fail(
    'Cách dùng: node scripts/db/migration-check.js <đường-dẫn-DB-sao-lưu> [--orphans] [--pay] [--months=..] [--lib=..]'
  );
if (source === ':memory:') fail('Cần đường dẫn tới file DB.');

// Đường dẫn chuẩn tắc (giải liên kết, không phân biệt hoa thường trên Windows/macOS): chặn DB lương thật bằng cả đường dẫn lẫn tên file
const canonical = file => {
  const full = path.resolve(file);
  let real = full;
  try {
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
if (
  canonical(source) === canonical(path.join(ROOT, 'data', 'luong.sqlite')) ||
  path.basename(source) === 'luong.sqlite'
)
  fail(
    'Từ chối: đây là DB lương thật (luong.sqlite). Sao lưu bằng `sqlite3 data/luong.sqlite ".backup <bản-sao>"`, đổi tên bản sao rồi chạy lại trên bản sao.'
  );
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) fail('Không thấy file DB: ' + source);

const lib = path.resolve(typeof flags.lib === 'string' ? flags.lib : ROOT);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-migration-check-'));
process.on('exit', () => fs.rmSync(work, { recursive: true, force: true }));
// Bản sao làm việc. Nếu bên cạnh có -wal/-shm (DB đang mở dở) thì sao cả, vì chỉ file .sqlite có thể thiếu ghi gần nhất.
const copy = path.join(work, 'copy.sqlite');
for (const suffix of ['', '-wal', '-shm'])
  if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, copy + suffix);

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
// Chụp chỉ-đọc: bảng (không tính sqlite_*) → cột, số dòng, băm nội dung theo thứ tự rowid; cộng lược đồ (bảng, chỉ mục, trigger)
function snapshot(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const objects = db
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
      .all()
      .map(r => ({ ...r }));
    const tables = {};
    for (const t of objects.filter(o => o.type === 'table')) {
      const columns = db
        .prepare(`PRAGMA table_info("${t.name}")`)
        .all()
        .map(c => c.name);
      const quoted = columns.map(c => `"${c}"`).join(', ');
      const hash = crypto.createHash('sha256');
      let rows = 0;
      for (const row of db.prepare(`SELECT ${quoted} FROM "${t.name}" ORDER BY rowid`).all()) {
        hash.update(JSON.stringify(Object.values(row)) + '\n');
        rows++;
      }
      tables[t.name] = { columns, rows, hash: hash.digest('hex') };
      if (t.name === 'settings')
        tables[t.name].keys = db
          .prepare('SELECT key FROM settings ORDER BY rowid')
          .all()
          .map(r => r.key);
    }
    const integrity = db
      .prepare('PRAGMA integrity_check')
      .all()
      .map(r => Object.values(r)[0]);
    return { objects, tables, schemaHash: sha(JSON.stringify(objects)), integrity };
  } finally {
    db.close();
  }
}
// Hash của các cột CŨ của một bảng (để so sau khi bảng được thêm cột mới), và theo khoá cho settings
function oldColumnsHash(file, table, columns, keyed) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const quoted = columns.map(c => `"${c}"`).join(', ');
    const hash = crypto.createHash('sha256');
    const sql = keyed
      ? `SELECT ${quoted} FROM "${table}" WHERE key IN (${keyed.map(() => '?').join(',')}) ORDER BY rowid`
      : `SELECT ${quoted} FROM "${table}" ORDER BY rowid`;
    for (const row of db.prepare(sql).all(...(keyed || []))) hash.update(JSON.stringify(Object.values(row)) + '\n');
    return hash.digest('hex');
  } finally {
    db.close();
  }
}
// Một lần khởi động thật của lib/db trên bản sao (chạy migrate lúc require) trong tiến trình con
const boot = () =>
  execFileSync(
    process.execPath,
    [
      '--no-warnings=ExperimentalWarning',
      '-e',
      `require(${JSON.stringify(path.join(lib, 'lib', 'db.js'))}).db.close()`
    ],
    {
      cwd: lib,
      env: { ...process.env, DB_PATH: copy },
      stdio: 'pipe'
    }
  );

const problems = [];
const say = (label, value = '') => console.log(`${label.padEnd(44)}${value}`);

if (flags.pay) {
  // Chế độ băm tiền lương (DB demo): phải chạy trên bản sao đã sẵn sàng, tuỳ ý lib (cũ hoặc mới). Lib mới sẽ migrate bản sao trước khi tính.
  const months = String(flags.months || '2026-10,2026-11').split(',');
  const script = `
    const path = require('node:path');
    const lib = ${JSON.stringify(lib)};
    const store = require(path.join(lib, 'lib', 'db.js'));
    const { loadPayroll } = require(path.join(lib, 'lib', 'ai', 'payroll-loader.js'));
    const gen = require(path.join(lib, 'scripts', 'db', 'demo', 'generate.js'));
    const payroll = loadPayroll(path.join(lib, 'public'));
    const g = gen.create({ store, payroll, passHash: 'x' });
    const out = [];
    for (const month of ${JSON.stringify(months)})
      for (const s of store.listStaff().filter(s => s.role !== 'admin'))
        out.push([s.username, month, JSON.stringify(g.computeMonth(s.username, month, '2026-11-26T05:00:00.000Z'))]);
    const crypto = require('node:crypto');
    console.log(JSON.stringify({ count: out.length, digest: crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex') }));
    store.db.close();`;
  const out = execFileSync(process.execPath, ['--no-warnings=ExperimentalWarning', '-e', script], {
    cwd: lib,
    env: { ...process.env, DB_PATH: copy },
    encoding: 'utf8'
  });
  const result = JSON.parse(out.trim().split('\n').pop());
  say('Số kết quả lương (người × tháng)', result.count);
  say('Băm SHA-256 kết quả lương', result.digest);
  process.exit(0);
}

const before = snapshot(copy);
say('DB gốc (chỉ đọc, đã sao ra thư mục tạm)', path.basename(source));
say('Bảng trước khi nâng cấp', Object.keys(before.tables).length);
say('integrity_check trước', before.integrity.join(','));
boot();
const mid = snapshot(copy);
boot();
const after = snapshot(copy);

/* ---------- so sánh ---------- */
const newTables = Object.keys(mid.tables).filter(t => !before.tables[t]);
const addedColumns = [];
for (const [table, was] of Object.entries(before.tables)) {
  const now = mid.tables[table];
  if (!now) {
    problems.push(`Bảng cũ biến mất: ${table}`);
    continue;
  }
  const kept = was.columns.every((c, i) => now.columns[i] === c);
  if (!kept) problems.push(`Cột cũ bị đổi/mất ở bảng ${table}`);
  for (const c of now.columns.filter(c => !was.columns.includes(c))) addedColumns.push(`${table}.${c}`);
  if (table === 'settings') {
    // khoá cũ phải còn nguyên giá trị (khoá mới được thêm)
    if (oldColumnsHash(copy, table, was.columns, was.keys) !== was.hash)
      problems.push('Giá trị một khoá settings cũ đã đổi');
  } else {
    const was2 = oldColumnsHash(copy, table, was.columns);
    if (was.rows !== now.rows || was2 !== was.hash)
      problems.push(`Dòng của bảng ${table} đã đổi (${was.rows} → ${now.rows})`);
  }
}
const settingsGained = mid.tables.settings
  ? mid.tables.settings.rows - (before.tables.settings ? before.tables.settings.rows : 0)
  : 0;
if (JSON.stringify(mid.tables) !== JSON.stringify(after.tables) || mid.schemaHash !== after.schemaHash)
  problems.push('Chạy migration lần hai đã đổi lược đồ hoặc nội dung (không idempotent)');
if (mid.integrity.join() !== 'ok' || after.integrity.join() !== 'ok')
  problems.push('PRAGMA integrity_check không ok sau nâng cấp');

say('Bảng mới', newTables.length ? newTables.join(', ') : '(không)');
say('Cột mới trên bảng cũ', addedColumns.join(', ') || '(không)');
say('Khoá settings mới', settingsGained);
const newObjects = mid.objects.filter(o => !before.objects.some(b => b.name === o.name));
say('Chỉ mục mới', newObjects.filter(o => o.type === 'index').length);
say('Trigger mới', newObjects.filter(o => o.type === 'trigger').length);
console.log('\nSố dòng mỗi bảng cũ (trước → sau lần chạy thứ hai)');
for (const [table, was] of Object.entries(before.tables))
  say(`  ${table}`, `${was.rows} → ${after.tables[table] ? after.tables[table].rows : 'mất'}`);
console.log('\nSố dòng bảng mới (đều phải là 0 trừ khi dữ liệu có sẵn)');
for (const table of newTables) say(`  ${table}`, after.tables[table].rows);

if (flags.orphans) {
  // Khoá ngoại không được bật (TK 3.3): đếm dòng mồ côi để đề xuất bật PRAGMA foreign_keys sau. Chỉ in số đếm.
  const db = new DatabaseSync(copy, { readOnly: true });
  console.log('\nDòng mồ côi (username không còn trong staff)');
  let total = 0;
  for (const table of Object.keys(before.tables)) {
    if (table === 'staff' || !before.tables[table].columns.includes('username')) continue;
    const n = db
      .prepare(
        `SELECT COUNT(*) AS n FROM "${table}" t WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.username = t.username)`
      )
      .get().n;
    total += n;
    say(`  ${table}`, n);
  }
  say('  Tổng', total);
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  say('PRAGMA foreign_key_check (khoá khai báo)', fk.length);
  db.close();
}

console.log('');
if (problems.length) {
  console.log('KHÔNG ĐẠT:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(2);
}
console.log('ĐẠT: mọi dòng và cột cũ còn nguyên, lần chạy thứ hai không đổi gì, integrity_check = ok.');
