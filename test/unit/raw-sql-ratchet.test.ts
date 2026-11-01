'use strict';
// Ratchet SQL thô: truy vấn mới phải đi qua repository Kysely (src/data), không viết `db.prepare(...)` mới.
// Mỗi file dưới đây còn SQL thô vì một lý do ghi rõ; số đếm chỉ được GIẢM (giảm thì hạ số trong bảng, tăng thì đỏ).
// Điểm vào SQL thô được đếm: `.prepare(` và `this.one/all/run(` (lớp nền src/domain/shared/repository.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ENTRY = /\.prepare\(|\bthis\.(?:one|all|run)\(/g;

const ALLOWED = {
  'src/data/postgres-database.ts': [1, 'bộ điều hợp PostgreSQL: tự chuẩn bị câu lệnh đã đổi dấu ?'],
  'src/ops/pg-backup.ts': [10, 'công cụ sao lưu đọc/ghi mọi bảng theo tên: SQL động theo thiết kế'],
  'src/modules/system/system.controller.ts': [1, 'SELECT 1 kiểm sức khoẻ kết nối']
};

function walk(dir?) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(js|ts)$/.test(entry.name) ? [full] : [];
  });
}

const counts: Record<string, any> = {};
for (const file of walk(path.join(ROOT, 'src'))) {
  const n = (fs.readFileSync(file, 'utf8').match(ENTRY) || []).length;
  if (n) counts[path.relative(ROOT, file).split(path.sep).join('/')] = n;
}

test('SQL thô: không file nào ngoài danh sách có truy vấn thô, và không file nào tăng thêm', () => {
  const grew = Object.entries<any>(counts)
    .filter(([file, n]: any) => !(file in ALLOWED) || n > ALLOWED[file][0])
    .map(([file, n]: any) => `${file}: ${n} (cho phép ${file in ALLOWED ? ALLOWED[file][0] : 0})`);
  assert.deepEqual(grew, [], 'viết truy vấn mới qua repository trong src/data (Kysely), đừng thêm SQL thô');
});

test('SQL thô: danh sách cho phép khớp thực tế (giảm thì hạ số trong bảng)', () => {
  const stale = Object.entries<any>(ALLOWED)
    .filter(([file, [n]]: any) => (counts[file] || 0) < n)
    .map(([file, [n]]: any) => `${file}: còn ${counts[file] || 0} < ${n}, hạ số hoặc xoá dòng`);
  assert.deepEqual(stale, []);
});

test('SQL thô: controller và hạ tầng HTTP không import src/data và không viết SQL (đi qua lib/ hoặc store)', () => {
  const offenders = walk(path.join(ROOT, 'src', 'modules'))
    .concat(walk(path.join(ROOT, 'src', 'http')))
    .filter(file => /from '[^']*\/data(\/|')|require\('[^']*\/data'\)|queryBuilder/.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(ROOT, file));
  assert.deepEqual(offenders, []);
});
