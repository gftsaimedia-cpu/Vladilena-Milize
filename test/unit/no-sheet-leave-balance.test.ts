'use strict';
// Lịch khai không còn kiểm số dư phép năm: mã SHEET_LEAVE_BALANCE không xuất hiện trong lib/, server.js, public/, scripts/.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TARGETS = ['src', 'scripts'];
const SKIP_DIR = new Set<any>(['node_modules', '.git']);
const TEXT_EXT = new Set<any>(['.js', '.cjs', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.vue']);
// dựng từ hai nửa để tệp này không tự chứa mã cần tìm
const CODE = 'SHEET_' + 'LEAVE_BALANCE';

function* walk(entry?) {
  const stat = fs.statSync(entry);
  if (stat.isFile()) {
    if (TEXT_EXT.has(path.extname(entry))) yield entry;
    return;
  }
  for (const name of fs.readdirSync(entry)) if (!SKIP_DIR.has(name)) yield* walk(path.join(entry, name));
}

test('không còn mã kiểm số dư phép của lịch khai ở lib, server.js, public, scripts', () => {
  const hits: any[] = [];
  for (const target of TARGETS)
    for (const file of walk(path.join(ROOT, target)))
      if (fs.readFileSync(file, 'utf8').includes(CODE)) hits.push(path.relative(ROOT, file));
  assert.deepEqual(hits, []);
});
