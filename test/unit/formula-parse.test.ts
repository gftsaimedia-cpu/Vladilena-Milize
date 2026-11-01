'use strict';
// Bộ phân tích công thức gõ bằng tiếng Việt: src/engine/formula.ts → Formula.parse.
// Thiếu src/engine/formula.ts thì các test chạy như `todo`; RED=1 để xem đỏ. Giả định riêng của từng nhóm ghi ở đầu nhóm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/formula-fixture');

const { STD_VOCAB, AMBIGUOUS_VOCAB } = F;
const opts = F.READY();
const load = F.loadFormula;

// ---------- Câu mẫu: tổng thu nhập ----------

test(
  'Câu của chủ dự án: "lương cơ bản" mơ hồ giữa hai biến thì hỏi lại với hai lựa chọn, không dựng cây, không đoán',
  opts,
  async () => {
    const Formula = await load();
    const res = Formula.parse('Tổng thu nhập = lương cơ bản + đi lại + chuyên cần + lương KPI', {
      vocabulary: AMBIGUOUS_VOCAB
    });
    assert.equal(res.ok, false, 'chưa chọn nghĩa thì không được ok');
    assert.ok(!res.tree, 'không được dựng cây khi còn chỗ mơ hồ');
    assert.ok(
      Array.isArray(res.questions) && res.questions.length === 1,
      `phải có đúng 1 câu hỏi: ${JSON.stringify(res)}`
    );
    const [q] = res.questions;
    assert.equal(q.options.length, 2, 'hai nghĩa của "lương cơ bản"');
    const text = 'Tổng thu nhập = lương cơ bản + đi lại + chuyên cần + lương KPI';
    assert.equal(text.slice(q.at.start, q.at.end).toLowerCase(), 'lương cơ bản', 'câu hỏi chỉ đúng chỗ chữ mơ hồ');
    const blob = JSON.stringify(q.options);
    assert.match(blob, /luongCoBan/, 'một lựa chọn là lương cơ bản của level');
    assert.match(blob, /tienNgayCong/, 'một lựa chọn là tiền lương theo ngày công');
  }
);

test('Câu của chủ dự án: gọi đúng tên đầy đủ thì hết mơ hồ và dựng cây theo khoá, không theo nhãn', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(
    Formula,
    'Tổng thu nhập = lương cơ bản của level + đi lại + chuyên cần + lương KPI',
    AMBIGUOUS_VOCAB
  );
  const stored = F.ser(Formula, res.tree);
  for (const key of ['luongCoBan', 'diLai', 'chuyenCan', 'luongKpi']) assert.match(stored, new RegExp(key), key);
  assert.doesNotMatch(stored, /tienNgayCong/);
  assert.doesNotMatch(stored, /lương cơ bản/i, 'cây lưu khoá, không lưu chữ Admin gõ');
});

test('Câu của chủ dự án: LCB chỉ trỏ về một biến nên không bị hỏi lại dù "lương cơ bản" mơ hồ', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'Tổng thu nhập = LCB + đi lại', AMBIGUOUS_VOCAB);
  assert.match(F.ser(Formula, res.tree), /luongCoBan/);
});

// ---------- Hợp lệ: tổng, thứ tự phép tính, ngoặc ----------

test('Tổng thông thường dựng được cây và liệt kê đúng các biến phụ thuộc, không kể vế trái', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'tổng thu nhập = tiền ngày công + đi lại + chuyên cần + lương KPI');
  assert.deepEqual([...Formula.dependencies(tree)].sort(), ['chuyenCan', 'diLai', 'luongKpi', 'tienNgayCong']);
});

test('Độ ưu tiên: nhân trước cộng, a + b × c = 70 với a=10, b=20, c=3', opts, async () => {
  const Formula = await load();
  const vars = { luongCoBan: 10, tienNgayCong: 20, diLai: 3 };
  assert.equal(F.evalText(Formula, 'khoản A = lương cơ bản + tiền ngày công × đi lại', { variables: vars }), 70);
});

test('Ngoặc đổi thứ tự: (a + b) × c = 90', opts, async () => {
  const Formula = await load();
  const vars = { luongCoBan: 10, tienNgayCong: 20, diLai: 3 };
  assert.equal(F.evalText(Formula, 'khoản A = (lương cơ bản + tiền ngày công) × đi lại', { variables: vars }), 90);
});

test('Kết hợp trái: a - b - c = (a - b) - c và a ÷ b ÷ c = (a ÷ b) ÷ c', opts, async () => {
  const Formula = await load();
  const vars = { luongCoBan: 100, tienNgayCong: 20, diLai: 4 };
  assert.equal(F.evalText(Formula, 'khoản A = lương cơ bản - tiền ngày công - đi lại', { variables: vars }), 76);
  assert.equal(
    F.evalText(Formula, 'khoản A = lương cơ bản ÷ tiền ngày công ÷ đi lại', { variables: vars }),
    100 / 20 / 4
  );
});

test('Dấu trừ một ngôi: -a + b', opts, async () => {
  const Formula = await load();
  const vars = { luongCoBan: 10, tienNgayCong: 25 };
  assert.equal(F.evalText(Formula, 'khoản A = -lương cơ bản + tiền ngày công', { variables: vars }), 15);
});

test('Ngoặc lồng nhau và khoảng trắng thừa cho cùng một cây', opts, async () => {
  const Formula = await load();
  const a = F.parseOk(Formula, 'khoản A = ((lương cơ bản + đi lại)) × tỷ lệ đi lại');
  const b = F.parseOk(Formula, '  khoản A   =  ( lương cơ bản+đi lại ) ×   tỷ lệ đi lại  ');
  assert.equal(F.ser(Formula, a.tree), F.ser(Formula, b.tree));
});

test('Các ký hiệu phép toán thay thế nhau: × * x nhân; ÷ / chia; − - trừ; cộng', opts, async () => {
  const Formula = await load();
  const base = F.ser(Formula, F.parseOk(Formula, 'khoản A = lương cơ bản × tỷ lệ đi lại').tree);
  for (const op of ['*', 'x', 'nhân']) {
    const t = F.parseOk(Formula, `khoản A = lương cơ bản ${op} tỷ lệ đi lại`);
    assert.equal(F.ser(Formula, t.tree), base, `toán tử "${op}"`);
  }
  const div = F.ser(Formula, F.parseOk(Formula, 'khoản A = lương cơ bản ÷ ngày công chuẩn').tree);
  for (const op of ['/', 'chia'])
    assert.equal(F.ser(Formula, F.parseOk(Formula, `khoản A = lương cơ bản ${op} ngày công chuẩn`).tree), div, op);
  const sub = F.ser(Formula, F.parseOk(Formula, 'khoản A = lương cơ bản - đi lại').tree);
  for (const op of ['−', 'trừ'])
    assert.equal(F.ser(Formula, F.parseOk(Formula, `khoản A = lương cơ bản ${op} đi lại`).tree), sub, op);
  const add = F.ser(Formula, F.parseOk(Formula, 'khoản A = lương cơ bản + đi lại').tree);
  assert.equal(F.ser(Formula, F.parseOk(Formula, 'khoản A = lương cơ bản cộng đi lại').tree), add);
});

// ---------- Số kiểu Việt Nam ----------
// Giả định: giá trị số nằm ở đâu đó trong kết quả phân tích (nút lit, hoặc tham số tự sinh kèm giá trị).

test('Số vi-VN: 6.000.000 là sáu triệu (dấu chấm ngăn nghìn)', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'khoản A = lương cơ bản + 6.000.000');
  assert.ok(F.containsNumber(res, 6000000), JSON.stringify(res));
});

test('Số vi-VN: 15% là 0,15 (tỷ lệ)', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'khoản A = lương cơ bản × 15%');
  assert.ok(F.containsNumber(res, 0.15), JSON.stringify(res));
});

test('Số vi-VN: 1,5 và 0,25 (dấu phẩy thập phân)', opts, async () => {
  const Formula = await load();
  const a = F.parseOk(Formula, 'khoản A = lương cơ bản × 1,5');
  assert.ok(F.containsNumber(a, 1.5), JSON.stringify(a));
  const b = F.parseOk(Formula, 'khoản A = lương cơ bản × 0,25');
  assert.ok(F.containsNumber(b, 0.25), JSON.stringify(b));
});

test('Số vi-VN: 1.234,5 là một nghìn hai trăm ba mươi tư phẩy năm', opts, async () => {
  const Formula = await load();
  const res = F.parseOk(Formula, 'khoản A = lương cơ bản + 1.234,5');
  assert.ok(F.containsNumber(res, 1234.5), JSON.stringify(res));
});

test('PARSE_NUMBER_AMBIGUOUS: "1.5" có thể là 1.500 hoặc 1,5 nên hỏi lại, không đoán', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = lương cơ bản × 1.5';
  const res = Formula.parse(text, { vocabulary: STD_VOCAB });
  assert.equal(res.ok, false);
  assert.ok(!res.tree);
  assert.ok(F.codesOf(res).includes('PARSE_NUMBER_AMBIGUOUS'), JSON.stringify(res));
  const where = [...(res.errors || []), ...(res.questions || [])].find(x => x.at);
  assert.equal(text.slice(where.at.start, where.at.end), '1.5', 'chỉ đúng chỗ số mơ hồ');
});

test('Số khác 0 và 1 không nằm thẳng trong cây: nút lit chỉ mang 0 hoặc 1 (mục 3.3)', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'khoản A = lương cơ bản × 15% + 6.000.000 + 0 + 1');
  const nodes = F.serObject(Formula, tree).nodes;
  const lits = Object.values<any>(nodes).filter(n => n.t === 'lit');
  assert.ok(lits.length >= 2, 'số 0 và 1 là lit');
  for (const n of lits) assert.ok(n.v === 0 || n.v === 1, `lit không được là ${n.v}`);
});

// ---------- Từ đồng nghĩa, hoa thường, bỏ dấu ----------

test('Từ đồng nghĩa: LCB và lương CB đều trỏ về lương cơ bản (cây giống hệt)', opts, async () => {
  const Formula = await load();
  const canonical = F.ser(Formula, F.parseOk(Formula, 'tổng thu nhập = lương cơ bản + đi lại').tree);
  assert.equal(F.ser(Formula, F.parseOk(Formula, 'tổng thu nhập = LCB + đi lại').tree), canonical);
  assert.equal(F.ser(Formula, F.parseOk(Formula, 'tổng thu nhập = lương CB + đi lại').tree), canonical);
  assert.equal(F.ser(Formula, F.parseOk(Formula, 'tổng thu nhập = lcb + đi lại').tree), canonical);
});

test('Không phân biệt hoa thường; cây lưu khoá chứ không lưu nhãn', opts, async () => {
  const Formula = await load();
  const canonical = F.parseOk(Formula, 'tổng thu nhập = lương cơ bản + đi lại + lương KPI');
  const shouting = F.parseOk(Formula, 'TỔNG THU NHẬP = LƯƠNG CƠ BẢN + ĐI LẠI + LƯƠNG kpi');
  assert.equal(F.ser(Formula, shouting.tree), F.ser(Formula, canonical.tree));
  const stored = F.ser(Formula, shouting.tree);
  assert.match(stored, /luongCoBan/);
  assert.match(stored, /diLai/);
  assert.match(stored, /luongKpi/);
  assert.doesNotMatch(stored, /LƯƠNG|lương|đi lại/i);
});

test('Bỏ dấu khi chỉ có một nghĩa khớp: "luong co ban + di lai" ra cùng cây', opts, async () => {
  const Formula = await load();
  const canonical = F.parseOk(Formula, 'tổng thu nhập = lương cơ bản + đi lại');
  const plain = F.parseOk(Formula, 'tong thu nhap = luong co ban + di lai');
  assert.equal(F.ser(Formula, plain.tree), F.ser(Formula, canonical.tree));
});

test('Khớp nhãn dài nhất trước: "tỷ lệ đi lại" không bị cắt thành "đi lại" cộng chữ lạ', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'khoản A = lương cơ bản × tỷ lệ đi lại');
  assert.deepEqual([...Formula.dependencies(tree)].sort(), ['luongCoBan', 'tyLeDiLai']);
});

test('Nhãn nhiều từ chứa nhãn ngắn khác: "tiền OT" và "OT" đều ra tienOt', opts, async () => {
  const Formula = await load();
  const a = F.parseOk(Formula, 'khoản A = tiền OT + lương cơ bản');
  const b = F.parseOk(Formula, 'khoản A = OT + lương cơ bản');
  assert.equal(F.ser(Formula, a.tree), F.ser(Formula, b.tree));
});

// ---------- Điều kiện ----------

test('nếu … thì … ngược lại …: chọn nhánh đúng theo hàm có sẵn "giữ được chuyên cần"', opts, async () => {
  const Formula = await load();
  const text = 'phụ cấp chuyên cần = nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần ngược lại 0';
  const vars = { luongCoBan: 6000000 };
  const params = { tyLeChuyenCan: 0.25 };
  assert.equal(
    F.evalText(Formula, text, { variables: vars, parameters: params, builtins: { giuChuyenCan: () => true } }),
    1500000
  );
  assert.equal(
    F.evalText(Formula, text, { variables: vars, parameters: params, builtins: { giuChuyenCan: () => false } }),
    0
  );
});

test('Điều kiện so sánh: nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì … (lớn hơn đúng, bằng thì không)', opts, async () => {
  const Formula = await load();
  const text = 'hệ số ngày KPI = nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì ngày đi làm ÷ ngày công chuẩn ngược lại 1';
  const base = { ngayDiLam: 13, ngayCongChuan: 26 };
  const params = { nguongGioKpi: 24 };
  assert.equal(F.evalText(Formula, text, { variables: { ...base, gioVuotNguong: 25 }, parameters: params }), 0.5);
  assert.equal(F.evalText(Formula, text, { variables: { ...base, gioVuotNguong: 24 }, parameters: params }), 1);
  assert.equal(F.evalText(Formula, text, { variables: { ...base, gioVuotNguong: 0 }, parameters: params }), 1);
});

test('Điều kiện nối bằng và, hoặc, không', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = nếu giữ được chuyên cần và không ở iDorm thì lương cơ bản ngược lại 0';
  const run = (giu?, idorm?) =>
    F.evalText(Formula, text, {
      variables: { luongCoBan: 7 },
      builtins: { giuChuyenCan: () => giu, idorm: () => idorm }
    });
  assert.equal(run(true, false), 7);
  assert.equal(run(true, true), 0);
  assert.equal(run(false, false), 0);
  const either = 'khoản A = nếu giữ được chuyên cần hoặc ở iDorm thì lương cơ bản ngược lại 0';
  const runOr = (giu?, idorm?) =>
    F.evalText(Formula, either, {
      variables: { luongCoBan: 7 },
      builtins: { giuChuyenCan: () => giu, idorm: () => idorm }
    });
  assert.equal(runOr(false, false), 0);
  assert.equal(runOr(false, true), 7);
  assert.equal(runOr(true, false), 7);
});

test('PARSE_MISSING_ELSE: "nếu … thì …" không có "ngược lại" bị từ chối với vị trí', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = nếu giữ được chuyên cần thì lương cơ bản';
  const res = Formula.parse(text, { vocabulary: STD_VOCAB });
  assert.equal(res.ok, false);
  assert.ok(F.codesOf(res).includes('PARSE_MISSING_ELSE'), JSON.stringify(res));
  F.assertPositioned(res.errors, text);
});

// ---------- min / max ----------

test('nhỏ nhất của (a ; b) và lớn nhất của (a ; b), kể cả nhiều đối số', opts, async () => {
  const Formula = await load();
  const vars = { luongCoBan: 5, tienNgayCong: 9, diLai: 7 };
  assert.equal(F.evalText(Formula, 'khoản A = nhỏ nhất của (lương cơ bản ; tiền ngày công)', { variables: vars }), 5);
  assert.equal(F.evalText(Formula, 'khoản A = lớn nhất của (lương cơ bản ; tiền ngày công)', { variables: vars }), 9);
  assert.equal(
    F.evalText(Formula, 'khoản A = lớn nhất của (lương cơ bản ; tiền ngày công ; đi lại)', { variables: vars }),
    9
  );
  assert.equal(
    F.evalText(Formula, 'khoản A = nhỏ nhất của (lương cơ bản + tiền ngày công ; đi lại)', { variables: vars }),
    7,
    'đối số là biểu thức'
  );
});

// ---------- Không hợp lệ: mỗi lỗi có mã và vị trí ----------

test('PARSE_UNKNOWN_WORD: chữ lạ bị chỉ đúng vị trí và gợi ý tối đa ba nhãn gần nhất', opts, async () => {
  const Formula = await load();
  const text = 'tổng thu nhập = lương cơ bản + KPO';
  const res = Formula.parse(text, { vocabulary: STD_VOCAB });
  assert.equal(res.ok, false);
  assert.ok(!res.tree);
  assert.deepEqual(F.codesIn(res.errors), ['PARSE_UNKNOWN_WORD']);
  F.assertPositioned(res.errors, text);
  const [e] = res.errors;
  assert.equal(text.slice(e.at.start, e.at.end), 'KPO');
  assert.ok(Array.isArray(e.suggestions) && e.suggestions.length >= 1 && e.suggestions.length <= 3, JSON.stringify(e));
  assert.ok(
    e.suggestions.some(s => /kpi/i.test(typeof s === 'string' ? s : JSON.stringify(s))),
    `gợi ý phải có KPI: ${JSON.stringify(e.suggestions)}`
  );
});

test('PARSE_UNKNOWN_WORD: "thưởng chuyên cần" (ví dụ của TK) bị từ chối và vị trí nằm trong chữ', opts, async () => {
  const Formula = await load();
  const text = 'tổng thu nhập = lương cơ bản + thưởng chuyên cần';
  const res = Formula.parse(text, { vocabulary: STD_VOCAB });
  assert.equal(res.ok, false);
  assert.ok(F.codesIn(res.errors).includes('PARSE_UNKNOWN_WORD'), JSON.stringify(res.errors));
  F.assertPositioned(res.errors, text);
  const e = res.errors.find(x => x.code === 'PARSE_UNKNOWN_WORD');
  assert.match(text.slice(e.at.start, e.at.end), /thưởng/);
});

test(
  'Toán tử treo: phép toán cuối câu hoặc đứng cạnh phép toán khác bị từ chối với mã PARSE_ và vị trí',
  opts,
  async () => {
    const Formula = await load();
    for (const text of [
      'tổng thu nhập = lương cơ bản +',
      'tổng thu nhập = lương cơ bản + đi lại ×',
      'tổng thu nhập = lương cơ bản + × đi lại',
      'tổng thu nhập = × lương cơ bản',
      'tổng thu nhập = lương cơ bản ÷'
    ]) {
      const res = Formula.parse(text, { vocabulary: STD_VOCAB });
      assert.equal(res.ok, false, text);
      assert.ok(!res.tree, text);
      F.assertPositioned(res.errors, text);
      assert.ok(
        res.errors.every(e => e.code.startsWith('PARSE_')),
        `${text}: ${JSON.stringify(res.errors)}`
      );
    }
  }
);

test('PARSE_UNBALANCED: thiếu ngoặc đóng hoặc thừa ngoặc đóng', opts, async () => {
  const Formula = await load();
  for (const text of [
    'tổng thu nhập = (lương cơ bản + đi lại',
    'tổng thu nhập = ((lương cơ bản + đi lại) × tỷ lệ đi lại',
    'tổng thu nhập = lương cơ bản + đi lại)',
    'tổng thu nhập = nhỏ nhất của (lương cơ bản ; đi lại'
  ]) {
    const res = Formula.parse(text, { vocabulary: STD_VOCAB });
    assert.equal(res.ok, false, text);
    assert.ok(F.codesIn(res.errors).includes('PARSE_UNBALANCED'), `${text}: ${JSON.stringify(res.errors)}`);
    F.assertPositioned(res.errors, text);
  }
});

test('Vế phải rỗng: "tổng thu nhập =" bị từ chối với mã PARSE_ và vị trí', opts, async () => {
  const Formula = await load();
  for (const text of ['tổng thu nhập =', 'tổng thu nhập =   ', 'tổng thu nhập = ()']) {
    const res = Formula.parse(text, { vocabulary: STD_VOCAB });
    assert.equal(res.ok, false, JSON.stringify(text));
    F.assertPositioned(res.errors, text);
    assert.ok(
      res.errors.every(e => e.code.startsWith('PARSE_')),
      JSON.stringify(res.errors)
    );
  }
});

test('Hai dấu "=" trong một công thức (ngoài điều kiện) bị từ chối', opts, async () => {
  const Formula = await load();
  for (const text of ['tổng thu nhập = lương cơ bản = đi lại', 'tổng thu nhập = khoản A = lương cơ bản + đi lại']) {
    const res = Formula.parse(text, { vocabulary: STD_VOCAB });
    assert.equal(res.ok, false, text);
    F.assertPositioned(res.errors, text);
    assert.ok(
      res.errors.every(e => e.code.startsWith('PARSE_')),
      JSON.stringify(res.errors)
    );
  }
});

test('Thiếu vế trái hoặc thiếu dấu "=": bị từ chối', opts, async () => {
  const Formula = await load();
  for (const text of ['= lương cơ bản + đi lại', 'lương cơ bản + đi lại', '']) {
    const res = Formula.parse(text, { vocabulary: STD_VOCAB });
    assert.equal(res.ok, false, JSON.stringify(text));
    assert.ok(!res.tree);
    assert.ok(F.codesOf(res).length >= 1, JSON.stringify(res));
  }
});

// ---------- Chữ giống mã: không bao giờ chạy ----------

test('Chữ giống mã (require, process, dấu huyền, ${...}) bị từ chối như chữ lạ và KHÔNG được chạy', opts, async () => {
  const Formula = await load();
  delete globalThis.__formulaPwned;
  const attacks = [
    "tổng thu nhập = require('fs')",
    'tổng thu nhập = process.exit(1)',
    'tổng thu nhập = `lương cơ bản`',
    'tổng thu nhập = ${globalThis.__formulaPwned = 1}',
    'tổng thu nhập = lương cơ bản + ${1}',
    "tổng thu nhập = Function('return globalThis.__formulaPwned = 1')()",
    "tổng thu nhập = eval('globalThis.__formulaPwned = 1')",
    'tổng thu nhập = this.constructor',
    'tổng thu nhập = lương cơ bản + globalThis.__formulaPwned',
    'tổng thu nhập = import("fs")'
  ];
  for (const text of attacks) {
    const res = Formula.parse(text, { vocabulary: STD_VOCAB });
    assert.equal(res.ok, false, `phải từ chối: ${text}`);
    assert.ok(!res.tree, text);
    assert.equal(
      res.errors.some(e => /^PARSE_UNKNOWN/.test(e.code)),
      true,
      `${text} phải có lỗi PARSE_UNKNOWN_*: ${JSON.stringify(res.errors)}`
    );
    F.assertPositioned(res.errors, text);
  }
  assert.equal(globalThis.__formulaPwned, undefined, 'chữ của Admin đã được thực thi');
});

test(
  'Tên trùng thuộc tính của Object ("constructor", "toString", "__proto__", "hasOwnProperty") là chữ lạ, không phải nhãn',
  opts,
  async () => {
    const Formula = await load();
    for (const w of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype']) {
      const text = `tổng thu nhập = lương cơ bản + ${w}`;
      const res = Formula.parse(text, { vocabulary: STD_VOCAB });
      assert.equal(res.ok, false, w);
      assert.ok(F.codesIn(res.errors).includes('PARSE_UNKNOWN_WORD'), `${w}: ${JSON.stringify(res.errors)}`);
    }
    assert.equal((Object.prototype as any).polluted, undefined);
  }
);

test('Bộ phân tích xác định: cùng câu, cùng từ vựng thì cùng cây qua 20 lần chạy', opts, async () => {
  const Formula = await load();
  const text = 'tổng thu nhập = lương cơ bản × tỷ lệ đi lại + (đi lại - chuyên cần) ÷ 2';
  const first = JSON.stringify(Formula.parse(text, { vocabulary: STD_VOCAB }));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(Formula.parse(text, { vocabulary: STD_VOCAB })), first);
});

test(
  'Đầu vào xấu không làm bộ phân tích ném lỗi lạ: null, số, đối tượng, chuỗi cực dài đều trả ok:false',
  opts,
  async () => {
    const Formula = await load();
    for (const bad of [null, undefined, 42, {}, [], 'a'.repeat(5000), '('.repeat(3000), '\u0000\u0001\u0002']) {
      let res;
      assert.doesNotThrow(
        () => {
          res = Formula.parse(bad, { vocabulary: STD_VOCAB });
        },
        `parse(${JSON.stringify(bad)?.slice(0, 20)}) không được ném`
      );
      assert.equal(res.ok, false);
      assert.ok(Array.isArray(res.errors) && res.errors.length >= 1);
    }
  }
);

test('Chuỗi tấn công kiểu ReDoS (nhiều khoảng trắng, nhiều dấu) xử lý dưới hai giây', opts, async () => {
  const Formula = await load();
  const nasty = [
    'tổng thu nhập = ' + 'lương cơ bản '.repeat(120),
    'tổng thu nhập = ' + '1.'.repeat(900),
    'tổng thu nhập =' + ' '.repeat(1900) + 'x',
    'tổng thu nhập = ' + '- '.repeat(900) + 'đi lại'
  ];
  const started = Date.now();
  for (const text of nasty) Formula.parse(text, { vocabulary: STD_VOCAB });
  assert.ok(Date.now() - started < 2000, `chậm: ${Date.now() - started} ms`);
});
