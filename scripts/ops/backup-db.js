'use strict';
/*
 * Sao lưu DB SQLite đang chạy (chế độ WAL) thành một bản sao nhất quán.
 *
 * Dùng:   DB_PATH=<đường-dẫn-DB> node scripts/ops/backup-db.js [thư-mục-sao-lưu]
 * Biến:   DB_PATH      bắt buộc, file DB cần sao lưu (không đọc .env, để không đụng tới bí mật)
 *         BACKUP_DIR   thư mục sao lưu nếu không truyền tham số (mặc định ./backups, đã nằm trong .gitignore)
 *         BACKUP_KEEP  số bản giữ lại (mặc định 30, số nguyên >= 1)
 *
 * Cách làm: mở DB ở chế độ chỉ đọc rồi chạy VACUUM INTO (một giao dịch đọc nên bản sao nhất quán dù app đang ghi;
 * node:sqlite chỉ có API backup từ Node 22.16, còn dự án yêu cầu >= 22.13). Bản sao được ghi ra file tạm, kiểm
 * PRAGMA integrity_check rồi mới đổi tên; chỉ sau đó mới xoá các bản cũ vượt quá BACKUP_KEEP.
 *
 * Chỉ in tên file và dung lượng, không bao giờ in dữ liệu. Chỉ xoá file đúng mẫu luong-YYYYMMDD-HHMMSS.sqlite.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const DEFAULT_KEEP = 30;
const NAME_PATTERN = /^luong-\d{8}-\d{6}\.sqlite$/;

class BackupError extends Error {}

// Múi giờ nghiệp vụ Asia/Ho_Chi_Minh là UTC+7 cố định (Việt Nam không có giờ mùa hè), nên không cần Intl.
function vnStamp(ms) {
  const iso = new Date(ms + 7 * 3600 * 1000).toISOString(); // 2026-10-15T14:05:09.123Z, đã cộng 7 giờ
  return iso.slice(0, 10).replaceAll('-', '') + '-' + iso.slice(11, 19).replaceAll(':', '');
}

// realpath của phần đã tồn tại + phần còn lại chưa tạo: bắt được cả symlink trỏ vào public/.
function realResolve(p) {
  let cur = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    tail.unshift(path.basename(cur));
    cur = up;
  }
  return path.join(fs.realpathSync(cur), ...tail);
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function parseKeep(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_KEEP;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw new BackupError('BACKUP_KEEP phải là số nguyên từ 1 trở lên (mặc định ' + DEFAULT_KEEP + ').');
  }
  return Number(value);
}

function sqlQuote(s) {
  return "'" + s.replaceAll("'", "''") + "'";
}

function backup({ dbPath, outDir, keep, now = Date.now(), publicDir = PUBLIC_DIR }) {
  if (!dbPath) throw new BackupError('Thiếu DB_PATH: đặt đường dẫn file DB cần sao lưu.');
  if (dbPath === ':memory:' || dbPath.startsWith('file:')) throw new BackupError('DB_PATH phải là file trên đĩa.');
  if (!outDir) throw new BackupError('Thiếu thư mục sao lưu (tham số dòng lệnh hoặc BACKUP_DIR).');
  const keepN = parseKeep(keep);

  const src = path.resolve(dbPath);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new BackupError('Không thấy file DB tại DB_PATH.');

  const dest = realResolve(outDir);
  if (isInside(dest, realResolve(publicDir))) {
    throw new BackupError('Thư mục sao lưu không được nằm trong public/ (mọi file ở đó ai cũng tải được).');
  }
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });

  const name = 'luong-' + vnStamp(now) + '.sqlite';
  const finalPath = path.join(dest, name);
  const tmpPath = finalPath + '.partial';
  if (fs.existsSync(finalPath))
    throw new BackupError('Bản sao ' + name + ' đã có (chạy hai lần trong một giây): thử lại sau.');
  fs.rmSync(tmpPath, { force: true });

  let db;
  let copy;
  try {
    db = new DatabaseSync(src, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec('VACUUM INTO ' + sqlQuote(tmpPath));
    db.close();
    db = null;

    copy = new DatabaseSync(tmpPath, { readOnly: true });
    const check = copy.prepare('PRAGMA integrity_check').all();
    copy.close();
    copy = null;
    if (check.length !== 1 || check[0].integrity_check !== 'ok')
      throw new BackupError('Bản sao không qua integrity_check.');

    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, finalPath);
  } catch (err) {
    try {
      db && db.close();
      copy && copy.close();
    } catch {
      /* đã đóng */
    }
    fs.rmSync(tmpPath, { force: true });
    if (err instanceof BackupError) throw err;
    throw new BackupError('Sao lưu thất bại: ' + (err && err.message ? err.message : String(err)));
  }

  // Xoá bản cũ chỉ sau khi bản mới đã xong; tên có dấu thời gian nên sắp xếp chữ cái cũng là sắp theo thời gian.
  const copies = fs
    .readdirSync(dest)
    .filter(n => NAME_PATTERN.test(n))
    .sort();
  const stale = copies.slice(0, Math.max(0, copies.length - keepN));
  for (const n of stale) fs.rmSync(path.join(dest, n), { force: true });

  return { name, size: fs.statSync(finalPath).size, removed: stale.length, kept: copies.length - stale.length };
}

function main() {
  try {
    const outDir = process.argv[2] || process.env.BACKUP_DIR || path.join(REPO_ROOT, 'backups');
    const r = backup({ dbPath: process.env.DB_PATH, outDir, keep: process.env.BACKUP_KEEP });
    console.log('Đã sao lưu: ' + r.name + ' (' + r.size + ' byte)');
    console.log('Đang giữ ' + r.kept + ' bản' + (r.removed ? ', đã xoá ' + r.removed + ' bản cũ.' : '.'));
  } catch (err) {
    console.error('Lỗi: ' + (err instanceof BackupError ? err.message : 'sao lưu thất bại.'));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { backup, vnStamp, BackupError, NAME_PATTERN };
