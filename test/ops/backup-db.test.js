// Kiểm tra scripts/ops/backup-db.js trên DB tạm tự tạo; không đụng tới data/.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { backup, vnStamp, BackupError, NAME_PATTERN } = require('../../scripts/ops/backup-db');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ops', 'backup-db.js');
const MARKER = 'DU-LIEU-NHAY-CAM-KHONG-DUOC-IN';
let tmp;
let dbPath;
let writer;

function count(file, table) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  } finally {
    db.close();
  }
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-backup-test-'));
  dbPath = path.join(tmp, 'live.sqlite');
  writer = new DatabaseSync(dbPath);
  writer.exec('PRAGMA journal_mode = WAL');
  // Không tự checkpoint: dữ liệu mới nằm trong file -wal, đúng tình huống "app đang chạy"
  writer.exec('PRAGMA wal_autocheckpoint = 0');
  writer.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY, name TEXT)');
  writer.exec('CREATE TABLE sheets (id INTEGER PRIMARY KEY, v TEXT)');
  const ins = writer.prepare('INSERT INTO staff (name) VALUES (?)');
  for (let i = 0; i < 25; i++) ins.run(i === 0 ? MARKER : 'nhan-vien-' + i);
  const ins2 = writer.prepare('INSERT INTO sheets (v) VALUES (?)');
  for (let i = 0; i < 7; i++) ins2.run('x' + i);
});

after(() => {
  try {
    writer.close();
  } catch {
    /* đã đóng */
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('vnStamp: giờ Việt Nam (UTC+7), qua nửa đêm sang ngày sau', () => {
  assert.equal(vnStamp(Date.UTC(2026, 9, 15, 17, 30, 0)), '20261016-003000');
  assert.equal(vnStamp(Date.UTC(2026, 9, 15, 2, 5, 9)), '20261015-090509');
});

test('bản sao mở được, đủ số dòng như DB đang chạy (kể cả phần còn trong -wal), không sót file tạm', () => {
  assert.ok(fs.existsSync(dbPath + '-wal'), 'tiền điều kiện: dữ liệu đang nằm trong -wal');
  const out = path.join(tmp, 'out1');
  const r = backup({ dbPath, outDir: out, keep: '30', now: Date.UTC(2026, 9, 15, 5, 0, 0) });
  assert.equal(r.name, 'luong-20261015-120000.sqlite');
  assert.match(r.name, NAME_PATTERN);
  assert.ok(r.size > 0);
  const file = path.join(out, r.name);
  assert.equal(fs.statSync(file).size, r.size);
  assert.equal(count(file, 'staff'), 25);
  assert.equal(count(file, 'sheets'), 7);
  const db = new DatabaseSync(file, { readOnly: true });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  db.close();
  assert.deepEqual(fs.readdirSync(out), [r.name]);
});

test('bản sao là ảnh chụp: ghi thêm vào DB sau đó không làm đổi bản đã sao', () => {
  const out = path.join(tmp, 'out-snap');
  const r = backup({ dbPath, outDir: out, now: Date.UTC(2026, 9, 15, 6, 0, 0) });
  writer.prepare('INSERT INTO sheets (v) VALUES (?)').run('muon-hon');
  assert.equal(count(path.join(out, r.name), 'sheets'), 7);
  assert.equal(count(dbPath, 'sheets'), 8);
  writer.prepare('DELETE FROM sheets WHERE v = ?').run('muon-hon');
});

test('xoay vòng: chỉ giữ BACKUP_KEEP bản mới nhất, không đụng file lạ', () => {
  const out = path.join(tmp, 'out-rotate');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'ghi-chu.txt'), 'giu lai');
  fs.writeFileSync(path.join(out, 'luong-20260101-000000.sqlite.partial'), 'giu lai');
  const names = [];
  for (let i = 0; i < 5; i++) {
    const r = backup({ dbPath, outDir: out, keep: '3', now: Date.UTC(2026, 9, 10 + i, 0, 0, 0) });
    names.push(r.name);
    if (i === 4) {
      assert.equal(r.removed, 1);
      assert.equal(r.kept, 3);
    }
  }
  const left = fs.readdirSync(out).filter(n => NAME_PATTERN.test(n));
  assert.deepEqual(left, names.slice(2));
  assert.ok(fs.existsSync(path.join(out, 'ghi-chu.txt')));
  assert.ok(fs.existsSync(path.join(out, 'luong-20260101-000000.sqlite.partial')));
});

test('mặc định giữ 30 bản khi không đặt BACKUP_KEEP', () => {
  const out = path.join(tmp, 'out-default');
  for (let i = 0; i < 32; i++) backup({ dbPath, outDir: out, now: Date.UTC(2026, 8, 1 + i, 0, 0, 0) });
  assert.equal(fs.readdirSync(out).filter(n => NAME_PATTERN.test(n)).length, 30);
});

test('BACKUP_KEEP không hợp lệ bị từ chối và không xoá gì', () => {
  const out = path.join(tmp, 'out-badkeep');
  const r = backup({ dbPath, outDir: out, now: Date.UTC(2026, 9, 1, 0, 0, 0) });
  for (const bad of ['0', '-1', 'abc', '2.5', '1e3']) {
    assert.throws(() => backup({ dbPath, outDir: out, keep: bad, now: Date.UTC(2026, 9, 2, 0, 0, 0) }), BackupError);
  }
  assert.deepEqual(fs.readdirSync(out), [r.name]);
});

test('từ chối khi thiếu DB_PATH, DB trong bộ nhớ, file không tồn tại hoặc thiếu thư mục sao lưu', () => {
  const out = path.join(tmp, 'out-refuse');
  assert.throws(() => backup({ dbPath: '', outDir: out }), /DB_PATH/);
  assert.throws(() => backup({ dbPath: undefined, outDir: out }), /DB_PATH/);
  assert.throws(() => backup({ dbPath: ':memory:', outDir: out }), /file trên đĩa/);
  assert.throws(() => backup({ dbPath: path.join(tmp, 'khong-co.sqlite'), outDir: out }), /Không thấy file DB/);
  assert.throws(() => backup({ dbPath: tmp, outDir: out }), /Không thấy file DB/);
  assert.throws(() => backup({ dbPath, outDir: '' }), /thư mục sao lưu/);
  assert.equal(fs.existsSync(out), false, 'không tạo thư mục khi bị từ chối');
});

test('từ chối thư mục sao lưu nằm trong public/ (kể cả thư mục con chưa tồn tại)', () => {
  const pub = path.join(tmp, 'public');
  fs.mkdirSync(pub);
  assert.throws(() => backup({ dbPath, outDir: pub, publicDir: pub }), /public/);
  assert.throws(() => backup({ dbPath, outDir: path.join(pub, 'a', 'b'), publicDir: pub }), /public/);
  assert.throws(() => backup({ dbPath, outDir: path.join(pub, '..', 'public', 'x'), publicDir: pub }), /public/);
  assert.equal(fs.existsSync(path.join(pub, 'a')), false);
  assert.deepEqual(fs.readdirSync(pub), []);
  // thư mục cùng tiền tố tên nhưng nằm ngoài thì được
  const ok = backup({ dbPath, outDir: path.join(tmp, 'public-backups'), publicDir: pub });
  assert.match(ok.name, NAME_PATTERN);
});

test('từ chối symlink trỏ vào public/', t => {
  const pub = path.join(tmp, 'public-sym');
  fs.mkdirSync(pub);
  const link = path.join(tmp, 'link-to-public');
  try {
    fs.symlinkSync(pub, link, 'junction');
  } catch {
    t.skip('không tạo được symlink trên máy này');
    return;
  }
  assert.throws(() => backup({ dbPath, outDir: path.join(link, 'x'), publicDir: pub }), /public/);
});

test('từ chối thư mục public/ thật của dự án khi dùng giá trị mặc định', () => {
  const real = path.join(__dirname, '..', '..', 'public', 'backup-test-khong-tao');
  assert.throws(() => backup({ dbPath, outDir: real }), /public/);
  assert.equal(fs.existsSync(real), false);
});

test('khôi phục thử trên bản sao: chép đè, xoá -wal và -shm cũ, mở lại đủ số dòng', () => {
  const out = path.join(tmp, 'out-restore');
  const r = backup({ dbPath, outDir: out, now: Date.UTC(2026, 9, 15, 7, 0, 0) });
  const target = path.join(tmp, 'restored', 'luong.sqlite');
  fs.mkdirSync(path.dirname(target));
  // DB "hỏng" kèm -wal/-shm cũ không còn khớp
  fs.writeFileSync(target, 'hong');
  fs.writeFileSync(target + '-wal', 'wal cu');
  fs.writeFileSync(target + '-shm', 'shm cu');
  fs.copyFileSync(path.join(out, r.name), target);
  fs.rmSync(target + '-wal', { force: true });
  fs.rmSync(target + '-shm', { force: true });
  const db = new DatabaseSync(target);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staff').get().n, 25);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sheets').get().n, 7);
  db.exec('PRAGMA journal_mode = WAL');
  db.prepare('INSERT INTO sheets (v) VALUES (?)').run('ghi-duoc-sau-khoi-phuc');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sheets').get().n, 8);
  db.close();
});

test('CLI chỉ in tên file và dung lượng, không in dữ liệu; thiếu DB_PATH thì thoát mã 1', () => {
  const out = path.join(tmp, 'out-cli');
  const env = { ...process.env, DB_PATH: dbPath, BACKUP_KEEP: '5' };
  const ok = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT, out], { env, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Đã sao lưu: luong-\d{8}-\d{6}\.sqlite \(\d+ byte\)/);
  assert.ok(!ok.stdout.includes(MARKER) && !ok.stderr.includes(MARKER));
  assert.ok(!ok.stdout.includes(tmp), 'không in đường dẫn DB');

  const noDb = { ...process.env, BACKUP_DIR: out };
  delete noDb.DB_PATH;
  const bad = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', SCRIPT], {
    env: noDb,
    encoding: 'utf8'
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /DB_PATH/);
});
