'use strict';
// An toàn của công thức gõ chữ:
//   - không eval, new Function, vm, setTimeout(chuỗi), import() động, require tính từ chuỗi, biểu thức chính quy dựng từ dữ liệu;
//   - cây chỉ gồm các lớp nút trong danh sách đóng; deserialize kiểm lại từng nút, không tin dữ liệu đã lưu.
// Nhóm quét tĩnh luôn chạy trên public/ và lib/; phần còn lại chạy như `todo` khi thiếu src/engine/formula.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readAsJs } = require('../../scripts/dev/ts-source');
const F = require('../helpers/formula-fixture');
const { pending, ROOT } = require('../helpers/red');

const { STD_VOCAB } = F;
const opts = F.READY();
const load = F.loadFormula;

// Bỏ chú thích để quét mã chứ không quét lời giải thích ("không dùng eval")
const stripComments = (source?) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const FORBIDDEN = [
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\b/, 'new Function'],
  [/(^|[^.\w])Function\s*\(/, 'Function('],
  [/\bvm\s*\./, 'vm.'],
  [/node:vm|require\(\s*['"]vm['"]\s*\)/, 'module vm'],
  [/\bsetTimeout\s*\(\s*['"`]/, 'setTimeout(chuỗi)'],
  [/\bsetInterval\s*\(\s*['"`]/, 'setInterval(chuỗi)'],
  [/\bimport\s*\(/, 'import() động'],
  [/\brequire\s*\(\s*[^'")\s]/, 'require với đường dẫn tính từ chuỗi']
];
// Chặt hơn, chỉ cho src/engine/formula*.js: chữ và từ vựng do Admin sửa được nên không dựng RegExp từ chúng (nguy cơ ReDoS)
const FORMULA_ONLY = [
  [/\bnew\s+RegExp\b|(^|[^.\w])RegExp\s*\(/, 'RegExp dựng từ chuỗi'],
  [/\bwith\s*\(/, 'with(...)'],
  [/__proto__\s*=|\.prototype\s*\.\w+\s*=/, 'ghi vào prototype']
];

const scan = (source?, strict = false) => {
  const code = stripComments(source);
  return [...FORBIDDEN, ...(strict ? FORMULA_ONLY : [])]
    .filter(([pattern]: any) => pattern.test(code))
    .map(([, label]: any) => label);
};

const jsFiles = (dir?) => {
  const out: any[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(rel));
    else if (/\.(js|cjs|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
};

// ---------- Quét tĩnh (luôn chạy) ----------

test('Bộ quét tĩnh bắt đúng mã nguy hiểm và bỏ qua chú thích (tự kiểm trước khi tin vào kết quả quét)', () => {
  assert.deepEqual(scan('const x = eval("1");'), ['eval(']);
  assert.ok(scan('const f = new Function("return 1");').includes('new Function'));
  assert.ok(scan('Function("a")()').includes('Function('));
  assert.deepEqual(scan('vm.runInContext(a, b);'), ['vm.']);
  assert.deepEqual(scan("setTimeout('x()', 1);"), ['setTimeout(chuỗi)']);
  assert.deepEqual(scan('const m = await import(name);'), ['import() động']);
  assert.deepEqual(scan('const m = require(name);'), ['require với đường dẫn tính từ chuỗi']);
  assert.deepEqual(scan('const r = new RegExp(label);', true), ['RegExp dựng từ chuỗi']);
  assert.deepEqual(
    scan('const r = new RegExp(label);'),
    [],
    'lib/ đã có RegExp từ chuỗi cố định: chỉ cấm trong formula*.js'
  );
  assert.deepEqual(scan("const m = require('node:fs'); setTimeout(() => 1, 1); // không dùng eval( ở đây"), []);
  assert.deepEqual(scan('/* new Function("x") */ const ok = 1;'), []);
  assert.deepEqual(scan('const label = "evaluate(ctx)"; formula.evaluate(tree);'), [], 'evaluate không phải eval');
});

// Không có danh sách cho phép: mọi file .js của public/, lib/ và server.js đều không được dùng mã động.
test('no-dynamic-code: không file .js nào của public/ và lib/ dùng eval, new Function, vm, setTimeout(chuỗi), import() động, require động (không ngoại lệ)', () => {
  const offenders: any[] = [];
  for (const file of [...jsFiles('src')]) {
    const hits = scan(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    if (hits.length) offenders.push(`${file}: ${hits.join(', ')}`);
  }
  assert.deepEqual(offenders, []);
});

test(
  'src/engine/formula*.js: không dùng mã động, kể cả RegExp dựng từ từ vựng, và không có ngoại lệ nào',
  opts,
  async () => {
    await load(); // thiếu file thì ném "module missing"
    const files = fs.readdirSync(path.join(ROOT, 'src/engine')).filter(name => /^formula.*\.ts$/.test(name));
    assert.ok(files.includes('formula.ts'));
    for (const name of files) {
      const source = fs.readFileSync(path.join(ROOT, 'src/engine', name), 'utf8');
      assert.deepEqual(scan(source, true), [], `src/engine/${name}`);
    }
  }
);

test(
  'src/engine/formula.ts: chạy được trong trình duyệt giả (vm không có module/require/window): gắn Formula vào đối tượng toàn cục',
  opts,
  async () => {
    await load();
    const source = readAsJs(path.join(ROOT, 'src/engine/formula.ts'));
    const sandbox = vm.createContext({});
    vm.runInContext(source, sandbox, { timeout: 2000 });
    const api = sandbox.Formula;
    assert.ok(api, 'UMD phải gắn root.Formula khi không có module (như KpiScore, ApprovalView)');
    for (const fn of ['parse', 'validate', 'describe', 'evaluate', 'serialize', 'deserialize', 'dependencies'])
      assert.equal(typeof api[fn], 'function', fn);
    const res = api.parse('khoản A = lương cơ bản + đi lại', { vocabulary: STD_VOCAB });
    assert.equal(res.ok, true);
  }
);

test(
  'src/engine/formula.ts: không chạm DOM, mạng, đồng hồ hay đĩa (mô-đun thuần dùng chung trình duyệt và máy chủ)',
  opts,
  async () => {
    await load();
    const code = stripComments(fs.readFileSync(path.join(ROOT, 'src/engine/formula.ts'), 'utf8'));
    for (const [pattern, label] of [
      [/\bdocument\b/, 'document'],
      [/\bwindow\b/, 'window'],
      [/\bfetch\s*\(/, 'fetch'],
      [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
      [/\bDate\b/, 'Date (đồng hồ)'],
      [/\bMath\.random\b/, 'Math.random'],
      [/\brequire\s*\(/, 'require'],
      [/\bprocess\./, 'process'],
      [/\blocalStorage\b|\bsessionStorage\b/, 'localStorage']
    ])
      assert.doesNotMatch(code, pattern, `formula.js không được dùng ${label}`);
  }
);

// ---------- Danh sách đóng các lớp nút ----------
const CLOSED = [
  'lit',
  'var',
  'param',
  'op',
  'fn',
  'cond',
  'pred',
  'and',
  'or',
  'not',
  'tier',
  'builtin',
  'ref',
  'round'
];

// deserialize bị từ chối: ném, hoặc trả ok:false / errors
const rejected = (Formula?, doc?) => {
  try {
    const out = Formula.deserialize(doc);
    return Boolean(out && (out.ok === false || (Array.isArray(out.errors) && out.errors.length > 0)));
  } catch {
    return true;
  }
};
const doc = (nodes?) => ({ v: 1, root: 'n1', nodes });

test('Danh sách đóng: mọi cây phân tích ra chỉ có nút thuộc 14 lớp cho phép', opts, async () => {
  const Formula = await load();
  const seen = new Set<any>();
  for (const text of [
    'khoản A = lương cơ bản + đi lại × tỷ lệ đi lại - 1 + 0',
    'khoản A = nếu giữ được chuyên cần và không ở iDorm hoặc ở iDorm thì lương cơ bản ngược lại 0',
    'khoản A = nhỏ nhất của (lương cơ bản ; đi lại) + lớn nhất của (đi lại ; chuyên cần)',
    'khoản A = tổng theo ngày (tiền ca trong ngày) + khoản B',
    'khoản A = -lương cơ bản'
  ]) {
    const nodes = F.serObject(Formula, F.parseOk(Formula, text).tree).nodes;
    for (const node of Object.values<any>(nodes)) seen.add(node.t);
  }
  for (const t of seen) assert.ok(CLOSED.includes(t), `lớp lạ: ${t}`);
  assert.ok(seen.size >= 6, 'bộ mẫu phải chạm nhiều lớp nút');
});

test('deserialize từ chối nút có loại lạ: call, eval, code, import, exec, Function, constructor', opts, async () => {
  const Formula = await load();
  for (const t of [
    'call',
    'eval',
    'code',
    'import',
    'exec',
    'Function',
    'constructor',
    '__proto__',
    '',
    7,
    null,
    ['lit']
  ])
    assert.ok(rejected(Formula, doc({ n1: { t } })), `nút t=${JSON.stringify(t)} phải bị từ chối`);
});

test('deserialize từ chối lit khác 0 và 1 (mọi số khác là tham số), và lit không phải số hữu hạn', opts, async () => {
  const Formula = await load();
  for (const v of [2, -1, 0.5, 6000000, NaN, Infinity, '0', '1', null, undefined, {}, [0]])
    assert.ok(rejected(Formula, doc({ n1: { t: 'lit', v } })), `lit v=${JSON.stringify(v)} phải bị từ chối`);
  assert.ok(!rejected(Formula, doc({ n1: { t: 'lit', v: 0 } })));
  assert.ok(!rejected(Formula, doc({ n1: { t: 'lit', v: 1 } })));
});

test(
  'deserialize từ chối cây hỏng: thiếu root, root không có trong nodes, nút con không tồn tại, thiếu trường bắt buộc',
  opts,
  async () => {
    const Formula = await load();
    const lit = { t: 'lit', v: 1 };
    assert.ok(rejected(Formula, { v: 1, nodes: { n1: lit } }), 'thiếu root');
    assert.ok(rejected(Formula, { v: 1, root: 'n9', nodes: { n1: lit } }), 'root trỏ vào nút không có');
    assert.ok(rejected(Formula, doc({ n1: { t: 'op', op: 'mul', a: 'n2', b: 'n3' }, n2: lit })), 'b không tồn tại');
    assert.ok(rejected(Formula, doc({ n1: { t: 'op', op: 'mul', a: 'n2' }, n2: lit })), 'thiếu b');
    assert.ok(rejected(Formula, doc({ n1: { t: 'cond', if: 'n2', then: 'n2' }, n2: lit })), 'thiếu else');
    assert.ok(rejected(Formula, doc({ n1: { t: 'var' } })), 'var thiếu id');
    assert.ok(rejected(Formula, doc({ n1: { t: 'param' } })), 'param thiếu key');
  }
);

test('deserialize từ chối toán tử lạ trong nút op', opts, async () => {
  const Formula = await load();
  const lit = { t: 'lit', v: 1 };
  for (const op of ['pow', 'exec', 'mod', 'constructor', '', 5, undefined])
    assert.ok(
      rejected(Formula, doc({ n1: { t: 'op', op, a: 'n2', b: 'n2' }, n2: lit })),
      `op=${JSON.stringify(op)} phải bị từ chối`
    );
  assert.ok(
    !rejected(Formula, doc({ n1: { t: 'op', op: 'mul', a: 'n2', b: 'n2' }, n2: lit })),
    'mul là toán tử hợp lệ (ví dụ của TK mục 4)'
  );
});

test('deserialize từ chối vòng trong nodes (n1 trỏ n1, n1 → n2 → n1) để bộ tính không lặp vô hạn', opts, async () => {
  const Formula = await load();
  assert.ok(rejected(Formula, doc({ n1: { t: 'op', op: 'mul', a: 'n1', b: 'n1' } })), 'tự trỏ');
  assert.ok(
    rejected(
      Formula,
      doc({ n1: { t: 'op', op: 'mul', a: 'n2', b: 'n2' }, n2: { t: 'op', op: 'mul', a: 'n1', b: 'n1' } })
    ),
    'vòng hai nút'
  );
});

test('deserialize từ chối cây vượt giới hạn: lồng thật sâu hơn 12 tầng, hơn 200 nút', opts, async () => {
  const Formula = await load();
  // lồng thật: phép đổi luân phiên cộng/nhân (mỗi tầng đổi phép nên không gộp thành một tầng)
  const deep: Record<string, any> = { z: { t: 'lit', v: 1 } };
  for (let i = 1; i <= 40; i++) deep['n' + i] = { t: 'op', op: i % 2 ? 'add' : 'mul', a: 'n' + (i + 1), b: 'z' };
  deep.n41 = { t: 'lit', v: 1 };
  assert.ok(rejected(Formula, doc(deep)), 'lồng thật 40 tầng');
  // lồng thật bằng điều kiện nếu/thì
  const conds: Record<string, any> = { z: { t: 'lit', v: 1 }, c: { t: 'pred', p: 'idorm' } };
  for (let i = 1; i <= 30; i++) conds['n' + i] = { t: 'cond', if: 'c', then: 'z', else: 'n' + (i + 1) };
  conds.n31 = { t: 'lit', v: 1 };
  assert.ok(rejected(Formula, doc(conds)), 'điều kiện lồng 30 tầng');
  const wide = { n1: { t: 'or', args: Array.from({ length: 250 }, (_, i) => 'm' + i) } };
  for (let i = 0; i < 250; i++) wide['m' + i] = { t: 'pred', p: 'idorm' };
  assert.ok(rejected(Formula, doc(wide)), '251 nút');
});

// chuỗi cùng phép + gồm n số hạng: n1 = n2 + v1, n2 = n3 + v2, ... (lệch trái), lá v0 ở cuối
const addChain = (n?, id?) => {
  const nodes: Record<string, any> = {};
  for (let i = 1; i < n; i++) nodes['n' + i] = { t: 'op', op: 'add', a: i + 1 < n ? 'n' + (i + 1) : 'v0', b: 'v' + i };
  for (let i = 0; i < n; i++) nodes['v' + i] = { t: 'var', id: id || (i % 2 ? 'diLai' : 'luongCoBan') };
  return nodes;
};

test('deserialize nhận chuỗi cùng phép + dài 13 và 30 số hạng (một chuỗi là một tầng)', opts, async () => {
  const Formula = await load();
  for (const n of [13, 30]) assert.ok(!rejected(Formula, doc(addChain(n))), n + ' số hạng cùng phép + phải nạp được');
});

test('deserialize: chuỗi cùng phép + vượt 200 nút vẫn bị từ chối', opts, async () => {
  const Formula = await load();
  assert.ok(rejected(Formula, doc(addChain(150, 'luongCoBan'))), '299 nút');
});

test(
  'deserialize không bị đầu độc prototype: khoá __proto__ / constructor trong nodes, kết quả không làm bẩn Object.prototype',
  opts,
  async () => {
    const Formula = await load();
    const evil = JSON.parse(
      '{"v":1,"root":"n1","nodes":{"n1":{"t":"lit","v":1},"__proto__":{"polluted":"yes"},"constructor":{"t":"lit","v":1}}}'
    );
    try {
      Formula.deserialize(evil);
    } catch {
      // ném cũng được
    }
    assert.equal(({} as any).polluted, undefined, 'Object.prototype bị ô nhiễm');
    assert.equal((Object.prototype as any).polluted, undefined);
  }
);

test(
  'deserialize không tin đầu vào kiểu lạ: null, số, chuỗi, mảng, hàm đều bị từ chối, không ném lỗi lạ',
  opts,
  async () => {
    const Formula = await load();
    for (const bad of [null, undefined, 0, 'abc', [], () => 1, { v: 99, root: 'n1', nodes: {} }])
      assert.ok(rejected(Formula, bad), `đầu vào ${typeof bad} phải bị từ chối`);
  }
);

test(
  'deserialize bản lưu đúng phiên bản định dạng: v khác 1 bị từ chối rõ ràng (đường nâng cấp là việc của người sau)',
  opts,
  async () => {
    const Formula = await load();
    assert.ok(rejected(Formula, { v: 2, root: 'n1', nodes: { n1: { t: 'lit', v: 1 } } }));
    assert.ok(!rejected(Formula, { v: 1, root: 'n1', nodes: { n1: { t: 'lit', v: 1 } } }));
  }
);

test(
  'Cây đã nạp không chạy được chữ: nhãn và tên trong cây là dữ liệu (var.id lạ không gọi gì, báo lỗi có mã)',
  opts,
  async () => {
    const Formula = await load();
    const tree = Formula.deserialize(doc({ n1: { t: 'var', id: 'constructor' } }));
    const code = F.evalErrorCode(Formula, tree, F.makeCtx({ variables: {} }));
    assert.ok(code, 'biến "constructor" không có giá trị trong ctx phải là lỗi, không phải số lấy từ Object.prototype');
  }
);

test(
  'Biến không có trong ctx.variables (kể cả tên trùng Object.prototype) là lỗi có mã, không âm thầm bằng 0',
  opts,
  async () => {
    const Formula = await load();
    for (const id of ['toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const tree = Formula.deserialize(doc({ n1: { t: 'var', id } }));
      const code = F.evalErrorCode(Formula, tree, F.makeCtx({ variables: {} }));
      assert.ok(code, `${id} phải là lỗi`);
    }
  }
);
