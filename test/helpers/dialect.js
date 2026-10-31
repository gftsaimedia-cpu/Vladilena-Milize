'use strict';
// Bộ test chạy được trên cả hai bộ máy (DB_DIALECT=postgres cho PostgreSQL/PGlite, mặc định SQLite). Vài test kiểm chính những thứ
// chỉ SQLite có (file .sqlite, bước nâng cấp DB cũ, EXPLAIN QUERY PLAN, trigger viết bằng cú pháp SQLite, SQLITE_BUSY...): đánh dấu bằng helper này
// để chúng chạy trên SQLite và được bỏ qua có ghi rõ lý do trên PostgreSQL.
const { test } = require('node:test');

const isPostgres = process.env.DB_DIALECT === 'postgres';
const SQLITE_ONLY = 'chỉ áp dụng cho SQLite (chạy với DB_DIALECT mặc định)';

// sqliteOnly(name, fn) / sqliteOnly(name, options, fn) như test() của node:test
function sqliteOnly(name, options, fn) {
  if (typeof options === 'function') return sqliteOnly(name, {}, options);
  return test(name, { ...options, skip: isPostgres ? SQLITE_ONLY : options.skip }, fn);
}

// Đầu file chỉ-SQLite: `if (require('../helpers/dialect').skipWholeFile(__filename)) return;`
function skipWholeFile(file) {
  if (!isPostgres) return false;
  test(require('node:path').basename(file) + ': ' + SQLITE_ONLY, { skip: SQLITE_ONLY }, () => {});
  return true;
}

module.exports = { isPostgres, SQLITE_ONLY, sqliteOnly, skipWholeFile };
