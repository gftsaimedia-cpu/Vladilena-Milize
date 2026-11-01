'use strict';
// Bộ kiểm công thức: src/engine/formula.ts → Formula.validate.
// Kiểm: đơn vị, miền (ngày hay tháng), chia cho 0, vòng, khoá, thành phần bắt buộc, giới hạn kích thước.
// Luật có thể báo lỗi ở bước phân tích hoặc bước kiểm thì dùng checkAll = phân tích rồi kiểm, gộp lỗi.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/formula-fixture');

const { STD_VOCAB } = F;
const opts = F.READY();
const load = F.loadFormula;

// Hàm kiểm: phân tích phải ok (câu hợp văn phạm), rồi trả kết quả validate
const validateText = (Formula?, text?, extra: any = {}) => {
  const res = F.parseOk(Formula, text, STD_VOCAB, extra);
  return { res, v: Formula.validate(res.tree, { vocabulary: STD_VOCAB, ...extra }) };
};
const SIX = 'tiền ngày công + phụ cấp ca + giờ nghỉ đêm + làm bù + tiền OT + làm lễ';

// ---------- Đơn vị ----------

test('FORMULA_UNIT_MISMATCH: tiền (VND) cộng giờ là lỗi, có vị trí', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = lương cơ bản + giờ vượt ngưỡng';
  const { v } = validateText(Formula, text);
  assert.equal(v.ok, false);
  assert.ok(F.codesIn(v.errors).includes('FORMULA_UNIT_MISMATCH'), JSON.stringify(v));
  F.assertPositioned(v.errors, text);
});

test('FORMULA_UNIT_MISMATCH: tiền trừ ngày, ngày cộng tiền, tiền × tiền đều là lỗi', opts, async () => {
  const Formula = await load();
  for (const text of [
    'khoản A = lương cơ bản - ngày đi làm',
    'khoản A = ngày đi làm + lương cơ bản',
    'khoản A = lương cơ bản × tiền ngày công + đi lại'
  ]) {
    const { v } = validateText(Formula, text);
    assert.equal(v.ok, false, text);
    assert.ok(F.codesIn(v.errors).includes('FORMULA_UNIT_MISMATCH'), `${text}: ${JSON.stringify(v.errors)}`);
  }
});

test('Tiền × tỷ lệ phần trăm ra tiền: cộng thêm một khoản tiền thì hợp lệ', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = lương cơ bản × tỷ lệ đi lại + tiền ngày công');
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
});

test('Tiền ÷ ngày ra "tiền mỗi ngày": cộng với tiền thường là lỗi, nhân lại với ngày thì ra tiền', opts, async () => {
  const Formula = await load();
  const bad = validateText(Formula, 'khoản A = lương cơ bản ÷ ngày công chuẩn + tiền ngày công');
  assert.equal(bad.v.ok, false);
  assert.ok(F.codesIn(bad.v.errors).includes('FORMULA_UNIT_MISMATCH'), JSON.stringify(bad.v.errors));
  const good = validateText(Formula, 'khoản A = lương cơ bản ÷ ngày công chuẩn × ngày đi làm + tiền ngày công');
  assert.deepEqual(good.v.errors, []);
  assert.equal(good.v.ok, true);
});

test('Ngày ÷ ngày ra tỷ lệ: tiền × (ngày ÷ ngày) ra tiền, cộng được với tiền', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = lương cơ bản × (ngày đi làm ÷ ngày công chuẩn) + tiền ngày công');
  assert.deepEqual(v.errors, []);
});

test('Số 0 và 1 viết thẳng không mang đơn vị nên cộng được với bất kỳ đơn vị nào', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = lương cơ bản + 0');
  assert.deepEqual(v.errors, []);
});

test('Điều kiện: hai nhánh nếu/ngược lại khác đơn vị là lỗi', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = nếu giữ được chuyên cần thì lương cơ bản ngược lại giờ vượt ngưỡng');
  assert.equal(v.ok, false);
  assert.ok(F.codesIn(v.errors).includes('FORMULA_UNIT_MISMATCH'), JSON.stringify(v.errors));
});

test('Điều kiện: so sánh giờ với tiền là lỗi đơn vị', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = nếu giờ vượt ngưỡng > lương cơ bản thì đi lại ngược lại 0');
  assert.equal(v.ok, false);
  assert.ok(F.codesIn(v.errors).includes('FORMULA_UNIT_MISMATCH'), JSON.stringify(v.errors));
});

test('Hàm min/max: các đối số cùng đơn vị hợp lệ, khác đơn vị là lỗi', opts, async () => {
  const Formula = await load();
  assert.deepEqual(validateText(Formula, 'khoản A = nhỏ nhất của (lương cơ bản ; đi lại)').v.errors, []);
  const bad = validateText(Formula, 'khoản A = nhỏ nhất của (lương cơ bản ; giờ vượt ngưỡng)').v;
  assert.equal(bad.ok, false);
  assert.ok(F.codesIn(bad.errors).includes('FORMULA_UNIT_MISMATCH'));
});

// ---------- Miền ngày / tháng ----------

test('FORMULA_DOMAIN_MIXED: biến theo ngày dùng ngoài "tổng theo ngày (...)" là lỗi', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = tiền ca trong ngày + lương cơ bản';
  const { v } = validateText(Formula, text);
  assert.equal(v.ok, false);
  assert.ok(F.codesIn(v.errors).includes('FORMULA_DOMAIN_MIXED'), JSON.stringify(v.errors));
  F.assertPositioned(v.errors, text);
  assert.match(JSON.stringify(v.errors), /tienCaNgay|tiền ca trong ngày/, 'nói rõ biến nào theo ngày');
});

test('Biến theo ngày đặt trong "tổng theo ngày (...)" thì hợp lệ', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = tổng theo ngày (tiền ca trong ngày) + lương cơ bản');
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
});

test(
  'Biến theo ngày nhân với tham số theo tháng bên trong "tổng theo ngày (...)" không bị báo lẫn miền',
  opts,
  async () => {
    const Formula = await load();
    const res = F.parseOk(Formula, 'khoản A = tổng theo ngày (tiền ca trong ngày × tỷ lệ đi lại) + lương cơ bản');
    const v = Formula.validate(res.tree, { vocabulary: STD_VOCAB });
    assert.ok(!F.codesIn(v.errors).includes('FORMULA_DOMAIN_MIXED'), JSON.stringify(v.errors));
  }
);

// ---------- Chia cho 0 ----------

test('Chia cho số 0 viết thẳng bị chặn tĩnh khi kiểm (FORMULA_DIV_ZERO_POSSIBLE)', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = lương cơ bản ÷ 0';
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(
    F.codesIn(out.errors).some(c => /^FORMULA_DIV_ZERO/.test(c)),
    JSON.stringify(out.errors)
  );
  F.assertPositioned(out.errors, text);
});

test('Chia cho biến hợp lệ (ngày công chuẩn) không bị chặn tĩnh', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = lương cơ bản ÷ ngày công chuẩn × ngày đi làm');
  assert.deepEqual(v.errors, []);
});

// ---------- Vòng, tự tham chiếu ----------

test('FORMULA_CYCLE: A dùng B, B dùng A, kèm đường vòng', opts, async () => {
  const Formula = await load();
  const a = F.parseOk(Formula, 'khoản A = khoản B + lương cơ bản').tree;
  const b = F.parseOk(Formula, 'khoản B = khoản A + đi lại').tree;
  const v = Formula.validate(a, { vocabulary: STD_VOCAB, formulas: { khoanA: a, khoanB: b } });
  assert.equal(v.ok, false);
  const cycle = v.errors.find(e => e.code === 'FORMULA_CYCLE');
  assert.ok(cycle, JSON.stringify(v.errors));
  const blob = JSON.stringify(cycle);
  assert.match(blob, /khoanA|khoản A/);
  assert.match(blob, /khoanB|khoản B/);
});

test('FORMULA_CYCLE: kiểm công thức còn lại của vòng cũng báo vòng (không phụ thuộc thứ tự kiểm)', opts, async () => {
  const Formula = await load();
  const a = F.parseOk(Formula, 'khoản A = khoản B + lương cơ bản').tree;
  const b = F.parseOk(Formula, 'khoản B = khoản A + đi lại').tree;
  const v = Formula.validate(b, { vocabulary: STD_VOCAB, formulas: { khoanA: a, khoanB: b } });
  assert.ok(F.codesIn(v.errors).includes('FORMULA_CYCLE'), JSON.stringify(v.errors));
});

test('FORMULA_CYCLE: vòng ba công thức A → B → C → A', opts, async () => {
  const Formula = await load();
  const vocabulary = [...STD_VOCAB, F.word('khoanC', 'khoản C', 'VND', 'month', { kind: 'formula' })];
  const a = F.parseOk(Formula, 'khoản A = khoản B + 0', vocabulary).tree;
  const b = F.parseOk(Formula, 'khoản B = khoản C + 0', vocabulary).tree;
  const c = F.parseOk(Formula, 'khoản C = khoản A + 0', vocabulary).tree;
  const v = Formula.validate(a, { vocabulary, formulas: { khoanA: a, khoanB: b, khoanC: c } });
  assert.ok(F.codesIn(v.errors).includes('FORMULA_CYCLE'), JSON.stringify(v.errors));
});

test('FORMULA_CYCLE: công thức tự tham chiếu chính nó (khoản A = khoản A + …)', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = khoản A + lương cơ bản';
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  // phân tích đã chặn thì thôi; nếu qua phân tích thì kiểm phải thấy vòng khi công thức nằm trong tập formulas
  if (out.stage === 'validate') {
    const tree = out.res.tree;
    const v = Formula.validate(tree, { vocabulary: STD_VOCAB, formulas: { khoanA: tree } });
    assert.ok(F.codesIn(v.errors).includes('FORMULA_CYCLE'), JSON.stringify(v.errors));
  } else {
    assert.ok(
      F.codesIn(out.errors).some(c => c === 'FORMULA_CYCLE' || /^PARSE_/.test(c)),
      JSON.stringify(out.errors)
    );
  }
});

test('Đồ thị không vòng (A dùng B, B dùng biến) hợp lệ và dependencies đi theo tham chiếu', opts, async () => {
  const Formula = await load();
  const b = F.parseOk(Formula, 'khoản B = lương cơ bản + đi lại').tree;
  const a = F.parseOk(Formula, 'khoản A = khoản B + tiền ngày công').tree;
  const v = Formula.validate(a, { vocabulary: STD_VOCAB, formulas: { khoanB: b } });
  assert.deepEqual(v.errors, []);
  assert.ok(Formula.dependencies(a).includes('khoanB'));
});

// ---------- Hàm có sẵn bị khoá ----------

test('Gán vào hàm có sẵn bị khoá (thuế TNCN = …) bị từ chối', opts, async () => {
  const Formula = await load();
  for (const text of ['thuế TNCN = lương cơ bản', 'tiền OT = lương cơ bản + đi lại']) {
    const out = F.checkAll(Formula, text);
    assert.equal(out.ok, false, `${text} phải bị từ chối (đã nhận stage ${out.stage})`);
    assert.ok(out.errors.length >= 1);
    assert.ok(
      out.errors.every(e => /^(PARSE|FORMULA)_/.test(e.code)),
      JSON.stringify(out.errors)
    );
    F.assertPositioned(out.errors, text);
  }
});

test('Hàm có sẵn dùng được ở vế phải (công thức gọi, không sửa)', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = lương cơ bản + tiền OT');
  assert.deepEqual(v.errors, []);
});

// ---------- Thành phần bắt buộc của tổng thu nhập ----------

test('Tổng thu nhập đủ sáu thành phần ngày (cộng đi lại, chuyên cần, KPI) hợp lệ', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, `tổng thu nhập = ${SIX} + đi lại + chuyên cần + lương KPI`);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
});

test('FORMULA_MISSING_REQUIRED: bỏ OT khỏi tổng thu nhập là lỗi và nói rõ thiếu OT', opts, async () => {
  const Formula = await load();
  const text = 'tổng thu nhập = tiền ngày công + phụ cấp ca + giờ nghỉ đêm + làm bù + làm lễ + đi lại';
  const { v } = validateText(Formula, text);
  assert.equal(v.ok, false);
  const missing = v.errors.find(e => e.code === 'FORMULA_MISSING_REQUIRED');
  assert.ok(missing, JSON.stringify(v.errors));
  assert.match(JSON.stringify(missing), /tienOt|tiền OT|OT/);
});

test('FORMULA_MISSING_REQUIRED: bỏ nhiều thành phần thì báo đủ tất cả thành phần thiếu', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'tổng thu nhập = tiền ngày công + đi lại + chuyên cần + lương KPI');
  const blob = JSON.stringify(v.errors.filter(e => e.code === 'FORMULA_MISSING_REQUIRED'));
  for (const key of ['phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe'])
    assert.match(blob, new RegExp(key + '|' + STD_VOCAB.find(w => w.key === key).label), `thiếu ${key} trong lỗi`);
});

test(
  'Ví dụ của chủ dự án: tổng thu nhập = tiền ngày công + đi lại + chuyên cần + lương KPI phân tích được nhưng không lưu được',
  opts,
  async () => {
    const Formula = await load();
    const { v } = validateText(Formula, 'Tổng thu nhập = tiền ngày công + đi lại + chuyên cần + lương KPI');
    assert.equal(v.ok, false);
    assert.ok(F.codesIn(v.errors).includes('FORMULA_MISSING_REQUIRED'));
  }
);

test('Thành phần bắt buộc chỉ áp cho tổng thu nhập: khoản A thiếu OT vẫn hợp lệ', opts, async () => {
  const Formula = await load();
  const { v } = validateText(Formula, 'khoản A = tiền ngày công + đi lại');
  assert.ok(!F.codesIn(v.errors).includes('FORMULA_MISSING_REQUIRED'), JSON.stringify(v.errors));
});

test(
  'Thành phần bắt buộc nằm ở đồ thị: tổng thu nhập gồm khoản A, khoản A chứa đủ sáu thành phần thì hợp lệ',
  opts,
  async () => {
    const Formula = await load();
    const a = F.parseOk(Formula, `khoản A = ${SIX}`).tree;
    const total = F.parseOk(Formula, 'tổng thu nhập = khoản A + đi lại').tree;
    const v = Formula.validate(total, { vocabulary: STD_VOCAB, formulas: { khoanA: a } });
    assert.deepEqual(v.errors, [], 'FormulaRef cũng tính là chứa thành phần');
  }
);

// MỖI thành phần bắt buộc phải được cộng NGUYÊN VẸN vào tổng cấp cao nhất của đích, đúng một lần
// (hệ số 1, cộng không trừ, không nằm trong nếu/thì, không nhân chia hay bọc trong hàm; đệ quy qua công thức có tên). Vi phạm là
// FORMULA_REQUIRED_NOT_WHOLE (at trên chỗ xuất hiện, component = khoá); cộng nguyên vẹn nhiều hơn một lần là FORMULA_REQUIRED_DUPLICATE (at ở lần thứ hai);
// vắng hẳn vẫn là FORMULA_MISSING_REQUIRED.
const PARTS = ['tiền ngày công', 'phụ cấp ca', 'giờ nghỉ đêm', 'làm bù', 'tiền OT', 'làm lễ'];
// Tổng thu nhập dựng từ danh sách số hạng (chuỗi); mặc định đủ sáu thành phần nguyên vẹn
const totalOf = (terms = PARTS) => 'tổng thu nhập = ' + terms.join(' + ');
const without = (label?) => PARTS.filter(x => x !== label);
const errorsOf = (Formula?, text?, extra: any = {}) => {
  const { v } = validateText(Formula, text, extra);
  return v.errors;
};
const byCode = (errors?, code?) => errors.filter(e => e.code === code);
const sliceOf = (text?, e?) => text.slice(e.at.start, e.at.end);

test(
  'Q8: dạng nguyên vẹn (cộng cả sáu thành phần một lần) hợp lệ, không có lỗi NOT_WHOLE hay DUPLICATE',
  opts,
  async () => {
    const Formula = await load();
    assert.deepEqual(errorsOf(Formula, totalOf()), []);
    assert.deepEqual(errorsOf(Formula, totalOf([...PARTS, 'đi lại', 'chuyên cần', 'lương KPI'])), []);
  }
);

test(
  'Q8: tiền OT × 0 không tính là còn thành phần OT: FORMULA_REQUIRED_NOT_WHOLE, component tienOt, at trên chỗ "tiền OT"',
  opts,
  async () => {
    const Formula = await load();
    const text = totalOf([...without('tiền OT'), 'tiền OT × 0']);
    const errors = errorsOf(Formula, text);
    const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE');
    assert.equal(hit.length, 1, JSON.stringify(errors));
    assert.equal(hit[0].component, 'tienOt');
    assert.match(sliceOf(text, hit[0]), /tiền OT/);
    F.assertPositioned(hit, text);
    assert.deepEqual(
      byCode(errors, 'FORMULA_MISSING_REQUIRED'),
      [],
      'có mặt nhưng không nguyên vẹn, không phải vắng hẳn'
    );
  }
);

test('Q8: tiền OT × 2 (nhân hệ số khác 1) là NOT_WHOLE', opts, async () => {
  const Formula = await load();
  const text = totalOf([...without('tiền OT'), 'tiền OT × 2']);
  const errors = errorsOf(Formula, text);
  const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE');
  assert.equal(hit.length, 1, JSON.stringify(errors));
  assert.equal(hit[0].component, 'tienOt');
  assert.match(sliceOf(text, hit[0]), /tiền OT/);
});

test(
  'Q8: chia, nhân hai phía, nhân chính nó, bọc trong hàm hoặc dấu trừ một ngôi cũng là NOT_WHOLE',
  opts,
  async () => {
    const Formula = await load();
    for (const form of [
      'tiền OT ÷ 2',
      '2 × tiền OT',
      'tiền OT × tiền OT',
      'lớn nhất của (tiền OT ; tiền OT)',
      '-tiền OT'
    ]) {
      const text = totalOf([...without('tiền OT'), form]);
      const errors = errorsOf(Formula, text);
      const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE').filter(e => e.component === 'tienOt');
      assert.ok(hit.length >= 1, `${form}: ${JSON.stringify(errors)}`);
    }
  }
);

test('Q8: trừ thành phần (… - tiền OT) là NOT_WHOLE, không phải vắng hẳn', opts, async () => {
  const Formula = await load();
  const text = 'tổng thu nhập = ' + without('tiền OT').join(' + ') + ' - tiền OT';
  const errors = errorsOf(Formula, text);
  const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE');
  assert.equal(hit.length, 1, JSON.stringify(errors));
  assert.equal(hit[0].component, 'tienOt');
  assert.match(sliceOf(text, hit[0]), /tiền OT/);
  assert.deepEqual(byCode(errors, 'FORMULA_MISSING_REQUIRED'), []);
});

test(
  'Q8: tiền OT nằm trong nếu/thì (… + (nếu ở iDorm thì tiền OT ngược lại 0)) là NOT_WHOLE; không đặt ngoặc thì sai văn phạm (PARSE_EXPECTED_OPERAND)',
  opts,
  async () => {
    const Formula = await load();
    const text = totalOf([...without('tiền OT'), '(nếu ở iDorm thì tiền OT ngược lại 0)']);
    const errors = errorsOf(Formula, text);
    const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE');
    assert.equal(hit.length, 1, JSON.stringify(errors));
    assert.equal(hit[0].component, 'tienOt');
    assert.match(sliceOf(text, hit[0]), /tiền OT/);
  }
);

test('Q8: tiền OT bọc trong hàm (… + nhỏ nhất của (tiền OT ; 1.000.000)) là NOT_WHOLE', opts, async () => {
  const Formula = await load();
  const text = totalOf([...without('tiền OT'), 'nhỏ nhất của (tiền OT ; 1.000.000)']);
  const errors = errorsOf(Formula, text);
  const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE');
  assert.equal(hit.length, 1, JSON.stringify(errors));
  assert.equal(hit[0].component, 'tienOt');
  assert.match(sliceOf(text, hit[0]), /tiền OT/);
});

test('Q8: nhóm cùng phép cộng (… + (tiền OT + đi lại)) vẫn là cộng nguyên vẹn, hợp lệ', opts, async () => {
  const Formula = await load();
  assert.deepEqual(errorsOf(Formula, totalOf([...without('tiền OT'), '(tiền OT + đi lại)'])), []);
  assert.deepEqual(errorsOf(Formula, totalOf([...without('tiền OT'), '(đi lại + (tiền OT + chuyên cần))'])), []);
});

test('Q8: nhóm đổi phép (nhân) quanh tổng chứa OT là NOT_WHOLE', opts, async () => {
  const Formula = await load();
  const text = totalOf([...without('tiền OT'), '(tiền OT + đi lại) × 2']);
  const hit = byCode(errorsOf(Formula, text), 'FORMULA_REQUIRED_NOT_WHOLE');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].component, 'tienOt');
});

test(
  'Q8: thành phần đi qua công thức có tên: cộng nguyên vẹn công thức đó hợp lệ; nhân, chia hay trừ công thức đó là NOT_WHOLE tại chỗ tham chiếu',
  opts,
  async () => {
    const Formula = await load();
    const named = F.parseOk(Formula, 'khoản B = tiền OT + đi lại').tree;
    const formulas = { khoanB: named };
    assert.deepEqual(errorsOf(Formula, totalOf([...without('tiền OT'), 'khoản B']), { formulas }), []);
    for (const form of ['khoản B × 2', 'khoản B ÷ 2', '(khoản B × 2)']) {
      const text = totalOf([...without('tiền OT'), form]);
      const errors = errorsOf(Formula, text, { formulas });
      const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE').filter(e => e.component === 'tienOt');
      assert.ok(hit.length >= 1, `${form}: ${JSON.stringify(errors)}`);
      assert.match(sliceOf(text, hit[0]), /khoản B/, `${form}: at phải trên chỗ tham chiếu`);
    }
    const sub = 'tổng thu nhập = ' + without('tiền OT').join(' + ') + ' - khoản B';
    const subErrors = errorsOf(Formula, sub, { formulas });
    assert.ok(
      byCode(subErrors, 'FORMULA_REQUIRED_NOT_WHOLE').some(e => e.component === 'tienOt'),
      JSON.stringify(subErrors)
    );
  }
);

test('Q8: công thức có tên chứa thành phần đã bị nhân bên trong thì dùng nó cũng là NOT_WHOLE', opts, async () => {
  const Formula = await load();
  const scaled = F.parseOk(Formula, 'khoản B = tiền OT × 2').tree;
  const text = totalOf([...without('tiền OT'), 'khoản B']);
  const errors = errorsOf(Formula, text, { formulas: { khoanB: scaled } });
  const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE').filter(e => e.component === 'tienOt');
  assert.ok(hit.length >= 1, JSON.stringify(errors));
});

test('Q8: vắng hẳn một thành phần vẫn là FORMULA_MISSING_REQUIRED (không phải NOT_WHOLE)', opts, async () => {
  const Formula = await load();
  const errors = errorsOf(Formula, totalOf(without('tiền OT')));
  assert.ok(byCode(errors, 'FORMULA_MISSING_REQUIRED').length >= 1);
  assert.deepEqual(byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE'), []);
  assert.match(JSON.stringify(byCode(errors, 'FORMULA_MISSING_REQUIRED')), /tienOt|tiền OT/);
});

test(
  'FORMULA_REQUIRED_DUPLICATE: cộng nguyên vẹn tiền OT hai lần (… + tiền OT + tiền OT) báo ở lần thứ hai, component tienOt',
  opts,
  async () => {
    const Formula = await load();
    const text = totalOf([...PARTS, 'tiền OT']);
    const errors = errorsOf(Formula, text);
    const dup = byCode(errors, 'FORMULA_REQUIRED_DUPLICATE');
    assert.equal(dup.length, 1, JSON.stringify(errors));
    assert.equal(dup[0].component, 'tienOt');
    assert.equal(dup[0].at.start, text.lastIndexOf('tiền OT'), 'at ở lần xuất hiện thứ hai');
    assert.equal(sliceOf(text, dup[0]), 'tiền OT');
    F.assertPositioned(dup, text);
    assert.deepEqual(byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE'), []);
  }
);

test('FORMULA_REQUIRED_DUPLICATE: bản sao thứ hai qua công thức có tên báo ở chỗ tham chiếu', opts, async () => {
  const Formula = await load();
  const named = F.parseOk(Formula, 'khoản B = tiền OT').tree;
  const text = totalOf([...PARTS, 'khoản B']);
  const errors = errorsOf(Formula, text, { formulas: { khoanB: named } });
  const dup = byCode(errors, 'FORMULA_REQUIRED_DUPLICATE');
  assert.equal(dup.length, 1, JSON.stringify(errors));
  assert.equal(dup[0].component, 'tienOt');
  assert.equal(sliceOf(text, dup[0]), 'khoản B');
  // cả hai bản đều đi qua công thức có tên (hai tham chiếu khác nhau): vẫn trùng, báo ở tham chiếu thứ hai
  const other = F.parseOk(Formula, 'khoản A = tiền OT').tree;
  const twice = totalOf([...without('tiền OT'), 'khoản A', 'khoản B']);
  const twiceErrors = errorsOf(Formula, twice, { formulas: { khoanB: named, khoanA: other } });
  const second = byCode(twiceErrors, 'FORMULA_REQUIRED_DUPLICATE');
  assert.equal(second.length, 1, JSON.stringify(twiceErrors));
  assert.equal(sliceOf(twice, second[0]), 'khoản B');
});

test(
  'Một bản nguyên vẹn cộng một bản bị trừ (… - tiền OT + tiền OT) là NOT_WHOLE ở bản bị trừ, KHÔNG phải trùng',
  opts,
  async () => {
    const Formula = await load();
    const text = 'tổng thu nhập = ' + without('tiền OT').join(' + ') + ' - tiền OT + tiền OT';
    const errors = errorsOf(Formula, text);
    assert.deepEqual(byCode(errors, 'FORMULA_REQUIRED_DUPLICATE'), [], JSON.stringify(errors));
    const hit = byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE');
    assert.equal(hit.length, 1, JSON.stringify(errors));
    assert.equal(hit[0].component, 'tienOt');
    assert.equal(hit[0].at.start, text.indexOf('tiền OT'), 'at ở bản bị trừ (lần xuất hiện đầu)');
    assert.ok(hit[0].at.start < text.lastIndexOf('tiền OT'));
  }
);

test(
  'Q8 chỉ áp cho đích có thành phần bắt buộc: khoản A chứa tiền OT × 2 hay nhiều lần không bị báo',
  opts,
  async () => {
    const Formula = await load();
    const errors = errorsOf(Formula, 'khoản A = tiền OT × 2 + tiền OT + tiền OT');
    assert.deepEqual(byCode(errors, 'FORMULA_REQUIRED_NOT_WHOLE'), []);
    assert.deepEqual(byCode(errors, 'FORMULA_REQUIRED_DUPLICATE'), []);
  }
);

// ---------- Giới hạn kích thước (mặc định: 200 nút, sâu 12, chữ 2000, bảng bậc 10 hàng) ----------

test('FORMULA_TOO_LARGE: chữ dài hơn 2000 ký tự bị từ chối', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = lương cơ bản' + ' + 0'.repeat(600);
  assert.ok(text.length > 2000);
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

test('FORMULA_TOO_LARGE: hơn 200 nút (hàm lớn nhất của 250 đối số LCB, nông nhưng rộng)', opts, async () => {
  const Formula = await load();
  const args = Array.from({ length: 250 }, () => 'LCB').join(' ; ');
  const text = `khoản A = lớn nhất của (${args})`;
  assert.ok(text.length <= 2000, 'giữ dưới giới hạn chữ để chỉ thử giới hạn số nút');
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

// Quy tắc độ sâu: một chuỗi cùng một phép kết hợp (+ hoặc ×) tính là MỘT tầng, để Admin thêm khoản
// vào tổng thu nhập không bao giờ chạm giới hạn ngầm. Lồng thật (ngoặc đổi phép, hàm, nếu/thì, so sánh, dấu trừ một ngôi) vẫn tính từng tầng;
// giới hạn 200 nút vẫn chặn chuỗi quá dài.
test('FORMULA_TOO_LARGE: lồng thật sâu hơn 12 tầng nhưng ít nút (hàm lồng hàm, 20 tầng)', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = ' + 'nhỏ nhất của (LCB ; '.repeat(20) + 'đi lại' + ')'.repeat(20);
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

test('FORMULA_TOO_LARGE: lồng thật bằng nếu/thì/ngược lại 20 tầng', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = ' + 'nếu ở iDorm thì LCB ngược lại ('.repeat(20) + 'đi lại' + ')'.repeat(20);
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

test('FORMULA_TOO_LARGE: lồng thật bằng ngoặc đổi phép (× rồi + rồi × ...) 20 tầng', opts, async () => {
  const Formula = await load();
  // đơn vị có thể sai nhưng lỗi độ sâu phải có mặt
  let text = 'đi lại';
  for (let i = 0; i < 20; i++) text = i % 2 === 0 ? `LCB × (${text})` : `LCB + (${text})`;
  const out = F.checkAll(Formula, 'khoản A = ' + text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

test('FORMULA_TOO_LARGE: chuỗi cùng phép + vượt 200 nút vẫn bị chặn bởi giới hạn số nút', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = LCB' + ' + LCB'.repeat(250);
  assert.ok(text.length <= 2000);
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

test('Tổng 13 và 30 số hạng tiền cùng phép + hợp lệ (một chuỗi là một tầng)', opts, async () => {
  const Formula = await load();
  for (const n of [13, 30]) {
    const terms = Array.from({ length: n }, (_, i) => (i % 2 ? 'đi lại' : 'LCB')).join(' + ');
    const out = F.checkAll(Formula, 'khoản A = ' + terms);
    assert.equal(out.ok, true, n + ' số hạng: ' + JSON.stringify(out.errors));
    assert.deepEqual(out.errors, []);
  }
});

test('Chuỗi nhân 30 nhân tố cùng phép × cũng chỉ là một tầng (không bị báo sâu)', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = LCB' + ' × tỷ lệ đi lại'.repeat(29);
  const res = F.parseOk(Formula, text);
  const v = Formula.validate(res.tree, { vocabulary: STD_VOCAB });
  assert.ok(!F.codesIn(v.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(v.errors));
});

test('Tổng thu nhập thật đủ sáu thành phần cộng 20 khoản tuỳ chỉnh vẫn lưu được', opts, async () => {
  const Formula = await load();
  const extra = Array.from({ length: 20 }, (_, i) => F.word('khoanX' + i, 'khoản X' + i, 'VND', 'month'));
  const vocabulary = [...STD_VOCAB, ...extra];
  const text = 'tổng thu nhập = ' + SIX + ' + đi lại + chuyên cần + lương KPI + ' + extra.map(w => w.label).join(' + ');
  const res = F.parseOk(Formula, text, vocabulary);
  const v = Formula.validate(res.tree, { vocabulary });
  assert.deepEqual(v.errors, []);
});

test(
  'Ngoặc lồng cùng phép + 30 lớp theo hướng phải (đi lại + (LCB + (đi lại + ...))) cũng là một tầng',
  opts,
  async () => {
    const Formula = await load();
    let right = 'LCB';
    for (let i = 0; i < 29; i++) right = (i % 2 ? 'LCB' : 'đi lại') + ' + (' + right + ')';
    const out = F.checkAll(Formula, 'khoản A = ' + right);
    assert.equal(out.ok, true, JSON.stringify(out.errors).slice(0, 300));
  }
);

test(
  'Ngoặc dư không tính là tầng: 30 lớp ngoặc quanh một biến, hoặc quanh nhóm cùng phép +, vẫn hợp lệ',
  opts,
  async () => {
    const Formula = await load();
    const text = 'khoản A = ' + '('.repeat(30) + 'lương cơ bản' + ')'.repeat(30);
    const out = F.checkAll(Formula, text);
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    // nhóm cùng phép: ((((LCB + đi lại) + LCB) + đi lại) + ...) và đi lại + (LCB + (đi lại + (...)))
    let left = 'LCB';
    for (let i = 0; i < 29; i++) left = '(' + left + ' + ' + (i % 2 ? 'LCB' : 'đi lại') + ')';
    assert.equal(F.checkAll(Formula, 'khoản A = ' + left).ok, true, 'nhóm trái cùng phép +');
    // một nhóm ngoặc cùng phép giữa chuỗi dài: LCB + (đi lại + chuyên cần + LCB) + đi lại + ...
    const grouped = 'LCB + (đi lại + chuyên cần + LCB) + ' + Array.from({ length: 20 }, () => 'đi lại').join(' + ');
    assert.equal(F.checkAll(Formula, 'khoản A = ' + grouped).ok, true, 'một nhóm ngoặc cùng phép giữa chuỗi dài');
  }
);

test(
  'Một tổng 12 số hạng (sáu thành phần ngày, đi lại, chuyên cần, KPI và ba khoản tuỳ chỉnh) không vượt giới hạn mặc định',
  opts,
  async () => {
    const Formula = await load();
    // Tổng thu nhập thật gồm 9 thành phần cộng phụ cấp tuỳ chỉnh. Chuỗi cùng phép + là một tầng.
    const vocabulary = [
      ...STD_VOCAB,
      F.word('khoanB', 'khoản B', 'VND', 'month', { kind: 'formula' }),
      F.word('khoanC', 'khoản C', 'VND', 'month', { kind: 'variable' }),
      F.word('khoanD', 'khoản D', 'VND', 'month', { kind: 'variable' }),
      F.word('khoanE', 'khoản E', 'VND', 'month', { kind: 'variable' })
    ];
    const text = `tổng thu nhập = ${SIX} + đi lại + chuyên cần + lương KPI + khoản C + khoản D + khoản E`;
    const res = F.parseOk(Formula, text, vocabulary);
    const v = Formula.validate(res.tree, { vocabulary });
    assert.deepEqual(v.errors, [], 'tổng thu nhập thật của một phiếu lương phải lưu được');
  }
);

test('Bảng bậc quá 10 hàng bị từ chối (system.tier.maxRows)', opts, async () => {
  const Formula = await load();
  const rows = Array.from({ length: 12 }, (_, i) => `từ ${i * 5}% đến dưới ${i * 5 + 5}% → ${i}%`).join('; ');
  const text = `khoản A = bảng bậc theo giờ vượt ngưỡng: ${rows}`;
  const out = F.checkAll(Formula, text);
  assert.equal(out.ok, false);
  assert.ok(F.codesIn(out.errors).includes('FORMULA_TOO_LARGE'), JSON.stringify(out.errors).slice(0, 300));
});

// ---------- Kiểm không đổi cây và không tin đầu vào ----------

test('validate không sửa cây và gọi lại cho cùng kết quả', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'khoản A = lương cơ bản + giờ vượt ngưỡng');
  const before = F.ser(Formula, res.tree);
  const first = JSON.stringify(Formula.validate(res.tree, { vocabulary: STD_VOCAB }));
  const second = JSON.stringify(Formula.validate(res.tree, { vocabulary: STD_VOCAB }));
  assert.equal(first, second);
  assert.equal(F.ser(Formula, res.tree), before);
});

test('validate với cây rỗng, null hoặc nút lạ không ném: trả ok:false', opts, async () => {
  const Formula = await load();
  for (const bad of [null, undefined, {}, { root: 'n1', nodes: {} }, 'abc', 5]) {
    let v;
    assert.doesNotThrow(() => {
      v = Formula.validate(bad, { vocabulary: STD_VOCAB });
    });
    assert.equal(v.ok, false);
    assert.ok(Array.isArray(v.errors) && v.errors.length >= 1);
  }
});
