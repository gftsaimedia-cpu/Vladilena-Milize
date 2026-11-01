'use strict';
// Spec viết tay (spec/*.md) không được dẫn tới file không còn tồn tại, và không dùng neo số dòng (`file.js:123`) vì số dòng trôi sau mỗi
// lần sửa mã. Chỗ cần vị trí chính xác (route, module, lược đồ, luật...) đã có spec/reference/*.md do scripts/docs/gen-spec.ts sinh từ mã.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const SKIP_DIRS = new Set<any>(['node_modules', '.git', 'dist']);

function walk(dir?, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(entry => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(dir, r) : [r];
  });
}
const FILES = walk(ROOT);
const FILE_SET = new Set<any>(FILES);
const BASENAMES = new Set<any>(FILES.map(f => path.basename(f)));

// Đường dẫn chỉ có ở lúc chạy hoặc là đường dẫn URL, không phải file của cây mã
const RUNTIME = [
  /^playwright.config.js$/,
  /* spec nói rõ file này KHÔNG có */ /^\/[\w.-]+\.(html|js)$/,
  /^\/__sandbox\//,
  /^out\//,
  /^cases\.json$/,
  /^web\/dist\//,
  /^data\//,
  /^backups\//,
  /^\.env/
];

const specs = fs.readdirSync(path.join(ROOT, 'spec')).filter(f => f.endsWith('.md'));
const REF = /`([A-Za-z0-9_./@-]+\.(?:js|ts|json|md|html|css|sql|cjs|mjs|png|yml|example))`/g;

test('spec: mọi file được dẫn trong spec/*.md còn tồn tại', () => {
  const missing: any[] = [];
  for (const doc of specs) {
    const lines = fs.readFileSync(path.join(ROOT, 'spec', doc), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(REF)) {
        const p = m[1];
        if (RUNTIME.some(re => re.test(p))) continue;
        const ok = p.includes('/') ? FILE_SET.has(p) || FILES.some(f => f.endsWith('/' + p)) : BASENAMES.has(p);
        if (!ok) missing.push(`${doc}:${i + 1} → ${p}`);
      }
    });
  }
  assert.deepEqual(missing, [], 'spec dẫn file không còn (đổi tên/xoá mà chưa sửa spec?)');
});

test('spec: không dùng neo số dòng file.js:123 (dùng tên hàm/khoá; vị trí chính xác ở spec/reference)', () => {
  const found: any[] = [];
  for (const doc of specs) {
    const lines = fs.readFileSync(path.join(ROOT, 'spec', doc), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/[\w/-]+\.(?:js|cjs|ts):\d+/.test(line)) found.push(`${doc}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});

test('spec: các tên module trong spec/reference/modules.md khớp thư mục src/modules', () => {
  const text = fs.readFileSync(path.join(ROOT, 'spec/reference/modules.md'), 'utf8');
  const dirs = fs
    .readdirSync(path.join(ROOT, 'src/modules'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
  for (const d of dirs) assert.ok(text.includes(`| \`${d}\` |`), `modules.md thiếu module ${d}`);
});
