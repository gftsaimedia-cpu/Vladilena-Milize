'use strict';
// Bản chụp lược đồ DB do lib/db.js dựng: để việc tách lib/db.js
// ra lib/store/* không đổi lược đồ lấy một chữ. Chụp: bảng, cột (tên, kiểu, not null, mặc định, khoá chính), chỉ mục, khoá ngoại,
// trigger và view (SQL đã nén khoảng trắng), số dòng gieo sẵn mỗi bảng, khoá `settings` gieo sẵn, và danh sách khoá của đối tượng
// lib/db.js xuất ra (store). Không chứa dữ liệu thật: chỉ DB trống do mã dựng.
//
//   node test/tools/record-schema.js --write     ghi test/fixtures/db-schema-snapshot.json (đổi lược đồ có chủ đích: kèm lý do trong commit)
//   node test/tools/record-schema.js --capture <đường dẫn DB> --out <file json>   (nội bộ, cho test nâng cấp) nạp lib/db trên file đó rồi ghi bản chụp
//   node test/tools/record-schema.js             in bản chụp của DB trong bộ nhớ
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '../..');
const SNAPSHOT = path.join(ROOT, 'test/fixtures/db-schema-snapshot.json');
const squash = sql =>
  (sql || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim();

function describeStore(store) {
  const out = {};
  for (const key of Object.keys(store).sort()) {
    const value = store[key];
    // Khoá của DatabaseSync do Node định nghĩa và thay đổi theo phiên bản (vd. `limits` ở Node 24.18), không phải lược đồ của mã này
    out[key] =
      typeof value === 'function'
        ? 'function'
        : value instanceof DatabaseSync
          ? 'DatabaseSync'
          : value && typeof value === 'object'
            ? `object{${Object.keys(value).sort().join(',')}}`
            : typeof value;
  }
  return out;
}

// db = DatabaseSync đã mở; store = module.exports của lib/db (có thể bỏ trống)
function capture(db, store) {
  const all = db
    .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all();
  const tables = {};
  for (const row of all.filter(r => r.type === 'table')) {
    const columns = db
      .prepare(`PRAGMA table_info(${row.name})`)
      .all()
      .map(c => ({
        name: c.name,
        type: c.type,
        notnull: c.notnull,
        default: c.dflt_value,
        pk: c.pk
      }));
    const indexes = db
      .prepare(`PRAGMA index_list(${row.name})`)
      .all()
      .map(index => ({
        name: index.name,
        unique: index.unique,
        origin: index.origin,
        partial: index.partial,
        columns: db
          .prepare(`PRAGMA index_info(${index.name})`)
          .all()
          .map(c => c.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const foreignKeys = db
      .prepare(`PRAGMA foreign_key_list(${row.name})`)
      .all()
      .map(f => ({ table: f.table, from: f.from, to: f.to, onDelete: f.on_delete, onUpdate: f.on_update }));
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM ${row.name}`).get().n;
    tables[row.name] = { sql: squash(row.sql), columns, indexes, foreignKeys, seededRows: rows };
  }
  const others = all
    .filter(r => r.type !== 'table')
    .map(r => ({ type: r.type, name: r.name, table: r.tbl_name, sql: squash(r.sql) }));
  const settingsKeys = db
    .prepare('SELECT key FROM settings ORDER BY key')
    .all()
    .map(r => r.key);
  return {
    tables,
    objects: others,
    settingsKeys,
    store: store ? describeStore(store) : undefined
  };
}

// Cột của mỗi bảng dạng tập (không theo thứ tự), để so sánh DB nâng cấp (cột thêm sau nằm cuối) với DB dựng mới
const columnSets = snap =>
  Object.fromEntries(
    Object.entries(snap.tables).map(([name, t]) => [
      name,
      t.columns.map(c => `${c.name} ${c.type} ${c.notnull} ${c.default} ${c.pk}`).sort()
    ])
  );
const indexSets = snap =>
  Object.fromEntries(
    Object.entries(snap.tables).map(([name, t]) => [
      name,
      t.indexes.map(i => `${i.name} ${i.unique} ${i.columns.join('+')}`).sort()
    ])
  );

module.exports = { capture, columnSets, indexSets, describeStore, SNAPSHOT, ROOT };

if (require.main === module)
  (async () => {
    const index = process.argv.indexOf('--capture');
    process.env.DB_PATH = index > 0 ? process.argv[index + 1] : ':memory:';
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'qa-schema-snapshot';
    const store = require('../../lib/db');
    await store.ready; // nâng cấp dữ liệu lúc mở DB chạy bất đồng bộ: chụp lược đồ sau khi xong
    const snap = capture(store.db, store);
    if (index > 0) {
      fs.writeFileSync(process.argv[process.argv.indexOf('--out') + 1], JSON.stringify(snap));
      store.db.close();
    } else if (process.argv.includes('--write')) {
      (async () => {
        const prettier = require('prettier');
        const config = (await prettier.resolveConfig(SNAPSHOT)) || {};
        fs.writeFileSync(SNAPSHOT, await prettier.format(JSON.stringify(snap), { ...config, parser: 'json' }));
        console.log(
          `Đã ghi ${path.relative(ROOT, SNAPSHOT)}: ${Object.keys(snap.tables).length} bảng, ${snap.objects.length} đối tượng khác, ${Object.keys(snap.store).length} khoá store.`
        );
      })();
    } else console.log(JSON.stringify(snap, null, 2));
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
