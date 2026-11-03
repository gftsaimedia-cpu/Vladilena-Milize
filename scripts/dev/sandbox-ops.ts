'use strict';
// Điều khiển thử TẢI và SAO LƯU/KHÔI PHỤC cho sandbox. Chỉ chạy với DB PostgreSQL tạm của sandbox.
//   Tải:        nạp N người đo tải, chạy scripts/loadtest/run.ts trỏ vào sandbox, đối soát ghi bằng DB tạm.
//   Sao lưu:    ghi một file tạm, kiểm nội dung và diễn tập khôi phục bằng công cụ pg-backup.
//   Hỏng giả:   chép một bản rồi ghi đè vài byte để thấy bước kiểm BẮT được hỏng.
// Mọi file tạm nằm trong một thư mục tạm riêng, xoá khi sandbox tắt. Không đụng DB thật, không đường dẫn từ người dùng (chỉ chọn theo tên đã tạo).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const pgBackup = require('../../src/ops/pg-backup');
const { seedLoadUsers, DEFAULT_PREFIX } = require('../loadtest/kit/seed');
const { reconcile } = require('../loadtest/kit/reconcile');

const LOAD_SCENARIOS = ['login', 'checkin', 'mix', 'admin-burst', 'probe'];
const MAX_LOAD_USERS = 1000;
const LOG_LINES = 80;
const MAX_BACKUPS = 6;
const TOOL_TIMEOUT_MS = 120000;
const clamp = (value?, min?, max?, fallback?) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const fail = (status?, message?) => Object.assign(new Error(message), { status });

function createOps({ store, auth, project, getPort, getLocalMonth, limits }: any) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-sandbox-ops-'));
  const state: Record<string, any> = {
    load: { seeded: 0, password: null, job: null },
    backups: [], // { name, file, bytes, kind, integrity }
    tool: null // kết quả lần chạy kiểm/diễn tập gần nhất { action, name, exitCode, verdict, lines, ms }
  };
  let counter = 0;
  let toolRunning = false;

  /* ---------- tải ---------- */
  const countLoadUsers = async () =>
    Number(
      (
        await store.db
          .prepare("SELECT COUNT(*) AS n FROM staff WHERE username LIKE ? AND role = 'staff'")
          .get(DEFAULT_PREFIX + '%')
      ).n
    );

  async function seed(data?) {
    if (state.load.job?.status === 'running') throw fail(409, 'Đang chạy đo tải; chờ xong hoặc hủy trước');
    const count = clamp(data.count, 1, MAX_LOAD_USERS, 300);
    state.load.password = crypto.randomBytes(12).toString('hex');
    await seedLoadUsers(store, { count, passHash: auth.hashPassword(state.load.password) });
    state.load.seeded = count;
    state.load.job = null;
  }

  async function startLoad(data?) {
    if (!state.load.password || !(await countLoadUsers())) throw fail(400, 'Chưa nạp người dùng đo tải');
    if (state.load.job?.status === 'running') throw fail(409, 'Đang chạy đo tải');
    const scenarios = (Array.isArray(data.scenarios) ? data.scenarios : []).filter(name =>
      LOAD_SCENARIOS.includes(name)
    );
    if (!scenarios.length) throw fail(400, 'Chọn ít nhất một kịch bản');
    // Check-in chỉ chạy được một lần mỗi lần đặt lại: đồng hồ sandbox đứng yên nên lượt mở của lần trước vẫn còn
    if (
      scenarios.includes('checkin') &&
      (await store.db
        .prepare('SELECT 1 FROM attendance_sessions WHERE username LIKE ? LIMIT 1')
        .get(DEFAULT_PREFIX + '%'))
    )
      throw fail(
        400,
        'Các lượt Check-in đo tải đã có. Bấm "Đặt lại dữ liệu thử" rồi nạp lại người dùng để chạy lại Check-in'
      );
    const users = clamp(data.users, 1, state.load.seeded || MAX_LOAD_USERS, state.load.seeded);
    const seconds = clamp(data.seconds, 5, 180, 20);
    const spread = clamp(data.spread, 0, 60, 5);
    const admins = clamp(data.admins, 0, 10, 3);
    const outFile = path.join(workDir, `load-${++counter}.json`);
    const idsFile = path.join(workDir, `load-${counter}-ids.json`);
    const args = [
      '--no-warnings=ExperimentalWarning',
      path.join(project, 'scripts', 'loadtest', 'run.ts'),
      `--base=http://127.0.0.1:${getPort()}`,
      `--users=${users}`,
      `--scenarios=${scenarios.join(',')}`,
      `--seconds=${seconds}`,
      `--spread=${spread}`,
      `--admins=${admins}`,
      `--month=${getLocalMonth()}`,
      `--out=${outFile}`,
      `--ids-out=${idsFile}`
    ];
    const child = spawn(process.execPath, args, {
      cwd: project,
      env: { ...process.env, LT_PASSWORD: state.load.password },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const job: Record<string, any> = {
      status: 'running',
      startedAt: performance.now(),
      options: { users, scenarios, seconds, spread, admins },
      lines: [],
      summaries: [],
      reconciled: null,
      exitCode: null,
      child
    };
    state.load.job = job;
    const onData = (chunk?) => {
      for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) job.lines.push(line);
      if (job.lines.length > LOG_LINES) job.lines.splice(0, job.lines.length - LOG_LINES);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', error => {
      job.status = 'failed';
      job.lines.push(`Không chạy được bộ đo tải: ${error.message}`);
    });
    child.once('exit', async code => {
      job.exitCode = code;
      job.endedAt = performance.now();
      try {
        const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        job.summaries = report.summaries;
      } catch {
        /* không có báo cáo: bộ đo lỗi sớm hoặc bị hủy */
      }
      try {
        // Đối soát bằng DB tạm của sandbox: mọi lượt Check-in đã nhận 200 phải có đúng một dòng
        if (fs.existsSync(idsFile))
          job.reconciled = await reconcile(store.db, JSON.parse(fs.readFileSync(idsFile, 'utf8')));
      } catch (error) {
        job.lines.push(`Không đối soát được: ${error.message}`);
      }
      if (job.status !== 'cancelled') job.status = code === 0 ? 'passed' : 'failed';
    });
  }

  function cancelLoad() {
    const job = state.load.job;
    if (job?.status !== 'running') return;
    job.status = 'cancelled';
    job.child.kill();
  }

  /* ---------- sao lưu / khôi phục ---------- */
  const findBackup = (name?) => {
    const item = state.backups.find(b => b.name === name);
    if (!item) throw fail(400, 'Không có bản sao lưu này; tạo bản mới');
    return item;
  };
  // Kiểm toàn vẹn bản sao lưu: đọc cả file, tính lại số dòng và dấu vân tay từng bảng (src/ops/pg-backup.ts → verifyFile)
  const integrityOf = async (file?) => {
    try {
      const r = await pgBackup.verifyFile(file);
      return r.ok ? 'ok' : r.problems.join('; ').slice(0, 200);
    } catch (error) {
      return `lỗi: ${error.message}`.slice(0, 200);
    }
  };
  const addBackup = (file?, kind?) => {
    const item: Record<string, any> = {
      name: path.basename(file),
      file,
      kind,
      bytes: fs.statSync(file).size,
      createdAt: performance.now()
    };
    state.backups.push(item);
    while (state.backups.length > MAX_BACKUPS) fs.rmSync(state.backups.shift().file, { force: true });
    return item;
  };

  async function backup() {
    const dir = path.join(workDir, `backup-${++counter}`);
    const t0 = performance.now();
    const made = await pgBackup.backup(store.db, dir); // ảnh chụp nhất quán của DB sandbox trong giao dịch REPEATABLE READ chỉ đọc
    const item = addBackup(made.file, 'backup');
    item.integrity = await integrityOf(made.file);
    item.ms = Math.round(performance.now() - t0);
  }

  // Chép một bản rồi ghi đè 16 byte ở giữa luồng nén: mô phỏng đĩa hỏng/ghi dở. Bước kiểm (đọc lại cả file, giải nén, tính lại
  // dấu vân tay từng bảng) phải BẮT được.
  async function corrupt(data?) {
    const source = findBackup(data.name);
    const file = path.join(workDir, `corrupt-${++counter}.pgbak.gz`);
    fs.copyFileSync(source.file, file);
    const fd = fs.openSync(file, 'r+');
    try {
      const size = fs.fstatSync(fd).size;
      fs.writeSync(fd, Buffer.alloc(16, 0xff), 0, 16, Math.max(20, Math.floor(size / 2)));
    } finally {
      fs.closeSync(fd);
    }
    const item = addBackup(file, 'corrupt');
    item.integrity = await integrityOf(file);
  }

  // Chạy một script ops ở tiến trình con và đợi xong (một lần một việc)
  function runTool(action?, name?, script?, args?, extraEnv: any = {}) {
    if (toolRunning) throw fail(409, 'Đang chạy một việc kiểm/khôi phục; chờ xong');
    toolRunning = true;
    const lines: any[] = [];
    const t0 = performance.now();
    return new Promise<any>(resolve => {
      const child = spawn(
        process.execPath,
        ['--no-warnings=ExperimentalWarning', path.join(project, 'scripts', 'ops', script), ...args],
        {
          cwd: project,
          env: { ...process.env, ...extraEnv, VERIFY_TMP: workDir },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
      const timer = setTimeout(() => child.kill(), TOOL_TIMEOUT_MS);
      const onData = (chunk?) => {
        for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) lines.push(line);
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const finish = (exitCode?) => {
        clearTimeout(timer);
        toolRunning = false;
        const verdicts = { 0: 'ĐẠT', 1: 'HỎNG', 2: 'MỘT PHẦN' };
        state.tool = {
          action,
          name,
          exitCode,
          verdict: verdicts[exitCode] || 'LỖI',
          lines: lines.slice(-30),
          ms: Math.round(performance.now() - t0)
        };
        resolve(undefined);
      };
      child.once('error', error => {
        lines.push(error.message);
        finish(-1);
      });
      child.once('exit', code => finish(code ?? -1));
    });
  }

  const verify = (data?) =>
    runTool('verify', data.name, 'pg-backup.js', ['verify', `--backup=${findBackup(data.name).file}`]);
  const drill = (data?) =>
    runTool('drill', data.name, 'pg-backup.js', ['drill', `--backup=${findBackup(data.name).file}`], {
      DRILL_PG_CONTROL_URL: process.env.SANDBOX_PG_CONTROL_URL || ''
    });

  /* ---------- đọc trạng thái ---------- */
  function fetchHealth() {
    return new Promise<any>(resolve => {
      const req = http.get({ host: '127.0.0.1', port: getPort(), path: '/api/health', timeout: 1500 }, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => req.destroy());
    });
  }

  async function snapshot() {
    const job = state.load.job;
    const gate = limits?.hashGate?.stats();
    return {
      load: {
        seeded: await countLoadUsers(),
        scenarios: LOAD_SCENARIOS,
        job: job && {
          status: job.status,
          options: job.options,
          elapsedSec: Math.round(((job.endedAt || performance.now()) - job.startedAt) / 1000),
          lines: job.lines,
          summaries: job.summaries,
          reconciled: job.reconciled,
          exitCode: job.exitCode
        }
      },
      server: {
        health: await fetchHealth(),
        shed: limits?.shedder?.shed ?? null,
        hashGate: gate ?? null
      },
      backups: state.backups.map(({ name, kind, bytes, integrity, ms }: any) => ({ name, kind, bytes, integrity, ms })),
      tool: state.tool,
      toolRunning
    };
  }

  const POST = {
    'load-seed': async (data?) => seed(data),
    'load-run': async (data?) => startLoad(data),
    'load-cancel': async () => cancelLoad(),
    backup: async () => backup(),
    corrupt: async (data?) => corrupt(data),
    verify,
    drill
  };

  return {
    snapshot,
    // Trả undefined nếu không phải đường của ops
    async post(name?, data?) {
      if (!Object.hasOwn(POST, name)) return undefined;
      await POST[name](data);
      return snapshot();
    },
    close() {
      cancelLoad();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  };
}

module.exports = { createOps };
