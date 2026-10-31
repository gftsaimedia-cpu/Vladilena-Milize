'use strict';
/*
 * Một lệnh cho Windows Scheduled Task: sao lưu DB đang chạy, (tuỳ chọn) kiểm ngay bản vừa tạo, ghi MỘT dòng JSON vào log.
 *
 * Dùng:
 *   node scripts/ops/backup-daily.js --db=<file-DB> --dir=<thư mục sao lưu> [--keep=<n>] [--verify]
 *        [--log=<file.jsonl>] [--label=daily|weekly|monthly]
 *
 *   --db     file DB cần sao lưu. Bỏ trống thì lấy DB_PATH trong môi trường (đường dẫn tuyệt đối hoá theo thư mục đang đứng).
 *   --dir    thư mục chứa bản sao (mỗi bậc một thư mục: daily/weekly/monthly). Không được nằm trong public/.
 *   --keep   số bản giữ lại trong thư mục đó; bỏ trống thì BACKUP_KEEP, cuối cùng là 30 (như backup-db.js).
 *   --verify chạy scripts/ops/verify-backup.js trên đúng file vừa tạo; mã thoát 2 (thiếu AUDIT_KEY) tính là HỎNG.
 *   --log    nối thêm một dòng JSON cho mỗi lần chạy (không có thì không ghi log).
 *   --label  bậc sao lưu, chỉ để ghi log và đặt tên thư mục ở phía Task Scheduler.
 *
 * Việc sao lưu và việc từ chối đường dẫn sai đều do backup-db.js quyết (script này KHÔNG tự kiểm đường dẫn lần nữa):
 * nó gọi backup() của file đó. Vì vậy mọi kiểm tra (thiếu file, DB trong bộ nhớ, thư mục trong public/, --keep sai)
 * giữ đúng một nguồn.
 *
 * Kiểm hỏng thì KHÔNG xoá bản vừa tạo: đổi tên thêm hậu tố .failed để không bản nào trông như lành, và để người trực
 * xem lại. Bản .failed không khớp mẫu luong-YYYYMMDD-HHMMSS.sqlite nên không bị xoay vòng xoá; dọn tay sau khi xem.
 *
 * Mã thoát: 0 chỉ khi sao lưu xong VÀ (nếu có --verify) kiểm trả về 0; mọi trường hợp khác là 1.
 * Log chỉ có số liệu vận hành: thời điểm, bậc, tên file DB (basename), tên bản sao, số byte, số mili giây, kết quả
 * kiểm, mã thoát. Không có dòng dữ liệu, tên nhân sự, số tiền hay khoá nào.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { backup } = require('./backup-db');

const VERIFY_SCRIPT = path.join(__dirname, 'verify-backup.js');
const LABELS = ['daily', 'weekly', 'monthly'];
const VERIFY_TIMEOUT_MS = 30 * 60 * 1000; // kiểm một DB lớn (nhiều kỳ lương) có thể lâu; quá hạn thì coi là hỏng
const FAILED_SUFFIX = '.failed';
const ERROR_MAX = 300; // chỉ cắt thông báo lỗi, không bao giờ ghi dữ liệu

class DailyError extends Error {}

// Asia/Ho_Chi_Minh là UTC+7 cố định (Việt Nam không có giờ mùa hè): không cần Intl, máy chủ có thể chạy giờ UTC.
function vnIso(ms) {
  const iso = new Date(ms + 7 * 3600 * 1000).toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 19) + '+07:00';
}

function parseArgs(argv) {
  const out = { db: null, dir: null, keep: null, verify: false, log: null, label: 'daily' };
  const takesValue = new Set(['db', 'dir', 'keep', 'log', 'label']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify') {
      out.verify = true;
      continue;
    }
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new DailyError('Tham số lạ: ' + a);
    if (!takesValue.has(m[1])) throw new DailyError('Tuỳ chọn lạ: --' + m[1]);
    let value = m[2];
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new DailyError('--' + m[1] + ' cần một giá trị.');
    }
    out[m[1]] = value;
  }
  if (!out.db) out.db = process.env.DB_PATH || null;
  if (!out.db)
    throw new DailyError(
      'Thiếu --db=<file DB>. Dùng: node scripts/ops/backup-daily.js --db=<db> --dir=<thư mục> [--keep=<n>] [--verify] [--log=<file>] [--label=daily|weekly|monthly]'
    );
  if (!out.dir) throw new DailyError('Thiếu --dir=<thư mục sao lưu>.');
  if (out.keep !== null && (!/^\d+$/.test(out.keep) || Number(out.keep) < 1))
    throw new DailyError('--keep phải là số nguyên từ 1 trở lên.');
  if (!LABELS.includes(out.label)) throw new DailyError('--label phải là một trong: ' + LABELS.join(', ') + '.');
  return out;
}

// Nối thêm đúng một dòng JSON (không ghi đè): log của tháng này là lịch sử của tháng này.
function appendLog(file, entry) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.appendFileSync(path.resolve(file), JSON.stringify(entry) + '\n', { encoding: 'utf8' });
}

// Chạy verify-backup.js ở tiến trình riêng: file đó đặt process.env.DB_PATH rồi mở lib/db, không nên nạp vào tiến trình này.
function verifyFile(filePath, dbPath) {
  const r = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', VERIFY_SCRIPT, filePath], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: VERIFY_TIMEOUT_MS,
    env: { ...process.env, DB_PATH: dbPath }
  });
  const output = String(r.stdout || '') + String(r.stderr || '');
  if (r.error) return { result: 'error', exit: null, output };
  if (r.status === 0) return { result: 'ok', exit: 0, output };
  if (r.status === 2) return { result: 'partial', exit: 2, output }; // thiếu AUDIT_KEY: chưa kiểm nội dung nhật ký
  return { result: 'failed', exit: r.status === null ? null : r.status, output };
}

async function main() {
  const started = Date.now();
  const entry = {
    ts: vnIso(started),
    label: 'daily',
    db: null,
    file: null,
    bytes: 0,
    ms: 0,
    verify: 'skipped',
    verify_exit: null,
    exit: 1
  };
  let logPath = null;
  const finish = () => {
    entry.ms = Date.now() - started;
    if (logPath) {
      try {
        appendLog(logPath, entry);
      } catch (err) {
        // Không ghi được log thì người trực không có dấu vết nào: coi như lần chạy hỏng.
        console.error('Lỗi: không ghi được log ' + logPath + ' (' + (err && err.code ? err.code : 'lỗi') + ').');
        entry.exit = 1;
      }
    }
    console.log(
      (entry.exit === 0 ? 'XONG' : 'HỎNG') +
        ': ' +
        (entry.file || 'không có bản sao') +
        (entry.exit === 0 ? ' (' + entry.bytes + ' byte)' : '') +
        ' · ' +
        entry.ms +
        ' ms · kiểm: ' +
        entry.verify +
        ' · mã thoát ' +
        entry.exit
    );
    process.exitCode = entry.exit;
  };

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error('Lỗi: ' + err.message);
    process.exitCode = 1;
    return;
  }
  entry.label = args.label;
  entry.db = path.basename(args.db);
  logPath = args.log ? path.resolve(args.log) : null;

  const dbPath = path.resolve(args.db);
  const outDir = path.resolve(args.dir);

  let made;
  try {
    // backup-db.js tự kiểm: file có thật, không phải :memory:, --keep hợp lệ, thư mục không nằm trong public/.
    made = await backup({ dbPath, outDir, keep: args.keep === null ? undefined : args.keep });
  } catch (err) {
    entry.error = String(err && err.message ? err.message : err).slice(0, ERROR_MAX);
    console.error('Lỗi: ' + entry.error);
    finish();
    return;
  }

  entry.file = made.name;
  entry.bytes = made.size;
  let filePath = path.join(outDir, made.name);
  console.log(
    'Đã sao lưu: ' +
      made.name +
      ' (' +
      made.size +
      ' byte) · giữ ' +
      made.kept +
      ' bản' +
      (made.removed ? ', đã xoá ' + made.removed + ' bản cũ' : '') +
      '.'
  );

  if (args.verify) {
    const checked = verifyFile(filePath, dbPath);
    entry.verify = checked.result;
    entry.verify_exit = checked.exit;
    if (checked.result !== 'ok') {
      // In phần kết luận của verify-backup (chỉ số đếm và mã lỗi, không có dữ liệu) để người trực thấy lý do.
      for (const line of checked.output.split(/\r?\n/))
        if (/^\s*\[(LỖI|CHÚ Ý)\]|^Lỗi:|^KẾT QUẢ:/.test(line)) console.error(line.trim());
      const failedPath = filePath + FAILED_SUFFIX;
      try {
        fs.renameSync(filePath, failedPath);
        entry.file = made.name + FAILED_SUFFIX;
        console.error('Đã đổi tên bản hỏng thành ' + entry.file + ' (giữ lại để xem, không dùng để khôi phục).');
      } catch (err) {
        console.error(
          'Không đổi tên được sang .failed (' +
            (err && err.message ? err.message : 'lỗi') +
            '): bản này KHÔNG dùng được, đừng để nó trông như bản lành.'
        );
      }
      entry.exit = 1;
      finish();
      return;
    }
    console.log('Kiểm bản vừa tạo: ĐẠT.');
  }

  entry.exit = 0;
  finish();
}

if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });

module.exports = { parseArgs, vnIso, verifyFile, appendLog, LABELS, FAILED_SUFFIX, DailyError };
