'use strict';
// Bộ đo tải chạy tay (không thuộc `npm test`).
// Mọi script chạy server.js thật trên cổng riêng (mặc định 3500, đổi bằng LT_PORT) với DB demo tạm trong LT_WORK/db (copy của DB dựng bằng
// `node scripts/db/seed-demo.js --scale=1000 --no-check --db=<LT_WORK>/db/base1000.sqlite`). Từ chối mọi đường dẫn tên luong.sqlite.
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
// Thư mục làm việc (DB tạm, nhật ký, cookie): đặt LT_WORK, mặc định ./work cạnh các script. Không bao giờ trỏ vào data/.
const WORK = path.resolve(process.env.LT_WORK || path.join(__dirname, 'work'));
const HERE = __dirname;
const PORT = Number(process.env.LT_PORT || 3500);
const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
};
const r1 = x => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);

function makeClient(port = PORT, maxSockets = 2000, keepAlive = true) {
  const agent = keepAlive ? new http.Agent({ keepAlive: true, maxSockets }) : false;
  function request(method, url, { cookie, body } = {}) {
    return new Promise(resolve => {
      const data = body === undefined ? null : JSON.stringify(body);
      const t0 = process.hrtime.bigint();
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: url,
          method,
          agent,
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {})
          }
        },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try {
              json = JSON.parse(text);
            } catch {}
            resolve({
              status: res.statusCode,
              headers: res.headers,
              text,
              json,
              bytes: text.length,
              ms: Number(process.hrtime.bigint() - t0) / 1e6
            });
          });
        }
      );
      req.on('error', e =>
        resolve({ status: 0, error: e.code || String(e), ms: Number(process.hrtime.bigint() - t0) / 1e6, bytes: 0 })
      );
      if (data) req.write(data);
      req.end();
    });
  }
  return { request, agent, destroy: () => agent && agent.destroy() };
}

// Chạy tasks (mảng hàm async) với tối đa conc việc cùng lúc
async function pool(tasks, conc) {
  let i = 0;
  const out = new Array(tasks.length);
  await Promise.all(
    Array.from({ length: Math.min(conc, tasks.length) }, async () => {
      while (i < tasks.length) {
        const k = i++;
        out[k] = await tasks[k]();
      }
    })
  );
  return out;
}

function copyDb(src, dst) {
  for (const f of [src, dst])
    if (path.basename(f).toLowerCase().startsWith('luong.sqlite')) throw new Error('Từ chối: đó là DB lương thật');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.mkdirSync(path.join(WORK, 'out'), { recursive: true });
  for (const s of ['', '-wal', '-shm']) fs.rmSync(dst + s, { force: true });
  fs.copyFileSync(src, dst);
  const t = new DatabaseSync(dst);
  t.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  t.close();
}

async function startServer({ db, shimNow, name, port = PORT, extraEnv = {}, nodeArgs = [] }) {
  const mon = path.join(WORK, 'out', `mon-${name}.jsonl`);
  const child = spawn(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', ...nodeArgs, '-r', path.join(HERE, 'shim.js'), path.join(ROOT, 'server.js')],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DB_PATH: db,
        PORT: String(port),
        COOKIE_SECURE: '0',
        SESSION_SECRET: 'perf-' + 'x'.repeat(40),
        NODE_ENV: 'development',
        TZ: 'Asia/Ho_Chi_Minh',
        SHIM_NOW: shimNow || '',
        MON_FILE: mon,
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let log = '';
  await new Promise((resolve, reject) => {
    child.stdout.on('data', d => {
      log += d;
      if (/đang chạy tại/.test(log)) resolve();
    });
    child.stderr.on('data', d => (log += d));
    child.on('exit', c => reject(new Error('server thoát sớm ' + c + ' ' + log.slice(-300))));
    setTimeout(() => reject(new Error('server không lên: ' + log.slice(-300))), 30000);
  });
  return {
    child,
    mon,
    log: () => log,
    stop: async () => {
      child.kill('SIGTERM');
      await sleep(800);
      child.kill();
      await sleep(200);
    }
  };
}
function readMon(mon, fromIdx = 0) {
  let rows = [];
  try {
    rows = fs
      .readFileSync(mon, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  } catch {}
  return rows;
}
// Tóm tắt nhật ký giám sát giữa hai mốc (chỉ số dòng)
function monSummary(mon, from = 0, to = Infinity) {
  const rows = readMon(mon).slice(from, to);
  if (!rows.length) return { n: 0 };
  return {
    n: rows.length,
    rssMaxMB: r1(Math.max(...rows.map(r => r.rss)) / 1048576),
    rssLastMB: r1(rows.at(-1).rss / 1048576),
    cpuMaxPct: Math.max(...rows.map(r => r.cpu)),
    cpuAvgPct: r1(rows.reduce((s, r) => s + r.cpu, 0) / rows.length),
    eld99MaxMs: r1(Math.max(...rows.map(r => r.eld99))),
    eldMaxMs: r1(Math.max(...rows.map(r => r.eldMax)))
  };
}
const monIdx = mon => readMon(mon).length;

async function loginAll(client, names, conc) {
  const lats = [];
  const cookies = {};
  let fail = 0;
  const t0 = Date.now();
  await pool(
    names.map(u => async () => {
      const r = await client.request('POST', '/api/login', { body: { username: u, password: PASSWORD } });
      lats.push(r.ms);
      if (r.status !== 200) fail++;
      else cookies[u] = String(r.headers['set-cookie'][0]).split(';')[0];
    }),
    conc
  );
  const wall = Date.now() - t0;
  return {
    cookies,
    wallMs: wall,
    fail,
    n: names.length,
    p50: r1(pct(lats, 50)),
    p95: r1(pct(lats, 95)),
    p99: r1(pct(lats, 99)),
    max: r1(Math.max(...lats)),
    perSec: r1((names.length / wall) * 1000)
  };
}
const bulkNames = n => Array.from({ length: n }, (_, i) => `demo_bulk_${String(i + 1).padStart(4, '0')}`);
module.exports = {
  ROOT,
  HERE,
  WORK,
  PORT,
  PASSWORD,
  sleep,
  pct,
  r1,
  makeClient,
  pool,
  copyDb,
  startServer,
  readMon,
  monSummary,
  monIdx,
  loginAll,
  bulkNames
};
