'use strict';
// Ca vàng của công thức gõ chữ: cây do bộ phân tích dựng (src/engine/formula.ts) phải cho ĐÚNG số của khối công thức cũ trên cả 300 ca vàng
// (test/fixtures/payroll-golden-v0.json): không lệch một đồng.
//
// KẾT QUẢ ĐO TRÊN KHỐI CŨ:
//   KHỚP TỪNG BIT (Object.is) trên 300/300 ca khi viết theo cấu trúc của khối cũ:
//     tổng thu nhập   = tiền ngày công + (đi lại + chuyên cần) + lương KPI        (cũ: r.total = r.work + r.allow + r.kpiPay, allow = travel + attendance)
//     phụ cấp đi lại  = nếu ở iDorm thì 0 ngược lại lương cơ bản × tỷ lệ đi lại × (ngày đi làm ÷ ngày công chuẩn)
//     chuyên cần      = nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần × (ngày đi làm ÷ ngày công chuẩn) ngược lại 0
//     hệ số ngày KPI  = nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì ngày đi làm ÷ ngày công chuẩn ngược lại 1   (256 ca có KPI)
//   KHÔNG KHỚP TỪNG BIT nếu viết phẳng không ngoặc (cộng/nhân kết hợp trái):
//     tổng phẳng            283/300 giống bit; 17 ca lệch cỡ 1e-9 đồng (thứ tự cộng số thực), sau làm tròn đồng vẫn bằng 300/300
//     đi lại phẳng (a×b×c÷d) 269/300 giống bit; chuyên cần phẳng 275/300; lệch cỡ 1e-9 đồng
//   KHÔNG VIẾT ĐƯỢC BẰNG CÂY (hàm có sẵn bị khoá): tiền ngày công và các thành phần trong ngày (calcDay, sổ giờ bù, chia ngày lễ),
//     chính cờ "giữ được chuyên cần" (calcMonth → attendOk), tiền KPI (KpiScore.pay). Ở đây chúng là đầu vào của ctx lấy từ kết quả khối cũ.
// Hệ quả: "tổng thu nhập = a + b + c + d" gõ phẳng không bằng khối cũ từng bit; muốn khớp từng bit cần biến `phụ cấp` (= đi lại + chuyên cần)
// hoặc dung sai ≤ 1e-6 đồng vì gross luôn qua Math.round (calcNet: D(m.total)).
//
// Thiếu src/engine/formula.ts thì các test chạy như `todo` (trừ nhóm "khối cũ": không cần mô-đun); RED=1 để xem đỏ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/formula-fixture');
const { createLegacyEngine } = require('../helpers/legacy-payroll');
const { readGolden } = require('../helpers/golden');

const opts = F.READY();
const load = F.loadFormula;
const word = F.word;

const golden = readGolden();
const legacy = createLegacyEngine();

// Kết quả khối cũ cho 300 ca, tính một lần; kèm các đầu vào mà công thức cần
let CASES;
function cases() {
  if (CASES) return CASES;
  CASES = golden.cases.map(c => {
    const { m } = legacy.computeMonth(c.input);
    const staff = c.input.staff;
    const T = legacy.TYPES[staff.type];
    const L = T.levels[staff.level];
    return { id: c.id, staff, T, L, m, gross: c.expected.gross };
  });
  return CASES;
}

// ---------- từ vựng cho ca vàng ----------
const VOCAB = [
  word('tienNgayCong', 'tiền ngày công', 'VND', 'month'),
  word('diLai', 'đi lại', 'VND', 'month'),
  word('chuyenCan', 'chuyên cần', 'VND', 'month'),
  word('luongKpi', 'lương KPI', 'VND', 'month'),
  word('luongCoBan', 'lương cơ bản', 'VND', 'month'),
  word('ngayDiLam', 'ngày đi làm', 'day', 'month'),
  word('ngayCongChuan', 'ngày công chuẩn', 'day', 'month'),
  word('gioVuotNguong', 'giờ vượt ngưỡng', 'hour', 'month'),
  word('tyLeDiLai', 'tỷ lệ đi lại', 'percent', 'month', { kind: 'parameter' }),
  word('tyLeChuyenCan', 'tỷ lệ chuyên cần', 'percent', 'month', { kind: 'parameter' }),
  word('nguongGioKpi', 'ngưỡng giờ KPI', 'hour', 'month', { kind: 'parameter' }),
  word('giuChuyenCan', 'giữ được chuyên cần', 'count', 'month', { kind: 'builtin' }),
  word('idorm', 'ở iDorm', 'count', 'month', { kind: 'builtin' }),
  word('tongThuNhap', 'tổng thu nhập', 'VND', 'month', { kind: 'formula' }),
  word('phuCapDiLai', 'phụ cấp đi lại', 'VND', 'month', { kind: 'formula' }),
  word('phuCapChuyenCan', 'phụ cấp chuyên cần', 'VND', 'month', { kind: 'formula' }),
  word('heSoNgayKpi', 'hệ số ngày KPI', 'ratio', 'month', { kind: 'formula' })
];

const ctxOf = (c?, formulas: any = {}) =>
  F.makeCtx({
    variables: {
      tienNgayCong: c.m.work,
      diLai: c.m.travel,
      chuyenCan: c.m.attendance,
      luongKpi: c.m.kpiPay,
      luongCoBan: c.L.base,
      ngayDiLam: c.m.count,
      ngayCongChuan: c.T.workdays,
      gioVuotNguong: c.m.overHours
    },
    parameters: {
      tyLeDiLai: c.T.travel || 0,
      tyLeChuyenCan: c.T.attendance || 0,
      nguongGioKpi: legacy.OVER_LIMIT
    },
    builtins: { giuChuyenCan: () => c.m.attendOk === true, idorm: () => Boolean(c.staff.idorm) },
    formulas
  });

const treeOf = (Formula?, text?) => F.parseOk(Formula, text, VOCAB).tree;

// So từng ca; trả danh sách ca lệch (rỗng = khớp)
const compare = (list?, expectedOf?, actualOf?, same?) => {
  const wrong: any[] = [];
  for (const c of list) {
    const want = expectedOf(c);
    const got = actualOf(c);
    if (!same(got, want)) wrong.push(`${c.id}: cây ${got} khác khối cũ ${want}`);
  }
  return wrong;
};
const bitExact = (got?, want?) => Object.is(got, want);
const within = (got?, want?) => typeof got === 'number' && Math.abs(got - want) <= 1e-6;

// ---------- Nhóm 0: chính khối cũ (không cần mô-đun) ----------
test('Khối cũ: tổng = tiền ngày công + (đi lại + chuyên cần) + lương KPI khớp từng bit trên 300 ca; viết phẳng chỉ lệch dưới 1e-6 và bằng nhau sau làm tròn đồng', t => {
  const list = cases();
  assert.equal(list.length, 300);
  const grouped = list.filter(c => !Object.is(c.m.work + (c.m.travel + c.m.attendance) + c.m.kpiPay, c.m.total));
  assert.deepEqual(
    grouped.map(c => c.id),
    [],
    'cấu trúc ghép của khối cũ đã đổi: cập nhật chú thích đầu file này'
  );
  const flat = (c?) => c.m.work + c.m.travel + c.m.attendance + c.m.kpiPay;
  assert.deepEqual(
    list.filter(c => Math.abs(flat(c) - c.m.total) > 1e-6).map(c => c.id),
    []
  );
  assert.deepEqual(
    list.filter(c => Math.round(flat(c)) !== c.gross).map(c => c.id),
    [],
    'gross (đã làm tròn) phải bằng nhau dù cộng theo thứ tự nào'
  );
  t.diagnostic(`tổng phẳng giống bit: ${list.filter(c => flat(c) === c.m.total).length}/300`);
});

// ---------- Nhóm 1: tổng thu nhập ----------
test(
  'Công thức của chủ dự án, ghép theo cấu trúc khối cũ: "tổng thu nhập = tiền ngày công + (đi lại + chuyên cần) + lương KPI" bằng m.total từng bit trên 300 ca vàng',
  opts,
  async () => {
    const Formula = await load();
    const tree = treeOf(Formula, 'Tổng thu nhập = tiền ngày công + (đi lại + chuyên cần) + lương KPI');
    const wrong = compare(
      cases(),
      c => c.m.total,
      c => Formula.evaluate(tree, ctxOf(c)),
      bitExact
    );
    assert.deepEqual(wrong, []);
  }
);

test(
  'Tổng thu nhập ghép theo cấu trúc khối cũ, sau Math.round bằng đúng gross (đồng) của 300 ca vàng',
  opts,
  async () => {
    const Formula = await load();
    const tree = treeOf(Formula, 'Tổng thu nhập = tiền ngày công + (đi lại + chuyên cần) + lương KPI');
    const wrong = compare(
      cases(),
      c => c.gross,
      c => Math.round(Formula.evaluate(tree, ctxOf(c))),
      bitExact
    );
    assert.deepEqual(wrong, []);
  }
);

test(
  'Câu chính xác của chủ dự án (phẳng, kết hợp trái): lệch m.total dưới 1e-6 và gross sau Math.round bằng nhau trên 300 ca',
  opts,
  async t => {
    const Formula = await load();
    const tree = treeOf(Formula, 'Tổng thu nhập = tiền ngày công + đi lại + chuyên cần + lương KPI');
    const run = (c?) => Formula.evaluate(tree, ctxOf(c));
    assert.deepEqual(
      compare(cases(), c => c.m.total, run, within),
      []
    );
    assert.deepEqual(
      compare(
        cases(),
        c => c.gross,
        c => Math.round(run(c)),
        bitExact
      ),
      [],
      'gross phải đúng đến đồng'
    );
    const exact = cases().filter(c => Object.is(run(c), c.m.total)).length;
    t.diagnostic(`câu phẳng giống bit với khối cũ: ${exact}/300 (khối cũ cộng đi lại + chuyên cần trước)`);
  }
);

// ---------- Nhóm 2: phụ cấp đi lại ----------
const TRAVEL_NESTED =
  'phụ cấp đi lại = nếu ở iDorm thì 0 ngược lại lương cơ bản × tỷ lệ đi lại × (ngày đi làm ÷ ngày công chuẩn)';
const TRAVEL_FLAT =
  'phụ cấp đi lại = nếu ở iDorm thì 0 ngược lại lương cơ bản × tỷ lệ đi lại × ngày đi làm ÷ ngày công chuẩn';

test(
  'Đi lại: "lương cơ bản × tỷ lệ đi lại × (ngày đi làm ÷ ngày công chuẩn)" khớp m.travel từng bit trên 300 ca, iDorm = 0',
  opts,
  async () => {
    const Formula = await load();
    const tree = treeOf(Formula, TRAVEL_NESTED);
    const idormCases = cases().filter(c => c.staff.idorm);
    assert.ok(idormCases.length >= 20, 'ca vàng có đủ người ở iDorm');
    const wrong = compare(
      cases(),
      c => c.m.travel,
      c => Formula.evaluate(tree, ctxOf(c)),
      bitExact
    );
    assert.deepEqual(wrong, []);
  }
);

test(
  'Đi lại viết phẳng (a × b × c ÷ d, đúng câu của chủ dự án): lệch dưới 1e-6 đồng so với m.travel trên 300 ca',
  opts,
  async t => {
    const Formula = await load();
    const tree = treeOf(Formula, TRAVEL_FLAT);
    const wrong = compare(
      cases(),
      c => c.m.travel,
      c => Formula.evaluate(tree, ctxOf(c)),
      within
    );
    assert.deepEqual(wrong, []);
    const exact = cases().filter(c => Object.is(Formula.evaluate(tree, ctxOf(c)), c.m.travel)).length;
    t.diagnostic(`đi lại phẳng giống bit: ${exact}/300 (nhân trước rồi chia khác chia trước rồi nhân ở bit cuối)`);
  }
);

// ---------- Nhóm 3: chuyên cần ----------
test(
  'Chuyên cần: "nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần × (ngày đi làm ÷ ngày công chuẩn) ngược lại 0" khớp m.attendance từng bit trên 300 ca',
  opts,
  async () => {
    const Formula = await load();
    const tree = treeOf(
      Formula,
      'phụ cấp chuyên cần = nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần × (ngày đi làm ÷ ngày công chuẩn) ngược lại 0'
    );
    const lost = cases().filter(c => c.T.attendance && c.m.attendOk === false);
    assert.ok(lost.length >= 5, 'ca vàng có người mất chuyên cần (nhánh ngược lại)');
    const wrong = compare(
      cases(),
      c => c.m.attendance,
      c => Formula.evaluate(tree, ctxOf(c)),
      bitExact
    );
    assert.deepEqual(wrong, []);
  }
);

test('Chuyên cần viết phẳng: lệch dưới 1e-6 đồng so với m.attendance trên 300 ca', opts, async () => {
  const Formula = await load();
  const tree = treeOf(
    Formula,
    'phụ cấp chuyên cần = nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần × ngày đi làm ÷ ngày công chuẩn ngược lại 0'
  );
  const wrong = compare(
    cases(),
    c => c.m.attendance,
    c => Formula.evaluate(tree, ctxOf(c)),
    within
  );
  assert.deepEqual(wrong, []);
});

// ---------- Nhóm 4: hệ số ngày KPI ----------
test(
  'Hệ số ngày KPI: "nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì ngày đi làm ÷ ngày công chuẩn ngược lại 1" khớp m.kpiRatio từng bit trên các ca có KPI',
  opts,
  async () => {
    const Formula = await load();
    const tree = treeOf(
      Formula,
      'hệ số ngày KPI = nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì ngày đi làm ÷ ngày công chuẩn ngược lại 1'
    );
    const withKpi = cases().filter(c => c.T.kpi);
    assert.ok(withKpi.length >= 200);
    assert.ok(
      withKpi.some(c => c.m.kpiRatio !== 1),
      'ca vàng có ca vượt ngưỡng (nhánh "thì")'
    );
    const wrong = compare(
      withKpi,
      c => c.m.kpiRatio,
      c => Formula.evaluate(tree, ctxOf(c)),
      bitExact
    );
    assert.deepEqual(wrong, []);
  }
);

// ---------- Nhóm 5: ghép bằng tham chiếu công thức có tên (FormulaRef) ----------
test(
  'Ghép bằng FormulaRef: tổng thu nhập = tiền ngày công + (phụ cấp đi lại + phụ cấp chuyên cần) + lương KPI, hai phụ cấp tính bằng cây, bằng m.total từng bit trên 300 ca',
  opts,
  async () => {
    const Formula = await load();
    const travel = treeOf(Formula, TRAVEL_NESTED);
    const attendance = treeOf(
      Formula,
      'phụ cấp chuyên cần = nếu giữ được chuyên cần thì lương cơ bản × tỷ lệ chuyên cần × (ngày đi làm ÷ ngày công chuẩn) ngược lại 0'
    );
    const total = treeOf(Formula, 'tổng thu nhập = tiền ngày công + (phụ cấp đi lại + phụ cấp chuyên cần) + lương KPI');
    assert.deepEqual([...Formula.dependencies(total)].sort(), [
      'luongKpi',
      'phuCapChuyenCan',
      'phuCapDiLai',
      'tienNgayCong'
    ]);
    const formulas = { phuCapDiLai: travel, phuCapChuyenCan: attendance };
    const v = Formula.validate(total, { vocabulary: VOCAB, formulas });
    assert.ok(
      !(v.errors || []).some(e => e.code === 'FORMULA_CYCLE' || e.code === 'FORMULA_UNIT_MISMATCH'),
      JSON.stringify(v.errors)
    );
    const wrong = compare(
      cases(),
      c => c.m.total,
      c => Formula.evaluate(total, ctxOf(c, formulas)),
      bitExact
    );
    assert.deepEqual(wrong, []);
  }
);

test('Các cây ca vàng qua deserialize(serialize()) cho đúng cùng số trên 300 ca', opts, async () => {
  const Formula = await load();
  const tree = treeOf(Formula, TRAVEL_NESTED);
  const loaded = Formula.deserialize(Formula.serialize(tree));
  const wrong = compare(
    cases(),
    c => c.m.travel,
    c => Formula.evaluate(loaded, ctxOf(c)),
    bitExact
  );
  assert.deepEqual(wrong, []);
});

test('Các công thức ca vàng validate sạch (đơn vị, miền, không vòng)', opts, async () => {
  const Formula = await load();
  for (const text of [TRAVEL_NESTED, TRAVEL_FLAT]) {
    const v = Formula.validate(treeOf(Formula, text), { vocabulary: VOCAB });
    assert.deepEqual(v.errors, [], text);
  }
  const kpi = treeOf(
    Formula,
    'hệ số ngày KPI = nếu giờ vượt ngưỡng > ngưỡng giờ KPI thì ngày đi làm ÷ ngày công chuẩn ngược lại 1'
  );
  assert.deepEqual(Formula.validate(kpi, { vocabulary: VOCAB }).errors, []);
});

// ---------- Chưa viết được bằng cây ----------
test.todo(
  'Chưa viết được: tiền ngày công và thành phần trong ngày (chia ngày lễ, sổ giờ bù, OT bị chặn, giờ nghỉ đêm) là hàm có sẵn bị khoá thanhPhanNgay (TK mục 2); Sau'
);
test.todo(
  'Chưa viết được: cờ "giữ được chuyên cần" (calcMonth → attendOk) và tiền KPI (KpiScore.pay) là hàm có sẵn bị khoá; ca vàng lấy kết quả của khối cũ làm đầu vào'
);
test.todo(
  'Chờ chủ dự án/architect: tổng thu nhập gõ phẳng không bằng khối cũ từng bit (17/300 ca lệch ~1e-9 đồng); thêm biến "phụ cấp" hay chấp nhận dung sai 1e-6'
);
