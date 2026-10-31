'use strict';
// Dịch câu SQL viết theo SQLite (nguồn gốc của mã hiện tại) sang PostgreSQL. Chỉ xử lý những khác biệt mã đang dùng:
//   ?                        → $1, $2, ...
//   INSERT OR IGNORE INTO    → INSERT INTO ... ON CONFLICT DO NOTHING
//   INSERT INTO <bảng có id> → thêm RETURNING id (để run() trả lastInsertRowid như SQLite)
//   json_extract(c, '$.a.b') → (c::jsonb #>> '{a,b}')
//   IS [NOT] <giá trị>       → IS [NOT] DISTINCT FROM <giá trị>
//   LIKE                     → ILIKE (LIKE của SQLite không phân biệt hoa thường với chữ ASCII)
//   total_changes()          → số lần ghi đã đếm của kết nối (xem PostgresDatabase.writes)
//   PRAGMA ...               → bỏ qua
// Chuỗi trong nháy đơn, tên trong nháy kép và chú thích được giữ nguyên, không bị thay.
// sqlite_master giả: bảng, chỉ mục, trigger của lược đồ public (cột sql chỉ có ở chỉ mục; schema_migrations không tính)
const SQLITE_MASTER = `(SELECT 'table' AS type, table_name::text AS name, table_name::text AS tbl_name, NULL::text AS sql
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'
  UNION ALL SELECT 'index', indexname::text, tablename::text, indexdef::text FROM pg_indexes
  WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
  UNION ALL SELECT 'trigger', t.tgname::text, c.relname::text, NULL::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal) AS sqlite_master`;

class PostgresSql {
  // identityTables: tên bảng có cột id tự tăng. writes: giá trị thay cho total_changes().
  constructor({ identityTables = new Set(), writes = () => 0 } = {}) {
    this.identityTables = identityTables;
    this.writes = writes;
  }

  // Tách thành các đoạn { code: bool, text } để chỉ sửa phần mã
  static #segments(sql) {
    const out = [];
    let i = 0;
    let start = 0;
    const push = (end, code) => {
      if (end > start) out.push({ code, text: sql.slice(start, end) });
      start = end;
    };
    while (i < sql.length) {
      const c = sql[i];
      const two = sql.slice(i, i + 2);
      if (c === "'" || c === '"') {
        push(i, true);
        i++;
        while (i < sql.length) {
          if (sql[i] === c && sql[i + 1] === c) i += 2;
          else if (sql[i] === c) {
            i++;
            break;
          } else i++;
        }
        push(i, false);
      } else if (two === '--') {
        push(i, true);
        while (i < sql.length && sql[i] !== '\n') i++;
        push(i, false);
      } else if (two === '/*') {
        push(i, true);
        const end = sql.indexOf('*/', i + 2);
        i = end < 0 ? sql.length : end + 2;
        push(i, false);
      } else i++;
    }
    push(sql.length, true);
    return out;
  }

  // → { text, params: số tham số, noop: true khi là PRAGMA, write: có ghi không, wantsId: cần RETURNING id }
  translate(sql) {
    let original = String(sql);
    const columns = /^\s*PRAGMA\s+table_info\(\s*(\w+)\s*\)/i.exec(original);
    if (columns)
      return {
        text: `SELECT column_name::text AS name, data_type::text AS type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${columns[1].toLowerCase()}' ORDER BY ordinal_position`,
        params: 0,
        noop: false,
        write: false,
        wantsId: false
      };
    if (/^\s*PRAGMA\b/i.test(original)) return { text: '', noop: true, write: false, wantsId: false };
    // json_extract(cột, '$.a.b') cần cả chuỗi trong nháy, xử lý trên văn bản gốc
    original = original.replace(
      /json_extract\(\s*([\w.]+)\s*,\s*'\$\.([\w.]+)'\s*\)/gi,
      (m, column, path) => `(${column}::jsonb #>> '{${path.split('.').join(',')}}')`
    );
    original = original.replace(/total_changes\(\)/gi, '__TOTAL_CHANGES__');
    let ignore = false;
    let n = 0;
    const parts = PostgresSql.#segments(original).map(segment => {
      if (!segment.code) return segment.text;
      return segment.text
        .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, () => {
          ignore = true;
          return 'INSERT INTO';
        })
        .replace(/\bIS\s+NOT\s+(?!NULL\b|DISTINCT\b)/gi, 'IS DISTINCT FROM ')
        .replace(/\bIS\s+(?!NOT\b|NULL\b|DISTINCT\b|TRUE\b|FALSE\b)/gi, 'IS NOT DISTINCT FROM ')
        .replace(/\bLIKE\b/gi, 'ILIKE')
        .replace(/\bORDER\s+BY\s+rowid\b/gi, 'ORDER BY ctid')
        .replace(/\bsqlite_master\b/gi, () => SQLITE_MASTER)
        .replace(/\bhex\(([^()]+)\)/gi, (m, value) => `upper(encode(${value}, 'hex'))`)
        .replace(/\?/g, () => `$${++n}`);
    });
    let text = parts.join('').trim().replace(/;+\s*$/, '');
    const insert = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(text);
    const write = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(text);
    if (ignore && !/\bON\s+CONFLICT\b/i.test(text)) text += ' ON CONFLICT DO NOTHING';
    const wantsId = !!insert && this.identityTables.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(text);
    if (wantsId) text += ' RETURNING id';
    return { text, params: n, noop: false, write, wantsId, dynamic: text.includes('__TOTAL_CHANGES__') };
  }
}

module.exports = { PostgresSql };
