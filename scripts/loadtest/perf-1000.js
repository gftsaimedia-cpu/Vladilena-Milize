'use strict';
// Đo thời gian API với 1.000 nhân sự (không thuộc `npm test`, chạy tay):
//   node --no-warnings=ExperimentalWarning scripts/db/seed-demo.js --scale=1000 --no-check --db=<file tạm>
//   node --no-warnings=ExperimentalWarning scripts/loadtest/perf-1000.js --db=<file tạm> [--port=3121] [--month=2026-10] [--sse=1000] [--clock=real]
// Khởi động server.js trên cổng riêng (mặc định 3121) với DB tạm và đồng hồ dịch tới 2026-11-26 (scripts/loadtest/clock-shim.js);
// --clock=real chạy đồng hồ thật (Date gốc, nhanh hơn: bản dịch giờ làm chậm mọi new Date) và nên đo tháng đã qua, ví dụ --month=2026-09.
// Từ chối chạy nếu --db trỏ vào data/luong.sqlite hoặc không phải DB demo (thiếu khoá demo_dataset). Chỉ người bịa (demo_*).
const { spawn, execFileSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const DB = args.db && path.resolve(String(args.db));
const PORT = Number(args.port || 3121);
const MONTH = String(args.month || '2026-10');
const SSE_TARGET = Number(args.sse === undefined ? 1000 : args.sse);
const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const SLOW_MS = 2000;

if (!DB) throw new Error('Thiếu --db=<file DB demo tạm>');
if (path.basename(DB).toLowerCase() === 'luong.sqlite') throw new Error('Từ chối: đó là DB lương thật');
{
  const probe = new DatabaseSync(DB, { readOnly: true });
  const marked = probe.prepare('SELECT 1 FROM settings WHERE key = ?').get('demo_dataset');
  const bulk = probe.prepare('SELECT COUNT(*) AS n FROM staff WHERE username LIKE ?').get('demo_bulk_%').n;
  probe.close();
  if (!marked) throw new Error('Từ chối: không phải DB demo (thiếu demo_dataset)');
  console.log(`DB demo ${path.basename(DB)}: ${bulk} nhân sự nền`);
}

/* ---------- HTTP nhỏ có cookie ---------- */
const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });
function request(method, url, { cookie, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
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
          } catch {
            /* không phải JSON */
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json, bytes: Buffer.byteLength(text) });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
async function login(username) {
  const res = await request('POST', '/api/login', { body: { username, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`Đăng nhập ${username}: ${res.status} ${res.text.slice(0, 80)}`);
  return String(res.headers['set-cookie'][0]).split(';')[0];
}
const rssMb = pid => {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      const kb = Number((out.split('","')[4] || '').replace(/[^0-9]/g, ''));
      return kb / 1024;
    }
    return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' })) / 1024;
  } catch {
    return NaN;
  }
};
const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const results = [];
async function timed(label, fn, repeats = 3) {
  const times = [];
  let last;
  for (let i = 0; i < repeats; i++) {
    const t0 = process.hrtime.bigint();
    last = await fn();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const row = {
    label,
    status: last.status,
    kb: Math.round(last.bytes / 1024),
    medianMs: Math.round(median(times)),
    maxMs: Math.round(Math.max(...times)),
    flag: median(times) > SLOW_MS ? 'CHẬM' : ''
  };
  results.push(row);
  console.log(
    `${row.flag ? '!! ' : '   '}${label.padEnd(62)} HTTP ${row.status}  ${String(row.kb).padStart(6)} KB  trung vị ${String(row.medianMs).padStart(6)} ms  lớn nhất ${row.maxMs} ms  [${times.map(t => Math.round(t)).join(', ')}]`
  );
  return last;
}

/* ---------- khởi động server ---------- */
function startServer() {
  const child = spawn(
    process.execPath,
    [
      '--no-warnings=ExperimentalWarning',
      ...(args.clock === 'real' ? [] : ['-r', path.join(__dirname, 'clock-shim.js')]),
      '--import',
      'tsx',
      path.join(ROOT, 'src/server.ts')
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DB_PATH: DB,
        PORT: String(PORT),
        COOKIE_SECURE: '0',
        SESSION_SECRET: 'perf-' + 'x'.repeat(40),
        NODE_ENV: 'development',
        TZ: 'Asia/Ho_Chi_Minh'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  return new Promise((resolve, reject) => {
    let log = '';
    const onData = d => {
      log += d;
      if (/đang chạy tại/.test(log)) resolve(child);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', d => (log += d));
    child.on('exit', code => reject(new Error(`server thoát sớm (${code}): ${log.slice(-300)}`)));
    setTimeout(() => reject(new Error('server không lên sau 30 s: ' + log.slice(-300))), 30000);
  });
}

/* ---------- SSE ---------- */
function openSse(cookie) {
  return new Promise(resolve => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/api/events', method: 'GET', agent: false, headers: { cookie } },
      res => {
        const conn = { res, req, status: res.statusCode, frames: [] };
        res.setEncoding('utf8');
        res.on('data', d => conn.frames.push({ at: process.hrtime.bigint(), text: d }));
        resolve(conn);
      }
    );
    req.on('error', () => resolve({ status: 0, frames: [], req }));
    req.end();
  });
}

async function sseTest(child, admin) {
  const perUser = 5; // trần EVENTS_MAX_PER_USER
  const users = Math.ceil(SSE_TARGET / perUser);
  console.log(`\nSSE: mở ${SSE_TARGET} luồng nhàn rỗi bằng ${users} tài khoản (mỗi tài khoản ${perUser} luồng)`);
  const base = rssMb(child.pid);
  const conns = [];
  const t0 = Date.now();
  const cookies = [];
  for (let i = 1; i <= users; i++) cookies.push(await login(`demo_bulk_${String(i).padStart(4, '0')}`));
  console.log(`   đăng nhập ${users} tài khoản: ${Date.now() - t0} ms`);
  const t1 = Date.now();
  for (const cookie of cookies) for (let k = 0; k < perUser; k++) conns.push(await openSse(cookie));
  const ok = conns.filter(c => c.status === 200).length;
  console.log(
    `   mở ${conns.length} kết nối: ${ok} nhận 200 trong ${Date.now() - t1} ms; không nhận 200: ${conns.length - ok}`
  );
  await new Promise(r => setTimeout(r, 1500));
  console.log(`   RSS server: ${base.toFixed(0)} MB -> ${rssMb(child.pid).toFixed(0)} MB (${ok} luồng mở)`);
  // một lần phát tới tất cả: Lưu tham số phát params.changed cho mọi người
  const [y, mo] = MONTH.split('-').map(Number);
  const effective = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; // kỳ MONTH đã chốt công ở bước trên: tháng sau mới còn mở
  const rev = (await request('GET', `/api/settings/params?group=2&month=${effective}`, { cookie: admin })).json;
  const mark = process.hrtime.bigint();
  const res = await request('PUT', '/api/settings/params', {
    cookie: admin,
    body: {
      changes: [{ key: 'level.nv.1.base', value: 6500000 }],
      effectiveMonth: effective,
      reason: 'Đo độ trễ phát SSE trên dữ liệu demo',
      expectedRev: rev && rev.paramsRev
    }
  });
  const putMs = Number(process.hrtime.bigint() - mark) / 1e6;
  console.log(
    `   PUT /api/settings/params: HTTP ${res.status} trong ${Math.round(putMs)} ms ${res.status !== 200 ? res.text.slice(0, 200) : ''}`
  );
  await new Promise(r => setTimeout(r, 2000));
  const lat = conns
    .map(c => c.frames.find(f => /params\.changed/.test(f.text)))
    .filter(Boolean)
    .map(f => Number(f.at - mark) / 1e6);
  if (lat.length)
    console.log(
      `   params.changed: ${lat.length}/${conns.length} luồng nhận; độ trễ tính từ lúc gửi PUT: nhỏ nhất ${Math.round(Math.min(...lat))} ms, trung vị ${Math.round(median(lat))} ms, lớn nhất ${Math.round(Math.max(...lat))} ms`
    );
  else console.log('   không luồng nào nhận params.changed');
  console.log(`   RSS server sau phát: ${rssMb(child.pid).toFixed(0)} MB`);
  for (const c of conns) {
    try {
      c.req.destroy();
    } catch {
      /* đã đóng */
    }
  }
}

async function main() {
  const child = await startServer();
  console.log(`server pid ${child.pid} cổng ${PORT}, tháng đo ${MONTH}`);
  try {
    const admin = await login('demo_admin');
    const staff = await login('demo_bulk_0001');
    await timed('GET /api/me (admin)', () => request('GET', '/api/me', { cookie: admin }));
    await timed(`GET /api/periods/${MONTH}/estimates (trang đầu)`, () =>
      request('GET', `/api/periods/${MONTH}/estimates`, { cookie: admin })
    );
    await timed(`GET /api/periods/${MONTH}/estimates?pageSize=1000`, () =>
      request('GET', `/api/periods/${MONTH}/estimates?pageSize=1000`, { cookie: admin })
    );
    // Node chạy một luồng: một yêu cầu tính cả kỳ chặn mọi người khác. Đo độ trễ của một nhân sự trong lúc Admin đang tải estimates.
    {
      const heavy = request('GET', `/api/periods/${MONTH}/estimates`, { cookie: admin });
      await new Promise(r => setTimeout(r, 150));
      const t0 = process.hrtime.bigint();
      const light = await request('GET', '/api/me', { cookie: staff });
      const waited = Number(process.hrtime.bigint() - t0) / 1e6;
      await heavy;
      console.log(
        `${waited > SLOW_MS ? '!! ' : '   '}GET /api/me của nhân sự trong lúc Admin tải estimates: HTTP ${light.status}, chờ ${Math.round(waited)} ms`
      );
    }
    await timed('GET /api/me/estimate (nhân sự)', () =>
      request('GET', `/api/me/estimate?month=${MONTH}`, { cookie: staff })
    );
    await timed('GET /api/settings/params?group=2', () =>
      request('GET', `/api/settings/params?group=2&month=${MONTH}`, { cookie: admin })
    );
    await timed('POST /api/settings/params/preview (đổi lương cơ bản NV bậc 1)', () =>
      request('POST', '/api/settings/params/preview', {
        cookie: admin,
        body: { changes: [{ key: 'level.nv.1.base', value: 6500000 }], reason: 'Đo hiệu năng trên dữ liệu demo' }
      })
    );

    // Vòng đời kỳ: chốt công -> tính lương -> phiếu. Mỗi bước chạy một lần vì đổi trạng thái.
    const view = await request('GET', `/api/periods/${MONTH}`, { cookie: admin });
    console.log(`   kỳ ${MONTH}: trạng thái ${view.json && view.json.status}, rev ${view.json && view.json.rev}`);
    if (view.json && view.json.status === 'open') {
      // thử không bỏ qua gì để lấy danh sách kiểm (409 PERIOD_NOT_READY kèm checklist); nếu qua luôn thì kỳ đã chốt công
      const probe = await request('POST', `/api/periods/${MONTH}/lock-attendance`, {
        cookie: admin,
        body: { rev: view.json.rev }
      });
      if (probe.status === 200) console.log('   lock-attendance qua ngay, không có việc chặn');
      else {
        const lock = await timed(
          `POST /api/periods/${MONTH}/lock-attendance`,
          () =>
            request('POST', `/api/periods/${MONTH}/lock-attendance`, {
              cookie: admin,
              body: {
                rev: view.json.rev,
                reason: 'Đo hiệu năng trên dữ liệu demo',
                acknowledge: (probe.json?.checklist || []).filter(i => i.acknowledgeable).map(i => i.code)
              }
            }),
          1
        );
        if (lock.status !== 200) console.log(`   lock-attendance không qua: ${lock.text.slice(0, 300)}`);
      }
    }
    const after = await request('GET', `/api/periods/${MONTH}`, { cookie: admin });
    if (after.json && after.json.status === 'attendance_locked') {
      const calc = await timed(
        `POST /api/periods/${MONTH}/calculate`,
        () => request('POST', `/api/periods/${MONTH}/calculate`, { cookie: admin, body: { rev: after.json.rev } }),
        1
      );
      if (calc.status !== 200) console.log(`   calculate không qua: ${calc.text.slice(0, 300)}`);
    } else console.log(`   bỏ qua calculate: kỳ đang ở ${after.json && after.json.status}`);
    await timed(`GET /api/periods/${MONTH}/payslips (trang đầu)`, () =>
      request('GET', `/api/periods/${MONTH}/payslips`, { cookie: admin })
    );
    await timed(`GET /api/periods/${MONTH}/payslips?type=nv`, () =>
      request('GET', `/api/periods/${MONTH}/payslips?type=nv`, { cookie: admin })
    );
    await timed(`GET /api/periods/${MONTH}/payslips?type=nv&pageSize=1000`, () =>
      request('GET', `/api/periods/${MONTH}/payslips?type=nv&pageSize=1000`, { cookie: admin })
    );
    await timed(`GET /api/periods/${MONTH} (xem kỳ, có tổng)`, () =>
      request('GET', `/api/periods/${MONTH}`, { cookie: admin })
    );

    if (SSE_TARGET > 0) await sseTest(child, admin);
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 500));
    child.kill();
  }
  const slow = results.filter(r => r.flag);
  console.log(
    slow.length
      ? `\nCHẬM (> ${SLOW_MS} ms): ${slow.map(r => r.label).join('; ')}`
      : '\nKhông có đường nào chậm hơn 2 s.'
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
