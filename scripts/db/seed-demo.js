// Dựng bộ dữ liệu DEMO của AiCB: người giả phủ mọi ca có thể xảy ra, kèm các ca bất thường cố ý.
//   npm run seed:demo                       → ./data/demo.sqlite (hoặc DB_PATH nếu đặt)
//   node scripts/db/seed-demo.js --export   → thêm CSV (UTF-8 có BOM) vào data/demo/
//   --today=YYYY-MM-DD   "hôm nay" mà dữ liệu giả định (mặc định 2026-11-26); lượt Check-in/out và quyết định sau ngày này bị bỏ
//   --scale=1000         thêm 1000 nhân sự nền demo_bulk_0001… để thử hiệu năng
//   --no-check           bỏ qua bước tự kiểm bằng "Soát dữ liệu" (AI)
//   --db=đường/dẫn       đường dẫn DB (ưu tiên hơn DB_PATH)   --out=thư/mục   thư mục CSV (mặc định data/demo)
// AN TOÀN: tuyệt đối không mở data/luong.sqlite (DB lương thật). Chỉ ghi vào file chưa có, file rỗng, hoặc file demo do chính script này tạo
// (nhận ra bằng khoá `demo_dataset` trong bảng settings); mọi file khác bị từ chối. Dựng lại = xoá file demo cũ rồi tạo mới, kết quả luôn giống nhau.
// Mật khẩu mọi tài khoản demo: biến môi trường DEMO_PASSWORD, nếu bỏ trống dùng mật khẩu mặc định ghi ngay dưới đây (chỉ dùng cho DB demo).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DB = path.join(ROOT, 'data', 'demo.sqlite');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const MARKER_KEY = 'demo_dataset';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};

// Đường dẫn chuẩn tắc: giải về tuyệt đối, kể cả liên kết tượng trưng ở thư mục chứa, so không phân biệt hoa thường trên Windows và macOS
const canonical = file => {
  const full = path.resolve(file);
  let real = full;
  try {
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
const REAL_DB = canonical(path.join(ROOT, 'data', 'luong.sqlite'));
const dbArg = typeof args.db === 'string' ? args.db : process.env.DB_PATH || DEFAULT_DB;
const MEMORY = dbArg === ':memory:';
if (!MEMORY) {
  const wanted = canonical(dbArg);
  if (wanted === REAL_DB || path.basename(wanted) === 'luong.sqlite')
    fail(
      'Từ chối chạy: đường dẫn trỏ vào DB lương thật (data/luong.sqlite). Dữ liệu demo chỉ ghi vào data/demo.sqlite hoặc file demo khác.'
    );
  if (fs.existsSync(dbArg) && fs.statSync(dbArg).size > 0) {
    let marked = false;
    try {
      const probe = new DatabaseSync(dbArg, { readOnly: true });
      marked = !!probe.prepare('SELECT 1 FROM settings WHERE key = ?').get(MARKER_KEY);
      probe.close();
    } catch {
      marked = false;
    }
    if (!marked)
      fail(
        'Từ chối chạy: file đã tồn tại và không phải DB demo do script này tạo (thiếu khoá demo_dataset). Chọn đường dẫn khác hoặc xoá file đó bằng tay nếu chắc chắn.'
      );
    // File demo cũ: xoá cùng -wal và -shm để dựng lại từ trống (migration chạy lại trên DB mới)
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbArg + suffix, { force: true });
  }
}

// Chỉ nạp lib/db SAU khi đường dẫn đã được kiểm: nạp lib/db là mở và nâng cấp file DB
process.env.DB_PATH = dbArg;
const S = require('./demo/scenarios.js');
const H = require('./demo/helpers.js');
const gen = require('./demo/generate.js');
const selfcheck = require('./demo/selfcheck.js');
const { exportAll } = require('./demo/export-csv.js');
const store = require('../../lib/db');
const { loadPayroll } = require('../../lib/ai/payroll-loader.js');

const today = typeof args.today === 'string' ? args.today : S.TODAY;
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || today < '2026-10-01' || today > '2026-11-30')
  fail('--today phải là ngày YYYY-MM-DD trong khoảng 2026-10-01 đến 2026-11-30');
const scale = args.scale === undefined ? 0 : Number(args.scale);
if (!Number.isInteger(scale) || scale < 0 || scale > 5000) fail('--scale phải là số nguyên từ 0 đến 5000');

// Đánh dấu ngay khi file mới được tạo: nếu lần dựng bị lỗi giữa chừng, lần sau vẫn nhận ra đây là file demo và dựng lại được
store.setSetting(MARKER_KEY, { version: 1, building: true });
const t0 = Date.now();
const payroll = loadPayroll();
const passHash = H.fixedHash(DEMO_PASSWORD);
const personas = S.PERSONAS;
const generator = gen.create({ store, payroll, passHash, today });
const bulk = scale ? gen.bulkPersonas(scale, personas.length + S.ADMINS.length) : [];
generator.seedAll(personas, S.ADMINS, bulk);
store.setSetting(MARKER_KEY, { version: 1, today, personas: personas.length, bulk: bulk.length });

/* ---------- tóm tắt (không có tên hay số tiền) ---------- */
const line = (label, value) => console.log(`${label.padEnd(34)}${value}`);
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
  const n = store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  line(`  ${table}`, n);
}
const byGroup = {};
for (const p of personas) byGroup[p.group] = (byGroup[p.group] || 0) + 1;
console.log('\nPersona');
line('  Nhân sự (không tính Admin)', personas.length);
for (const [group, n] of Object.entries(byGroup)) line(`    ${group}`, n);
line('  Admin', S.ADMINS.length);
line('  Nhân sự nền (--scale)', bulk.length);
const covered = new Set([...personas, ...S.ADMINS].flatMap(p => p.covers));
const allCases = S.CASES.map(([id]) => id);
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

/* ---------- tự kiểm bằng "Soát dữ liệu" ---------- */
let check = null;
let exitCode = 0;
if (!args['no-check']) {
  check = selfcheck.run({ store, payroll, personas, today });
  console.log(`\nTự kiểm "Soát dữ liệu" (${check.months.join(', ')}, tính đến ${today})`);
  for (const [month, total] of Object.entries(check.perMonth)) line(`  Phát hiện tháng ${month}`, total);
  for (const m of check.mapping)
    console.log(
      `  ${m.rule.padEnd(28)} ${String(m.hits).padStart(3)} lần, ${String(m.people).padStart(2)} người · phải bắn: ${m.fire.length} persona · sát ngưỡng: ${m.miss.length} persona${S.SYSTEM_RULES.includes(m.rule) ? ' · luật hệ thống, không kiểm bằng persona' : ''}`
    );
  line('  Lỗi tính lương (payrollErrors)', check.payrollErrors);
  if (check.period) {
    const p = check.period.summary;
    console.log(`
Phiếu kỳ lương ${p.month} (tính trong tiến trình, không ghi DB; luồng route thật: scripts/db/demo/period-check.js)`);
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

/* ---------- xuất CSV ---------- */
if (args.export) {
  const dir = typeof args.out === 'string' ? args.out : path.join(ROOT, 'data', 'demo');
  const written = exportAll({ store, personas, selfcheck: check, dir, people: [...personas, ...S.ADMINS, ...bulk] });
  console.log(`\nĐã xuất ${Object.keys(written).length} file CSV vào ${path.relative(ROOT, path.resolve(dir))}/`);
  for (const [file, rows] of Object.entries(written)) line(`  ${file}`, `${rows} dòng`);
}
store.db.close();
console.log(
  `\nXong trong ${((Date.now() - t0) / 1000).toFixed(1)} giây.${exitCode ? ' Có kỳ vọng AI chưa đạt (xem cảnh báo).' : ''}`
);
process.exit(exitCode);
