// Giữ hợp đồng BE↔FE (docs/api/v2-contract.md) khớp với route thật trong các controller.
// Không cần DB: chỉ đọc file nguồn và tài liệu.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = process.cwd();
const MODULES_DIR = join(ROOT, 'src', 'modules');
const DOC_PATH = join(ROOT, 'docs', 'api', 'v2-contract.md');

// Route có trong doc nhưng cố ý không nằm ở controller (alias/ghi chú). Giải thích từng dòng.
// Hiện để trống: mọi route trong doc đều có ở BE (route cũ /api/... không v2 như alias /api/me, /api/roles bị bỏ qua từ đầu).
const DOC_ONLY_ALLOWED = new Set<string>([]);
// Route v2 của BE cố ý không phải tài liệu hoá. Giải thích từng dòng.
const CODE_ONLY_ALLOWED = new Set<string>([]);

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...controllerFiles(p));
    else if (name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

function normalize(path: string): string {
  const cleaned = path
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '')
    .replace(/\{[^}]*\}|<[^>]*>|:[A-Za-z_]\w*/g, ':p');
  return cleaned || '/';
}

function codeRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const file of controllerFiles(MODULES_DIR)) {
    const src = readFileSync(file, 'utf8');
    const prefix = /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/.exec(src);
    const base = prefix ? (prefix[1] ?? prefix[2] ?? '') : '';
    const re = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
    for (const m of src.matchAll(re)) {
      const sub = m[2] ?? m[3] ?? '';
      const full = '/' + [base, sub].map((s) => s.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
      // Chỉ xét v2; route cũ /api/... (me, roles, health) là alias, không thuộc hợp đồng v2.
      if (!full.startsWith('/api/v2/')) continue;
      routes.add(`${m[1].toUpperCase()} ${normalize(full)}`);
    }
  }
  return routes;
}

function docRoutes(): Set<string> {
  const text = readFileSync(DOC_PATH, 'utf8');
  const routes = new Set<string>();
  const re = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/v2\/[^\s`'")]*)/g;
  for (const m of text.matchAll(re)) {
    const path = m[2].replace(/[.,;:]+$/, '');
    routes.add(`${m[1]} ${normalize(path)}`);
  }
  return routes;
}

test('mọi route v2 của BE đều có trong docs/api/v2-contract.md', () => {
  const doc = docRoutes();
  const missing = [...codeRoutes()].filter((r) => !doc.has(r) && !CODE_ONLY_ALLOWED.has(r)).sort();
  assert.deepEqual(missing, [], `Route BE chưa được tài liệu hoá:\n  ${missing.join('\n  ')}`);
});

test('mọi route v2 trong docs/api/v2-contract.md đều có ở BE', () => {
  const code = codeRoutes();
  const extra = [...docRoutes()].filter((r) => !code.has(r) && !DOC_ONLY_ALLOWED.has(r)).sort();
  assert.deepEqual(extra, [], `Route trong doc nhưng BE không có:\n  ${extra.join('\n  ')}`);
});
