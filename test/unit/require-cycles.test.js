'use strict';
// Luật cấm vòng `require`: quét chuỗi require('./…') tĩnh trong server.js và lib/**,
// dựng đồ thị và đòi:
//   (1) không có vòng nào trong server.js + lib/** (kể cả require trong hàm: vòng ẩn khi chia file vẫn là vòng);
//   (2) lib/domain/* không require lib/routes/*; (3) lib/routes/* không require lẫn nhau (trừ routes/index → routes/* và _legacy);
//   (4) lib/http.js và lib/request-rules.js không require lib/domain/* hay lib/routes/*.
// Luật (2) đến (4) không kiểm gì khi các thư mục đó chưa có file.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const toRel = abs => path.relative(ROOT, abs).split(path.sep).join('/');

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(rel);
    return /\.(js|ts)$/.test(entry.name) ? [rel] : [];
  });
}

// require('./x') / require("../y") có thật trong mã (bỏ dòng chú thích thuần)
function requiresOf(source) {
  const out = [];
  for (const line of source.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const match of line.matchAll(/\brequire\(\s*(['"`])(\.{1,2}\/[^'"`]*)\1\s*\)/g)) out.push(match[2]);
  }
  return out;
}
function resolve(fromRel, spec) {
  const base = path.join(ROOT, path.dirname(fromRel), spec);
  for (const candidate of [base, base + '.js', base + '.json', path.join(base, 'index.js')])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return toRel(candidate);
  return null;
}

// Đồ thị { rel: Set(rel) } cho các file cho trước; cạnh chỉ nối tới file cũng nằm trong tập
function buildGraph(files, readSource = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8'), resolver = resolve) {
  const set = new Set(files);
  const graph = new Map();
  for (const rel of files) {
    const edges = new Set();
    for (const spec of requiresOf(readSource(rel))) {
      const target = resolver(rel, spec);
      if (target && set.has(target)) edges.add(target);
    }
    graph.set(rel, edges);
  }
  return graph;
}
// Mọi vòng đơn giản tìm được bằng DFS, mỗi vòng ghi dạng a → b → a (xoay để file nhỏ nhất đứng đầu, không trùng lặp)
async function findCycles(graph) {
  const cycles = new Map();
  const state = new Map(); // 1 đang duyệt, 2 xong
  const stack = [];
  const visit = async node => {
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

const FILES = ['server.js', ...walk('lib'), ...walk('src')];
const GRAPH = buildGraph(FILES);

test('không có vòng require giữa server.js và lib/** (quét tĩnh, kể cả require trong hàm)', async () => {
  assert.ok(FILES.length > 20, 'quét thiếu file?');
  assert.deepEqual(await findCycles(GRAPH), []);
});

test('đồ thị require nhìn thấy các cạnh đã biết (công cụ quét không trượt vì đổi cú pháp)', () => {
  assert.ok(GRAPH.get('server.js').has('lib/db.js'), 'server.js → lib/db.js');
  assert.ok(GRAPH.get('src/http/api-gate.ts').has('lib/authz.js'), 'cổng ApiGuard → lib/authz.js');
  assert.ok(GRAPH.get('lib/auth.js').has('lib/db.js'));
  const edges = [...GRAPH.values()].reduce((n, set) => n + set.size, 0);
  assert.ok(edges >= 30, `chỉ thấy ${edges} cạnh`);
});

test('công cụ tìm vòng bắt được vòng a → b → c → a và vòng tự trỏ, không báo nhầm đồ thị không vòng', async () => {
  const g = (...pairs) => new Map(pairs.map(([k, v]) => [k, new Set(v)]));
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

const dirOf = rel => path.posix.dirname(rel);
const inDir = (rel, dir) => rel.startsWith(dir + '/');
function violations(rule) {
  const out = [];
  for (const [from, edges] of GRAPH) for (const to of edges) if (rule(from, to)) out.push(`${from} → ${to}`);
  return out;
}

test('lib/domain/* không require lib/routes/* (luật 1 của mục 4.5)', async () => {
  assert.deepEqual(
    await violations((from, to) => inDir(from, 'lib/domain') && inDir(to, 'lib/routes')),
    []
  );
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

test('lib/http.js, lib/request-rules.js không require lib/domain/* hay lib/routes/* (luật 3)', async () => {
  const leaves = ['lib/http.js', 'lib/request-rules.js'];
  assert.deepEqual(
    await violations((from, to) => leaves.includes(from) && (inDir(to, 'lib/domain') || inDir(to, 'lib/routes'))),
    []
  );
});

test('lib/** không require server.js (máy chủ là gốc của đồ thị)', async () => {
  assert.deepEqual(
    await violations((from, to) => from !== 'server.js' && to === 'server.js'),
    []
  );
});
