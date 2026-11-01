'use strict';
// Hai lớp của công thức gõ chữ (src/engine/formula.ts, src/engine/payroll-engine.ts, src/engine/payroll-graph.ts):
//   1. nút `tier` "bảng bậc theo <chỉ số>: từ a trở lên → x; từ a đến dưới b → y; dưới b → z" ("từ a" gồm a, "đến dưới b" không gồm b);
//   2. biến THEO NGÀY (PayrollEngine.DAY_VARIABLES, 11 biến) cộng bằng "tổng theo ngày (…)": phải bằng đúng giá trị tháng của calcMonth.
// Dùng từ vựng khởi đầu thật (src/engine/formula-vocab.ts), người và số đều bịa. Không phụ thuộc ngày thật.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Formula = require('../../src/engine/formula');
const Vocab = require('../../src/engine/formula-vocab');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../helpers/defaults-old-basis.js');
const PayrollGraph = require('../../src/engine/payroll-graph');
const { declaredPunches } = require('../helpers/declared-punches');
const { readGolden } = require('../helpers/golden');

const parse = (text?, extra: any = {}) => Formula.parse(text, { vocabulary: Vocab, ...extra });
const parseOk = (text?) => {
  const res = parse(text);
  assert.ok(res.ok, `phải phân tích được: ${text} -> ${JSON.stringify(res.errors)}`);
  return res;
};
const ser = (tree?) => JSON.stringify(Formula.serialize(tree));
const clone = (value?) => JSON.parse(JSON.stringify(value));
const validateCodes = (tree?) => Formula.validate(tree, { vocabulary: Vocab }).errors.map(e => e.code);
const paramsOf = (res?) => Object.fromEntries(res.newParameters.map(p => [p.key, p.value]));
const evalTier = (res?, x?, params = paramsOf(res)) =>
  Formula.evaluate(res.tree, { variables: { diemKpi: x }, parameters: params });
const codeOf = (fn?) => {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
};

const TIER_KPI =
  'khoản A = bảng bậc theo điểm KPI: từ 90 trở lên → 100 đồng; từ 75 đến dưới 90 → 80 đồng; dưới 75 → 0 đồng';
const rowsText = (n?) =>
  Array.from({ length: n }, (_, i) =>
    i === 0 ? 'dưới 1 → 0' : i === n - 1 ? `từ ${i} trở lên → ${i}` : `từ ${i} đến dưới ${i + 1} → ${i}`
  ).join('; ');
const tierHours = (n?) => `khoản A = bảng bậc theo giờ vượt ngưỡng: ${rowsText(n)}`;

/* ===================== 1. Bảng bậc: tính ===================== */

test('tier: tính đúng ở mọi biên (95→100, 90→100, 89,99→80, 75→80, 74,99→0, 0→0)', () => {
  const res = parseOk(TIER_KPI);
  const want = [
    [95, 100],
    [90, 100],
    [89.99, 80],
    [75, 80],
    [74.99, 0],
    [0, 0]
  ];
  for (const [x, y] of want) assert.equal(evalTier(res, x), y, `điểm ${x}`);
});

test('tier: đảo thứ tự các hàng cho cùng kết quả (và cùng kết quả khi kiểm)', () => {
  const reversed =
    'khoản A = bảng bậc theo điểm KPI: dưới 75 → 0 đồng; từ 75 đến dưới 90 → 80 đồng; từ 90 trở lên → 100 đồng';
  const a = parseOk(TIER_KPI);
  const b = parseOk(reversed);
  assert.deepEqual(validateCodes(b.tree), []);
  for (const x of [200, 95, 90, 89.99, 80, 75, 74.99, 1, 0, -5])
    assert.equal(evalTier(b, x), evalTier(a, x), `điểm ${x}`);
});

test('tier: chỉ số NaN hoặc thiếu thì FORMULA_MISSING_INPUT, không rơi vào hàng nào', () => {
  const res = parseOk(TIER_KPI);
  assert.equal(
    codeOf(() => evalTier(res, NaN)),
    'FORMULA_MISSING_INPUT'
  );
  assert.equal(
    codeOf(() => Formula.evaluate(res.tree, { variables: {}, parameters: paramsOf(res) })),
    'FORMULA_MISSING_INPUT'
  );
});

test('tier: tính được với mười hàng (tối đa) và bậc liền kề không chồng không hở', () => {
  const res = parseOk(tierHours(10));
  assert.deepEqual(validateCodes(res.tree), []);
  const params = paramsOf(res);
  for (let i = 0; i < 10; i++) {
    const ev = (x?) => Formula.evaluate(res.tree, { variables: { gioVuotNguong: x }, parameters: params });
    assert.equal(ev(i + 0.5), i, `giờ ${i + 0.5}`);
    if (i > 0) assert.equal(ev(i), i, `giờ ${i} thuộc hàng "từ ${i}"`);
  }
});

/* ===================== 2. Bảng bậc: vòng tròn chữ và cây ===================== */

test('tier: describe rồi phân tích lại ra CÙNG cây (serialize bằng nhau); serialize-deserialize-serialize bằng nhau', () => {
  const first = parseOk(TIER_KPI);
  const sentence = Formula.describe(first.tree, Vocab);
  assert.equal(sentence, TIER_KPI, 'câu đọc lại giống chữ chuẩn');
  const again = parseOk(sentence);
  assert.equal(ser(again.tree), ser(first.tree));
  const stored = ser(first.tree);
  const back = Formula.deserialize(JSON.parse(stored));
  assert.equal(ser(back), stored);
  assert.deepEqual(Formula.validate(back, { vocabulary: Vocab }).errors, []);
});

test('tier: cạnh và giá trị thành tham số formula.khoanA.const.N theo thứ tự chữ; hai số 90 gõ riêng là hai tham số', () => {
  const res = parseOk(TIER_KPI);
  assert.deepEqual(
    res.newParameters.map(p => [p.key, p.value]),
    [
      ['formula.khoanA.const.1', 90],
      ['formula.khoanA.const.2', 100],
      ['formula.khoanA.const.3', 75],
      ['formula.khoanA.const.4', 90],
      ['formula.khoanA.const.5', 80],
      ['formula.khoanA.const.6', 75],
      ['formula.khoanA.const.7', 0]
    ]
  );
  // hai số 90 là hai nút tham số khác khoá, không dùng chung
  const paramNodes = Object.values<any>(Formula.serialize(res.tree).nodes).filter(n => n.t === 'param');
  assert.equal(new Set<any>(paramNodes.map(n => n.key)).size, 7);
});

test('tier: trong một phép cộng, describe bọc bảng bậc trong ngoặc và câu đó đọc lại ra cùng cây', () => {
  const text =
    'khoản A = lương cơ bản của level + (bảng bậc theo điểm KPI: từ 90 trở lên → 100 đồng; dưới 90 → 0 đồng)';
  const first = parseOk(text);
  const sentence = Formula.describe(first.tree, Vocab);
  assert.equal(sentence, text);
  assert.equal(ser(parseOk(sentence).tree), ser(first.tree));
});

test('tier: không có ngoặc trong phép cộng thì không phân tích được (bảng bậc là cả vế phải hoặc nằm trong ngoặc)', () => {
  const res = parse(
    'khoản A = lương cơ bản của level + bảng bậc theo điểm KPI: từ 90 trở lên → 100 đồng; dưới 90 → 0 đồng'
  );
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].code, 'PARSE_EXPECTED_OPERAND');
});

test('tier: làm đối số đứng trước một đối số khác trong "lớn nhất của (…)" thì roundtrip và tính đúng', () => {
  const text =
    'khoản A = lớn nhất của (bảng bậc theo điểm KPI: từ 90 trở lên → 100 đồng; dưới 90 → 0 đồng ; lương cơ bản của level)';
  const first = parseOk(text);
  const sentence = Formula.describe(first.tree, Vocab);
  assert.equal(sentence, text);
  const again = parseOk(sentence);
  assert.equal(ser(again.tree), ser(first.tree));
  assert.deepEqual(validateCodes(first.tree), []);
  const params = paramsOf(first);
  const run = (diemKpi?) =>
    Formula.evaluate(first.tree, { variables: { diemKpi, luongCoBan: 50 }, parameters: params });
  assert.equal(run(95), 100, 'bảng bậc 100 lớn hơn 50');
  assert.equal(run(10), 50, 'bảng bậc 0 nhỏ hơn 50');
});

/* ===================== 3. Bảng bậc: lỗi khi kiểm và khi phân tích ===================== */

test('tier: hở bậc ("dưới 8; từ 9 trở lên") báo FORMULA_TIER_GAP', () => {
  const res = parseOk('khoản A = bảng bậc theo giờ vượt ngưỡng: dưới 8 → 1; từ 9 trở lên → 0');
  assert.deepEqual(validateCodes(res.tree), ['FORMULA_TIER_GAP']);
});

test('tier: hàng giữa không nối vào hàng thấp nhất (dưới 24; từ 8 đến dưới 40; từ 40) báo FORMULA_TIER_GAP', () => {
  const res = parseOk('khoản A = bảng bậc theo giờ vượt ngưỡng: dưới 24 → 1; từ 8 đến dưới 40 → 2; từ 40 trở lên → 0');
  assert.deepEqual(validateCodes(res.tree), ['FORMULA_TIER_GAP']);
});

test('tier: không có hàng thấp nhất ("dưới …") báo FORMULA_TIER_BOUNDS', () => {
  const res = parseOk('khoản A = bảng bậc theo giờ vượt ngưỡng: từ 8 đến dưới 24 → 1; từ 24 trở lên → 0');
  assert.deepEqual(validateCodes(res.tree), ['FORMULA_TIER_BOUNDS']);
});

test('tier: cạnh giảm dần ("từ 8 đến dưới 4") báo FORMULA_TIER_ORDER', () => {
  const res = parseOk('khoản A = bảng bậc theo giờ vượt ngưỡng: dưới 8 → 1; từ 8 đến dưới 4 → 2; từ 4 trở lên → 0');
  assert.deepEqual(validateCodes(res.tree), ['FORMULA_TIER_ORDER']);
});

test('tier: giá trị các hàng khác đơn vị (đồng và giờ) báo FORMULA_UNIT_MISMATCH', () => {
  const res = parseOk(
    'khoản A = bảng bậc theo điểm KPI: từ 90 trở lên → 100 đồng; từ 75 đến dưới 90 → 80 giờ; dưới 75 → 0 đồng'
  );
  assert.ok(validateCodes(res.tree).includes('FORMULA_UNIT_MISMATCH'));
});

test('tier: chỉ số tiền (VND) mà cạnh là giờ báo FORMULA_UNIT_MISMATCH', () => {
  const res = parseOk('khoản A = bảng bậc theo lương KPI: từ 90 giờ trở lên → 1; dưới 90 giờ → 0');
  assert.ok(validateCodes(res.tree).includes('FORMULA_UNIT_MISMATCH'));
});

test('tier: 12 hàng bị từ chối ngay lúc phân tích bằng FORMULA_TOO_LARGE; 10 hàng thì qua', () => {
  const twelve = parse(tierHours(12));
  assert.equal(twelve.ok, false);
  assert.ok(twelve.errors.some(e => e.code === 'FORMULA_TOO_LARGE'));
  assert.equal(parse(tierHours(10)).ok, true);
});

test('tier: thiếu dấu ":" báo PARSE_TIER_COLON', () => {
  const res = parse('khoản A = bảng bậc theo điểm KPI từ 90 trở lên → 1; dưới 90 → 0');
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].code, 'PARSE_TIER_COLON');
});

test('tier: thiếu mũi tên "→" báo PARSE_TIER_ARROW', () => {
  const res = parse('khoản A = bảng bậc theo điểm KPI: từ 90 trở lên 1; dưới 90 → 0');
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].code, 'PARSE_TIER_ARROW');
});

test('tier: hàng mở đầu sai ("lương KPI → 1" hoặc "từ 90 → 1" thiếu "trở lên") báo PARSE_TIER_ROW', () => {
  for (const text of [
    'khoản A = bảng bậc theo điểm KPI: lương KPI → 1; dưới 90 → 0',
    'khoản A = bảng bậc theo điểm KPI: từ 90 → 1; dưới 90 → 0'
  ]) {
    const res = parse(text);
    assert.equal(res.ok, false, text);
    assert.equal(res.errors[0].code, 'PARSE_TIER_ROW', text);
  }
});

test('tier: lỗi phân tích có vị trí nguyên nằm trong chữ', () => {
  const text = 'khoản A = bảng bậc theo điểm KPI từ 90 trở lên → 1; dưới 90 → 0';
  const e = parse(text).errors[0];
  assert.ok(Number.isInteger(e.at.start) && Number.isInteger(e.at.end));
  assert.ok(e.at.start >= 0 && e.at.end >= e.at.start && e.at.end <= text.length);
  assert.equal(typeof e.message, 'string');
});

/* ===================== 4. Bảng bậc: cây đã lưu bị sửa tay ===================== */

// Chỉ trong cây đã lưu (không qua trình phân tích): đổi giá trị của nút tham số có khoá `key`
const tamper = (res?, key?, value?) => {
  const raw = clone(Formula.serialize(res.tree));
  const node = Object.values<any>(raw.nodes).find(n => n.t === 'param' && n.key === key);
  assert.ok(node, `không có nút ${key}`);
  node.value = value;
  return { tree: Formula.deserialize(raw), params: { ...paramsOf(res), [key]: value } };
};

test('tier đã lưu bị sửa: cạnh "từ 75" thành 80 tạo hở (75..80) -> kiểm FORMULA_TIER_GAP, tính 77 FORMULA_TIER_NO_ROW, 80 vào hàng mới', () => {
  const res = parseOk(TIER_KPI);
  const { tree, params } = tamper(res, 'formula.khoanA.const.3', 80);
  assert.deepEqual(validateCodes(tree), ['FORMULA_TIER_GAP']);
  const at = (x?) => Formula.evaluate(tree, { variables: { diemKpi: x }, parameters: params });
  assert.equal(
    codeOf(() => at(77)),
    'FORMULA_TIER_NO_ROW'
  );
  assert.equal(at(80), 80, 'bắt đầu hàng 80 đồng');
  assert.equal(at(90), 100);
  assert.equal(at(74), 0);
});

test('tier đã lưu bị sửa: cạnh "dưới 75" thành 80 tạo chồng (75..80) -> kiểm FORMULA_TIER_GAP, tính 77 FORMULA_TIER_OVERLAP', () => {
  const res = parseOk(TIER_KPI);
  const { tree, params } = tamper(res, 'formula.khoanA.const.6', 80);
  assert.deepEqual(validateCodes(tree), ['FORMULA_TIER_GAP']);
  const at = (x?) => Formula.evaluate(tree, { variables: { diemKpi: x }, parameters: params });
  assert.equal(
    codeOf(() => at(77)),
    'FORMULA_TIER_OVERLAP'
  );
  assert.equal(at(80), 80);
});

test('tier đã lưu: deserialize từ chối dưới 2 hàng, khoá hàng lạ, khoá nút lạ, và hơn 10 hàng', () => {
  const res = parseOk(TIER_KPI);
  const base = clone(Formula.serialize(res.tree));
  const tierId = Object.keys(base.nodes).find(id => base.nodes[id].t === 'tier');
  const mutate = (fn?) => {
    const raw = clone(base);
    fn(raw.nodes[tierId], raw);
    return raw;
  };
  const code = (raw?) => codeOf(() => Formula.deserialize(raw));

  assert.equal(code(mutate(t => (t.rows = t.rows.slice(0, 1)))), 'FORMULA_BAD_NODE', 'một hàng');
  assert.equal(code(mutate(t => (t.rows = []))), 'FORMULA_BAD_NODE', 'không hàng');
  assert.equal(code(mutate(t => (t.rows[0].extra = t.rows[0].value))), 'FORMULA_BAD_NODE', 'khoá hàng lạ');
  assert.equal(code(mutate(t => (t.zzz = 1))), 'FORMULA_BAD_NODE', 'khoá nút lạ');
  assert.equal(
    code(
      mutate(t => {
        t.rows = Array.from({ length: 11 }, () => ({ to: t.rows[2].to, value: t.rows[2].value }));
      })
    ),
    'FORMULA_TOO_LARGE',
    'mười một hàng'
  );
  // bản gốc vẫn đọc được
  assert.equal(code(base), null);
});

/* ===================== 5. Tổng theo ngày: công thức gõ chữ ===================== */

test('tổng theo ngày: tienTrongNgay [1000, 2000, 3500] cộng thành 6500', () => {
  const res = parseOk('khoản A = tổng theo ngày (tiền công cả ngày)');
  assert.deepEqual(validateCodes(res.tree), []);
  const out = Formula.evaluate(res.tree, { variables: { tienTrongNgay: [1000, 2000, 3500] }, parameters: {} });
  assert.equal(out, 6500);
});

test('tổng theo ngày: "tiền OT trong ngày × 2" kiểm ra đơn vị VND và tính từng ngày rồi cộng', () => {
  const res = parseOk('khoản A = tổng theo ngày (tiền OT trong ngày × 2)');
  const v = Formula.validate(res.tree, { vocabulary: Vocab });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(v.unit, 'VND');
  const out = Formula.evaluate(res.tree, {
    variables: { tienOtNgay: [100, 0, 250] },
    parameters: paramsOf(res)
  });
  assert.equal(out, 700);
});

test('tổng theo ngày: biến theo ngày ngoài "tổng theo ngày" (tiền OT trong ngày + lương cơ bản) báo FORMULA_DOMAIN_MIXED', () => {
  const res = parseOk('khoản A = tiền OT trong ngày + lương cơ bản của level');
  assert.deepEqual(validateCodes(res.tree), ['FORMULA_DOMAIN_MIXED']);
});

test('tổng theo ngày: bên trong không có biến theo ngày nào báo FORMULA_SUMDAYS_NO_DAY', () => {
  const res = parseOk('khoản A = tổng theo ngày (lương cơ bản của level)');
  assert.deepEqual(validateCodes(res.tree), ['FORMULA_SUMDAYS_NO_DAY']);
});

test('tổng theo ngày: hai danh sách ngày dài khác nhau thì FORMULA_MISSING_INPUT, không cộng lệch ngày', () => {
  const res = parseOk('khoản A = tổng theo ngày (tiền công cả ngày + tiền OT trong ngày)');
  const code = codeOf(() =>
    Formula.evaluate(res.tree, {
      variables: { tienTrongNgay: [1, 2, 3], tienOtNgay: [1, 2] },
      parameters: {}
    })
  );
  assert.equal(code, 'FORMULA_MISSING_INPUT');
});

test('tổng theo ngày: dùng biến theo ngày ngoài khối tổng khi tính cũng bị chặn (FORMULA_DOMAIN_MIXED)', () => {
  const res = parseOk('khoản A = tiền OT trong ngày + lương cơ bản của level');
  const code = codeOf(() =>
    Formula.evaluate(res.tree, {
      variables: { tienOtNgay: [1, 2], luongCoBan: 5 },
      parameters: {}
    })
  );
  assert.equal(code, 'FORMULA_DOMAIN_MIXED');
});

/* ===================== 6. Biến theo ngày của bộ máy ===================== */

const DAY_KEYS = [
  'tienTrongNgay',
  'tienNgayCongNgay',
  'phuCapCaNgay',
  'gioNghiDemNgay',
  'lamBuNgay',
  'tienOtNgay',
  'tienLamLeNgay',
  'gioOtNgay',
  'gioLamBuNgay',
  'gioLamLeNgay',
  'gioDemNgay'
];

test('DAY_VARIABLES: đúng 11 biến theo ngày, miền "day", khớp từ vựng khởi đầu về khoá, nhãn, đơn vị và miền', () => {
  assert.deepEqual(Object.keys(PayrollEngine.DAY_VARIABLES).sort(), [...DAY_KEYS].sort());
  assert.equal(Object.isFrozen(PayrollEngine.DAY_VARIABLES), true);
  for (const key of DAY_KEYS) {
    const engine = PayrollEngine.DAY_VARIABLES[key];
    const vocab = Vocab.byKey(key);
    assert.ok(vocab, `từ vựng thiếu ${key}`);
    assert.equal(engine.domain, 'day', key);
    assert.equal(vocab.domain, 'day', key);
    assert.equal(vocab.unit, engine.unit, `${key}: đơn vị`);
    assert.equal(vocab.kind, 'variable', key);
  }
  const dayInVocab = Vocab.filter(e => e.domain === 'day').map(e => e.key);
  assert.deepEqual([...dayInVocab].sort(), [...DAY_KEYS].sort(), 'từ vựng không có biến ngày thừa');
});

const golden = readGolden();
const params = PayrollParams.DEFAULTS;
const engine = PayrollEngine.create(params);
const MONTH_VALUES = [
  ['tổng theo ngày (tiền công cả ngày)', 'm.work', m => m.work],
  ['tổng theo ngày (tiền ngày công trong ngày)', 'trace.tienNgayCong', m => m.trace.tienNgayCong],
  ['tổng theo ngày (phụ cấp ca trong ngày)', 'trace.phuCapCa', m => m.trace.phuCapCa],
  ['tổng theo ngày (tiền giờ nghỉ đêm trong ngày)', 'trace.gioNghiDem', m => m.trace.gioNghiDem],
  ['tổng theo ngày (tiền làm bù trong ngày)', 'trace.lamBu', m => m.trace.lamBu],
  ['tổng theo ngày (tiền OT trong ngày)', 'trace.tienOt', m => m.trace.tienOt],
  ['tổng theo ngày (tiền làm ngày lễ trong ngày)', 'trace.tienLamLe', m => m.trace.tienLamLe],
  ['tổng theo ngày (giờ OT trong ngày)', 'm.otHours', m => m.otHours],
  ['tổng theo ngày (giờ làm bù trong ngày)', 'm.makeupHours', m => m.makeupHours],
  ['tổng theo ngày (giờ làm ngày lễ trong ngày)', 'm.holWorkHours', m => m.holWorkHours],
  ['tổng theo ngày (giờ làm đêm trong ngày)', 'm.nightHours', m => m.nightHours]
];

test('tổng theo ngày: 300 ca vàng, mỗi biến theo ngày cộng ra ĐÚNG số của tháng (so bằng nhau, không dung sai)', () => {
  assert.equal(golden.cases.length, 300);
  const trees = MONTH_VALUES.map(([text]: any) => parseOk(`khoản A = ${text}`).tree);
  const wrong: any[] = [];
  for (const c of golden.cases) {
    const out = engine.computeMonth(clone(c.input));
    const ctx = PayrollGraph.contextFor(out.m, c.input.staff, params);
    for (const key of DAY_KEYS)
      assert.equal(ctx.variables[key].length, out.m.rows.length, `${c.id}: ${key} dài bằng số dòng lịch`);
    MONTH_VALUES.forEach(([text, source, pick]: any, i) => {
      const got = Formula.evaluate(trees[i], ctx);
      const want = pick(out.m);
      // +0 gộp -0 và 0: "-0" không phải một số tiền khác
      if (got + 0 !== want + 0) wrong.push(`${c.id} ${text} (${source}): ${got} khác ${want}`);
    });
  }
  assert.deepEqual(wrong.slice(0, 10), []);
});

test('tổng theo ngày: có ít nhất một ca vàng có giá trị khác 0 cho từng biến (bài so sánh không rỗng)', () => {
  const nonZero = new Array(MONTH_VALUES.length).fill(0);
  for (const c of golden.cases) {
    const { m } = engine.computeMonth(clone(c.input));
    MONTH_VALUES.forEach(([, , pick]: any, i) => {
      if (pick(m) !== 0) nonZero[i]++;
    });
  }
  nonZero.forEach((n, i) => assert.ok(n > 0, `${MONTH_VALUES[i][1]} luôn bằng 0 trong 300 ca`));
});

/* ===================== 7. Công thức đã lưu dùng tổng theo ngày hoặc bảng bậc ===================== */

const NV1 = { username: 'qa_daysum_nv1', type: 'nv', level: 1, nightPct: 40, startDate: '2026-01-05' };
const monthInput = (days?, kpi: any = null) => ({
  staff: NV1,
  days,
  approvals: {},
  sessions: declaredPunches(NV1, days),
  kpi,
  holidays: [],
  month: '2026-10',
  upTo: null,
  asOf: '2026-11-04T09:00:00+07:00'
});
// Lưu một công thức có tên (như PUT /api/settings/params): { text, tree } và các tham số tự sinh của nó
const withSaved = (name?, text?) => {
  const res = Formula.parse(text, { vocabulary: Vocab });
  assert.ok(res.ok, `${text} -> ${JSON.stringify(res.errors)}`);
  const saved = { ...params, [`formula.${name}`]: { text, tree: Formula.serialize(res.tree) } };
  for (const p of res.newParameters) saved[p.key] = p.value;
  return PayrollEngine.create(saved);
};

test('formula.heSoNgayKpi lưu dạng bảng bậc chỉ khác mặc định đúng ở 24 giờ vượt ngưỡng (T6-5)', () => {
  // Mặc định: "vượt ngưỡng" là lớn hơn 24 (kpi.overLimitCompare = gt) nên đúng 24 giờ KPI vẫn đủ.
  // Bảng bậc "từ 24 trở lên" tính cả 24 -> KPI nhân tỷ lệ ngày đi làm 25 ÷ 26 (27 ngày Thứ Hai đến Thứ Bảy trừ 2 ngày nghỉ không lương).
  const kpi: Record<string, any> = { pct: 100, amt: 6000000, admPct: null, admAmt: null };
  // các ngày Thứ Hai đến Thứ Bảy còn lại đi làm đủ ca
  const daysFor = (lastOut?) => {
    const days: Record<string, any> = {};
    for (let d = 1; d <= 31; d++) {
      const date = `2026-10-${String(d).padStart(2, '0')}`;
      if (new Date(date + 'T00:00:00Z').getUTCDay() !== 0) days[date] = { kind: 'work', in: '08:00', out: '17:00' };
    }
    return {
      ...days,
      '2026-10-01': { kind: 'unpaid' },
      '2026-10-02': { kind: 'unpaid' },
      '2026-10-05': { kind: 'work', in: '08:00', out: '08:15' },
      '2026-10-06': { kind: 'work', in: '08:00', out: lastOut }
    };
  };
  const tier = withSaved(
    'heSoNgayKpi',
    'hệ số ngày KPI = bảng bậc theo giờ vượt ngưỡng: dưới 24 → 1; từ 24 trở lên → tỷ lệ ngày đi làm'
  );
  const run = (eng?, lastOut?) => eng.computeMonth(clone(monthInput(daysFor(lastOut), kpi))).m;

  const cases = [
    ['17:00', 23.75, false],
    ['16:45', 24, true],
    ['16:30', 24.25, false]
  ];
  for (const [lastOut, hours, differs] of cases) {
    const a = run(engine, lastOut);
    const b = run(tier, lastOut);
    assert.equal(a.overHours, hours, `giờ vượt ngưỡng ${lastOut}`);
    assert.equal(b.overHours, hours);
    if (differs) {
      assert.equal(a.kpiPay, 6000000, 'mặc định: đúng 24 giờ chưa vượt, KPI đủ');
      assert.equal(Math.round(b.kpiPay), Math.round((6000000 * 25) / 26), 'bảng bậc: 24 giờ nhân 25/26 = 5.769.231');
      assert.equal(Math.round(b.kpiPay), 5769231);
    } else {
      assert.equal(b.kpiPay, a.kpiPay, `giờ ${hours}: bảng bậc phải bằng mặc định`);
      assert.equal(b.net.net, a.net.net);
    }
  }
});
