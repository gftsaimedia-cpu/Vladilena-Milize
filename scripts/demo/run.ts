// DB demo và test đầu-cuối trên BE thật (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md).
//
//   npm run demo -- db                 dựng lại luong_demo (xoá, nạp schema.sql, seed mọi mảng)
//   npm run demo -- serve              mở app trên luong_demo: BE http://127.0.0.1:3370, FE http://127.0.0.1:5170
//   npm run demo -- test <mảng>        dựng DB riêng của mảng, chạy web/tests/api/demo-<mảng>-*.spec.ts
//   npm run demo -- test smoke         thử phần nền (web/tests/api/demo-smoke.spec.ts)
//   npm run demo -- test               mọi mảng và mọi spec trong web/tests/api
//
// Sau `test <mảng>` có thể thêm đối số cho Playwright, ví dụ: npm run demo -- test payroll -g "phiếu".
// Tài khoản nằm ở deploy/demo/accounts.local (git bỏ qua). Lệnh không bao giờ in mật khẩu.
import { spawn, spawnSync } from 'node:child_process';
import { ensureAccounts } from './accounts';
import { ACCOUNTS_FILE, PG, ROOT, TARGETS, type TargetName } from './config';
import { demoMonths } from './dates';
import { dbExists, ensureContainer, recreateDb } from './db';
import { DemoApi } from './api';
import { AREAS, type Area } from './people/index';
import { seed } from './seed';
import { shellArg, startBackend, stop, type Running } from './processes';
import type { DemoAccounts } from './accounts-format';

const log = (m: string) => console.log(`[demo] ${m}`);

function apiFor(port: number, accounts: DemoAccounts): DemoApi {
  return new DemoApi(`http://127.0.0.1:${port}`, u => (u === accounts.adminUser ? accounts.adminPassword : accounts.staffPassword));
}

/** Dựng lại một DB, bật BE tạm, seed, tắt BE. Trả về các mảng seed lỗi (chỉ khi keepGoing). */
async function build(name: TargetName, areas: Area[], accounts: DemoAccounts, keepGoing: boolean) {
  const t = TARGETS[name];
  recreateDb(t.db);
  log(`đã dựng lại ${t.db} từ schema.sql`);
  let be: Running | undefined;
  try {
    be = await startBackend(name, t, accounts);
    const months = demoMonths();
    log(`hôm nay ${months.today}; các tháng ${months.m2}, ${months.m1}, ${months.m0}`);
    return await seed({ api: apiFor(t.be, accounts), adminUser: accounts.adminUser, staffPassword: accounts.staffPassword, areas, months, log, keepGoing });
  } finally {
    stop(be?.child);
  }
}

async function cmdDb(accounts: DemoAccounts): Promise<number> {
  const failed = await build('build', AREAS, accounts, true);
  if (failed.length) {
    log(`luong_demo đã dựng nhưng seed lỗi ở: ${failed.map(f => f.area).join(', ')}`);
    return 1;
  }
  log(`xong: luong_demo ở ${PG.container} (127.0.0.1:${PG.port}). Tài khoản: ${ACCOUNTS_FILE}`);
  return 0;
}

async function cmdServe(accounts: DemoAccounts): Promise<number> {
  if (!dbExists(TARGETS.demo.db)) {
    log('chưa có luong_demo, dựng trước');
    await cmdDb(accounts);
  }
  const t = TARGETS.demo;
  const be = await startBackend('demo', t, accounts);
  const args = ['--prefix', 'web', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(t.web), '--strictPort'];
  const web = spawn('npm', args, { cwd: ROOT, shell: true, stdio: 'inherit', env: { ...process.env, VITE_API_TARGET: `http://127.0.0.1:${t.be}` } });
  const shutdown = () => {
    stop(web);
    stop(be.child);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  log(`BE http://127.0.0.1:${t.be} (log ${be.logFile})`);
  log(`Mở http://127.0.0.1:${t.web}/dang-nhap. Tài khoản: ${ACCOUNTS_FILE}. Ctrl+C để tắt.`);
  const code = await new Promise<number>(resolve => web.once('exit', c => resolve(c ?? 0)));
  shutdown();
  return code;
}

async function cmdTest(which: string | undefined, extra: string[], accounts: DemoAccounts): Promise<number> {
  const name = (which ?? 'all') as TargetName;
  if (!['all', 'smoke', ...AREAS].includes(name)) throw new Error(`Không có mảng '${which}'. Chọn: smoke, ${AREAS.join(', ')}, hoặc bỏ trống để chạy hết.`);
  const areas: Area[] = name === 'all' ? AREAS : name === 'smoke' ? [] : [name as Area];
  const t = TARGETS[name];

  recreateDb(t.db);
  log(`đã dựng lại ${t.db} từ schema.sql`);
  let be: Running | undefined;
  try {
    be = await startBackend(name, t, accounts);
    await seed({ api: apiFor(t.be, accounts), adminUser: accounts.adminUser, staffPassword: accounts.staffPassword, areas, months: demoMonths(), log, keepGoing: false });
    const filter = name === 'all' ? [] : [`demo-${name}`];
    const args = ['--prefix', 'web', 'run', 'test:api', '--', ...filter, ...extra].map(shellArg);
    log(`chạy Playwright (${filter[0] ?? 'mọi spec trong web/tests/api'}) với BE ${t.be}, vite ${t.web}`);
    const r = spawnSync('npm', args, {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        PW_PORT: String(t.web),
        VITE_API_TARGET: `http://127.0.0.1:${t.be}`,
        PW_ADMIN_USER: accounts.adminUser,
        PW_ADMIN_PASS: accounts.adminPassword,
        DEMO_ACCOUNTS_FILE: ACCOUNTS_FILE,
        DEMO_AREAS: ['smoke', ...areas].join(',')
      }
    });
    log(`log BE: ${be.logFile}`);
    return r.status ?? 1;
  } finally {
    stop(be?.child);
  }
}

async function main(): Promise<number> {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  if (!cmd || !['db', 'serve', 'test'].includes(cmd)) {
    console.log('Dùng: npm run demo -- db | serve | test [smoke|staff|attendance|requests|payroll] [đối số Playwright]');
    return cmd ? 1 : 0;
  }
  const { accounts, created } = ensureAccounts();
  if (created) log(`đã tạo file tài khoản ${ACCOUNTS_FILE} (git bỏ qua)`);
  await ensureContainer(log);
  if (cmd === 'db') return cmdDb(accounts);
  if (cmd === 'serve') return cmdServe(accounts);
  return cmdTest(arg, rest, accounts);
}

main().then(
  code => process.exit(code),
  error => {
    console.error(`[demo] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
);
