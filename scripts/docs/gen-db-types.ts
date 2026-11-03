'use strict';
// db:types — dựng src/data/schema.generated.ts (kiểu Kysely cho mọi bảng) TỪ migrations/postgres/*.sql.
//   node scripts/docs/gen-db-types.ts            ghi file
//   node scripts/docs/gen-db-types.ts --check    thoát 1 nếu file trên đĩa khác bản dựng từ migration (test/unit/db-types.test.ts)
// Quy ước: TEXT → string; BIGINT/INTEGER/REAL/DOUBLE → number; BYTEA → Buffer; cột không NOT NULL và không khoá chính → T | null;
// cột có DEFAULT hoặc IDENTITY → Generated<T> (có thể bỏ khi INSERT).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'src', 'data', 'schema.generated.ts');

function splitTop(raw?) {
  const body = raw.replace(/--.*$/gm, ''); // bỏ chú thích TRƯỚC khi tách (chú thích có thể chứa dấu phẩy)
  const parts: any[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function tsType(sqlType?) {
  const t = sqlType.toUpperCase();
  if (/^(BIGINT|INTEGER|INT|SMALLINT|REAL|DOUBLE|NUMERIC)/.test(t)) return 'number';
  if (/^(BOOLEAN|BOOL)/.test(t)) return 'boolean';
  if (t === 'TIMESTAMPTZ') return 'Date';
  if (/^(BYTEA|BLOB)/.test(t)) return 'Buffer';
  return 'string';
}

function build() {
  const dir = path.join(ROOT, 'migrations', 'postgres');
  const sql = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'))
    .join('\n')
    .replace(/--.*$/gm, ''); // bỏ chú thích trước khi tìm thân bảng: chú thích có ");" làm cụt thân
  const tables: any[] = [];
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n?\)\s*;/gi)) tables.push({ name: m[1], parts: splitTop(m[2]) });
  // cột thêm sau bằng ALTER TABLE ... ADD COLUMN
  const extra = [...sql.matchAll(/ALTER TABLE (\w+) ADD COLUMN (?:IF NOT EXISTS )?(\w+) ([^;]+);/g)];
  // cột xoá sau bằng ALTER TABLE ... DROP COLUMN
  const dropped = [...sql.matchAll(/ALTER TABLE (\w+) DROP COLUMN (?:IF EXISTS )?(\w+);/g)];
  // bảng xoá sau bằng DROP TABLE
  const droppedTables = new Set([...sql.matchAll(/DROP TABLE (?:IF EXISTS )?(\w+)(?: CASCADE)?;/gi)].map(x => x[1]));
  const liveTables = tables.filter(t => !droppedTables.has(t.name));
  let out = '// Sinh tự động bởi scripts/docs/gen-db-types.ts (npm run db:types) từ migrations/postgres/*.sql. Đừng sửa tay.\n';
  out += "import type { ColumnType } from 'kysely';\n\n";
  out += '/** Cột có giá trị mặc định / tự sinh: đọc ra T, có thể bỏ khi INSERT. */\n';
  out += 'export type Generated<T> = ColumnType<T, T | undefined, T>;\n\n';
  for (const t of liveTables.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
    const droppedCols = new Set(dropped.filter(x => x[1] === t.name).map(x => x[2]));
    const cols: any[] = [];
    for (const part of t.parts) {
      if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)\b/i.test(part)) continue;
      const m = /^(\w+)\s+(\w+)(.*)$/.exec(part);
      if (m && !droppedCols.has(m[1])) cols.push({ name: m[1], type: m[2], rest: m[3] });
    }
    for (const e of extra.filter(x => x[1] === t.name)) {
      const m = /^(\w+)(.*)$/.exec(e[3].trim());
      if (m && !droppedCols.has(e[2])) cols.push({ name: e[2], type: m![1], rest: m![2] });
    }
    const pk = (t.parts.find(p => /^PRIMARY KEY\s*\(([^)]*)\)/i.test(p)) || '').match(/\(([^)]*)\)/);
    const pkCols = new Set<any>(pk ? pk[1].split(',').map(s => s.trim()) : []);
    out += `export interface ${t.name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}Table {\n`;
    for (const c of cols) {
      const base = tsType(c.type);
      const isPk = /PRIMARY KEY/i.test(c.rest) || pkCols.has(c.name);
      const nullableCol = !/NOT NULL/i.test(c.rest) && !(/PRIMARY KEY/i.test(c.rest) || pkCols.has(c.name));
      const generated = /GENERATED|DEFAULT/i.test(c.rest) || nullableCol; // cột cho phép NULL mà không khai mặc định thì mặc định NULL: bỏ được khi INSERT
      const nullable = !/NOT NULL/i.test(c.rest) && !isPk;
      const type = nullable ? `${base} | null` : base;
      out += `  ${c.name}: ${generated ? `Generated<${type}>` : type};\n`;
    }
    out += '}\n\n';
  }
  out += 'export interface Schema {\n';
  for (const t of liveTables.sort((a: any, b: any) => a.name.localeCompare(b.name)))
    out += `  ${t.name}: ${t.name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}Table;\n`;
  out += '}\n';
  return out;
}

if (require.main === module) {
  const built = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== built) {
      console.error('src/data/schema.generated.ts lệch so với migrations. Chạy: npm run db:types');
      process.exit(1);
    }
    console.log('src/data/schema.generated.ts khớp migration.');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, built);
    console.log('Đã ghi src/data/schema.generated.ts');
  }
}
module.exports = { build };
