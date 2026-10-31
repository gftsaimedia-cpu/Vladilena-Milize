// Kiểm scripts/ops/backup-daily.js, check-backup.js và restore-drill.js trên DB nguồn tự dựng trong thư mục tạm:
// tiến trình con đặt DB_PATH vào thư mục tạm rồi nạp lib/db.js (lược đồ và migration của app), thêm hai tài khoản qua store.upsertStaff.
// Không đọc gì dưới data/: đường dẫn data/luong.sqlite chỉ xuất hiện như chuỗi ở ca từ chối của restore-drill.js, và ca đó không đọc file.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DAILY = path.join(REPO_ROOT, 'scripts', 'ops', 'backup-daily.js');
const CHECK = path.join(REPO_ROOT, 'scripts', 'ops', 'check-backup.js');
const DRILL = path.join(REPO_ROOT, 'scripts', 'ops', 'restore-drill.js');
// Chạy trong tiến trình con: lib/db.js đọc DB_PATH lúc nạp, tự tạo lược đồ; hai tài khoản bịa để bảng staff có dòng.
const BUILD_SOURCE = `
const store = require(${JSON.stringify(path.join(REPO_ROOT, 'lib', 'db'))});
const auth = require(${JSON.stringify(path.join(REPO_ROOT, 'lib', 'auth'))});
(async () => {
  for (const [username, role] of [['qa_admin', 'admin'], ['qa_staff', 'staff']])
    await store.upsertStaff({
      username, name: 'Người thử ' + username, role, type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1',
      startDate: '2026-01-05', passHash: auth.hashPassword('test-pass')
    });
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  store.db.close();
})();
`;
const NAME_PATTERN = /^luong-\d{8}-\d{6}\.sqlite$/;
const LOG_KEYS = ['bytes', 'db', 'exit', 'file', 'label', 'ms', 'ts', 'verify', 'verify_exit'];

let tmp;
let dbPath;
const env = { ...process.env };
delete env.DB_PATH; // để không tiến trình con nào thừa hưởng DB_PATH của máy đang chạy
// Máy chủ con không thấy web/dist có sẵn trên máy dev (npm run build): "/" về trang đăng nhập như khi chưa build giao diện Vue
env.WEB_DIST = path.join(os.tmpdir(), 'luong-no-web-dist');

const run = (script, args, extraEnv = {}) =>
  spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', script, ...args], {
    cwd: REPO_ROOT,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    windowsHide: true
  });

const copies = dir =>
  fs
    .readdirSync(dir)
    .filter(n => NAME_PATTERN.test(n))
    .sort();
const readLog = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-backup-daily-test-'));
  dbPath = path.join(tmp, 'source.sqlite');
  const built = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', '-e', BUILD_SOURCE], {
    cwd: REPO_ROOT,
    env: { ...env, DB_PATH: dbPath },
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(built.status, 0, built.stderr);
  assert.ok(fs.statSync(dbPath).size > 0, 'DB nguồn đã dựng');
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('backup-daily --verify: sao lưu xong thì kiểm đạt, ghi đúng một dòng JSON không có dữ liệu', () => {
  const dir = path.join(tmp, 'daily');
  const log = path.join(tmp, 'daily.jsonl');
  const r = run(DAILY, [`--db=${dbPath}`, `--dir=${dir}`, '--keep=3', '--verify', '--label=daily', `--log=${log}`]);
  assert.equal(r.status, 0, r.stderr);

  const names = copies(dir);
  assert.equal(names.length, 1);
  const file = path.join(dir, names[0]);
  assert.ok(fs.statSync(file).size > 0);

  const lines = readLog(log);
  assert.equal(lines.length, 1, 'mỗi lần chạy đúng một dòng log');
  const entry = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(entry).sort(), LOG_KEYS, 'log chỉ có các trường vận hành đã định');
  assert.equal(entry.label, 'daily');
  assert.equal(entry.db, 'source.sqlite', 'chỉ ghi tên file DB, không ghi đường dẫn');
  assert.equal(entry.file, names[0]);
  assert.equal(entry.bytes, fs.statSync(file).size);
  assert.equal(entry.verify, 'ok');
  assert.equal(entry.verify_exit, 0);
  assert.equal(entry.exit, 0);
  assert.ok(entry.ms >= 0 && Number.isInteger(entry.ms));
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+07:00$/, 'thời điểm theo giờ Việt Nam');
  assert.ok(!lines[0].includes(tmp), 'không ghi đường dẫn máy');
});

test('xoay vòng: chạy 4 lần với --keep=3 thì xoá bản cũ nhất và chỉ còn 3 bản', async () => {
  const dir = path.join(tmp, 'rotate');
  const kept = [];
  for (let i = 0; i < 4; i++) {
    // Tên bản sao có độ phân giải một giây: chờ qua giây để không đụng "đã có bản cùng tên".
    if (i > 0) await sleep(1100);
    const r = run(DAILY, [`--db=${dbPath}`, `--dir=${dir}`, '--keep=3']);
    assert.equal(r.status, 0, r.stderr);
    kept.push(copies(dir));
  }
  assert.equal(kept[0].length, 1);
  assert.equal(kept[3].length, 3, 'giữ đúng 3 bản sau lần thứ tư');
  const left = copies(dir);
  assert.equal(left.length, 3);
  assert.ok(!left.includes(kept[0][0]), 'bản cũ nhất đã bị xoá');
});

test('check-backup: bản mới thì đạt và không in gì; thư mục trống thì hỏng, in đúng một dòng lý do', () => {
  const ok = run(CHECK, [`--dir=${path.join(tmp, 'daily')}`, '--max-age-hours=26']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, '', 'đạt thì không in gì');
  assert.equal(ok.stderr, '');

  const empty = path.join(tmp, 'empty');
  fs.mkdirSync(empty);
  const bad = run(CHECK, [`--dir=${empty}`, '--max-age-hours=26']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /không có bản sao lưu luong-\*\.sqlite/);
  assert.equal(bad.stderr.trim().split(/\r?\n/).length, 1, 'chỉ một dòng lý do');
});

test('check-backup: bản quá hạn thì hỏng kèm số giờ; bản .failed mới hơn bản lành cũng hỏng', () => {
  const source = path.join(tmp, 'daily', copies(path.join(tmp, 'daily'))[0]);

  const stale = path.join(tmp, 'stale');
  fs.mkdirSync(stale);
  const old = path.join(stale, 'luong-20260101-000000.sqlite');
  fs.copyFileSync(source, old);
  const oldAt = new Date(Date.now() - 48 * 3600 * 1000);
  fs.utimesSync(old, oldAt, oldAt);
  const tooOld = run(CHECK, [`--dir=${stale}`, '--max-age-hours=26']);
  assert.equal(tooOld.status, 1);
  assert.match(tooOld.stderr, /đã 48 giờ \(quá 26 giờ\)/);

  const broken = path.join(tmp, 'broken');
  fs.mkdirSync(broken);
  const good = path.join(broken, 'luong-20260101-000001.sqlite');
  fs.copyFileSync(source, good);
  const anHourAgo = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(good, anHourAgo, anHourAgo);
  fs.writeFileSync(good + '.failed', 'ban hong');
  const failed = run(CHECK, [`--dir=${broken}`, '--max-age-hours=26']);
  assert.equal(failed.status, 1, 'bản mới nhất bị đánh dấu hỏng thì không đạt');
  assert.match(failed.stderr, /đánh dấu hỏng/);
});

test('restore-drill trên một bản sao: máy chủ chạy được, 302 / 200 / 401', () => {
  const file = path.join(tmp, 'daily', copies(path.join(tmp, 'daily'))[0]);
  const r = run(DRILL, [`--backup=${file}`]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /-> 302/);
  assert.match(r.stdout, /-> 200, \d+ byte/);
  assert.match(r.stdout, /-> 401/);
  assert.match(r.stdout, /KẾT QUẢ: ĐẠT/);
});

test('restore-drill khi web/dist có index.html: GET / trả 200 là trang HTML của giao diện Vue, vẫn ĐẠT', () => {
  const dist = fs.mkdtempSync(path.join(tmp, 'web-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="app"></div></body></html>');
  const file = path.join(tmp, 'daily', copies(path.join(tmp, 'daily'))[0]);
  const r = run(DRILL, [`--backup=${file}`], { WEB_DIST: dist });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /GET \/ +-> 200, \d+ byte +\[ĐẠT\]/);
  assert.doesNotMatch(r.stdout, /-> 302/);
  assert.match(r.stdout, /-> 401/);
  assert.match(r.stdout, /KẾT QUẢ: ĐẠT/);
});

test('restore-drill từ chối luong.sqlite và file .partial, không chép gì', () => {
  // Ca duy nhất trong file này nhắc tới DB thật: chỉ để khẳng định nó bị từ chối, và script từ chối theo TÊN
  // trước khi mở file nên DB thật không bị đọc.
  const real = run(DRILL, ['--backup=data/luong.sqlite']);
  assert.equal(real.status, 1);
  assert.match(real.stderr, /từ chối luong\.sqlite/);
  assert.equal(real.stdout, '', 'không in bước chép nào: chưa đụng file');

  const partial = run(DRILL, [`--backup=${path.join(tmp, 'x.sqlite.partial')}`]);
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /file tạm/);
});
