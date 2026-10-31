'use strict';
/*
 * Kiểm một bản sao lưu (hoặc một DB vừa khôi phục) TRÊN BẢN SAO TẠM, không đụng bản gốc.
 *
 * Dùng:   [AUDIT_KEY=<khoá>] node scripts/ops/verify-backup.js <file-sao-lưu.sqlite> [--skip-periods] [--keep-copy] [--expect-head=<id>]
 *         --expect-head=<id>  id dòng cuối nhật ký đã ghi ở lần kiểm trước ("mỏ neo"); id nhỏ hơn nghĩa là bị cắt đuôi, mã thoát 1.
 * Biến:   AUDIT_KEY  khoá HMAC của nhật ký (cùng khoá với máy chủ). Thiếu khoá mà nhật ký có dòng HMAC thì chỉ kiểm được
 *                    việc nối chuỗi, kết quả là "một phần" (mã thoát 2), không phải "đạt".
 *         VERIFY_TMP thư mục chứa bản sao tạm (mặc định thư mục tạm của hệ điều hành). Bản sao là dữ liệu lương thật: đặt ở
 *                    ổ được bảo vệ; script xoá nó khi xong (trừ --keep-copy).
 *
 * Các bước:
 *   1. Chép file sang thư mục tạm (cùng -wal / -shm nếu có), PRAGMA integrity_check và foreign_key_check, đếm dòng từng bảng
 *      (chỉ số đếm, không in dữ liệu).
 *   2. Mở bản sao bằng lib/db.js (đúng mã của máy chủ; migration chạy trên bản sao, không phải bản gốc) rồi
 *      store.audit.verify(): đi lại cả chuỗi băm của nhật ký.
 *   3. Với mỗi kỳ lương đã có lần tính: periods.verify(tháng) tính lại từng phiếu từ bản chụp tham số và so với bản chụp phiếu
 *      (chỉ in số phiếu lệch, không in tên). Bỏ qua bằng --skip-periods.
 *
 * Mã thoát: 0 đạt · 1 hỏng (integrity, chuỗi băm, phiếu lệch, lỗi mở) · 2 một phần (thiếu AUDIT_KEY nên chưa kiểm nội dung nhật ký).
 * Không bao giờ in khoá, mật khẩu, tên nhân sự hay số tiền.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
// Bản sao lưu cũ có thể chưa có các bảng này: báo là thông tin, không phải lỗi.
const V4_TABLES = [
  'audit_log',
  'param_versions',
  'payroll_periods',
  'payroll_runs',
  'payslips',
  'ai_finding_actions',
  'ai_review_runs',
  'staff_roles'
];
const REQUIRED_TABLES = ['staff', 'settings'];
const HEAD_HASH_SHOWN = 12; // số ký tự đầu của băm dòng cuối nhật ký để ghi làm "mỏ neo" ngoài DB

class VerifyError extends Error {}

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
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

function parseArgs(argv) {
  const out = { file: null, skipPeriods: false, keepCopy: false, expectHead: null };
  for (const a of argv) {
    if (a === '--skip-periods') out.skipPeriods = true;
    else if (a === '--keep-copy') out.keepCopy = true;
    else if (/^--expect-head=[0-9]+$/.test(a)) out.expectHead = Number(a.split('=')[1]);
    else if (a.startsWith('--')) throw new VerifyError('Tuỳ chọn lạ: ' + a);
    else if (!out.file) out.file = a;
    else throw new VerifyError('Chỉ nhận một file sao lưu.');
  }
  if (!out.file)
    throw new VerifyError('Thiếu đường dẫn file sao lưu. Dùng: node scripts/ops/verify-backup.js <file.sqlite>');
  return out;
}

// Chép file sao lưu (và -wal/-shm cạnh nó, cho kiểu sao lưu "chép đủ ba file") sang thư mục tạm riêng
function makeCopy(file) {
  const src = path.resolve(file);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new VerifyError('Không thấy file sao lưu.');
  if (src.endsWith('.partial'))
    throw new VerifyError('Đây là file tạm của lần sao lưu chưa xong (.partial), không dùng được.');
  const real = fs.realpathSync(src);
  if (isInside(real, realResolve(PUBLIC_DIR)))
    throw new VerifyError('File nằm trong public/ (ai cũng tải được): chuyển nó đi trước.');
  if (process.env.DB_PATH && process.env.DB_PATH !== ':memory:' && fs.existsSync(process.env.DB_PATH)) {
    if (fs.realpathSync(process.env.DB_PATH) === real)
      throw new VerifyError('File này là DB đang chạy (trùng DB_PATH). Script chỉ kiểm BẢN SAO; hãy dùng bản sao lưu.');
  }
  const dir = fs.mkdtempSync(path.join(process.env.VERIFY_TMP || os.tmpdir(), 'aicb-verify-'));
  const copy = path.join(dir, 'restored.sqlite');
  fs.copyFileSync(src, copy);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, copy + ext);
  for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o600);
  return { dir, copy };
}

// Bước 1, chạy TRƯỚC khi lib/db mở bản sao: chưa migration nào đụng vào nên thấy đúng như file sao lưu
function inspectRaw(copy) {
  const db = new DatabaseSync(copy, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok';
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map(r => r.name);
    const counts = {};
    for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t.replaceAll('"', '""')}"`).get().n;
    return { integrityOk, foreignKeyViolations, counts };
  } finally {
    db.close();
  }
}

const line = (ok, text) =>
  console.log((ok === true ? '[ĐẠT] ' : ok === false ? '[LỖI] ' : ok === 'warn' ? '[CHÚ Ý] ' : '       ') + text);

async function main() {
  let work = null;
  let store = null;
  const cleanup = () => {
    // Windows không xoá được file đang mở: đóng DB của lib/db trước
    try {
      if (store) store.db.close();
    } catch {
      /* đã đóng */
    }
    store = null;
    if (work && !work.keep) {
      try {
        fs.rmSync(work.dir, { recursive: true, force: true });
      } catch {
        console.error('Không xoá được bản sao tạm ' + work.dir + ': xoá tay (là dữ liệu lương thật).');
      }
    }
    work = null;
  };
  // process.exit (ví dụ lib/db.js dừng khi migration lỗi) không chạy finally: dọn bản sao tạm ở sự kiện exit
  process.on('exit', cleanup);
  let failed = false;
  let partial = false;
  try {
    const args = parseArgs(process.argv.slice(2));
    const made = makeCopy(args.file);
    work = { ...made, keep: args.keepCopy };
    console.log('Kiểm bản sao lưu trên bản sao tạm (bản gốc không bị đụng).');

    const raw = inspectRaw(made.copy);
    line(raw.integrityOk, 'PRAGMA integrity_check');
    if (!raw.integrityOk) failed = true;
    line(raw.foreignKeyViolations === 0, `PRAGMA foreign_key_check: ${raw.foreignKeyViolations} dòng vi phạm`);
    if (raw.foreignKeyViolations) failed = true;
    for (const t of REQUIRED_TABLES)
      if (!(t in raw.counts)) {
        line(false, `Thiếu bảng bắt buộc: ${t}`);
        failed = true;
      }
    const missingV4 = V4_TABLES.filter(t => !(t in raw.counts));
    if (missingV4.length)
      line('warn', `Bản sao lưu cũ hơn backend v4, chưa có bảng: ${missingV4.join(', ')} (sẽ tạo khi nâng cấp)`);
    console.log('Số dòng từng bảng:');
    for (const [t, n] of Object.entries(raw.counts)) console.log(`       ${t}: ${n}`);
    if (failed) throw new VerifyError('Bản sao hỏng ở bước đọc cơ bản; dừng, không mở bằng mã máy chủ.');

    // Bước 2 và 3: dùng đúng mã của máy chủ trên bản sao tạm
    process.env.DB_PATH = made.copy;
    store = require('../../lib/db');

    const chain = await store.audit.verify();
    const head = store.db.prepare('SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
    if (chain.ok) line(true, `Chuỗi băm nhật ký: ${chain.checked} dòng, nối liền và đúng nội dung`);
    else if (chain.reason === 'AUDIT_KEY_MISSING') {
      line(
        'warn',
        `Chuỗi băm nhật ký: nối liền ${chain.checked} dòng, nhưng ${chain.unverifiable} dòng là HMAC mà thiếu AUDIT_KEY nên chưa kiểm nội dung. Đặt AUDIT_KEY (đúng khoá của máy chủ) rồi chạy lại.`
      );
      partial = true;
    } else {
      line(
        false,
        `Chuỗi băm nhật ký ĐỨT ở dòng id=${chain.firstBadId} (${chain.reason}) sau ${chain.checked} dòng đúng`
      );
      if (chain.reason === 'HASH' && chain.checked === 0 && process.env.AUDIT_KEY)
        console.log(
          '       Ngay dòng đầu đã lệch: nghi AUDIT_KEY không phải khoá đã ký nhật ký này (đổi khoá làm mọi dòng HMAC cũ không kiểm được).'
        );
      failed = true;
    }
    if (args.expectHead !== null && (head ? head.id : 0) < args.expectHead) {
      line(
        false,
        `Nhật ký bị CẮT ĐUÔI: dòng cuối id=${head ? head.id : 0}, nhỏ hơn mỏ neo đã ghi (id=${args.expectHead})`
      );
      failed = true;
    } else if (args.expectHead !== null)
      line(true, `Dòng cuối id=${head.id} không nhỏ hơn mỏ neo đã ghi (id=${args.expectHead})`);
    if (head) {
      const [algo, hex] = String(head.hash).split(':');
      console.log(
        `       Mỏ neo (ghi vào sổ vận hành ngoài DB): dòng cuối id=${head.id}, ${algo}:${(hex || '').slice(0, HEAD_HASH_SHOWN)}… ` +
          '(lần kiểm sau id phải không nhỏ hơn số này; nhỏ hơn nghĩa là bị cắt đuôi)'
      );
    } else console.log('       Nhật ký trống.');

    if (!args.skipPeriods) {
      const periods = require('../../lib/periods');
      const withRun = (await store.periods.list()).filter(p => p.currentRunId != null);
      if (!withRun.length) console.log('       Kỳ lương: chưa kỳ nào có lần tính, bỏ qua.');
      for (const p of withRun) {
        let r;
        try {
          r = await periods.verify(p.month);
        } catch (e) {
          line(false, `Kỳ ${p.month} (${p.status}): không kiểm được (${e && e.code ? e.code : 'lỗi'})`);
          failed = true;
          continue;
        }
        const note = r.engineChanged ? ' · bộ máy đã đổi phiên bản so với lúc tính' : '';
        if (r.mismatched.length) {
          line(false, `Kỳ ${p.month} (${p.status}): ${r.mismatched.length}/${r.checked} phiếu lệch bản chụp${note}`);
          failed = true;
        } else line(true, `Kỳ ${p.month} (${p.status}): ${r.checked} phiếu khớp bản chụp${note}`);
      }
    }
  } catch (err) {
    failed = true;
    console.error(
      'Lỗi: ' +
        (err instanceof VerifyError
          ? err.message
          : 'không kiểm được bản sao (' + (err && err.code ? err.code : 'lỗi') + ').')
    );
  }
  const keptDir = work && work.keep ? work.dir : null;
  cleanup();
  if (keptDir) console.log('Giữ bản sao tạm tại ' + keptDir + ' (là dữ liệu lương thật: xoá khi xong).');
  else console.log('Đã xoá bản sao tạm.');
  console.log(failed ? 'KẾT QUẢ: HỎNG' : partial ? 'KẾT QUẢ: MỘT PHẦN (thiếu AUDIT_KEY)' : 'KẾT QUẢ: ĐẠT');
  process.exitCode = failed ? 1 : partial ? 2 : 0;
}

if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });

module.exports = { inspectRaw, parseArgs, VerifyError, V4_TABLES };
