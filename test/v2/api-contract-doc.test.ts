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

// Mã trả về của POST: Nest mặc định 201, chỉ route có @HttpCode(n) mới khác. Doc phải ghi đúng mã đó ở "Response NNN".
function postStatusInCode(): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of controllerFiles(MODULES_DIR)) {
    const src = readFileSync(file, 'utf8');
    const prefix = /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/.exec(src);
    const base = prefix ? (prefix[1] ?? prefix[2] ?? '') : '';
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const m = /@Post\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/.exec(line);
      if (!m) return;
      const full = '/' + [base, m[1] ?? m[2] ?? ''].map((s) => s.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
      if (!full.startsWith('/api/v2/')) return;
      // Decorator của cùng handler đứng sát @Post (trước hoặc sau) cho tới dòng khai báo hàm.
      let code = 201;
      for (let j = i - 3; j <= i + 4 && j < lines.length; j++) {
        const h = /@HttpCode\((\d+)\)/.exec(lines[j] ?? '');
        if (h) code = Number(h[1]);
        if (j > i && /\basync\b|\)\s*[:{]/.test(lines[j] ?? '')) break;
      }
      out.set(normalize(full), code);
    });
  }
  return out;
}

test('mỗi mục POST trong doc có "Response NNN" khớp mã BE thật (201, trừ route có @HttpCode)', () => {
  const codes = postStatusInCode();
  const text = readFileSync(DOC_PATH, 'utf8');
  const sections = text.split(/\n(?=#{3,4} )/);
  const wrong: string[] = [];
  for (const section of sections) {
    const head = /^#{3,4} `POST (\/api\/v2\/[^\s`]*)`/.exec(section);
    if (!head) continue;
    const expected = codes.get(normalize(head[1]));
    if (expected === undefined) continue;
    const found = /\*\*Response (\d{3})/.exec(section);
    if (found && Number(found[1]) !== expected) wrong.push(`POST ${head[1]}: doc ghi ${found[1]}, BE trả ${expected}`);
  }
  assert.deepEqual(wrong, [], `Mã Response trong doc lệch BE:\n  ${wrong.join('\n  ')}`);
});
