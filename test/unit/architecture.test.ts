'use strict';
// Luật kiến trúc của mã NestJS (src/): quét tĩnh các câu import/require trong src/**/*.ts.
//   1. Module nghiệp vụ (src/modules/<A>) chỉ import module khác (src/modules/<B>) qua cổng công khai index.ts của <B>.
//   2. Chỉ src/app.module.ts được import src/modules/*; hạ tầng (src/http, src/shared, src/*.ts khác) không phụ thuộc module nghiệp vụ.
//   3. Không file nào trong src/ import server.js (server.js là gốc của đồ thị).
//   4. Mỗi module có đủ <tên>.module.ts, index.ts và (nếu có route) controller đặt trong chính module đó; controller không nằm ngoài src/modules.
//   5. Mọi module nghiệp vụ được đăng ký trong AppModule (không có module mồ côi) và NotFoundModule đứng cuối danh sách.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

function walk(dir?) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}
const rel = (abs?) => path.relative(ROOT, abs).split(path.sep).join('/');
const FILES = walk(SRC);

// import ... from '<x>' | import x = require('<x>') | require('<x>'), chỉ lấy đường dẫn tương đối
function importsOf(file?) {
  const text = fs.readFileSync(file, 'utf8');
  const found: any[] = [];
  for (const re of [/from\s+'(\.[^']*)'/g, /require\('(\.[^']*)'\)/g])
    for (const m of text.matchAll(re)) found.push(path.resolve(path.dirname(file), m[1]));
  return found;
}
const moduleOf = (abs?) => {
  const r = path.relative(path.join(SRC, 'modules'), abs).split(path.sep);
  return r[0] && r[0] !== '..' && !path.isAbsolute(r[0]) ? r[0] : null;
};

const MODULES = fs
  .readdirSync(path.join(SRC, 'modules'), { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

test('kiến trúc: module nghiệp vụ chỉ import module khác qua index.ts', () => {
  const bad: any[] = [];
  for (const file of FILES) {
    const mine = moduleOf(file);
    if (!mine) continue;
    for (const target of importsOf(file)) {
      const other = moduleOf(target);
      if (!other || other === mine) continue;
      const viaIndex =
        target === path.join(SRC, 'modules', other) || target === path.join(SRC, 'modules', other, 'index');
      if (!viaIndex)
        bad.push(
          `${rel(file)} import ruột của module ${other}: ${rel(target)} (chỉ được import từ src/modules/${other})`
        );
    }
  }
  assert.deepEqual(bad, []);
});

test('kiến trúc: chỉ app.module.ts import src/modules; hạ tầng không phụ thuộc module nghiệp vụ', () => {
  const bad: any[] = [];
  for (const file of FILES) {
    if (moduleOf(file) || rel(file) === 'src/app.module.ts') continue;
    for (const target of importsOf(file)) if (moduleOf(target)) bad.push(`${rel(file)} → ${rel(target)}`);
  }
  assert.deepEqual(bad, [], 'hạ tầng (src/http, src/shared, ...) không được import module nghiệp vụ');
});

test('kiến trúc: không file nào trong src/ import src/server.ts (điểm vào là gốc của đồ thị)', () => {
  const bad = FILES.filter(file =>
    importsOf(file).some(target => target === path.join(ROOT, 'server') || target === path.join(ROOT, 'src/server.ts'))
  );
  assert.deepEqual(bad.map(rel), []);
});

test('kiến trúc: mỗi module có <tên>.module.ts và index.ts; controller chỉ nằm trong src/modules (và NotFoundController của hạ tầng)', () => {
  const problems: any[] = [];
  for (const name of MODULES) {
    const dir = path.join(SRC, 'modules', name);
    if (!fs.existsSync(path.join(dir, `${name}.module.ts`))) problems.push(`${name}: thiếu ${name}.module.ts`);
    if (!fs.existsSync(path.join(dir, 'index.ts'))) problems.push(`${name}: thiếu index.ts (cổng công khai)`);
  }
  for (const file of FILES)
    if (file.endsWith('.controller.ts') && !moduleOf(file) && rel(file) !== 'src/http/not-found.controller.ts')
      problems.push(`${rel(file)}: controller phải nằm trong một module (src/modules/<tên>/)`);
  assert.deepEqual(problems, []);
});

test('kiến trúc: AppModule đăng ký mọi module nghiệp vụ, NotFoundModule đứng cuối', () => {
  const text = fs.readFileSync(path.join(SRC, 'app.module.ts'), 'utf8');
  const list = /FEATURE_MODULES\s*=\s*\[([^\]]*)\]/.exec(text);
  assert.ok(list, 'không thấy FEATURE_MODULES trong app.module.ts');
  const registered = list[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const declared = MODULES.map(name => {
    const src = fs.readFileSync(path.join(SRC, 'modules', name, `${name}.module.ts`), 'utf8');
    return /export class (\w+)/.exec(src)[1];
  });
  assert.deepEqual(
    [...declared].sort(),
    [...registered].sort(),
    'module có trên đĩa nhưng chưa đăng ký (hoặc ngược lại)'
  );
  assert.match(
    text,
    /imports:\s*\[\s*CoreModule,\s*\.\.\.FEATURE_MODULES,\s*NotFoundModule\s*\]/,
    'NotFoundModule phải đứng cuối imports'
  );
});

test('kiến trúc: công cụ quét thấy file và cạnh import thật (không xanh giả vì quét trượt)', () => {
  assert.ok(FILES.length > 40, `chỉ thấy ${FILES.length} file .ts`);
  assert.ok(MODULES.length >= 18, `chỉ thấy ${MODULES.length} module`);
  const crossModuleEdges = FILES.flatMap(file =>
    importsOf(file).filter(t => moduleOf(file) && moduleOf(t) && moduleOf(t) !== moduleOf(file))
  );
  assert.ok(crossModuleEdges.length >= 1, 'phải thấy ít nhất cạnh attendance → sheet');
});

test('kiến trúc: tầng lõi (platform, domain, ai, ops, params, engine, shared) không phụ thuộc module NestJS hay hạ tầng HTTP của Nest', () => {
  const CORE = ['platform', 'domain', 'ai', 'ops', 'params', 'engine', 'shared'].map(d => path.join(SRC, d) + path.sep);
  const FORBIDDEN = ['modules', 'http'].map(d => path.join(SRC, d) + path.sep);
  const bad: any[] = [];
  for (const file of FILES.filter(f => CORE.some(c => f.startsWith(c))))
    for (const target of importsOf(file))
      if (FORBIDDEN.some(x => target.startsWith(x))) bad.push(`${rel(file)} → ${rel(target)}`);
  assert.deepEqual(bad, [], 'tầng lõi chỉ được import tầng lõi và src/data');
});

test('kiến trúc: src/data không import module, hạ tầng HTTP (chỉ import node_modules, src/data và domain)', () => {
  const bad: any[] = [];
  for (const file of FILES.filter(f => rel(f).startsWith('src/data/')))
    for (const target of importsOf(file))
      if (
        !rel(target).startsWith('src/data/') &&
        !rel(target).startsWith('node_modules') &&
        !rel(target).startsWith('src/domain/')
      )
        bad.push(`${rel(file)} → ${rel(target)}`);
  assert.deepEqual(bad, []);
});

test('kiến trúc: controller, lớp hỗ trợ và hạ tầng HTTP nhận dịch vụ dùng chung qua DI của Nest, không require thẳng singleton', () => {
  const DIRECT =
    /(?:require\(|from\s+)'[./]+\/(?:platform\/(?:db|auth|authz|audit|events|request-rules|agents)|domain\/container)'\)?/;
  const bad: any[] = [];
  for (const file of FILES.filter(f => /\/src\/(modules|http)\//.test(f.split(path.sep).join('/'))))
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (DIRECT.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
      });
  assert.deepEqual(bad, [], 'dùng @Inject(TOKEN) từ src/core/tokens.ts (đăng ký ở src/core/core.module.ts)');
});
