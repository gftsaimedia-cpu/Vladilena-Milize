'use strict';
// Công cụ test/tools/free-identifiers.js (bắt tên thiếu sau khi chuyển hàm sang file khác) phải bắt được lỗi cố ý
// và không báo nhầm các cách khai báo thông thường. Đây là test của công cụ, không phải của mã sản phẩm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { freeIdentifiers, unusedBindings } = require('../tools/free-identifiers');

// Công cụ dùng bộ phân tích acorn đi kèm Prettier (devDependency). Bản sao chưa chạy npm install thì bỏ qua (skip, không phải todo)
// để npm test vẫn chạy được không cần npm install.
let hasPrettier = true;
try {
  require.resolve('prettier');
} catch {
  hasPrettier = false;
}
const NEEDS_PRETTIER = hasPrettier ? {} : { skip: 'cần Prettier (npm install) để chạy bộ dò tên thiếu' };

const names = async code => (await freeIdentifiers(code)).map(item => item.name).sort();

test(
  'free-identifiers: bắt `require` bị quên và hằng bị bỏ lại khi cắt hàm sang file khác',
  NEEDS_PRETTIER,
  async () => {
    const moved = `
    function listOt(status) {
      const rows = store.listSessions({ status });
      return rows.filter(row => row.entry.extraKind === 'ot').map(row => formatRow(row, MAX_EXTRA));
    }
    module.exports = { listOt };`;
    assert.deepEqual(await names(moved), ['MAX_EXTRA', 'formatRow', 'store']);
    const fixed = `const store = require('./db');\nconst { formatRow, MAX_EXTRA } = require('./x');\n${moved}`;
    assert.deepEqual(await names(fixed), []);
  }
);

test('free-identifiers: báo đúng dòng và cột của tên thiếu', NEEDS_PRETTIER, async () => {
  const [item] = await freeIdentifiers('const a = 1;\n\n  const b = a + missing;\n');
  assert.deepEqual(item, { name: 'missing', line: 3, col: 17 });
});

test(
  'free-identifiers: không báo nhầm khai báo, tham số, mẫu huỷ cấu trúc, catch, nhãn, lớp, hoist',
  NEEDS_PRETTIER,
  async () => {
    const ok = `
    'use strict';
    const fs = require('node:fs'), { join: j, ...rest } = require('node:path'), [first = 1, [second]] = [];
    let counter = 0;
    var legacy = 1;
    function hoisted() { return later() + counter + legacy; }
    function later() { return typeof maybeGlobal === 'undefined' ? first : second; }
    class Base { static kind = 'b'; #secret = 1; method(a, b = a, ...others) { return a + b + others.length + this.#secret + arguments.length; } }
    class Child extends Base { static { const inner = Base.kind; } get x() { return super.method(1); } }
    const fnExpr = function named(n) { return n ? named(n - 1) : 0; };
    const arrow = ({ a, b: { c } }, [d], e = d) => a + c + d + e;
    outer: for (let i = 0; i < 3; i++) { for (const k of [1]) { if (k) continue outer; else break outer; } }
    for (const key in { a: 1 }) hoisted(key);
    try { hoisted(); } catch ({ message }) { console.log(message); } finally { j(rest, fs, fnExpr, arrow, Child); }
    switch (counter) { case 0: { const scoped = 1; counter += scoped; break; } default: break; }
    const obj = { shorthand: counter, [fs.name]: 1, method() { return counter; }, get prop() { return later; } };
    label2: { if (obj) break label2; }
    ({ counter } = obj);
    const t = new.target ?? process.env.X ?? globalThis.Y ?? Buffer.from('') ?? URL ?? fetch;
    const tpl = \`\${counter}-\${obj.shorthand}\`;
    module.exports = { hoisted, later, tpl, t };`;
    assert.deepEqual(await names(ok), []);
  }
);

test(
  'free-identifiers: phạm vi đúng — tên khai trong khối, hàm khác hay vòng lặp không lọt ra ngoài',
  NEEDS_PRETTIER,
  async () => {
    assert.deepEqual(await names('{ const inBlock = 1; } console.log(inBlock);'), ['inBlock']);
    assert.deepEqual(await names('function f() { const local = 1; } function g() { return local; }'), ['local']);
    assert.deepEqual(await names('for (const i of [1]) {} console.log(i);'), ['i']);
    assert.deepEqual(await names('try {} catch (error) {} console.log(error);'), ['error']);
    assert.deepEqual(await names('const o = { key: 1 }; o.key; o.other.deeper; const { key } = o;'), []);
    assert.deepEqual(await names('x = 1;'), ['x']);
  }
);

test('free-identifiers: hàm khai báo và var dùng trước chỗ khai báo (hoist) không bị báo', NEEDS_PRETTIER, async () => {
  assert.deepEqual(await names('run(); function run() { return v; } var v = 1;'), []);
  assert.deepEqual(await names('if (true) { var late = 1; } console.log(late);'), []);
});

test('free-identifiers --unused: liệt kê require thừa sau khi chuyển', NEEDS_PRETTIER, async () => {
  const unused = await unusedBindings(
    `const a = require('a'), b = require('b'); const { c, d } = require('x'); module.exports = { a, c };`
  );
  assert.deepEqual(unused.map(item => item.name).sort(), ['b', 'd']);
});

test(
  'free-identifiers: file thật của máy chủ không có tên thiếu (lưới B0; chạy lại sau mỗi bước chia)',
  NEEDS_PRETTIER,
  async () => {
    const fs = require('node:fs');
    const { serverFiles, ROOT } = require('../helpers/server-source');
    // File .ts (module Nest) do trình biên dịch TypeScript kiểm tên (test/unit/typecheck.test.js), ở đây chỉ quét file .js
    const files = [...serverFiles().filter(rel => rel.endsWith('.js')), 'lib/db.js', 'lib/authz.js', 'lib/periods.js'];
    assert.ok(files.includes('server.js'));
    const found = [];
    for (const rel of files) {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const item of await freeIdentifiers(source)) found.push(`${rel}:${item.line}:${item.col} ${item.name}`);
    }
    assert.deepEqual(found, [], 'tên dùng mà không khai báo (quên require sau khi chuyển?)');
  }
);
