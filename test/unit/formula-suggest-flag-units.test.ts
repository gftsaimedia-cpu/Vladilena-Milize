'use strict';
// Ba tính năng của src/engine/formula.ts:
//   1. PARSE_UNKNOWN_WORD có `suggestionReplace` (một khoảng chữ cho mỗi gợi ý, cùng thứ tự) và `replace`: khoảng chữ phủ cả nhãn đã biết
//      liền kề, nên nhận một gợi ý không bao giờ làm lặp chữ;
//   2. đơn vị 'flag' (cờ đúng/sai) cho giá trị điều kiện: dùng được trong nếu/và/hoặc/không, không cộng trừ hay so sánh được
//      (FORMULA_NOT_NUMERIC); 'count' vẫn dùng làm điều kiện được (tương thích ngược);
//   3. validate() trả `units: { đường dẫn: đơn vị }` theo đường dẫn của lỗi ('cây', 'cây.a', 'cây.else.a.b', 'cây.args[0]'...).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/formula-fixture');

const { STD_VOCAB } = F;
const opts = F.READY();
const load = F.loadFormula;
const starter = () => F.loadFormula() && require('../../src/engine/formula-vocab');

// STD_VOCAB khai "ở iDorm" và "giữ được chuyên cần" là 'count'; FLAG_VOCAB khai 'flag'
const FLAG_VOCAB = STD_VOCAB.map(w => (w.unit === 'count' ? { ...w, unit: 'flag' } : w));

const apply = (text?, span?, replacement?) => text.slice(0, span.start) + replacement + text.slice(span.end);

// ---------- 1. Khoảng chữ thay thế của gợi ý ----------

test(
  'suggestionReplace: "thưởng chuyên cần" lạ ở 33..39, thay cả 33..50; nhận gợi ý 0 ra công thức hợp lệ có "chuyên cần" đúng một lần',
  opts,
  async () => {
    const Formula = await load();
    const vocabulary = starter();
    const text = 'tổng thu nhập = tiền ngày công + thưởng chuyên cần';
    const res = Formula.parse(text, { vocabulary });
    assert.equal(res.ok, false);
    const e = res.errors.find(x => x.code === 'PARSE_UNKNOWN_WORD');
    assert.deepEqual(e.at, { start: 33, end: 39 });
    assert.equal(text.slice(e.at.start, e.at.end), 'thưởng');
    assert.deepEqual(e.replace, { start: 33, end: 50 });
    assert.equal(text.slice(e.replace.start, e.replace.end), 'thưởng chuyên cần');
    assert.equal(e.suggestionReplace.length, e.suggestions.length, 'một khoảng cho mỗi gợi ý');
    assert.ok(e.suggestions.length >= 1);
    assert.deepEqual(e.suggestionReplace[0], e.replace, 'khoảng của gợi ý đầu là replace');
    const fixed = apply(text, e.suggestionReplace[0], e.suggestions[0]);
    assert.equal(fixed, 'tổng thu nhập = tiền ngày công + chuyên cần');
    assert.equal(fixed.split('chuyên cần').length - 1, 1, 'không lặp chữ');
    const again = Formula.parse(fixed, { vocabulary });
    assert.equal(again.ok, true, JSON.stringify(again.errors));
  }
);

test(
  'suggestionReplace: mọi gợi ý, áp tại khoảng của chính nó, cho công thức không còn lỗi PARSE_UNKNOWN_WORD và không lặp chữ',
  opts,
  async () => {
    const Formula = await load();
    const vocabulary = starter();
    const text = 'tổng thu nhập = tiền ngày công + thưởng chuyên cần';
    const e = Formula.parse(text, { vocabulary }).errors[0];
    e.suggestions.forEach((label, i) => {
      const fixed = apply(text, e.suggestionReplace[i], label);
      const res = Formula.parse(fixed, { vocabulary });
      assert.ok(!(res.errors || []).some(x => x.code === 'PARSE_UNKNOWN_WORD'), `gợi ý ${i} (${label}): ${fixed}`);
      assert.equal(fixed.split(label).length - 1, 1, `gợi ý ${i}: nhãn "${label}" lặp trong "${fixed}"`);
    });
  }
);

test('suggestionReplace: chữ lạ đứng riêng ("KPO") thì replace trùng at', opts, async () => {
  const Formula = await load();
  const vocabulary = starter();
  const text = 'tổng thu nhập = tiền ngày công + KPO';
  const e = Formula.parse(text, { vocabulary }).errors.find(x => x.code === 'PARSE_UNKNOWN_WORD');
  assert.deepEqual(e.at, { start: 33, end: 36 });
  assert.deepEqual(e.replace, e.at);
  for (const span of e.suggestionReplace) assert.deepEqual(span, e.at);
  const fixed = apply(text, e.replace, e.suggestions[0]);
  assert.equal(Formula.parse(fixed, { vocabulary }).ok, true, fixed);
});

test(
  'suggestionReplace: nhãn đã biết nằm TRƯỚC chữ lạ ("chuyên cần thưởng"): at 44..50, replace 33..50',
  opts,
  async () => {
    const Formula = await load();
    const vocabulary = starter();
    const text = 'tổng thu nhập = tiền ngày công + chuyên cần thưởng';
    const e = Formula.parse(text, { vocabulary }).errors.find(x => x.code === 'PARSE_UNKNOWN_WORD');
    assert.deepEqual(e.at, { start: 44, end: 50 });
    assert.equal(text.slice(e.at.start, e.at.end), 'thưởng');
    assert.deepEqual(e.replace, { start: 33, end: 50 });
    const fixed = apply(text, e.suggestionReplace[0], e.suggestions[0]);
    assert.equal(fixed.split('chuyên cần').length - 1, 1, fixed);
    assert.equal(Formula.parse(fixed, { vocabulary }).ok, true, fixed);
  }
);

test('suggestionReplace: mọi khoảng nằm trong chữ, start ≤ end, và phủ chữ lạ', opts, async () => {
  const Formula = await load();
  const vocabulary = starter();
  for (const text of [
    'tổng thu nhập = tiền ngày công + thưởng chuyên cần',
    'tổng thu nhập = tiền ngày công + chuyên cần thưởng',
    'tổng thu nhập = tiền ngày công + KPO',
    'tổng thu nhập = thưởng + tiền ngày công'
  ]) {
    const e = Formula.parse(text, { vocabulary }).errors.find(x => x.code === 'PARSE_UNKNOWN_WORD');
    assert.ok(e, text);
    for (const span of [e.replace, ...e.suggestionReplace]) {
      assert.ok(Number.isInteger(span.start) && Number.isInteger(span.end), text);
      assert.ok(
        span.start >= 0 && span.start <= span.end && span.end <= text.length,
        `${text}: ${JSON.stringify(span)}`
      );
      assert.ok(span.start <= e.at.start && span.end >= e.at.end, `${text}: khoảng phải phủ chữ lạ`);
    }
  }
});

// ---------- 2. Đơn vị flag ----------

test('flag: dùng làm điều kiện của nếu, và, hoặc, không đều hợp lệ', opts, async () => {
  const Formula = await load();
  for (const text of [
    'khoản A = nếu ở iDorm thì LCB ngược lại 0',
    'khoản A = nếu không ở iDorm thì LCB ngược lại 0',
    'khoản A = nếu giữ được chuyên cần và không ở iDorm thì LCB ngược lại 0',
    'khoản A = nếu giữ được chuyên cần hoặc ở iDorm thì LCB ngược lại 0'
  ]) {
    const res = F.parseOk(Formula, text, FLAG_VOCAB);
    const v = Formula.validate(res.tree, { vocabulary: FLAG_VOCAB });
    assert.deepEqual(v.errors, [], text);
    assert.equal(v.ok, true, text);
  }
});

test('FORMULA_NOT_NUMERIC: flag trong phép cộng, nhân, hoặc so sánh số bị từ chối', opts, async () => {
  const Formula = await load();
  for (const text of [
    'khoản A = LCB + ở iDorm',
    'khoản A = LCB × ở iDorm',
    'khoản A = LCB - giữ được chuyên cần',
    'khoản A = nếu ở iDorm > 0 thì LCB ngược lại 0',
    'khoản A = nếu ở iDorm > LCB thì đi lại ngược lại 0'
  ]) {
    const out = F.checkAll(Formula, text, FLAG_VOCAB);
    assert.equal(out.ok, false, text);
    assert.ok(F.codesIn(out.errors).includes('FORMULA_NOT_NUMERIC'), `${text}: ${JSON.stringify(out.errors)}`);
    F.assertPositioned(out.errors, text);
  }
});

test(
  'flag: nhãn flag là một điều kiện, nhưng "nếu LCB thì ..." (điều kiện là số tiền) không được tính là cờ',
  opts,
  async () => {
    const Formula = await load();
    const out = F.checkAll(Formula, 'khoản A = nếu LCB thì đi lại ngược lại 0', FLAG_VOCAB);
    assert.equal(out.ok, false, 'điều kiện phải là cờ hoặc so sánh');
  }
);

test('flag: evaluate nhận true/false hoặc 1/0 từ hàm có sẵn kiểu flag', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = nếu ở iDorm thì LCB ngược lại 0';
  const run = (value?) =>
    F.evalText(Formula, text, { variables: { luongCoBan: 7 }, builtins: { idorm: () => value } }, FLAG_VOCAB);
  assert.equal(run(true), 7);
  assert.equal(run(false), 0);
  assert.equal(run(1), 7);
  assert.equal(run(0), 0);
  const both = 'khoản A = nếu giữ được chuyên cần và không ở iDorm thì LCB ngược lại 0';
  const runBoth = (giu?, idorm?) =>
    F.evalText(
      Formula,
      both,
      { variables: { luongCoBan: 7 }, builtins: { giuChuyenCan: () => giu, idorm: () => idorm } },
      FLAG_VOCAB
    );
  assert.equal(runBoth(1, 0), 7);
  assert.equal(runBoth(true, 1), 0);
  assert.equal(runBoth(0, 0), 0);
});

test(
  'flag: giá trị không phải true/false/0/1 (NaN, chuỗi, 2) từ hàm có sẵn kiểu flag là lỗi, không đoán',
  opts,
  async () => {
    const Formula = await load();
    const { tree } = F.parseOk(Formula, 'khoản A = nếu ở iDorm thì LCB ngược lại 0', FLAG_VOCAB);
    for (const bad of [NaN, 'có', null, undefined, {}]) {
      const code = F.evalErrorCode(
        Formula,
        tree,
        F.makeCtx({ variables: { luongCoBan: 7 }, builtins: { idorm: () => bad } })
      );
      assert.ok(code, `idorm trả ${String(bad)} phải là lỗi`);
    }
  }
);

test('count vẫn dùng làm điều kiện được (tương thích ngược với từ vựng cũ)', opts, async () => {
  const Formula = await load();
  assert.ok(
    STD_VOCAB.some(w => w.unit === 'count'),
    'STD_VOCAB vẫn khai count'
  );
  const res = F.parseOk(Formula, 'khoản A = nếu ở iDorm thì LCB ngược lại 0', STD_VOCAB);
  const v = Formula.validate(res.tree, { vocabulary: STD_VOCAB });
  assert.deepEqual(v.errors, []);
  assert.equal(
    F.evalText(Formula, 'khoản A = nếu ở iDorm thì LCB ngược lại 0', {
      variables: { luongCoBan: 5 },
      builtins: { idorm: () => true }
    }),
    5
  );
});

test('checkVocabulary chấp nhận đơn vị flag và vẫn từ chối đơn vị không có thật', opts, async () => {
  const Formula = await load();
  const entry = (unit?) => [{ key: 'coCo', label: 'có cờ', synonyms: [], kind: 'builtin', unit, domain: 'month' }];
  const ok = Formula.checkVocabulary(entry('flag'));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.errors, []);
  const bad = Formula.checkVocabulary(entry('banana'));
  assert.equal(bad.ok, false);
});

test(
  'Từ vựng khởi đầu: ở iDorm và giữ được chuyên cần là flag, và toàn bộ từ vựng qua checkVocabulary',
  opts,
  async () => {
    const Formula = await load();
    const vocabulary = starter();
    for (const key of ['idorm', 'giuChuyenCan']) assert.equal(vocabulary.find(w => w.key === key).unit, 'flag', key);
    const check = Formula.checkVocabulary(vocabulary);
    assert.equal(check.ok, true, JSON.stringify(check.errors));
  }
);

// ---------- 3. units theo đường dẫn ----------

test('units: ví dụ phụ cấp đi lại cho đúng năm đơn vị theo đường dẫn', opts, async () => {
  const Formula = await load();
  const vocabulary = starter();
  const text =
    'phụ cấp đi lại = nếu ở iDorm thì 0 ngược lại lương cơ bản của level × tỷ lệ đi lại NV × (ngày đi làm ÷ ngày công chuẩn)';
  const res = F.parseOk(Formula, text, vocabulary);
  const v = Formula.validate(res.tree, { vocabulary });
  assert.deepEqual(v.errors, []);
  assert.equal(v.units['cây.if'], 'flag');
  assert.equal(v.units['cây.then'], 'any');
  assert.equal(v.units['cây.else.a.a'], 'VND');
  assert.equal(v.units['cây.else'], 'VND');
  assert.equal(v.units['cây'], 'VND');
  assert.equal(v.units['cây.else.b'], 'ratio', 'ngày ÷ ngày là tỷ lệ');
});

test('units: khoá là đường dẫn như path của lỗi; chỉ số hàm dạng args[0]', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'khoản A = nhỏ nhất của (LCB ; đi lại)');
  const v = Formula.validate(res.tree, { vocabulary: STD_VOCAB });
  assert.deepEqual(v.units, { 'cây.args[0]': 'VND', 'cây.args[1]': 'VND', cây: 'VND' });
});

test('units: mọi giá trị là chuỗi đơn vị hợp lệ và gốc "cây" luôn có khi cây hợp lệ', opts, async () => {
  const Formula = await load();
  const KNOWN = /^(VND|hour|day|ratio|count|any|flag|percent|VND\/day|VND\/hour|[A-Za-z]+(\/[A-Za-z]+)?)$/;
  for (const text of [
    'khoản A = LCB + đi lại',
    'khoản A = LCB × tỷ lệ đi lại',
    'khoản A = -LCB',
    'khoản A = nếu giữ được chuyên cần thì LCB ngược lại 0'
  ]) {
    const res = F.parseOk(Formula, text, FLAG_VOCAB);
    const v = Formula.validate(res.tree, { vocabulary: FLAG_VOCAB });
    assert.equal(v.ok, true, text);
    assert.ok(v.units['cây'], `${text}: thiếu đơn vị gốc`);
    for (const [path, unit] of Object.entries<any>(v.units)) {
      assert.match(path, /^cây(\.[A-Za-z]+(\[\d+\])?)*$/, path);
      assert.match(unit, KNOWN, `${text}: ${path} → ${unit}`);
    }
  }
});

test('units: tiền ÷ ngày là VND/day trên nút chia', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'khoản A = LCB ÷ ngày công chuẩn × ngày đi làm');
  const v = Formula.validate(res.tree, { vocabulary: STD_VOCAB });
  assert.equal(v.units['cây'], 'VND');
  assert.match(v.units['cây.a'], /day/, 'nút chia mang đơn vị theo ngày');
  assert.equal(v.units['cây.a.a'], 'VND');
});

test(
  'units: lỗi đơn vị vẫn trả units của các nút đã biết (đường dẫn của lỗi nằm trong units hoặc là cha của nút có đơn vị)',
  opts,
  async () => {
    const Formula = await load();
    const res = F.parseOk(Formula, 'khoản A = LCB + giờ vượt ngưỡng');
    const v = Formula.validate(res.tree, { vocabulary: STD_VOCAB });
    assert.equal(v.ok, false);
    assert.equal(v.units['cây.a'], 'VND');
    assert.equal(v.units['cây.b'], 'hour');
    assert.ok(v.errors.every(e => typeof e.path === 'string' && e.path.startsWith('cây')));
  }
);

test('units: validate sớm thất bại (cây rỗng, nút lạ) trả units rỗng', opts, async () => {
  const Formula = await load();
  for (const bad of [null, undefined, {}, 'abc', 5]) {
    const v = Formula.validate(bad, { vocabulary: STD_VOCAB });
    assert.equal(v.ok, false);
    assert.deepEqual(v.units, {}, `đầu vào ${String(bad)}`);
  }
});

test('units: tính xác định và không đổi sau serialize/deserialize', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(
    Formula,
    'khoản A = nếu giữ được chuyên cần thì LCB × tỷ lệ chuyên cần ngược lại 0',
    FLAG_VOCAB
  );
  const first = JSON.stringify(Formula.validate(tree, { vocabulary: FLAG_VOCAB }).units);
  assert.equal(JSON.stringify(Formula.validate(tree, { vocabulary: FLAG_VOCAB }).units), first);
  const loaded = Formula.deserialize(Formula.serialize(tree));
  assert.equal(JSON.stringify(Formula.validate(loaded, { vocabulary: FLAG_VOCAB }).units), first);
});
