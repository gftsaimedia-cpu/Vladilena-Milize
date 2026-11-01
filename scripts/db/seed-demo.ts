// Dựng bộ dữ liệu DEMO của AiCB: người giả phủ mọi ca có thể xảy ra, kèm các ca bất thường cố ý.
//   npm run seed:demo                       → ./data/demo (PostgreSQL trong tiến trình, lưu thư mục; hoặc DATABASE_URL / DB_PATH nếu đặt)
//   node scripts/db/seed-demo.ts --export   → thêm CSV (UTF-8 có BOM) vào data/demo/
//   --today=YYYY-MM-DD   "hôm nay" mà dữ liệu giả định (mặc định 2026-11-26); lượt Check-in/out và quyết định sau ngày này bị bỏ
//   --scale=1000         thêm 1000 nhân sự nền demo_bulk_0001… để thử hiệu năng
//   --no-check           bỏ qua bước tự kiểm bằng "Soát dữ liệu" (AI)
//   --db=thư/mục|:memory:  nơi lưu DB (ưu tiên hơn DB_PATH)   --out=thư/mục   thư mục CSV (mặc định data/demo)
// AN TOÀN: chỉ ghi vào thư mục chưa có, thư mục rỗng, hoặc thư mục demo do chính script này tạo
// (nhận ra bằng khoá `demo_dataset` trong bảng settings); mọi thư mục khác bị từ chối. Dựng lại = xoá thư mục demo cũ rồi tạo mới, kết quả luôn giống nhau.
// Mật khẩu mọi tài khoản demo: biến môi trường DEMO_PASSWORD, nếu bỏ trống dùng mật khẩu mặc định ghi ngay dưới đây (chỉ dùng cho DB demo).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DB = path.join(ROOT, 'data', 'demo');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const MARKER_KEY = 'demo_dataset';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = (message?, code = 1) => {
  console.error(message);
  process.exit(code);
};

// Đường dẫn chuẩn tắc: giải về tuyệt đối, kể cả liên kết tượng trưng ở thư mục chứa, so không phân biệt hoa thường trên Windows và macOS
const canonical = (file?) => {
  const full = path.resolve(file);
  let real = full;
  try {
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
// PostgreSQL thật qua DATABASE_URL: chỉ nạp vào DB MỚI (chưa có nhân sự) hoặc DB demo đã nạp trước đó, và phải có --confirm-demo-db.
// Kiểm trước khi nạp lib/db (nạp lib/db là chạy migration lên DB đó) bằng một kết nối riêng chỉ đọc.
if (process.env.DATABASE_URL) {
  if (args['confirm-demo-db'] !== true)
    fail(
      'Từ chối chạy: DATABASE_URL trỏ vào một máy chủ PostgreSQL. Thêm --confirm-demo-db để xác nhận đó là DB MỚI hoặc DB demo (dữ liệu demo ghi thẳng vào đó).'
    );
  const probe = require('node:child_process').spawnSync(
    process.execPath,
    [
      '-e',
      `const { Client } = require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();let staff=0,marked=false;try{staff=Number((await c.query('SELECT COUNT(*) AS n FROM staff')).rows[0].n);marked=(await c.query("SELECT 1 FROM settings WHERE key='demo_dataset'")).rowCount>0;}catch{}await c.end();console.log(JSON.stringify({staff,marked}));})().catch(e=>{console.error(e.message);process.exit(1);});`
    ],
    { encoding: 'utf8', env: process.env, cwd: ROOT }
  );
  if (probe.status !== 0)
    fail(
      'Không kiểm được DB PostgreSQL đích: ' +
        String(probe.stderr)
          .replace(/\/\/[^@/\s]*@/g, '//***@')
          .trim()
    );
  const { staff, marked } = JSON.parse(probe.stdout);
  if (staff > 0 && !marked)
    fail(
      'Từ chối chạy: DB PostgreSQL đích đã có ' + staff + ' nhân sự và không phải DB demo (thiếu khoá demo_dataset).'
    );
  if (marked)
    fail(
      'DB PostgreSQL đích đã là DB demo: dựng lại bằng cách tạo DB mới (script không xoá dữ liệu trên máy chủ PostgreSQL).'
    );
}
// Không có DATABASE_URL: PostgreSQL trong tiến trình (PGlite). --db=:memory: (RAM) hoặc --db=<thư mục> (lưu đĩa; mặc định data/demo).
const dbArg = process.env.DATABASE_URL
  ? null
  : typeof args.db === 'string'
    ? args.db
    : process.env.DB_PATH || DEFAULT_DB;
const MEMORY = dbArg === ':memory:';
if (dbArg && !MEMORY) {
  const dir = path.resolve(dbArg);
  const pathParts = dir.split(path.sep).map(p => p.toLowerCase());
  if (pathParts.includes('luong') || path.basename(dir) === 'luong')
    fail('Từ chối chạy: đường dẫn trông như DB lương thật. Dữ liệu demo chỉ ghi vào data/demo hoặc thư mục demo khác.');
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    // Thư mục có sẵn: chỉ dựng lại nếu là DB demo do chính script này tạo (khoá demo_dataset trong settings)
    const probe = require('node:child_process').spawnSync(
      process.execPath,
      [
        '--no-warnings=ExperimentalWarning',
        '-e',
        "const { PostgresDatabase } = require('./lib/data/postgres-database');(async()=>{const db=new PostgresDatabase({dataDir:process.argv[1]});let marked=false;try{await db.ready;marked=!!(await db.prepare('SELECT 1 FROM settings WHERE key = ?').get('demo_dataset'));}catch{}await db.close();console.log(JSON.stringify({marked}));})()",
        dir
      ],
      { encoding: 'utf8', cwd: ROOT }
    );
    let marked = false;
    try {
      marked = JSON.parse(String(probe.stdout).trim().split('\n').pop() as string).marked;
    } catch {
      marked = false;
    }
    if (!marked)
      fail(
        'Từ chối chạy: thư mục đã có dữ liệu và không phải DB demo do script này tạo (thiếu khoá demo_dataset). Chọn đường dẫn khác hoặc xoá thư mục nếu chắc đó là dữ liệu thử.'
      );
    fs.rmSync(dir, { recursive: true, force: true }); // dựng lại từ trống (migration chạy lại trên DB mới)
  }
}

// Chỉ nạp lib/db SAU khi đường dẫn đã được kiểm: nạp lib/db là mở và nâng cấp file DB
if (dbArg) process.env.DB_PATH = dbArg;
const S = require('./demo/scenarios');
const H = require('./demo/helpers');
const gen = require('./demo/generate');
const selfcheck = require('./demo/selfcheck');
const { exportAll } = require('./demo/export-csv');
const store = require('../../lib/db');
const { loadPayroll } = require('../../lib/ai/payroll-loader.ts');

const today = typeof args.today === 'string' ? args.today : S.TODAY;
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || today < '2026-10-01' || today > '2026-11-30')
  fail('--today phải là ngày YYYY-MM-DD trong khoảng 2026-10-01 đến 2026-11-30');
const scale = args.scale === undefined ? 0 : Number(args.scale);
if (!Number.isInteger(scale) || scale < 0 || scale > 5000) fail('--scale phải là số nguyên từ 0 đến 5000');

(async () => {
  // Đánh dấu ngay khi file mới được tạo: nếu lần dựng bị lỗi giữa chừng, lần sau vẫn nhận ra đây là file demo và dựng lại được
  await store.setSetting(MARKER_KEY, { version: 1, building: true });
  const t0 = Date.now();
  const payroll = loadPayroll();
  const passHash = H.fixedHash(DEMO_PASSWORD);
  const personas = S.PERSONAS;
  const generator = gen.create({ store, payroll, passHash, today });
  const bulk = scale ? gen.bulkPersonas(scale, personas.length + S.ADMINS.length) : [];
  await generator.seedAll(personas, S.ADMINS, bulk);
  await store.setSetting(MARKER_KEY, { version: 1, today, personas: personas.length, bulk: bulk.length });

  /* ---------- tóm tắt (không có tên hay số tiền) ---------- */
  const line = (label?, value?) => console.log(`${label.padEnd(34)}${value}`);
  console.log(`DB demo: ${MEMORY ? ':memory:' : path.relative(ROOT, path.resolve(dbArg)) || dbArg}`);
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
      auth: require('../../lib/auth'),
      server: require('../../src/server'),
      admin: S.ADMINS[0].username,
      personas,
      today
    });
    await lifecycle.open();
    const prepared = await lifecycle.prepare();
    for (const step of prepared.filter(s => !s.ok)) warnings.push(`Lớp vận hành: ${step.name}: ${step.detail}`);
  }

  /* ---------- tự kiểm bằng "Soát dữ liệu" ---------- */
  let check: any = null;
  let exitCode = 0;
  if (!args['no-check']) {
    check = await selfcheck.run({ store, payroll, personas, today });
    console.log(`\nTự kiểm "Soát dữ liệu" (${check.months.join(', ')}, tính đến ${today})`);
    for (const [month, total] of Object.entries<any>(check.perMonth)) line(`  Phát hiện tháng ${month}`, total);
    for (const m of check.mapping)
      console.log(
        `  ${m.rule.padEnd(28)} ${String(m.hits).padStart(3)} lần, ${String(m.people).padStart(2)} người · phải bắn: ${m.fire.length} persona · sát ngưỡng: ${m.miss.length} persona${S.SYSTEM_RULES.includes(m.rule) ? ' · luật hệ thống, không kiểm bằng persona' : ''}`
      );
    line('  Lỗi tính lương (payrollErrors)', check.payrollErrors);
    if (check.period) {
      const p = check.period.summary;
      console.log(`
Phiếu kỳ lương ${p.month} (tính trong tiến trình, không ghi DB; luồng route thật: scripts/db/demo/period-check.ts)`);
      line('  Phiếu', `${p.total} (loại: ${p.types.join(', ')})`);
      line('  Phiếu lỗi theo mã', JSON.stringify(p.errors));
      line('  Phiếu có cờ AI', `${p.flagged} (trên ${p.rules} luật)`);
      line('  Chuyên cần giữ / mất', `${p.attendanceKept} / ${p.attendanceLost}`);
      line('  iDorm · tắt tạm ứng', `${p.iDorm} · ${p.advanceOff}`);
      for (const problem of check.period.problems) warnings.push(`Kỳ lương: ${problem}`);
    }
    for (const problem of check.clock) warnings.push(`Đồng hồ: ${problem}`);
    if (check.skipped.length) console.log(`  Luật bị bỏ qua: ${check.skipped.join(', ')}`);
    if (check.missingRules.length) warnings.push(`Danh sách luật lệch review.js: ${check.missingRules.join(', ')}`);
    if (check.zero.length) warnings.push(`Luật KHÔNG bắn lần nào: ${check.zero.join(', ')}`);
    if (check.noFire.length) warnings.push(`Luật chưa có persona "phải bắn": ${check.noFire.join(', ')}`);
    if (check.noMiss.length) warnings.push(`Luật chưa có persona "sát ngưỡng": ${check.noMiss.join(', ')}`);
    for (const mm of check.mismatches)
      warnings.push(`${mm.kind}: ${mm.username} · ${mm.rule}${mm.date ? ' · ' + mm.date : ''}`);
    if (check.clock.length) exitCode = 2;
    if (
      today === S.TODAY &&
      (check.zero.length ||
        check.mismatches.length ||
        check.noFire.length ||
        check.noMiss.length ||
        check.missingRules.length ||
        (check.period && check.period.problems.length))
    )
      exitCode = 2;
    if (today !== S.TODAY) warnings.push('Đã đổi --today nên kỳ vọng của AI có thể lệch: chỉ kiểm bản mặc định');
  }
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
      selfcheck: check,
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
