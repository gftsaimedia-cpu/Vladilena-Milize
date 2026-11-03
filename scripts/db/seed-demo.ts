// Dựng bộ dữ liệu DEMO của AiCB: người giả phủ mọi ca có thể xảy ra, kèm các ca bất thường cố ý.
//   DATABASE_URL=postgres://… npm run seed:demo -- --confirm-demo-db → dựng vào một database PostgreSQL mới, rỗng
//   node scripts/db/seed-demo.ts --export   → thêm CSV (UTF-8 có BOM) vào data/demo/
//   --today=YYYY-MM-DD   "hôm nay" mà dữ liệu giả định (mặc định 2026-11-26); lượt Check-in/out và quyết định sau ngày này bị bỏ
//   --scale=1000         thêm 1000 nhân sự nền demo_bulk_0001… để thử hiệu năng
//   --no-check           bỏ qua bước tự kiểm bằng "Soát dữ liệu" (AI)
//   --out=thư/mục   thư mục CSV (mặc định data/demo)
// AN TOÀN: cần DATABASE_URL đích tường minh và --confirm-demo-db; chỉ nhận PostgreSQL chưa có schema/bảng người dùng.
// Không ghi đè hay xoá database đã có; để dựng lại, hãy tạo một database mới.
// Mật khẩu mọi tài khoản demo: biến môi trường DEMO_PASSWORD, nếu bỏ trống dùng mật khẩu mặc định ghi ngay dưới đây (chỉ dùng cho DB demo).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const MARKER_KEY = 'demo_dataset';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = (message?, code = 1): never => {
  console.error(message);
  process.exit(code);
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('Cần DATABASE_URL trỏ tới database PostgreSQL mới, rỗng; seed demo không hỗ trợ DB_PATH.');
if (typeof args.db === 'string' || process.env.DB_PATH)
  fail('Từ chối chạy: seed demo chỉ nhận DATABASE_URL tường minh, không nhận --db hoặc DB_PATH.');
if (process.env.PG_TEST_URL)
  fail('Từ chối chạy: PG_TEST_URL chỉ dành cho công cụ test, không phải DB đích của seed demo.');
if (args['confirm-demo-db'] !== true)
  fail('Từ chối chạy: hãy thêm --confirm-demo-db để xác nhận DATABASE_URL là database demo mới và rỗng.');
const target: URL = (() => {
  try {
    return new URL(databaseUrl!);
  } catch {
    return fail('DATABASE_URL không phải URL PostgreSQL hợp lệ.');
  }
})();
const controlNames = new Set([
  '/postgres',
  '/luong_demo_control',
  '/luong_test_control',
  '/luong_sandbox_control',
  '/luong_drill_control',
  '/luong_scenario_control'
]);
if (!['postgres:', 'postgresql:'].includes(target.protocol) || controlNames.has(target.pathname))
  fail('DATABASE_URL phải trỏ tới database PostgreSQL đích, không phải database control hoặc database hệ thống.');
const probe = require('node:child_process').spawnSync(
  process.execPath,
  [
    '-e',
    `const { Client } = require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});try{await c.connect();const r=await c.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','public') AND nspname NOT LIKE 'pg_%') OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typrelid=0) AS occupied");console.log(JSON.stringify(r.rows[0]));}finally{await c.end();}})().catch(()=>process.exit(1));`
  ],
  { encoding: 'utf8', env: process.env, cwd: ROOT }
);
if (probe.status !== 0) fail('Không thể kiểm tra database PostgreSQL đích; thông tin kết nối đã được giữ kín.');
let targetState;
try {
  targetState = JSON.parse(probe.stdout);
} catch {
  fail('Không thể xác nhận database PostgreSQL đích đang rỗng.');
}
if (targetState.occupied)
  fail('Từ chối chạy: database đích không rỗng. Tạo database PostgreSQL mới; script không xoá database có sẵn.');
const S = require('./demo/scenarios');
const H = require('./demo/helpers');
const gen = require('./demo/generate');
const { exportAll } = require('./demo/export-csv');
const store = require('../../src/platform/db');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../../src/engine/payroll-params');

const today = typeof args.today === 'string' ? args.today : S.TODAY;
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || today < '2026-10-01' || today > '2026-11-30')
  fail('--today phải là ngày YYYY-MM-DD trong khoảng 2026-10-01 đến 2026-11-30');
const scale = args.scale === undefined ? 0 : Number(args.scale);
if (!Number.isInteger(scale) || scale < 0 || scale > 5000) fail('--scale phải là số nguyên từ 0 đến 5000');

(async () => {
  // Đánh dấu ngay khi file mới được tạo: nếu lần dựng bị lỗi giữa chừng, lần sau vẫn nhận ra đây là file demo và dựng lại được
  await store.setSetting(MARKER_KEY, { version: 1, building: true });
  const t0 = Date.now();
  const payroll = PayrollEngine.create(PayrollParams.DEFAULTS);
  const passHash = H.fixedHash(DEMO_PASSWORD);
  const personas = S.PERSONAS;
  const generator = gen.create({ store, payroll, passHash, today });
  const bulk = scale ? gen.bulkPersonas(scale, personas.length + S.ADMINS.length) : [];
  await generator.seedAll(personas, S.ADMINS, bulk);
  await store.setSetting(MARKER_KEY, { version: 1, today, personas: personas.length, bulk: bulk.length });

  /* ---------- tóm tắt (không có tên hay số tiền) ---------- */
  const line = (label?, value?) => console.log(`${label.padEnd(34)}${value}`);
  console.log('DB demo: PostgreSQL (DATABASE_URL đã được xác nhận là database rỗng)');
  console.log(
    `"Hôm nay" mà dữ liệu giả định: ${today} ${S.NOW_TIME} (giờ Việt Nam). Tháng 07–09 lịch sử, tháng 10 tháng chính, tháng 11 tính theo Check-in/out.`
  );
  console.log(
    'Đồng hồ thật của app (npm start) có thể sớm hơn: dòng tháng 11 sẽ là "tương lai". Sandbox: không nạp được DB này (luôn dùng RAM).'
  );
  console.log('\nSố dòng mỗi bảng');
  for (const table of [
    'staff',
    'timesheets',
    'settings',
    'slip_overrides',
    'sheet_approvals',
    'attendance_sessions',
    'punches',
    'corrections',
    'attendance_days',
    'punch_requests',
    'kpi_scores',
    'kpi_score_log'
  ]) {
    const n = (await store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;
    line(`  ${table}`, n);
  }
  const byGroup: Record<string, any> = {};
  for (const p of personas) byGroup[p.group] = (byGroup[p.group] || 0) + 1;
  console.log('\nPersona');
  line('  Nhân sự (không tính Admin)', personas.length);
  for (const [group, n] of Object.entries<any>(byGroup)) line(`    ${group}`, n);
  line('  Admin', S.ADMINS.length);
  line('  Nhân sự nền (--scale)', bulk.length);
  const covered = new Set<any>([...personas, ...S.ADMINS].flatMap(p => p.covers));
  const allCases = S.CASES.map(([id]: any) => id);
  const unknown = [...covered].filter(id => !allCases.includes(id));
  const uncovered = allCases.filter(id => !covered.has(id));
  const unreasonable = personas.filter(p => p.unreasonable);
  line('  Ca (case) đã phủ', `${allCases.length - uncovered.length}/${allCases.length}`);
  line(
    '  Persona bất thường (unreasonable)',
    `${unreasonable.length} (máy chủ hôm nay từ chối được ${unreasonable.filter(p => p.serverRejects && p.serverRejects.length).length})`
  );
  if (uncovered.length) console.log(`  Ca chưa có persona: ${uncovered.join(' ')}`);
  if (unknown.length) console.log(`  Mã ca không có trong danh mục: ${unknown.join(' ')}`);
  const warnings = [...generator.stats.warnings];
  if (generator.stats.skippedFutureEvents)
    warnings.push(`${generator.stats.skippedFutureEvents} quyết định hoặc thao tác Admin sau "hôm nay" không được tạo`);
  if (generator.stats.skippedFuturePunches)
    warnings.push(
      `${generator.stats.skippedFuturePunches} lượt Check-in/out sau "hôm nay" không được tạo (hoặc lượt ra còn để mở)`
    );

  /* ---------- lớp vận hành, phần chuẩn bị: cấu hình mà kỳ vọng của persona dựa vào (route thật, đồng hồ giả) ---------- */
  let lifecycle: any = null;
  if (!args['no-lifecycle']) {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'demo-lifecycle';
    const { Lifecycle } = require('./demo/lifecycle');
    lifecycle = new Lifecycle({
      store,
      auth: require('../../src/platform/auth'),
      server: require('../../src/server'),
      admin: S.ADMINS[0].username,
      personas,
      today
    });
    await lifecycle.open();
    const prepared = await lifecycle.prepare();
    for (const step of prepared.filter(s => !s.ok)) warnings.push(`Lớp vận hành: ${step.name}: ${step.detail}`);
  }

  let exitCode = 0;
  if (warnings.length) {
    console.log('\nCảnh báo');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  /* ---------- lớp vận hành, phần chính: vai trò, khoản điền thêm, giải trình, tạm ứng, sổ phép, kỳ lương mọi trạng thái ---------- */
  // Chạy sau tự kiểm vì tự kiểm cần kỳ chưa chốt. --no-lifecycle bỏ qua (khi chỉ cần nhân sự, lịch, chấm công, khoản chờ duyệt).
  if (lifecycle) {
    const report = await lifecycle.run();
    await lifecycle.close();
    console.log('\nLớp vận hành (route thật)');
    for (const step of report)
      console.log(`  ${step.ok ? '[ĐẠT]' : '[LỖI]'} ${step.name}${step.detail ? ': ' + step.detail : ''}`);
    const failed = report.filter(step => !step.ok);
    for (const step of failed)
      if (!warnings.some(w => w.includes(step.detail))) warnings.push(`Lớp vận hành: ${step.name}: ${step.detail}`);
    if (failed.length) exitCode = exitCode || 3;
  }

  /* ---------- độ phủ so với "vũ trụ ca" rút từ mã (scripts/db/demo/coverage.ts) ---------- */
  if (!args['no-coverage']) {
    const coverage = await require('./demo/coverage').measure({ store, personas });
    console.log(`
Độ phủ: ${coverage.summary.tables} bảng, ${coverage.summary.enumChecks} giá trị ràng buộc CHECK, ${coverage.summary.personas} persona (${coverage.summary.unreasonable} bất thường)`);
    if (coverage.gaps.length) {
      console.log(`  THIẾU ${coverage.gaps.length}:`);
      for (const g of coverage.gaps) console.log('   - ' + g);
      exitCode = exitCode || 4;
    } else
      console.log(
        '  Đủ: mọi bảng, mọi giá trị CHECK, mọi trạng thái kỳ lương, mọi chức vụ × bậc, mọi vai trò mặc định đều có dữ liệu.'
      );
    if (typeof args['coverage-json'] === 'string')
      fs.writeFileSync(args['coverage-json'], JSON.stringify(coverage, null, 2));
  }

  /* ---------- xuất CSV ---------- */
  if (args.export) {
    const dir = typeof args.out === 'string' ? args.out : path.join(ROOT, 'data', 'demo');
    const written = await exportAll({
      store,
      personas,
      dir,
      people: [...personas, ...S.ADMINS, ...bulk]
    });
    console.log(`\nĐã xuất ${Object.keys(written).length} file CSV vào ${path.relative(ROOT, path.resolve(dir))}/`);
    for (const [file, rows] of Object.entries<any>(written)) line(`  ${file}`, `${rows} dòng`);
  }
  store.db.close();
  console.log(
    `\nXong trong ${((Date.now() - t0) / 1000).toFixed(1)} giây.${exitCode ? { 2: ' Có kỳ vọng AI chưa đạt (xem cảnh báo).', 3: ' Lớp vận hành có bước lỗi (xem mục Lớp vận hành).', 4: ' Độ phủ còn thiếu (xem mục Độ phủ).' }[exitCode] || ' Có chỗ chưa đạt.' : ''}`
  );
  process.exit(exitCode);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
