'use strict';
// Độ phủ của bộ dữ liệu demo, đo trên DB đã dựng và đối chiếu với "vũ trụ ca" rút từ MÃ (không từ trí nhớ):
//   1. mọi bảng của lược đồ (migrations/postgres) có dữ liệu;
//   2. mọi giá trị của mỗi ràng buộc CHECK (cột IN (...)) xuất hiện ít nhất một lần (trạng thái, loại, mức nhạy cảm...);
//   3. mọi trạng thái kỳ lương (PERIOD_STATES), mọi chức vụ × bậc, mọi ca cố định, mọi vai trò mặc định đều có người;
//   4. mọi loại khoản duyệt còn dùng × ba trạng thái; vai trò tuỳ chỉnh có cả loại ngưng dùng.
// Thêm bảng, trạng thái, chức vụ hay loại khoản mới mà bộ demo chưa phủ thì báo thiếu ở đây (test/db/demo-coverage.test.js đòi báo cáo sạch).
// Ngoại lệ phải ghi lý do trong EXCLUDED; không có ngoại lệ ngầm.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

// Giá trị CHECK mà bộ demo CỐ Ý không phủ (kèm lý do). Khoá: 'bảng.cột=giá-trị'.
const EXCLUDED = {
  'leave_ledger.kind=expire':
    'phép hết hạn chỉ sinh khi sang năm mới của một khoản phép cũ; mốc demo (cuối 2026-11) chưa tới hạn hết phép năm',
  'leave_ledger.kind=start':
    'leave.accrual.start = 0 (mặc định): ngày vào làm không cộng phép nên không sinh dòng "start"',
  'ai_finding_actions.action=restore':
    'khôi phục phát hiện đã bỏ qua: lớp vận hành thử ở bước "bỏ qua phát hiện" (xem lifecycle.js); nếu route khôi phục chưa có thì ngoại lệ này giữ nguyên'
};

function migrationsSql() {
  const dir = path.join(ROOT, 'migrations', 'postgres');
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'))
    .join('\n');
}

/** { tables: [tên], enums: [{ table, column, values[] }] } rút từ migration. */
function schemaUniverse() {
  const sql = migrationsSql();
  const tables = [];
  const enums = [];
  for (const m of sql.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]*?)\n?\)\s*;/g)) {
    const name = m[1];
    tables.push(name);
    const body = m[2].replace(/--.*$/gm, '');
    for (const c of body.matchAll(/(\w+)\s+[A-Za-z]+[^,]*?CHECK\s*\(\s*\1\s+IN\s*\(([^)]*)\)\s*\)/g)) {
      const values = [...c[2].matchAll(/'([^']*)'/g)].map(x => x[1]);
      if (values.length) enums.push({ table: name, column: c[1], values });
    }
  }
  return { tables, enums };
}

const values = async (db, table, column) =>
  (await db.prepare(`SELECT DISTINCT ${column} AS v FROM ${table}`).all()).map(r => r.v);

/**
 * Đo độ phủ. Trả { gaps: [chuỗi mô tả chỗ thiếu], counts: { bảng: số dòng }, covered: { ... } }.
 * @param {{ store: any, personas: any[] }} deps
 */
async function measure({ store, personas }) {
  const db = store.db;
  const { tables, enums } = schemaUniverse();
  const gaps = [];
  const counts = {};
  for (const table of tables) {
    counts[table] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;
    if (!counts[table]) gaps.push(`bảng ${table} không có dòng nào`);
  }
  for (const { table, column, values: wanted } of enums) {
    if (!counts[table]) continue; // đã báo ở trên
    const have = new Set(await values(db, table, column));
    for (const v of wanted) {
      if (have.has(v) || EXCLUDED[`${table}.${column}=${v}`]) continue;
      gaps.push(`${table}.${column} chưa có giá trị '${v}'`);
    }
  }

  // trạng thái kỳ lương theo mã (PERIOD_STATES)
  const authz = require('../../../lib/authz.ts');
  const periodStatuses = new Set(await values(db, 'payroll_periods', 'status'));
  for (const s of ['open', 'attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'])
    if (s !== 'open' && !periodStatuses.has(s)) gaps.push(`kỳ lương chưa có trạng thái '${s}'`);
  const reopened = await db.prepare('SELECT COUNT(*) AS n FROM payroll_runs WHERE run_no > 1').get();
  if (!reopened.n) gaps.push('chưa có kỳ nào được mở lại và tính lần hai (payroll_runs.run_no > 1)');

  // chức vụ × bậc và ca cố định có người
  const types = (await db.prepare('SELECT DISTINCT code FROM position_types').all()).map(r => r.code);
  const staff = await db.prepare('SELECT type, level, shift_code, role, locked_at, payroll_subject FROM staff').all();
  for (const t of types) if (!staff.some(s => s.type === t)) gaps.push(`chưa có nhân sự chức vụ '${t}'`);
  const levels = await db.prepare('SELECT DISTINCT type_code AS type, level_no AS level FROM position_levels').all();
  for (const l of levels)
    if (!staff.some(s => s.type === l.type && Number(s.level) === Number(l.level)))
      gaps.push(`chưa có nhân sự ${l.type} bậc ${l.level}`);
  const shifts = await db.prepare('SELECT code, preset FROM work_shifts').all();
  for (const sh of shifts)
    if (!staff.some(s => s.shift_code === sh.preset || s.shift_code === sh.code))
      gaps.push(`chưa có nhân sự ca '${sh.code}'`);
  if (!staff.some(s => s.locked_at)) gaps.push('chưa có tài khoản bị khoá');
  if (!staff.some(s => !s.payroll_subject)) gaps.push('chưa có tài khoản ngoài bảng lương');

  // vai trò mặc định và tuỳ chỉnh
  const roleRows = await db.prepare('SELECT role, revoked_at FROM staff_roles').all();
  for (const role of ['hr', 'cb', 'accounting', 'manager'])
    if (!roleRows.some(r => r.role === role)) gaps.push(`chưa có ai được gán vai trò '${role}'`);
  if (!roleRows.some(r => r.revoked_at)) gaps.push('chưa có vai trò nào bị thu hồi');
  const customRoles = await store.getSetting(authz.CUSTOM_ROLES_KEY, null);
  const customList = (customRoles && customRoles.roles) || [];
  if (customList.length < 2) gaps.push('chưa có đủ 2 vai trò tuỳ chỉnh');
  if (!customList.some(r => r && r.deprecated)) gaps.push('chưa có vai trò tuỳ chỉnh ngưng dùng');

  // loại khoản duyệt còn dùng × ba trạng thái
  const rows = await db.prepare('SELECT item, status FROM sheet_approvals').all();
  const pairs = new Set(rows.map(r => `${r.item === 'holiday_work' ? 'ot' : r.item}|${r.status}`));
  for (const item of authz.DECIDE_ITEMS.filter(i => !['makeup_day', 'holiday_work'].includes(i)))
    // hai loại đã bỏ: approval-view.js
    for (const status of ['pending', 'approved', 'rejected'])
      if (!pairs.has(`${item}|${status}`)) gaps.push(`khoản '${item}' chưa có trạng thái '${status}'`);

  const unreasonable = personas.filter(p => p.unreasonable).length;
  return {
    gaps,
    counts,
    summary: {
      tables: tables.length,
      enumChecks: enums.reduce((n, e) => n + e.values.length, 0),
      personas: personas.length,
      unreasonable
    }
  };
}

module.exports = { measure, schemaUniverse, EXCLUDED };
