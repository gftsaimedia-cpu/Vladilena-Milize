'use strict';
/*
 * Diễn tập khôi phục: chứng minh một bản sao lưu THẬT SỰ chạy được, không cần mật khẩu của ai.
 *
 * Dùng:   node scripts/ops/restore-drill.js --backup=<file-sao-lưu.sqlite> [--work-dir=<thư mục>] [--port=0] [--keep]
 *
 * Các bước (làm trên file tạm chứ không trên DB thật):
 *   1. chép bản sao lưu vào thư mục làm việc với tên restore.sqlite; xoá restore.sqlite-wal / -shm còn sót lại
 *      (hai file đó thuộc DB cũ, để lại thì SQLite có thể áp chúng vào bản khôi phục và làm sai dữ liệu);
 *   2. chạy server.js ở TIẾN TRÌNH RIÊNG với DB_PATH trỏ vào bản chép, PORT, SESSION_SECRET ngẫu nhiên,
 *      COOKIE_SECURE=0 (máy chủ chạy trên localhost, không có TLS ở đây);
 *   3. chờ dòng khởi động, rồi gửi ba yêu cầu: GET / (503 kèm cách build khi chưa có giao diện Vue; 200 và trang HTML
 *      khi web/dist có index.html), GET /api/me (200 và
 *      JSON không rỗng, không cần cookie), GET /api/periods không kèm cookie (401 — chứng minh phần xác thực đang bật, không mở toang);
 *   4. tắt tiến trình con, xoá thư mục làm việc (bản chép là dữ liệu lương thật), in thời gian khôi phục đo được.
 *
 * Không dùng mật khẩu nào, không đọc .env của máy chủ (mọi biến do script đặt hoặc kế thừa từ môi trường).
 * Từ chối file tên luong.sqlite (DB thật đang chạy) và file .partial/.failed: script chỉ diễn tập trên bản sao lành.
 *
 * Mã thoát: 0 khi cả ba yêu cầu đạt; 1 khi bất kỳ bước nào hỏng (in lý do).
 * Không bao giờ in nội dung DB, tên nhân sự hay số tiền; chỉ in mã HTTP, số byte và thời gian.
 */
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_SCRIPT = path.join(REPO_ROOT, 'server.js');
const RESTORE_NAME = 'restore.sqlite';
const BOOT_TIMEOUT_MS = 60000; // DB lớn: migration trên bản chép có thể lâu
const STOP_TIMEOUT_MS = 5000;
const HTTP_TIMEOUT_MS = 20000;
const LOGIN_PATH = '/api/me';
const MIN_LOGIN_BYTES = 40; // phản hồi /api/me thật dài hơn; ít hơn nghĩa là trả về trang lỗi/rỗng

class DrillError extends Error {}

function parseArgs(argv) {
  const out = { backup: null, workDir: null, port: 0, keep: false };
  const takesValue = new Set(['backup', 'work-dir', 'port']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep') {
      out.keep = true;
      continue;
    }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new DrillError('Tham số lạ: ' + a);
    if (!takesValue.has(m[1])) throw new DrillError('Tuỳ chọn lạ: --' + m[1]);
    let value = m[2];
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new DrillError('--' + m[1] + ' cần một giá trị.');
    }
    if (m[1] === 'port') {
      if (!/^\d+$/.test(value) || Number(value) > 65535)
        throw new DrillError('--port phải là số từ 0 đến 65535 (0 = tự chọn cổng trống).');
      out.port = Number(value);
    } else out[m[1] === 'backup' ? 'backup' : 'workDir'] = value;
  }
  if (!out.backup)
    throw new DrillError(
      'Thiếu --backup=<file sao lưu>. Dùng: node scripts/ops/restore-drill.js --backup=<file.sqlite>'
    );
  return out;
}

// Cổng 0 thì máy chủ tự chọn cổng, nhưng server.js in cổng BIẾN PORT (số 0) chứ không in cổng thật — nên tự chọn trước.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

function get(port, pathname) {
  return new Promise(resolve => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'GET',
        timeout: HTTP_TIMEOUT_MS,
        headers: { Connection: 'close' }
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (body += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            location: res.headers.location || null,
            type: String(res.headers['content-type'] || ''),
            bytes: Buffer.byteLength(body)
          })
        );
      }
    );
    req.on('timeout', () => req.destroy(new DrillError('quá hạn ' + HTTP_TIMEOUT_MS / 1000 + ' giây')));
    req.on('error', err => resolve({ status: null, error: err.message, bytes: 0 }));
    req.end();
  });
}

const tail = (text, lines = 6) =>
  String(text || '')
    .trim()
    .split(/\r?\n/)
    .slice(-lines)
    .join('\n');

// Chờ dòng khởi động; giữ đọc stdout/stderr cho tới khi tắt để tiến trình con không bị nghẽn ống.
function waitBoot(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    let settled = false;
    const stop = () => {
      settled = true;
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      stop();
      reject(
        new DrillError(
          'máy chủ không in dòng khởi động trong ' +
            Math.round(timeoutMs / 1000) +
            ' giây' +
            (err ? ':\n' + tail(err) : '')
        )
      );
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => {
      out += d;
      const m = /http:\/\/localhost:(\d+)/.exec(out);
      if (m && !settled) {
        stop();
        resolve(Number(m[1]));
      }
    });
    child.stderr.on('data', d => {
      err = (err + d).slice(-4000); // chỉ giữ phần đuôi, để báo lỗi migration gọn
    });
    child.once('exit', code => {
      if (settled) return;
      stop();
      reject(new DrillError('máy chủ thoát (mã ' + code + ') trước khi chạy' + (err ? ':\n' + tail(err) : '')));
    });
    child.once('error', e => {
      if (settled) return;
      stop();
      reject(new DrillError('không chạy được server.js: ' + e.message));
    });
  });
}

function stopChild(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null || child.signalCode) return resolve();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      // Windows không có tín hiệu thật: kill() là TerminateProcess, cây tiến trình con phải dọn riêng
      try {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } catch {
        /* không có taskkill (không phải Windows): bỏ qua */
      }
      done();
    }, STOP_TIMEOUT_MS);
    child.once('exit', done);
    child.kill();
  });
}

function removeDir(dir) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      continue; // Windows đôi khi còn giữ file .sqlite vài chục mili giây sau khi tiến trình thoát
    }
  }
  return false;
}

async function main() {
  const started = Date.now();
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error('Lỗi: ' + err.message);
    process.exitCode = 1;
    return;
  }

  const backupFile = path.resolve(args.backup);
  const base = path.basename(backupFile);
  // Chỉ diễn tập trên bản sao: từ chối DB thật đang chạy, từ chối file dở/hỏng.
  if (base.toLowerCase() === 'luong.sqlite') {
    console.error(
      'Lỗi: từ chối ' +
        base +
        ' — đây là tên DB thật đang chạy. Diễn tập chỉ chạy trên file sao lưu luong-YYYYMMDD-HHMMSS.sqlite.'
    );
    process.exitCode = 1;
    return;
  }
  if (/\.partial$/.test(base)) {
    console.error('Lỗi: ' + base + ' là file tạm của lần sao lưu chưa xong, không diễn tập được.');
    process.exitCode = 1;
    return;
  }
  if (/\.failed$/.test(base)) {
    console.error('Lỗi: ' + base + ' đã bị đánh dấu hỏng (kiểm bản sao không đạt), không diễn tập được.');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(backupFile) || !fs.statSync(backupFile).isFile()) {
    console.error('Lỗi: không thấy file sao lưu ' + backupFile + '.');
    process.exitCode = 1;
    return;
  }

  const ownWorkDir = !args.workDir;
  const workDir = ownWorkDir
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-restore-drill-'))
    : path.resolve(args.workDir);
  fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
  const restored = path.join(workDir, RESTORE_NAME);
  let child = null;
  let failed = false;

  try {
    // Bước 1: dọn bản khôi phục cũ (kể cả -wal/-shm), rồi chép bản sao lưu vào
    for (const ext of ['', '-wal', '-shm', '-journal', '.partial']) fs.rmSync(restored + ext, { force: true });
    fs.copyFileSync(backupFile, restored);
    try {
      fs.chmodSync(restored, 0o600);
    } catch {
      /* Windows: quyền theo ACL, bỏ qua */
    }
    console.log('Chép ' + base + ' -> ' + restored + ' (đã xoá -wal/-shm còn sót của lần trước).');

    // Bước 2: chạy máy chủ trên bản chép
    const port = args.port || (await freePort());
    const env = {
      ...process.env,
      DB_PATH: restored,
      PORT: String(port),
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      COOKIE_SECURE: '0'
    };
    delete env.ADMIN_PASSWORD; // diễn tập không cần mật khẩu và không nên đặt mật khẩu nào lên bản chép
    child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', SERVER_SCRIPT], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const bootPort = await waitBoot(child, BOOT_TIMEOUT_MS);
    console.log('Máy chủ đã chạy trên bản khôi phục, cổng ' + bootPort + '.');

    // Bước 3: ba yêu cầu chứng minh app sống, API công khai /api/me trả JSON, và API khác vẫn đòi đăng nhập
    const root = await get(bootPort, '/');
    const rootNotBuilt = root.status === 503 && root.bytes > 0; // chưa build web/dist: máy chủ vẫn sống và nói rõ cách build
    const rootIsApp = root.status === 200 && root.type.includes('text/html') && root.bytes > 0;
    const rootOk = rootNotBuilt || rootIsApp;
    console.log(
      'GET /' +
        ' '.repeat(26) +
        ' -> ' +
        (root.status === null
          ? 'không kết nối được (' + root.error + ')'
          : (rootIsApp ? root.status + ', ' + root.bytes + ' byte' : root.status + ' → ' + (root.location || '')) +
            '  ' +
            (rootOk ? '[ĐẠT]' : '[LỖI]'))
    );
    if (!rootOk) failed = true;

    const login = await get(bootPort, LOGIN_PATH);
    const loginOk = login.status === 200 && login.bytes >= MIN_LOGIN_BYTES;
    console.log(
      'GET ' +
        LOGIN_PATH +
        ' '.repeat(Math.max(0, 25 - LOGIN_PATH.length)) +
        ' -> ' +
        (login.status === null
          ? 'không kết nối được (' + login.error + ')'
          : login.status + ', ' + login.bytes + ' byte  ' + (loginOk ? '[ĐẠT]' : '[LỖI]'))
    );
    if (!loginOk) failed = true;

    const guarded = await get(bootPort, '/api/periods');
    const guardedOk = guarded.status === 401;
    console.log(
      'GET /api/periods (không cookie) -> ' +
        (guarded.status === null
          ? 'không kết nối được (' + guarded.error + ')'
          : guarded.status + '  ' + (guardedOk ? '[ĐẠT]' : '[LỖI]')) +
        (guardedOk ? '' : ' (phải là 401: API không được trả dữ liệu khi chưa đăng nhập)')
    );
    if (!guardedOk) failed = true;
  } catch (err) {
    failed = true;
    console.error('Lỗi: ' + (err instanceof DrillError ? err.message : 'diễn tập hỏng (' + (err && err.message) + ')'));
  } finally {
    await stopChild(child);
  }

  const seconds = (Date.now() - started) / 1000;
  if (ownWorkDir && !args.keep) {
    if (!removeDir(workDir))
      console.error('Không xoá được thư mục làm việc ' + workDir + ': xoá tay (là dữ liệu lương thật).');
  } else {
    console.log('Giữ bản khôi phục tại ' + restored + ' (là dữ liệu lương thật: xoá khi xong).');
  }
  console.log('Thời gian khôi phục đo được: ' + seconds.toFixed(1) + ' giây (chép + khởi động + 3 yêu cầu HTTP).');
  console.log(failed ? 'KẾT QUẢ: HỎNG' : 'KẾT QUẢ: ĐẠT');
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });

module.exports = { parseArgs, get, freePort, DrillError };
