'use strict';
// Bắt "tên thiếu sau khi chuyển": liệt kê tên dùng trong một file JS mà không được khai báo (const/let/var/function/class/tham số/catch),
// không phải toàn cục của Node (và 4 tên của lớp bọc CommonJS: require, module, exports, __dirname, __filename).
// Repo không có linter, nên một `require` bị quên khi cắt hàm sang file khác chỉ nổ lúc chạy đúng nhánh đó; công cụ này bắt nó khi đọc.
// Không thêm phụ thuộc: dùng chính Prettier (đã là devDependency) làm trình phân tích: prettier.__debug.parse(code, { parser: 'acorn' })
// trả về cây ESTree thuần; phần phân tích phạm vi viết tay ở dưới (khoảng 200 dòng).
//
//   node test/tools/free-identifiers.ts lib/routes lib/domain server.js     in "file:dòng:cột tên" cho mỗi tên thiếu, thoát 1 nếu có
//   node test/tools/free-identifiers.ts --unused lib/http.ts                 thêm danh sách khai báo cấp module không được dùng (require thừa sau khi chuyển)
//   node test/tools/free-identifiers.ts --allow=foo,bar file.js              bỏ qua một số tên (toàn cục lạ của môi trường)
// Dùng từ code: const { freeIdentifiers, analyze } = require('./free-identifiers'); await freeIdentifiers(source) -> [{ name, line, col }]
//
// Giới hạn đã biết: không hiểu `with`, `eval`, tên tạo động trên globalThis; hàm khai báo trong khối được coi là thấy được ở cả hàm bao ngoài
// (như chế độ sloppy), nên việc dùng nó ngoài khối không bị báo. Tên chỉ dùng sau `typeof` không bị báo (cách viết hợp lệ để dò toàn cục).
const fs = require('node:fs');
const path = require('node:path');

const NODE_GLOBALS = new Set<any>([
  ...Object.getOwnPropertyNames(globalThis),
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename'
]);
const SKIP_KEYS = new Set<any>([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'raw',
  'regex',
  'bigint',
  'comments',
  'tokens'
]);

class Scope {
  parent: any;
  isFunction: any;
  names: any;

  constructor(parent?, isFunction?) {
    this.parent = parent;
    this.isFunction = isFunction;
    this.names = new Map(); // tên -> { uses }
  }
  declare(name?, info?) {
    if (!this.names.has(name)) this.names.set(name, { uses: 0, ...info });
  }
  lookup(name?) {
    for (let scope = this; scope; scope = scope.parent) if (scope.names.has(name)) return scope.names.get(name);
    return null;
  }
  functionScope() {
    let scope = this;
    while (!scope.isFunction) scope = scope.parent;
    return scope;
  }
}

const isNode = (value?) => value && typeof value === 'object' && typeof value.type === 'string';
function* children(node?) {
  for (const [key, value] of Object.entries<any>(node)) {
    if (SKIP_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) yield item;
    } else if (isNode(value)) yield value;
  }
}

// Tên được khai báo bởi một mẫu (đích gán / tham số)
function patternNames(pattern?, out: any[] = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern);
      break;
    case 'ObjectPattern':
      for (const p of pattern.properties) patternNames(p.type === 'RestElement' ? p.argument : p.value, out);
      break;
    case 'ArrayPattern':
      for (const e of pattern.elements) patternNames(e, out);
      break;
    case 'AssignmentPattern':
      patternNames(pattern.left, out);
      break;
    case 'RestElement':
      patternNames(pattern.argument, out);
      break;
  }
  return out;
}

const FUNCTIONS = new Set<any>(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

// var và hàm khai báo trong khối: hoist lên phạm vi hàm (không chui vào hàm con)
async function hoistVars(node?, fnScope?) {
  if (node.type === 'VariableDeclaration' && node.kind === 'var')
    for (const d of node.declarations)
      for (const id of patternNames(d.id)) await fnScope.declare(id.name, { node: id, kind: 'var' });
  if (FUNCTIONS.has(node.type) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    if (node.type === 'FunctionDeclaration' && node.id)
      await fnScope.declare(node.id.name, { node: node.id, kind: 'function' });
    return;
  }
  for (const child of children(node)) await hoistVars(child, fnScope);
}
// let/const/class/function/import ở ngay danh sách câu lệnh của một khối
async function hoistBlock(statements?, scope?) {
  for (const stmt of statements) {
    let s = stmt;
    if ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') && s.declaration)
      s = s.declaration;
    if (s.type === 'VariableDeclaration' && s.kind !== 'var')
      for (const d of s.declarations)
        for (const id of patternNames(d.id)) await scope.declare(id.name, { node: id, kind: s.kind });
    else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id)
      await scope.declare(s.id.name, { node: s.id, kind: s.type === 'ClassDeclaration' ? 'class' : 'function' });
    else if (s.type === 'ImportDeclaration')
      for (const sp of s.specifiers) await scope.declare(sp.local.name, { node: sp.local, kind: 'import' });
  }
}

async function analyze(ast?) {
  const free: any[] = [];
  const program = new Scope(null, true);

  function reference(id?, scope?) {
    const found = scope.lookup(id.name);
    if (found) found.uses += 1;
    else if (!NODE_GLOBALS.has(id.name)) free.push({ name: id.name, offset: id.start });
  }

  // Phần biểu thức nằm trong một mẫu (giá trị mặc định, khoá tính toán), không phải tên được khai báo
  async function patternExpressions(pattern?, scope?) {
    if (!pattern) return;
    switch (pattern.type) {
      case 'ObjectPattern':
        for (const p of pattern.properties) {
          if (p.type === 'RestElement') await patternExpressions(p.argument, scope);
          else {
            if (p.computed) await visit(p.key, scope);
            await patternExpressions(p.value, scope);
          }
        }
        break;
      case 'ArrayPattern':
        for (const e of pattern.elements) await patternExpressions(e, scope);
        break;
      case 'AssignmentPattern':
        await patternExpressions(pattern.left, scope);
        await visit(pattern.right, scope);
        break;
      case 'RestElement':
        await patternExpressions(pattern.argument, scope);
        break;
    }
  }

  async function visitFunction(node?, scope?) {
    const fn = new Scope(scope, true);
    if (node.type !== 'ArrowFunctionExpression') await fn.declare('arguments', { kind: 'implicit' });
    if (node.type === 'FunctionExpression' && node.id)
      await fn.declare(node.id.name, { node: node.id, kind: 'function' });
    for (const param of node.params)
      for (const id of patternNames(param)) await fn.declare(id.name, { node: id, kind: 'param' });
    for (const param of node.params) await patternExpressions(param, fn);
    if (node.body.type === 'BlockStatement') {
      await hoistVars(node.body, fn);
      await hoistBlock(node.body.body, fn);
      for (const stmt of node.body.body) await visit(stmt, fn);
    } else await visit(node.body, fn);
  }

  async function visitClass(node?, scope?) {
    if (node.superClass) await visit(node.superClass, scope);
    const cls = new Scope(scope, false);
    if (node.id) await cls.declare(node.id.name, { node: node.id, kind: 'class' });
    for (const member of node.body.body) {
      if (member.type === 'StaticBlock') {
        const block = new Scope(cls, true);
        await hoistVars({ type: 'BlockStatement', body: member.body }, block);
        await hoistBlock(member.body, block);
        for (const stmt of member.body) await visit(stmt, block);
        continue;
      }
      if (member.computed) await visit(member.key, cls);
      if (member.type === 'MethodDefinition') await visitFunction(member.value, cls);
      else if (member.value)
        await visitFunction({ type: 'ArrowFunctionExpression', params: [], body: member.value }, cls);
    }
  }

  async function visitBlock(statements?, scope?) {
    const block = new Scope(scope, false);
    await hoistBlock(statements, block);
    // hàm khai báo trong khối cũng thấy được ở hàm bao ngoài (sloppy)
    for (const stmt of statements)
      if (stmt.type === 'FunctionDeclaration' && stmt.id)
        await scope.functionScope().declare(stmt.id.name, { node: stmt.id, kind: 'function' });
    for (const stmt of statements) await visit(stmt, block);
  }

  async function visit(node?, scope?) {
    if (!node) return;
    switch (node.type) {
      case 'Identifier':
        reference(node, scope);
        return;
      case 'Program':
        return; // xử lý ở ngoài
      case 'VariableDeclaration':
        for (const d of node.declarations) {
          await patternExpressions(d.id, scope);
          await visit(d.init, scope);
        }
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        await visitFunction(node, scope);
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        await visitClass(node, scope);
        return;
      case 'BlockStatement':
        await visitBlock(node.body, scope);
        return;
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const loop = new Scope(scope, false);
        const head = node.type === 'ForStatement' ? node.init : node.left;
        if (head && head.type === 'VariableDeclaration' && head.kind !== 'var')
          for (const d of head.declarations)
            for (const id of patternNames(d.id)) await loop.declare(id.name, { node: id, kind: head.kind });
        if (node.type === 'ForStatement') {
          await visit(node.init, loop);
          await visit(node.test, loop);
          await visit(node.update, loop);
        } else {
          await visit(node.left, loop);
          await visit(node.right, loop);
        }
        await visit(node.body, loop);
        return;
      }
      case 'SwitchStatement': {
        await visit(node.discriminant, scope);
        const sw = new Scope(scope, false);
        await hoistBlock(
          node.cases.flatMap(c => c.consequent),
          sw
        );
        for (const c of node.cases) {
          await visit(c.test, sw);
          for (const stmt of c.consequent) await visit(stmt, sw);
        }
        return;
      }
      case 'CatchClause': {
        const handler = new Scope(scope, false);
        if (node.param)
          for (const id of patternNames(node.param)) await handler.declare(id.name, { node: id, kind: 'catch' });
        await patternExpressions(node.param, handler);
        await visit(node.body, handler);
        return;
      }
      case 'LabeledStatement':
        await visit(node.body, scope);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'MetaProperty':
      case 'ImportDeclaration':
        return;
      case 'MemberExpression':
        await visit(node.object, scope);
        if (node.computed) await visit(node.property, scope);
        return;
      case 'Property':
        if (node.computed) await visit(node.key, scope);
        await visit(node.value, scope);
        return;
      case 'UnaryExpression':
        if (node.operator === 'typeof' && node.argument.type === 'Identifier' && !scope.lookup(node.argument.name))
          return;
        await visit(node.argument, scope);
        return;
      case 'ExportNamedDeclaration':
        if (node.declaration) await visit(node.declaration, scope);
        return;
      default:
        for (const child of children(node)) await visit(child, scope);
    }
  }

  await hoistVars(ast, program);
  await hoistBlock(ast.body, program);
  for (const stmt of ast.body) await visit(stmt, program);
  const unused: any[] = [];
  for (const [name, info] of program.names)
    if (info.node && info.uses === 0 && info.kind !== 'param' && info.kind !== 'implicit')
      unused.push({ name, offset: info.node.start });
  return { free, unused };
}

const position = (text?, offset?) => {
  const before = text.slice(0, offset);
  return { line: before.split('\n').length, col: offset - before.lastIndexOf('\n') };
};

async function run(source?, { allow = [] }: any = {}) {
  const prettier = require('prettier');
  const text = source.replace(/\r\n/g, '\n').replace(/^#!.*/, '');
  const { ast } = await prettier.__debug.parse(text, { parser: 'acorn' });
  const { free, unused } = await analyze(ast);
  const named = (list?) =>
    list.filter(item => !allow.includes(item.name)).map(item => ({ name: item.name, ...position(text, item.offset) }));
  return { free: named(free), unused: named(unused) };
}

const freeIdentifiers = async (source?, options?) => (await run(source, options)).free;
const unusedBindings = async (source?, options?) => (await run(source, options)).unused;

module.exports = { freeIdentifiers, unusedBindings, analyze, run };

function listJs(target?) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap(entry => {
      const full = path.join(target, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listJs(full);
      return /\.(js|ts)$/.test(entry.name) ? [full] : [];
    })
    .sort();
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const allow = (args.find(a => a.startsWith('--allow=')) || '').slice(8).split(',').filter(Boolean);
    const wantUnused = args.includes('--unused');
    const targets = args.filter(a => !a.startsWith('--'));
    if (!targets.length) {
      console.error('Cách dùng: node test/tools/free-identifiers.ts [--unused] [--allow=a,b] <file|thư mục>...');
      process.exit(2);
    }
    let bad = 0;
    for (const target of targets.flatMap(listJs)) {
      const { free, unused } = await run(fs.readFileSync(target, 'utf8'), { allow });
      for (const item of free) {
        bad += 1;
        console.log(`${target}:${item.line}:${item.col} tên thiếu: ${item.name}`);
      }
      if (wantUnused)
        for (const item of unused) console.log(`${target}:${item.line}:${item.col} khai báo không dùng: ${item.name}`);
    }
    console.log(bad ? `${bad} tên thiếu` : 'Không có tên thiếu');
    process.exit(bad ? 1 : 0);
  })().catch(error => {
    console.error(error);
    process.exit(2);
  });
}
