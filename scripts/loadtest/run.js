'use strict';
// Bộ đo tải qua HTTP. Không thư viện ngoài. Hai chế độ:
//   Tự dựng (mặc định): tạo DB tạm trong thư mục tạm, nạp N người giả, chạy server.js ở tiến trình riêng, đo, đối soát DB, xoá thư mục tạm.
//     node --no-warnings=ExperimentalWarning scripts/loadtest/run.js --users=300 --seconds=30
//   Máy chủ có sẵn (ví dụ sandbox): --base=http://127.0.0.1:3104 và mật khẩu của người dùng đo tải trong biến môi trường LT_PASSWORD
//     (người dùng lt_0001..lt_NNNN và lt_admin phải có sẵn; sandbox nạp bằng nút "Nạp người dùng đo tải"). Đối soát DB không làm được từ ngoài:
//     dùng --ids-out=<file> để ghi các lượt đã xác nhận cho bên có DB (sandbox) tự đối soát.
// KHÔNG BAO GIỜ trỏ vào DB thật: chế độ tự dựng luôn tạo DB mới; chế độ --base chỉ gọi API bằng tài khoản lt_*.
// Tham số: --users --scenarios=login,checkin,mix,admin-burst --spread=<giây rải đăng nhập/Check-in> --seconds=<thời lượng mix>
//          --think=<min>-<max> ms --admins=<số Admin> --month=YYYY-MM --out=<file json> --ids-out=<file> --prefix=lt_ --port=<cổng tự dựng>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { SCENARIOS, DEFAULT_ORDER } = require('./kit/scenarios');
const { formatTable } = require('./kit/stats');
const { seedLoadUsers, userName, ADMIN_NAME, DEFAULT_PREFIX } = require('./kit/seed');
const { reconcile } = require('./kit/reconcile');

const root = path.resolve(__dirname, '..', '..');
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.length ? v.join('=') : 'true'];
    })
);
const num = (key, fallback) => (args[key] === undefined ? fallback : Number(args[key]));
const month = args.month || new Date().toISOString().slice(0, 7);
const [thinkMin, thinkMax] = (args.think || '5000-15000').split('-').map(Number);
const prefix = args.prefix || DEFAULT_PREFIX;
const scenarioNames = (args.scenarios || DEFAULT_ORDER.join(',')).split(',').filter(Boolean);
for (const name of scenarioNames) if (!SCENARIOS[name]) throw new Error(`Kịch bản không có: ${name}`);

async function waitHealthy(base, child) {
  for (let i = 0; i < 100; i++) {
    if (child && child.exitCode !== null) throw new Error('Máy chủ tự dựng thoát sớm');
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* chưa nghe cổng */
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Máy chủ không sẵn sàng sau 20 giây');
}

async function main() {
  const userCount = num('users', 300);
  let base = args.base;
  let password = process.env.LT_PASSWORD;
  let child = null;
  let workDir = null;
  let dbPath = null;

  if (!base) {
    // Tự dựng: DB tạm, nạp người dùng, chạy server.js riêng
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-loadtest-'));
    dbPath = path.join(workDir, 'load.sqlite');
    password = crypto.randomBytes(12).toString('hex');
    process.env.DB_PATH = dbPath;
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    const store = require('../../lib/db');
    const auth = require('../../lib/auth');
    await seedLoadUsers(store, { count: userCount, passHash: auth.hashPassword(password), prefix });
    store.db.close();
    const port = num('port', 3590);
    base = `http://127.0.0.1:${port}`;
    // LT_NODE_ARGS: thêm cờ cho tiến trình máy chủ tự dựng, ví dụ --cpu-prof --cpu-prof-dir=<thư mục> để xem hàm nào tốn CPU
    const extraNodeArgs = (process.env.LT_NODE_ARGS || '').split(' ').filter(Boolean);
    child = spawn(
      process.execPath,
      ['--no-warnings=ExperimentalWarning', ...extraNodeArgs, '--import', 'tsx', 'src/server.ts'],
      {
        cwd: root,
        env: { ...process.env, PORT: String(port), COOKIE_SECURE: '0', ACCESS_LOG: 'off' },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc']
      }
    );
  } else if (!password) {
    throw new Error('Chế độ --base cần mật khẩu của người dùng đo tải trong biến môi trường LT_PASSWORD');
  }

  const summaries = [];
  const state = {};
  try {
    await waitHealthy(base, child);
    const ctx = {
      base,
      users: Array.from({ length: userCount }, (_, i) => userName(prefix, i + 1)),
      admin: ADMIN_NAME,
      password,
      month,
      spreadSec: num('spread', 10),
      seconds: num('seconds', 30),
      think: [thinkMin, thinkMax],
      admins: num('admins', 5),
      state
    };
    console.log(`Đo tải ${base}: ${userCount} người, kịch bản ${scenarioNames.join(' → ')}, tháng ${month}`);
    for (const name of scenarioNames) {
      if (name !== 'login' && !state.sessions) await SCENARIOS.login(ctx); // các kịch bản sau cần phiên đăng nhập
      console.log(`… ${name}`);
      const stats = await SCENARIOS[name](ctx);
      const summary = stats.summary();
      if (stats.extra) summary.extra = stats.extra;
      if (name === 'probe')
        for (const [route, ms] of Object.entries(stats.extra)) console.log(`  ${route}: ${ms.join(' / ')} ms`);
      summaries.push(summary);
    }

    let reconciled = null;
    if (state.confirmed) {
      if (args['ids-out']) fs.writeFileSync(args['ids-out'], JSON.stringify(state.confirmed));
      if (dbPath) {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbPath, { readOnly: true });
        reconciled = reconcile(db, state.confirmed, { prefix });
        db.close();
      }
    }

    console.log('\n' + formatTable(summaries));
    for (const s of summaries) if (s.problems.length) console.log(`  ${s.phase}: ${s.problems.join('; ')}`);
    if (state.unconfirmed?.length)
      console.log(`\nCheck-in không được xác nhận: ${state.unconfirmed.length} (xem file --out)`);
    if (reconciled)
      console.log(
        `\nĐối soát ghi: ${reconciled.confirmed} lượt xác nhận — mất ${reconciled.missing}, mồ côi ${reconciled.orphan}, lệch ${reconciled.mismatch}, trùng ${reconciled.duplicateSessions}, thừa ${reconciled.extraSessions} → ${reconciled.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`
      );
    const report = {
      when: new Date().toISOString(),
      base,
      users: userCount,
      month,
      summaries,
      reconciled,
      unconfirmed: state.unconfirmed || []
    };
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    const failed = summaries.some(s => s.verdict !== 'ĐẠT') || (reconciled && !reconciled.pass);
    process.exitCode = failed ? 1 : 0;
  } finally {
    if (child) {
      // Tắt êm qua IPC (đóng DB, ghi file profile nếu có); quá 15 giây thì giết
      if (child.exitCode === null) child.send('shutdown');
      const timer = setTimeout(() => child.kill(), 15000);
      await new Promise(resolve => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
      clearTimeout(timer);
    }
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 2;
});
