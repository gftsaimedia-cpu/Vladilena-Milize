'use strict';
// Bộ dữ liệu demo (scripts/db/seed-demo.ts + demo/lifecycle.js) phải phủ "vũ trụ ca" rút từ mã: mọi bảng, mọi giá trị CHECK, mọi trạng thái kỳ lương,
// mọi chức vụ × bậc, mọi vai trò mặc định, mọi loại khoản duyệt còn dùng × trạng thái (scripts/db/demo/coverage.ts), cùng mọi luật AI bắn đúng kỳ vọng
// và lớp vận hành (route thật) không lỗi. Dựng thật bằng tiến trình con; chạy theo DB_DIALECT của lần chạy test (SQLite: file tạm; PostgreSQL: PGlite RAM).
process.env.DB_PATH = ':memory:';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-demo-coverage-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('dựng bộ demo: thoát 0, lớp vận hành không lỗi, độ phủ đủ', { timeout: 900000 }, () => {
  const report = path.join(tmp, 'coverage.json');
  const db = ':memory:';
  const r = spawnSync(
    process.execPath,
    [
      '--no-warnings=ExperimentalWarning',
      path.join(ROOT, 'scripts/db/seed-demo.ts'),
      `--db=${db}`,
      `--coverage-json=${report}`
    ],
    {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, DB_PATH: db, DATABASE_URL: undefined, PG_TEST_URL: undefined },
      timeout: 840000
    }
  );
  assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr.slice(-1500));
  assert.doesNotMatch(r.stdout, /\[LỖI\]/, 'lớp vận hành có bước lỗi');
  assert.match(r.stdout, /Ca \(case\) đã phủ\s+\d+\/\d+/);
  const covered = /Ca \(case\) đã phủ\s+(\d+)\/(\d+)/.exec(r.stdout);
  assert.equal(covered[1], covered[2], 'mọi ca trong CASES có persona');
  const coverage = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.deepEqual(coverage.gaps, []);
  assert.ok(Object.keys(coverage.counts).length >= 29);
  const { TABLES_UNUSED } = require('../../scripts/db/demo/coverage.ts');
  for (const [table, n] of Object.entries<any>(coverage.counts))
    if (!TABLES_UNUSED[table]) assert.ok(n > 0, `bảng ${table} rỗng`);
  assert.ok(coverage.counts.staff >= 70 && coverage.counts.payslips > 300 && coverage.counts.audit_log > 50);
});

test('công cụ đo độ phủ bắt được chỗ thiếu: DB trống báo thiếu mọi bảng', async () => {
  const store = require('../../src/platform/db');
  await store.ready;
  const { measure } = require('../../scripts/db/demo/coverage.ts');
  const result = await measure({ store, personas: [] });
  assert.ok(result.gaps.length > 40, `chỉ ${result.gaps.length} chỗ thiếu trên DB trống`);
  assert.ok(result.gaps.includes('bảng staff không có dòng nào'));
  assert.ok(
    result.gaps.some(
      g => g.includes("payroll_periods.status chưa có giá trị 'paid'") || g.includes('payroll_periods không có dòng')
    ) || result.gaps.includes('bảng payroll_periods không có dòng nào')
  );
  store.db.close();
});

test('ngoại lệ độ phủ có lý do và còn trỏ vào giá trị CHECK có thật (ngoại lệ lỗi thời thì đỏ)', () => {
  const { schemaUniverse, EXCLUDED } = require('../../scripts/db/demo/coverage.ts');
  const { enums } = schemaUniverse();
  const universe = new Set<any>(enums.flatMap(e => e.values.map(v => `${e.table}.${e.column}=${v}`)));
  for (const [key, reason] of Object.entries<any>(EXCLUDED)) {
    assert.ok(universe.has(key), `ngoại lệ ${key} không còn là giá trị CHECK nào của lược đồ`);
    assert.ok(typeof reason === 'string' && reason.length >= 20, `ngoại lệ ${key} thiếu lý do`);
  }
  assert.ok(
    Object.keys(EXCLUDED).length <= 4,
    'thêm ngoại lệ phải có chủ ý: nâng giới hạn này kèm lý do trong coverage.js'
  );
});
