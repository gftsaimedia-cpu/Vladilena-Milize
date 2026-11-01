'use strict';
// Luật cấm vòng `require`: quét chuỗi require('./…') tĩnh trong server.js và lib/**,
// dựng đồ thị và đòi:
//   (1) không có vòng nào trong server.js + lib/** (kể cả require trong hàm: vòng ẩn khi chia file vẫn là vòng);
//   (2) src/domain/* không require lib/routes/*; (3) lib/routes/* không require lẫn nhau (trừ routes/index → routes/* và _legacy);
//   (4) src/platform/http.ts và src/platform/request-rules.ts không require src/domain/* hay lib/routes/*.
// Luật (2) đến (4) không kiểm gì khi các thư mục đó chưa có file.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const toRel = (abs?) => path.relative(ROOT, abs).split(path.sep).join('/');

function walk(dir?) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(rel);
    return /\.(js|ts)$/.test(entry.name) ? [rel] : [];
  });
}

// require('./x') / require("../y") có thật trong mã (bỏ dòng chú thích thuần)
function requiresOf(source?) {
  const out: any[] = [];
  for (const line of source.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const match of line.matchAll(/\brequire\(\s*(['"`])(\.{1,2}\/[^'"`]*)\1\s*\)/g)) out.push(match[2]);
  }
  return out;
}
function resolve(fromRel?, spec?) {
  const base = path.join(ROOT, path.dirname(fromRel), spec);
  for (const candidate of [
    base,
    base + '.js',
    base + '.ts',
    base + '.json',
    path.join(base, 'index.js'),
    path.join(base, 'index.ts')
  ])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return toRel(candidate);
  return null;
}

// Đồ thị { rel: Set(rel) } cho các file cho trước; cạnh chỉ nối tới file cũng nằm trong tập
function buildGraph(files?, readSource = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8'), resolver = resolve) {
  const set = new Set<any>(files);
  const graph = new Map<any, any>();
  for (const rel of files) {
    const edges = new Set<any>();
    for (const spec of requiresOf(readSource(rel))) {
      const target = resolver(rel, spec);
      if (target && set.has(target)) edges.add(target);
    }
    graph.set(rel, edges);
  }
  return graph;
}
// Mọi vòng đơn giản tìm được bằng DFS, mỗi vòng ghi dạng a → b → a (xoay để file nhỏ nhất đứng đầu, không trùng lặp)
async function findCycles(graph?) {
  const cycles = new Map<any, any>();
  const state = new Map<any, any>(); // 1 đang duyệt, 2 xong
  const stack: any[] = [];
  const visit = async (node?) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (state.get(next) === 1) {
        const cycle = stack.slice(stack.indexOf(next));
        const start = cycle.indexOf([...cycle].sort()[0]);
        const rotated = [...cycle.slice(start), ...cycle.slice(0, start)];
        cycles.set(rotated.join(' → '), [...rotated, rotated[0]].join(' → '));
      } else if (!state.get(next)) await visit(next);
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const node of graph.keys()) if (!state.get(node)) await visit(node);
  return [...cycles.values()];
}

// src/engine (mã tính toán thuần, trước đây ở public/) có vòng payroll-engine ↔ payroll-graph từ trước; chưa nằm trong phạm vi luật này
const FILES = walk('src').filter(f => !f.startsWith('src/engine/'));
const GRAPH = buildGraph(FILES);

test('không có vòng require giữa server.js và lib/** (quét tĩnh, kể cả require trong hàm)', async () => {
  assert.ok(FILES.length > 20, 'quét thiếu file?');
  assert.deepEqual(await findCycles(GRAPH), []);
});

test('đồ thị require nhìn thấy các cạnh đã biết (công cụ quét không trượt vì đổi cú pháp)', () => {
  assert.ok(GRAPH.get('src/main.ts').has('src/platform/db.ts'), 'src/main.ts → src/platform/db.ts');
  assert.ok(GRAPH.get('src/http/api-gate.ts').has('src/platform/config.ts'), 'cổng ApiGate → src/platform/config.ts');
  assert.ok(GRAPH.get('src/platform/auth.ts').has('src/platform/db.ts'));
  const edges = [...GRAPH.values()].reduce((n, set) => n + set.size, 0);
  assert.ok(edges >= 30, `chỉ thấy ${edges} cạnh`);
});

test('công cụ tìm vòng bắt được vòng a → b → c → a và vòng tự trỏ, không báo nhầm đồ thị không vòng', async () => {
  const g = (...pairs) => new Map<any, any>(pairs.map(([k, v]: any) => [k, new Set<any>(v)]));
  assert.deepEqual(await findCycles(g(['a', ['b']], ['b', ['c']], ['c', ['a']])), ['a → b → c → a']);
  assert.deepEqual(await findCycles(g(['a', ['a']])), ['a → a']);
  assert.deepEqual(await findCycles(g(['a', ['b', 'c']], ['b', ['c']], ['c', []])), []);
  const fake = { 'x.js': "const y = require('./y');", 'y.js': "function f() { return require('./x'); }" };
  const graph = buildGraph(
    ['x.js', 'y.js'],
    rel => fake[rel],
    (from, spec) => spec.slice(2) + '.js'
  );
  assert.equal((await findCycles(graph)).length, 1, 'require trong hàm cũng là cạnh');
});

const dirOf = (rel?) => path.posix.dirname(rel);
const inDir = (rel?, dir?) => rel.startsWith(dir + '/');
function violations(rule?) {
  const out: any[] = [];
  for (const [from, edges] of GRAPH) for (const to of edges) if (rule(from, to)) out.push(`${from} → ${to}`);
  return out;
}

test('src/domain/* không require lib/routes/* (luật 1 của mục 4.5)', async () => {
  assert.deepEqual(await violations((from, to) => inDir(from, 'src/domain') && inDir(to, 'lib/routes')), []);
});

test('lib/routes/* không require lẫn nhau; chỉ routes/index.js được require các file miền (luật 2)', async () => {
  const bad = await violations(
    (from, to) =>
      inDir(from, 'lib/routes') &&
      inDir(to, 'lib/routes') &&
      from !== 'lib/routes/index.js' &&
      dirOf(from) === dirOf(to)
  );
  assert.deepEqual(bad, []);
});

test('src/platform/http.ts, src/platform/request-rules.ts không require src/domain/* hay lib/routes/* (luật 3)', async () => {
  const leaves = ['src/platform/http.ts', 'src/platform/request-rules.ts'];
  assert.deepEqual(
    await violations((from, to) => leaves.includes(from) && (inDir(to, 'src/domain') || inDir(to, 'lib/routes'))),
    []
  );
});

test('lib/** không require server.js (máy chủ là gốc của đồ thị)', async () => {
  assert.deepEqual(await violations((from, to) => from !== 'src/server.ts' && to === 'src/server.ts'), []);
});
