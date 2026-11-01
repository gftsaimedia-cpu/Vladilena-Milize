'use strict';
// Vòng tròn chữ → cây → câu → cây: cái được lưu là cây, chữ luôn sinh lại từ cây.
// Với mỗi công thức: parse → describe → parse lại phải ra CÙNG cây (serialize bằng nhau), và deserialize(serialize(cây)) cũng ra cùng cây.
// sentenceOf lấy câu từ describe(); câu đó phải đọc lại được bởi chính văn phạm.
// Thiếu src/engine/formula.ts thì các test chạy như `todo`; RED=1 để xem đỏ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/formula-fixture');

const { STD_VOCAB } = F;
const opts = F.READY();
const load = F.loadFormula;

const SIX = 'tiền ngày công + phụ cấp ca + giờ nghỉ đêm + làm bù + tiền OT + làm lễ';

// 36 công thức (không có số khác 0/1: số gõ vào thành tham số tự sinh, kiểm riêng bên dưới)
const FORMULAS = [
  'khoản A = lương cơ bản + đi lại',
  'khoản A = lương cơ bản - đi lại',
  'khoản A = lương cơ bản × tỷ lệ đi lại',
  'khoản A = lương cơ bản ÷ ngày công chuẩn',
  'khoản A = lương cơ bản + đi lại × tỷ lệ đi lại',
  'khoản A = (lương cơ bản + đi lại) × tỷ lệ đi lại',
  'khoản A = ((lương cơ bản + đi lại) × tỷ lệ đi lại) - chuyên cần',
  'khoản A = -lương cơ bản + đi lại',
  'khoản A = -(lương cơ bản + đi lại)',
  'khoản A = LCB × tỷ lệ chuyên cần',
  'khoản A = lương CB + OT',
  'khoản A = nhỏ nhất của (lương cơ bản ; đi lại)',
  'khoản A = lớn nhất của (lương cơ bản ; tiền ngày công)',
  'khoản A = lớn nhất của (lương cơ bản ; tiền ngày công ; đi lại)',
  'khoản A = nhỏ nhất của (lương cơ bản + đi lại ; chuyên cần × tỷ lệ chuyên cần)',
  'phụ cấp chuyên cần = nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần ngược lại 0',
  'phụ cấp đi lại = nếu ở iDorm thì 0 ngược lại lương cơ bản × tỷ lệ đi lại',
  'hệ số ngày KPI = nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì ngày đi làm ÷ ngày công chuẩn ngược lại 1',
  'khoản A = nếu giữ được chuyên cần và không ở iDorm thì lương cơ bản ngược lại 0',
  'khoản A = nếu giữ được chuyên cần hoặc ở iDorm thì lương cơ bản ngược lại 0',
  'khoản A = nếu không ở iDorm thì đi lại ngược lại 0',
  'khoản A = nếu giữ được chuyên cần thì (nếu ở iDorm thì 0 ngược lại đi lại) ngược lại chuyên cần',
  'khoản A = lương cơ bản + (nếu giữ được chuyên cần thì chuyên cần ngược lại 0)',
  'khoản A = nếu giờ vượt ngưỡng ≥ ngưỡng giờ KPI thì 0 ngược lại lương cơ bản',
  'khoản A = nếu giờ vượt ngưỡng < ngưỡng giờ KPI thì lương cơ bản ngược lại 0',
  'khoản A = tổng theo ngày (tiền ca trong ngày) + lương cơ bản',
  `tổng thu nhập = ${SIX}`,
  `tổng thu nhập = ${SIX} + đi lại + chuyên cần + lương KPI`,
  'khoản A = khoản B + tiền ngày công',
  'khoản A = lương cơ bản × (ngày đi làm ÷ ngày công chuẩn)',
  'khoản A = lương cơ bản ÷ ngày công chuẩn × ngày đi làm',
  'khoản A = lương cơ bản - (đi lại - chuyên cần)',
  'khoản A = lương cơ bản ÷ (ngày công chuẩn × ngày đi làm)',
  'khoản A = lương cơ bản × 1',
  'khoản A = lương cơ bản + 0',
  'khoản A = lương cơ bản - đi lại - chuyên cần',
  'khoản A = lương cơ bản ÷ ngày công chuẩn ÷ ngày đi làm'
];

test('Bộ roundtrip có ít nhất 30 công thức khác nhau', opts, () => {
  assert.ok(FORMULAS.length >= 30, `chỉ có ${FORMULAS.length}`);
  assert.equal(new Set<any>(FORMULAS).size, FORMULAS.length, 'có công thức trùng');
});

// Câu mà describe() sinh ra, chuẩn bị để phân tích lại: thêm vế trái nếu câu chưa có, bỏ dấu chấm cuối câu
const sentenceOf = (Formula?, tree?, original?) => {
  const lhs = original.slice(0, original.indexOf('=')).trim();
  const sentence = String(Formula.describe(tree, STD_VOCAB))
    .trim()
    .replace(/[.。]\s*$/, '');
  return sentence.includes('=') ? sentence : `${lhs} = ${sentence}`;
};

for (const [i, text] of FORMULAS.entries()) {
  test(`Roundtrip ${String(i + 1).padStart(2, '0')}: ${text}`, opts, async () => {
    const Formula = await load();
    const first = F.parseOk(Formula, text);
    const stored = F.ser(Formula, first.tree);

    // 1. cây → câu đọc được → cây
    const sentence = sentenceOf(Formula, first.tree, text);
    const again = Formula.parse(sentence, { vocabulary: STD_VOCAB });
    assert.ok(
      again.ok,
      `câu describe() không phân tích lại được: ${JSON.stringify(sentence)} → ${JSON.stringify(again.errors || again.questions)}`
    );
    assert.equal(F.ser(Formula, again.tree), stored, `cây đổi sau describe → parse. Câu: ${sentence}`);

    // 2. serialize → deserialize
    const loaded = Formula.deserialize(Formula.serialize(first.tree));
    assert.equal(F.ser(Formula, loaded), stored, 'deserialize(serialize(cây)) phải ra cùng cây');
    assert.deepEqual(Formula.dependencies(loaded), Formula.dependencies(first.tree));

    // 3. serialize qua JSON chữ (như khi lưu vào cơ sở dữ liệu) rồi nạp lại
    const viaText = Formula.deserialize(JSON.parse(JSON.stringify(F.serObject(Formula, first.tree))));
    assert.equal(F.ser(Formula, viaText), stored, 'qua JSON.stringify/parse vẫn ra cùng cây');
  });
}

test(
  'Định dạng lưu theo TK mục 4: v là 1, root trỏ vào nodes, mọi nút có t trong danh sách đóng, mọi tham chiếu con tồn tại',
  opts,
  async () => {
    const Formula = await load();
    const CLOSED = new Set<any>([
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
    ]);
    const CHILD_FIELDS = ['a', 'b', 'if', 'then', 'else', 'arg', 'args', 'rows'];
    for (const text of FORMULAS) {
      const doc = F.serObject(Formula, F.parseOk(Formula, text).tree);
      assert.equal(doc.v, 1, text);
      assert.ok(doc.nodes[doc.root], `${text}: root ${doc.root} không có trong nodes`);
      for (const [id, node] of Object.entries<any>(doc.nodes)) {
        assert.ok(CLOSED.has(node.t), `${text}: nút ${id} có loại lạ ${node.t}`);
        for (const field of CHILD_FIELDS) {
          const refs = Array.isArray(node[field]) ? node[field] : node[field] === undefined ? [] : [node[field]];
          for (const ref of refs)
            if (typeof ref === 'string') assert.ok(doc.nodes[ref], `${text}: ${id}.${field} → ${ref} không tồn tại`);
        }
      }
    }
  }
);

test('serialize xác định: cùng một cây cho cùng một chuỗi, qua nhiều lần', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, FORMULAS[28]);
  const first = F.ser(Formula, tree);
  for (let i = 0; i < 10; i++) assert.equal(F.ser(Formula, tree), first);
});

test(
  'describe nói bằng nhãn tiếng Việt, không lộ khoá (luongCoBan, tienOt...) và ổn định giữa các lần gọi',
  opts,
  async () => {
    const Formula = await load();
    for (const text of FORMULAS) {
      const { tree } = F.parseOk(Formula, text);
      const sentence = Formula.describe(tree, STD_VOCAB);
      assert.equal(typeof sentence, 'string', text);
      assert.ok(sentence.length > 0);
      assert.equal(Formula.describe(tree, STD_VOCAB), sentence, 'describe phải xác định');
      for (const word of STD_VOCAB)
        if (/[a-z][A-Z]/.test(word.key))
          assert.ok(!sentence.includes(word.key), `${text}: câu lộ khoá ${word.key}: ${sentence}`);
      for (const key of Formula.dependencies(tree)) {
        const word = STD_VOCAB.find(w => w.key === key);
        assert.ok(word, `dependencies trả khoá lạ ${key}`);
        assert.ok(
          sentence.toLowerCase().includes(word.label.toLowerCase()) ||
            word.synonyms.some(s => sentence.toLowerCase().includes(s.toLowerCase())),
          `${text}: câu không nhắc ${word.label}: ${sentence}`
        );
      }
    }
  }
);

test(
  'Công thức có số: describe in lại số kiểu Việt Nam và đọc lại ra cùng cây (15%, 6.000.000, 1,5, 0,25)',
  opts,
  async () => {
    const Formula = await load();
    for (const text of [
      'khoản A = lương cơ bản × 15%',
      'khoản A = lương cơ bản + 6.000.000',
      'khoản A = lương cơ bản × 1,5',
      'khoản A = lương cơ bản × 0,25'
    ]) {
      const first = F.parseOk(Formula, text);
      const sentence = sentenceOf(Formula, first.tree, text);
      const again = Formula.parse(sentence, { vocabulary: STD_VOCAB });
      assert.ok(again.ok, `${text} → ${sentence} → ${JSON.stringify(again.errors || again.questions)}`);
      assert.equal(F.ser(Formula, again.tree), F.ser(Formula, first.tree), `${text} → ${sentence}`);
    }
  }
);

test('Cách gõ khác nhau cho cùng một ý ra cùng cây rồi cùng câu (chữ gốc của Admin không được giữ)', opts, async () => {
  const Formula = await load();
  const variants = [
    'khoản A = lương cơ bản nhân tỷ lệ đi lại cộng đi lại',
    'KHOẢN A = LCB * tỷ lệ đi lại + đi lại',
    'khoan a = luong co ban x ty le di lai + di lai',
    'khoản A=lương cơ bản×tỷ lệ đi lại+đi lại'
  ];
  const trees = variants.map(v => F.parseOk(Formula, v).tree);
  const stored = trees.map(t => F.ser(Formula, t));
  for (const s of stored) assert.equal(s, stored[0]);
  const sentences = trees.map(t => Formula.describe(t, STD_VOCAB));
  for (const s of sentences) assert.equal(s, sentences[0]);
});

test('Nạp lại không đổi cây: deserialize rồi serialize rồi deserialize ba vòng vẫn bằng nhau', opts, async () => {
  const Formula = await load();
  for (const text of FORMULAS) {
    const { tree } = F.parseOk(Formula, text);
    let current = tree;
    const stored = F.ser(Formula, tree);
    for (let i = 0; i < 3; i++) current = Formula.deserialize(Formula.serialize(current));
    assert.equal(F.ser(Formula, current), stored, text);
  }
});
