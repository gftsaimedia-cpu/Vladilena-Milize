'use strict';
// Chuyển dữ liệu từ file SQLite sang PostgreSQL và ĐỐI CHIẾU: số dòng, dấu vân tay từng bảng, tổng tiền từng kỳ lương.
//
//   node scripts/db/migrate-sqlite-to-pg.js --from=<file.sqlite> --to=<DATABASE_URL | memory> [--report=<file.json>] [--replace-seed]
//
// An toàn:
//   - File nguồn chỉ MỞ ĐỌC (readOnly), không ghi, không tạo file -wal/-shm mới ngoài những gì SQLite tự tạo khi đọc.
//   - Đích phải là DB PostgreSQL MỚI (đã chạy migrations/postgres, chưa có dòng nhân sự nào). Có dữ liệu thì dừng, không ghi đè.
//   - Không đọc DB_PATH / .env; nguồn và đích phải truyền rõ ràng.
//   - --to=memory dùng PGlite trong tiến trình để thử trước (không đụng máy chủ nào).
// Mã thoát: 0 khi mọi đối chiếu khớp; 1 khi lệch hoặc lỗi.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { PostgresDatabase } = require('../../lib/data/postgres-database');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [key, ...rest] = a.slice(2).split('=');
      return [key, rest.length ? rest.join('=') : true];
    })
);

class MigrationError extends Error {}

// Bảng theo thứ tự phụ thuộc khoá ngoại (bảng được tham chiếu trước)
function orderedTables(source) {
  const rows = source.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  const deps = new Map(rows.map(r => [r.name, new Set([...String(r.sql).matchAll(/REFERENCES\s+(\w+)/g)].map(m => m[1]).filter(n => n !== r.name))]));
  const out = [];
  const visit = name => {
    if (out.includes(name) || !deps.has(name)) return;
    for (const dep of deps.get(name)) visit(dep);
    out.push(name);
  };
  [...deps.keys()].sort().forEach(visit);
  return out;
}

const canonical = value => {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return 'blob:' + Buffer.from(value).toString('hex');
  return value;
};
const fingerprintOf = rows => {
  const lines = rows.map(row => JSON.stringify(Object.keys(row).sort().map(key => [key, canonical(row[key])]))).sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
};

async function copyTable(source, target, table, columnsOfTarget) {
  const rows = source.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) return 0;
  const columns = Object.keys(rows[0]);
  const unknown = columns.filter(c => !columnsOfTarget.includes(c));
  if (unknown.length) throw new MigrationError(`${table}: cột nguồn không có ở đích: ${unknown.join(', ')}`);
  const identity = columns.includes('id') && (await target.prepare("SELECT 1 AS ok FROM information_schema.columns WHERE table_name = ? AND column_name = 'id' AND is_identity = 'YES'").get(table));
  const marks = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')})${identity ? ' OVERRIDING SYSTEM VALUE' : ''} VALUES (${marks})`;
  const insert = target.prepare(sql);
  for (const row of rows) {
    try {
      await insert.run(...columns.map(c => (row[c] instanceof Uint8Array ? Buffer.from(row[c]) : row[c])));
    } catch (error) {
      throw new MigrationError(`${table}: không chép được dòng ${JSON.stringify(Object.fromEntries(columns.slice(0, 3).map(c => [c, row[c]])))}: ${error.message}`);
    }
  }
  if (identity) await target.exec(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${table}))`);
  return rows.length;
}

// Tổng tiền từng kỳ theo lần chạy hiện hành: chứng minh số liệu lương không đổi sau khi chuyển
const PAYROLL_SQL = `SELECT r.month AS month, r.run_no AS run_no, r.status AS status, COUNT(p.id) AS slips,
  COALESCE(SUM(p.gross), 0) AS gross, COALESCE(SUM(p.net), 0) AS net, COALESCE(SUM(p.tax), 0) AS tax, COALESCE(SUM(p.insurance), 0) AS insurance
  FROM payroll_runs r LEFT JOIN payslips p ON p.run_id = r.id GROUP BY r.month, r.run_no, r.status ORDER BY r.month, r.run_no`;

async function run() {
  if (!args.from || !args.to) throw new MigrationError('Dùng: --from=<file.sqlite> --to=<DATABASE_URL|memory>');
  const sourcePath = path.resolve(String(args.from));
  if (!fs.existsSync(sourcePath)) throw new MigrationError(`Không thấy file nguồn: ${sourcePath}`);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const target = new PostgresDatabase(args.to === 'memory' ? { memory: true } : { url: String(args.to) });
  await target.ready;
  const report = { from: path.basename(sourcePath), tables: {}, payroll: {}, problems: [] };

  const existing = await target.prepare('SELECT COUNT(*) AS n FROM staff').get();
  if (existing.n > 0) throw new MigrationError('Đích đã có nhân sự: chỉ chuyển vào DB PostgreSQL mới, không ghi đè.');

  // Bảng gieo sẵn bởi migrations/postgres/0002_seed.sql bị thay bằng dữ liệu nguồn
  const seeded = ['settings', 'work_shifts', 'position_levels', 'position_type_benefits', 'position_types', 'benefit_types'];
  for (const table of seeded) await target.exec(`DELETE FROM ${table}`);

  const tables = orderedTables(source);
  for (const table of tables) {
    const columns = (await target.prepare(`PRAGMA table_info(${table})`).all()).map(c => c.name);
    if (!columns.length) {
      report.problems.push(`${table}: bảng nguồn không có ở đích (bỏ qua)`);
      continue;
    }
    const copied = await copyTable(source, target, table, columns);
    const sourceRows = source.prepare(`SELECT * FROM ${table}`).all();
    const targetRows = await target.prepare(`SELECT * FROM ${table}`).all();
    const same = fingerprintOf(sourceRows) === fingerprintOf(targetRows);
    report.tables[table] = { rows: sourceRows.length, copied, targetRows: targetRows.length, same };
    if (!same || sourceRows.length !== targetRows.length) report.problems.push(`${table}: lệch (nguồn ${sourceRows.length} dòng, đích ${targetRows.length} dòng, vân tay ${same ? 'khớp' : 'KHÁC'})`);
  }

  if (tables.includes('payroll_runs')) {
    const a = source.prepare(PAYROLL_SQL).all().map(r => ({ ...r }));
    const b = (await target.prepare(PAYROLL_SQL).all()).map(r => ({ ...r }));
    report.payroll = { runs: a.length, same: JSON.stringify(a) === JSON.stringify(b) };
    if (!report.payroll.same) report.problems.push('Tổng tiền các kỳ lương lệch giữa nguồn và đích');
  }
  source.close();
  await target.close();
  report.ok = report.problems.length === 0;
  if (args.report) fs.writeFileSync(String(args.report), JSON.stringify(report, null, 2));
  return report;
}

module.exports = { run, orderedTables, fingerprintOf };

if (require.main === module)
  run()
    .then(report => {
      const tableNames = Object.keys(report.tables);
      console.log(`Đã chuyển ${tableNames.length} bảng, ${tableNames.reduce((n, t) => n + report.tables[t].copied, 0)} dòng từ ${report.from}.`);
      for (const problem of report.problems) console.error('LỆCH: ' + problem);
      console.log(report.ok ? 'ĐỐI CHIẾU: KHỚP (số dòng, vân tay từng bảng, tổng tiền từng kỳ lương).' : 'ĐỐI CHIẾU: CÓ LỆCH.');
      process.exit(report.ok ? 0 : 1);
    })
    .catch(error => {
      console.error(error instanceof MigrationError ? error.message : error);
      process.exit(1);
    });
