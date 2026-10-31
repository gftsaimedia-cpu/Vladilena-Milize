'use strict';
/*
 * Kiểm "bản sao lưu có còn mới và còn lành không" — dùng cho giám sát (Task Scheduler, Zabbix, một script cron khác).
 *
 * Dùng:   node scripts/ops/check-backup.js --dir=<thư mục sao lưu> [--max-age-hours=26] [--log=<file.jsonl>]
 *
 * Đạt (mã thoát 0) khi CẢ BA điều sau đúng:
 *   1. trong thư mục có ít nhất một bản đúng mẫu luong-YYYYMMDD-HHMMSS.sqlite;
 *   2. bản mới nhất (theo thời điểm sửa file) trẻ hơn --max-age-hours (mặc định 26 giờ: chạy hằng ngày mà lỡ một
 *      lần là hỏng, chạy hai lần/ngày thì vẫn đạt);
 *   3. bản mới nhất không có file cạnh nó là <tên>.failed, và không có bản .failed/.partial nào MỚI HƠN bản lành mới
 *      nhất (dấu hiệu lần chạy gần nhất hỏng: backup-daily.js đổi tên bản hỏng thành .failed, còn .partial là lần
 *      sao lưu bị dừng giữa chừng).
 *
 * Hỏng (mã thoát 1) thì in ĐÚNG MỘT dòng lý do; đạt thì không in gì (để Task Scheduler chỉ báo khi có chuyện).
 * --log ghi thêm một dòng JSON cho mỗi lần kiểm (kể cả lần đạt), không có dữ liệu nào ngoài tên file và số giờ.
 */
const fs = require('node:fs');
const path = require('node:path');
const { NAME_PATTERN } = require('./backup-db');

const DEFAULT_MAX_AGE_HOURS = 26;
const PARTIAL_PATTERN = /^luong-\d{8}-\d{6}\.sqlite\.partial$/;

class CheckError extends Error {}

function vnIso(ms) {
  const iso = new Date(ms + 7 * 3600 * 1000).toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 19) + '+07:00';
}

function parseArgs(argv) {
  const out = { dir: null, maxAgeHours: DEFAULT_MAX_AGE_HOURS, log: null };
  const takesValue = new Set(['dir', 'max-age-hours', 'log']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new CheckError('Tham số lạ: ' + a);
    if (!takesValue.has(m[1])) throw new CheckError('Tuỳ chọn lạ: --' + m[1]);
    let value = m[2];
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new CheckError('--' + m[1] + ' cần một giá trị.');
    }
    if (m[1] === 'max-age-hours') {
      if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0)
        throw new CheckError('--max-age-hours phải là số dương (mặc định ' + DEFAULT_MAX_AGE_HOURS + ').');
      out.maxAgeHours = Number(value);
    } else out[m[1] === 'dir' ? 'dir' : 'log'] = value;
  }
  if (!out.dir) throw new CheckError('Thiếu --dir=<thư mục sao lưu>.');
  return out;
}

const hours = ms => ms / 3600000;
const round1 = n => Math.round(n * 10) / 10;

// Trả về { ok, reason, file, ageHours }. Chỉ đọc thư mục (tên file + mtime), không mở file DB nào.
function check({ dir, maxAgeHours = DEFAULT_MAX_AGE_HOURS, now = Date.now() }) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { ok: false, reason: 'không thấy thư mục sao lưu: ' + dir, file: null, ageHours: null };
  }
  const stamps = new Map();
  for (const n of names) {
    try {
      stamps.set(n, fs.statSync(path.join(dir, n)).mtimeMs);
    } catch {
      /* file vừa bị xoay vòng giữa chừng: bỏ qua */
    }
  }
  const copies = [...stamps.keys()].filter(n => NAME_PATTERN.test(n));
  if (!copies.length)
    return {
      ok: false,
      reason: 'không có bản sao lưu luong-*.sqlite nào trong ' + dir,
      file: null,
      ageHours: null
    };

  copies.sort((a, b) => stamps.get(b) - stamps.get(a));
  const newest = copies[0];
  const newestAt = stamps.get(newest);
  const ageHours = hours(now - newestAt);

  if (ageHours > maxAgeHours)
    return {
      ok: false,
      reason:
        'bản mới nhất ' +
        newest +
        ' đã ' +
        round1(ageHours) +
        ' giờ (quá ' +
        maxAgeHours +
        ' giờ) — lần sao lưu gần nhất không chạy hoặc không ghi được',
      file: newest,
      ageHours: round1(ageHours)
    };

  if (names.includes(newest + '.failed') || stamps.has(newest + '.failed'))
    return {
      ok: false,
      reason: 'bản mới nhất ' + newest + ' đã bị đánh dấu hỏng (' + newest + '.failed)',
      file: newest,
      ageHours: round1(ageHours)
    };

  const newerBroken = names
    .filter(n => /\.failed$/.test(n) || PARTIAL_PATTERN.test(n))
    .filter(n => (stamps.get(n) || 0) > newestAt)
    .sort();
  if (newerBroken.length)
    return {
      ok: false,
      reason: 'lần sao lưu gần nhất không lành: ' + newerBroken[0] + ' (mới hơn bản lành ' + newest + ')',
      file: newest,
      ageHours: round1(ageHours)
    };

  return { ok: true, reason: null, file: newest, ageHours: round1(ageHours) };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error('check-backup: ' + err.message);
    process.exitCode = 1;
    return;
  }
  const r = check({ dir: path.resolve(args.dir), maxAgeHours: args.maxAgeHours });
  if (args.log) {
    const entry = {
      ts: vnIso(Date.now()),
      ok: r.ok,
      dir: path.resolve(args.dir),
      file: r.file,
      age_hours: r.ageHours,
      max_age_hours: args.maxAgeHours,
      reason: r.reason
    };
    try {
      fs.mkdirSync(path.dirname(path.resolve(args.log)), { recursive: true });
      fs.appendFileSync(path.resolve(args.log), JSON.stringify(entry) + '\n', { encoding: 'utf8' });
    } catch (err) {
      console.error('check-backup: không ghi được log (' + (err && err.code ? err.code : 'lỗi') + ')');
      process.exitCode = 1;
      return;
    }
  }
  if (!r.ok) console.error('SAO LƯU KHÔNG ĐẠT: ' + r.reason);
  process.exitCode = r.ok ? 0 : 1;
}

if (require.main === module) main();

module.exports = { check, parseArgs, DEFAULT_MAX_AGE_HOURS, CheckError };
