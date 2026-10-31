'use strict';
/*
 * Xem hoặc lùi chế độ tham số về "defaults-only" (công tắc lùi nhanh của bộ máy tham số).
 * Script này KHÔNG bật được chế độ "active" (bật là bước triển khai riêng:
 * PARAMS_ALLOW_ACTIVATE=1 rồi Admin Lưu lần đầu trên màn Cài đặt).
 *
 * Dùng:
 *   DB_PATH=<db> node scripts/ops/params-mode.js status
 *   DB_PATH=<db> BACKUP_DIR=<thư-mục-sao-lưu> node scripts/ops/params-mode.js defaults-only --reason "<10 đến 300 ký tự>" --yes
 *
 * `status` chỉ đọc (mở DB ở chế độ readOnly). `defaults-only`:
 *   1. đổi từ "active": sao lưu DB bằng backup-db.js vào BACKUP_DIR (hoặc --backup-dir=...), không có thì từ chối chạy;
 *   2. trong MỘT giao dịch: settings.params_mode = 'defaults-only', tăng config_rev (màn hình và GET /api/settings/version
 *      thấy cấu hình đã đổi) và ghi một dòng nhật ký `param.mode` vào chuỗi băm (actor = "ops:<người dùng hệ điều hành>");
 *   3. không sửa, không xoá dòng nào của param_versions (lịch sử giữ nguyên, bật lại thì các dòng có hiệu lực trở lại).
 * Máy chủ đọc params_mode ở MỌI yêu cầu nên có hiệu lực ngay, kể cả khi app đang chạy; nên chạy khi ít người dùng.
 * Kỳ lương đã tính hoặc chốt giữ bản chụp tham số của lần chạy nên không đổi.
 * Chỉ in số đếm và tên chế độ; không in giá trị tham số, tên nhân sự, khoá hay mật khẩu.
 * Cần AUDIT_KEY trong môi trường nếu máy chủ dùng nó (để dòng nhật ký mới nối đúng kiểu băm của chuỗi).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const REASON_MIN = 10; // cùng giới hạn với param_versions.reason và lib/config.js REASON_MIN / REASON_MAX
const REASON_MAX = 300;
const ACTOR_MAX = 60;

class OpsError extends Error {}

function parseArgs(argv) {
  const out = { command: null, reason: null, yes: false, backupDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes') out.yes = true;
    else if (a === '--reason') out.reason = argv[++i] ?? '';
    else if (a.startsWith('--reason=')) out.reason = a.slice('--reason='.length);
    else if (a.startsWith('--backup-dir=')) out.backupDir = a.slice('--backup-dir='.length);
    else if (a.startsWith('--')) throw new OpsError('Tuỳ chọn lạ: ' + a);
    else if (!out.command) out.command = a;
    else throw new OpsError('Chỉ nhận một lệnh.');
  }
  if (out.command !== 'status' && out.command !== 'defaults-only')
    throw new OpsError('Lệnh phải là "status" hoặc "defaults-only". Xem phần đầu file để biết cách dùng.');
  return out;
}

function requireDbPath() {
  const dbPath = process.env.DB_PATH;
  if (!dbPath)
    throw new OpsError('Thiếu DB_PATH: đặt đường dẫn file DB (không có mặc định, để không mở nhầm DB thật).');
  if (dbPath === ':memory:' || dbPath.startsWith('file:')) throw new OpsError('DB_PATH phải là file trên đĩa.');
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) throw new OpsError('Không thấy file DB tại DB_PATH.');
  return path.resolve(dbPath);
}

const settingOf = (db, key, fallback) => {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
};
const modeOf = value => (value === 'active' ? 'active' : 'defaults-only');

// Chỉ đọc: chế độ, số phiên bản chung, số dòng phiên bản tham số, id dòng cuối nhật ký
function status(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    const count = table => {
      try {
        return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      } catch {
        return null; // bảng chưa có (DB cũ)
      }
    };
    const lastAudit = (() => {
      try {
        return db.prepare('SELECT MAX(id) AS id FROM audit_log').get().id;
      } catch {
        return null;
      }
    })();
    return {
      mode: modeOf(settingOf(db, 'params_mode', 'defaults-only')),
      configRev: settingOf(db, 'config_rev', 0),
      paramVersionRows: count('param_versions'),
      lastAuditId: lastAudit
    };
  } finally {
    db.close();
  }
}

// Băm của dòng cuối nhật ký (chỉ để biết kiểu băm); null nếu nhật ký trống hoặc chưa có bảng
function lastAuditHash(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
    return row ? String(row.hash) : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function toDefaultsOnly({ dbPath, reason, backupDir }) {
  const before = status(dbPath);
  if (before.mode === 'defaults-only') return { changed: false, before };
  // Nhật ký đã ký HMAC mà thiếu AUDIT_KEY thì dòng mới sẽ chỉ là SHA-256 thường: chuỗi vẫn nối nhưng dòng đó mất bảo vệ HMAC
  if (!process.env.AUDIT_KEY && (lastAuditHash(dbPath) || '').startsWith('hmac-sha256:'))
    throw new OpsError(
      'Nhật ký của DB này ký bằng HMAC: đặt AUDIT_KEY (đúng khoá của máy chủ) trong môi trường rồi chạy lại.'
    );
  const backup = require('./backup-db').backup({
    dbPath,
    outDir: backupDir,
    keep: process.env.BACKUP_KEEP
  });
  process.env.DB_PATH = dbPath; // lib/db.js đọc DB_PATH lúc require
  const store = require('../../lib/db');
  const audit = require('../../lib/audit');
  const configRev = require('../../lib/params/config-rev');
  store.db.exec('PRAGMA busy_timeout = 10000'); // app đang ghi thì chờ thay vì báo bận ngay
  const os_user = String(os.userInfo().username || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
  const ctx = { actor: ('ops:' + os_user).slice(0, ACTOR_MAX), actorRoles: [], requestId: 'ops-' + Date.now() };
  let rev;
  store.transaction(() => {
    store.setSetting('params_mode', 'defaults-only');
    rev = configRev.bump();
    audit.write(ctx, {
      action: 'param.mode',
      entityKind: 'setting',
      entityId: 'params_mode',
      before: { mode: before.mode },
      after: { mode: 'defaults-only', via: 'ops-script' },
      reason
    });
  });
  const after = status(dbPath);
  store.db.close();
  return { changed: true, before, after, backup, configRev: rev };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const dbPath = requireDbPath();
    if (args.command === 'status') {
      const s = status(dbPath);
      console.log(`params_mode: ${s.mode}`);
      console.log(`config_rev: ${s.configRev}`);
      console.log(`Dòng phiên bản tham số (param_versions): ${s.paramVersionRows ?? 'bảng chưa có'}`);
      console.log(`Dòng cuối nhật ký: id=${s.lastAuditId ?? 'chưa có'}`);
      return;
    }
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (reason.length < REASON_MIN || reason.length > REASON_MAX)
      throw new OpsError(`Cần --reason "..." từ ${REASON_MIN} đến ${REASON_MAX} ký tự (ghi vào nhật ký).`);
    if (!args.yes) throw new OpsError('Thêm --yes để xác nhận lùi về defaults-only trên DB tại DB_PATH.');
    const backupDir = args.backupDir || process.env.BACKUP_DIR;
    if (!backupDir)
      throw new OpsError('Thiếu thư mục sao lưu (--backup-dir=... hoặc BACKUP_DIR): luôn sao lưu trước khi đổi.');
    const r = toDefaultsOnly({ dbPath, reason, backupDir });
    if (!r.changed) return console.log('Đã ở chế độ defaults-only, không đổi gì.');
    console.log(`Đã sao lưu trước khi đổi: ${r.backup.name} (${r.backup.size} byte)`);
    console.log(`params_mode: ${r.before.mode} -> ${r.after.mode}; config_rev ${r.before.configRev} -> ${r.configRev}`);
    console.log(
      `Dòng phiên bản tham số giữ nguyên: ${r.after.paramVersionRows}. Dòng cuối nhật ký: id=${r.after.lastAuditId}.`
    );
    console.log('Máy chủ áp dụng ngay ở yêu cầu kế tiếp. Màn hình đang mở thấy khi tải lại.');
  } catch (err) {
    console.error(
      'Lỗi: ' +
        (err instanceof OpsError || err.constructor.name === 'BackupError'
          ? err.message
          : 'không thực hiện được (' + (err && err.code ? err.code : 'lỗi') + ').')
    );
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseArgs, status, toDefaultsOnly, OpsError };
