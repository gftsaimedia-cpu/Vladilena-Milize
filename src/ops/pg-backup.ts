'use strict';
// Sao lưu / kiểm / khôi phục cho PostgreSQL, không cần pg_dump.
//
// Bản sao lưu là MỘT file gzip chứa NDJSON:
//   dòng 1   header: { format, version, createdAt, migrations[], order[], tables[{ name, rows, sha256, identity }], payroll[] }
//   tiếp     { t: <bảng>, r: <dòng> } (cột BYTEA ghi dạng { $b64: ... })
//   dòng cuối { end: true, rows: <tổng số dòng> }   → thiếu dòng này là file bị cắt dở
// Xuất dữ liệu nằm trong MỘT giao dịch REPEATABLE READ chỉ đọc, nên là ảnh chụp nhất quán dù ứng dụng đang ghi.
// Khôi phục chỉ vào DB MỚI (đã chạy migration, chưa có dữ liệu), tất cả hoặc không (một giao dịch), rồi đối chiếu dấu vân tay
// từng bảng và tổng tiền từng kỳ lương ngay trong giao dịch trước khi COMMIT; lệch là hoàn tác.
// Không bao giờ in dữ liệu, chỉ tên bảng, số dòng, dung lượng.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { PostgresDatabase } = require('../data/postgres-database');
const { TemporaryPostgres } = require('../data/temporary-postgres');

const FORMAT = 'luong-pg-backup';
const VERSION = 1;
const NAME_PATTERN = /^luong-\d{8}-\d{6}\.pgbak\.gz$/;
const DEFAULT_KEEP = 30;
// Bảng gieo sẵn bởi migrations/postgres/0002_seed.sql: bị thay bằng dữ liệu trong bản sao lưu khi khôi phục
const SEEDED = [
  'settings',
  'work_shifts',
  'position_levels',
  'position_type_benefits',
  'position_types',
  'benefit_types'
];
const PAYROLL_SQL = `SELECT r.month AS month, r.run_no AS run_no, r.status AS status, COUNT(p.id) AS slips,
  COALESCE(SUM(p.gross), 0) AS gross, COALESCE(SUM(p.net), 0) AS net, COALESCE(SUM(p.tax), 0) AS tax, COALESCE(SUM(p.insurance), 0) AS insurance
  FROM payroll_runs r LEFT JOIN payslips p ON p.run_id = r.id GROUP BY r.month, r.run_no, r.status ORDER BY r.month, r.run_no`;

class PgBackupError extends Error {}

const canonical = (value?) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return 'blob:' + Buffer.from(value).toString('hex');
  return value;
};
// Dấu vân tay bảng: không phụ thuộc thứ tự dòng, nhạy với từng ô (kể cả BYTEA)
function fingerprintOf(rows?) {
  const lines = rows
    .map(row =>
      JSON.stringify(
        Object.keys(row)
          .sort()
          .map(key => [key, canonical(row[key])])
      )
    )
    .sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
const encodeRow = (row?) =>
  Object.fromEntries(
    Object.entries<any>(row).map(([k, v]: any) => [
      k,
      v instanceof Uint8Array ? { $b64: Buffer.from(v).toString('base64') } : v
    ])
  );
const decodeRow = (row?) =>
  Object.fromEntries(
    Object.entries<any>(row).map(([k, v]: any) => [
      k,
      v && typeof v === 'object' && '$b64' in v ? Buffer.from(v.$b64, 'base64') : v
    ])
  );

// Múi giờ nghiệp vụ UTC+7 cố định (Việt Nam không có giờ mùa hè)
function vnStamp(ms?) {
  const iso = new Date(ms + 7 * 3600 * 1000).toISOString();
  return iso.slice(0, 10).replaceAll('-', '') + '-' + iso.slice(11, 19).replaceAll(':', '');
}

/** Chỉ mở database PostgreSQL qua URL; in-memory/PGlite không còn là đích sao lưu hoặc khôi phục. */
function openDatabase(spec?) {
  if (!spec) throw new PgBackupError('Thiếu nguồn/đích PostgreSQL: truyền URL postgres://… hoặc postgresql://….');
  const text = String(spec);
  if (/^postgres(ql)?:\/\//i.test(text)) return new PostgresDatabase({ url: text, max: 1 });
  throw new PgBackupError('Nguồn/đích phải là URL PostgreSQL (postgres://… hoặc postgresql://…).');
}

async function tablesOf(db?) {
  const rows = await db
    .prepare(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name"
    )
    .all();
  const names = rows.map(r => r.name);
  const fks = await db
    .prepare(
      "SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint WHERE contype = 'f'"
    )
    .all();
  const deps = new Map<any, any>(names.map(n => [n, new Set()]));
  for (const fk of fks)
    if (deps.has(fk.child) && fk.parent !== fk.child && deps.has(fk.parent)) deps.get(fk.child).add(fk.parent);
  const order: any[] = [];
  const visit = (name?) => {
    if (order.includes(name)) return;
    for (const dep of deps.get(name) || []) visit(dep);
    order.push(name);
  };
  names.forEach(visit);
  const identity = new Set<any>(
    (
      await db
        .prepare(
          "SELECT table_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'"
        )
        .all()
    ).map(r => r.name)
  );
  return { names, order, identity };
}

async function payrollTotals(db?) {
  return (await db.prepare(PAYROLL_SQL).all()).map(r => ({ ...r }));
}

async function writeLine(stream?, object?) {
  if (!stream.write(JSON.stringify(object) + '\n')) await new Promise(resolve => stream.once('drain', resolve));
}

/**
 * Sao lưu `source` (spec DB) ra thư mục `dir`. Trả { file, bytes, tables, rows, tookMs }.
 * Ghi file tạm rồi đổi tên; kiểm lại file vừa ghi (verifyFile) trước khi xoá các bản cũ vượt `keep`.
 */
async function backup(source?, dir?, { keep = DEFAULT_KEEP, now = Date.now() }: any = {}) {
  if (!Number.isInteger(keep) || keep < 1) throw new PgBackupError('keep phải là số nguyên từ 1 trở lên.');
  const db = typeof source === 'string' ? openDatabase(source) : source;
  const started = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  const final = path.join(dir, `luong-${vnStamp(now)}.pgbak.gz`);
  const partial = final + '.partial';
  try {
    await db.ready;
    const gz = zlib.createGzip({ level: 6 });
    const out = fs.createWriteStream(partial);
    const finished = new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
      gz.on('error', reject);
    });
    gz.pipe(out);
    let header;
    let total = 0;
    await db.runTransaction(async () => {
      await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { names, order, identity } = await tablesOf(db);
      const migrations = (await db.prepare('SELECT name FROM schema_migrations ORDER BY name').all()).map(r => r.name);
      const data = new Map<any, any>();
      for (const name of names) data.set(name, await db.prepare(`SELECT * FROM ${name}`).all());
      header = {
        format: FORMAT,
        version: VERSION,
        createdAt: new Date(now).toISOString(),
        migrations,
        order,
        tables: names.map(name => ({
          name,
          rows: data.get(name).length,
          sha256: fingerprintOf(data.get(name)),
          identity: identity.has(name)
        })),
        payroll: await payrollTotals(db)
      };
      await writeLine(gz, header);
      for (const name of order)
        for (const row of data.get(name)) {
          await writeLine(gz, { t: name, r: encodeRow(row) });
          total++;
        }
      await writeLine(gz, { end: true, rows: total });
    });
    gz.end();
    await finished;
    const report = await verifyFile(partial);
    if (!report.ok) throw new PgBackupError('Bản vừa ghi không đạt kiểm tra: ' + report.problems.join('; '));
    fs.renameSync(partial, final);
    rotate(dir, keep);
    return {
      file: final,
      bytes: fs.statSync(final).size,
      tables: header.tables.length,
      rows: total,
      tookMs: Date.now() - started
    };
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  } finally {
    if (typeof source === 'string') await db.close();
  }
}

/** Giữ `keep` bản mới nhất theo tên (đúng mẫu luong-YYYYMMDD-HHMMSS.pgbak.gz); không đụng file khác. */
function rotate(dir?, keep?) {
  const files = fs
    .readdirSync(dir)
    .filter(n => NAME_PATTERN.test(n))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) fs.rmSync(path.join(dir, old));
}

async function* readLines(file?) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity
  });
  for await (const line of rl) if (line) yield JSON.parse(line);
}

/** Đọc cả file, tính lại số dòng + dấu vân tay từng bảng, so với header. Trả { ok, problems, header, tables }. */
async function verifyFile(file?) {
  const problems: any[] = [];
  let header: any = null;
  const rowsByTable = new Map<any, any>();
  let ended: any = null;
  try {
    for await (const item of readLines(file)) {
      if (!header) {
        header = item;
        if (header.format !== FORMAT || header.version !== VERSION)
          problems.push('không phải bản sao lưu ' + FORMAT + ' v' + VERSION);
        for (const t of header.tables || []) rowsByTable.set(t.name, []);
      } else if (item.end) ended = item;
      else if (item.t) {
        if (!rowsByTable.has(item.t)) problems.push('có dòng của bảng lạ: ' + item.t);
        else rowsByTable.get(item.t).push(decodeRow(item.r));
      }
    }
  } catch (error) {
    problems.push('không đọc được file (gzip/JSON hỏng hoặc bị cắt): ' + error.message);
  }
  if (!header) return { ok: false, problems: problems.length ? problems : ['file rỗng'], header: null, tables: [] };
  if (!ended) problems.push('thiếu dòng kết thúc: file bị cắt dở');
  const tables: any[] = [];
  let total = 0;
  for (const t of header.tables) {
    const rows = rowsByTable.get(t.name) || [];
    total += rows.length;
    const sha = fingerprintOf(rows);
    const ok = rows.length === t.rows && sha === t.sha256;
    tables.push({ name: t.name, rows: rows.length, expected: t.rows, ok });
    if (!ok)
      problems.push(`bảng ${t.name}: ${rows.length}/${t.rows} dòng, dấu vân tay ${sha === t.sha256 ? 'khớp' : 'KHÁC'}`);
  }
  if (ended && ended.rows !== total) problems.push(`tổng số dòng ${total} khác dòng kết thúc ${ended.rows}`);
  return { ok: problems.length === 0, problems, header, tables, rowsByTable };
}

/**
 * Khôi phục vào `target` (spec DB, phải MỚI). Một giao dịch: chép, đặt lại dãy số tự tăng, đối chiếu dấu vân tay và tổng tiền kỳ lương;
 * lệch thì ném lỗi và hoàn tác. Trả { tables, rows, tookMs }. `keepOpen`: không đóng DB (diễn tập cần đọc tiếp).
 */
async function restore(file?, target?, { keepOpen = false }: any = {}) {
  const started = Date.now();
  const report = await verifyFile(file);
  if (!report.ok) throw new PgBackupError('Bản sao lưu không toàn vẹn, không khôi phục: ' + report.problems.join('; '));
  const db = typeof target === 'string' ? openDatabase(target) : target;
  try {
    await db.ready;
    const { names, order, identity } = await tablesOf(db);
    const migrated = new Set<any>((await db.prepare('SELECT name FROM schema_migrations').all()).map(r => r.name));
    const missing = report.header.migrations.filter(m => !migrated.has(m));
    if (missing.length)
      throw new PgBackupError(
        'Đích thiếu migration của bản sao lưu: ' + missing.join(', ') + ' (nâng cấp ứng dụng rồi thử lại).'
      );
    for (const t of report.header.tables)
      if (!names.includes(t.name)) throw new PgBackupError('Đích không có bảng ' + t.name);
    for (const name of names) {
      if (SEEDED.includes(name)) continue;
      const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get();
      if (row.n > 0)
        throw new PgBackupError(
          'Đích không rỗng (bảng ' + name + ' đã có dữ liệu): chỉ khôi phục vào DB mới, không ghi đè.'
        );
    }
    let rows = 0;
    await db.runTransaction(async () => {
      for (const name of SEEDED) if (names.includes(name)) await db.exec(`DELETE FROM ${name}`);
      for (const name of report.header.order) {
        const data = report.rowsByTable!.get(name) || [];
        if (!data.length) continue;
        const columns = Object.keys(data[0]);
        const sql = `INSERT INTO ${name} (${columns.join(', ')})${identity.has(name) ? ' OVERRIDING SYSTEM VALUE' : ''} VALUES (${columns.map(() => '?').join(', ')})`;
        const insert = db.prepare(sql);
        for (const row of data) await insert.run(...columns.map(c => row[c]));
        rows += data.length;
        if (identity.has(name) && columns.includes('id'))
          await db.exec(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), (SELECT MAX(id) FROM ${name}))`);
      }
      // đối chiếu TRƯỚC khi COMMIT
      for (const t of report.header.tables) {
        const back = await db.prepare(`SELECT * FROM ${t.name}`).all();
        if (back.length !== t.rows || fingerprintOf(back) !== t.sha256)
          throw new PgBackupError(`Đối chiếu sau khôi phục lệch ở bảng ${t.name}: hoàn tác.`);
      }
      const totals = await payrollTotals(db);
      if (JSON.stringify(totals) !== JSON.stringify(report.header.payroll))
        throw new PgBackupError('Tổng tiền các kỳ lương lệch sau khôi phục: hoàn tác.');
    });
    return { tables: report.header.tables.length, rows, tookMs: Date.now() - started, header: report.header };
  } finally {
    if (typeof target === 'string' && !keepOpen) await db.close();
  }
}

/** Diễn tập: khôi phục vào database PostgreSQL tạm chỉ do lần chạy này tạo rồi dọn. */
async function drill(file?, controlUrl = process.env.DRILL_PG_CONTROL_URL) {
  if (!controlUrl) throw new PgBackupError('Drill cần DRILL_PG_CONTROL_URL của một control database PostgreSQL riêng.');
  return TemporaryPostgres.using(controlUrl, 'drill', temporary => restore(file, temporary.url), {
    handleSignals: true
  });
}

export = {
  backup,
  verifyFile,
  restore,
  drill,
  rotate,
  openDatabase,
  fingerprintOf,
  vnStamp,
  PgBackupError,
  NAME_PATTERN,
  DEFAULT_KEEP
};
