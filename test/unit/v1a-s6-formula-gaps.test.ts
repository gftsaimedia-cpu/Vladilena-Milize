'use strict';
// Ba trường hợp biên của công thức gõ chữ:
//   - bảng bậc có cạnh âm không bị báo FORMULA_TIER_GAP
//   - số hạng của miền tháng đứng riêng trong "tổng theo ngày" bị từ chối, không cộng mỗi ngày
//   - công thức đã lưu dùng điểm KPI đọc điểm đã gán (calcMonth gán kpiDat, mucKpi, diemKpi trước khi đọc F.*)
// Người và số đều bịa; không đọc đồng hồ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Formula = require('../../src/engine/formula');
const Vocab = require('../../src/engine/formula-vocab');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../helpers/defaults-old-basis.js');
const PayrollGraph = require('../../src/engine/payroll-graph');
const { attendDeclaredDays } = require('../helpers/payroll-cases');
const FormulaVocab = require('../../src/engine/formula-vocab');

const params = PayrollParams.DEFAULTS;
const clone = (value?) => JSON.parse(JSON.stringify(value));

/* ---------- cạnh âm ---------- */

test('V1A-S6-6: bảng bậc có cạnh âm ("dưới -5; từ -5 trở lên") qua kiểm, không báo FORMULA_TIER_GAP', async () => {
  const res = Formula.parse('khoản A = bảng bậc theo giờ vượt ngưỡng: dưới -5 → 1; từ -5 trở lên → 0', {
    vocabulary: Vocab
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  const v = Formula.validate(res.tree, { vocabulary: Vocab });
  assert.deepEqual(
    v.errors.map(e => e.code),
    []
  );
  assert.equal(v.ok, true);
  // và tính đúng ở hai bên cạnh: "từ -5" gồm -5, "dưới -5" không gồm
  const values = Object.fromEntries(res.newParameters.map(p => [p.key, p.value]));
  const at = (x?) => Formula.evaluate(res.tree, { variables: { gioVuotNguong: x }, parameters: values });
  assert.equal(await at(-6), 1);
  assert.equal(await at(-5), 0);
  assert.equal(await at(0), 0);
});

test('V1A-S6-6 (đối chứng): bảng bậc cạnh dương cùng hình dạng vẫn qua kiểm', () => {
  const res = Formula.parse('khoản A = bảng bậc theo giờ vượt ngưỡng: dưới 5 → 1; từ 5 trở lên → 0', {
    vocabulary: Vocab
  });
  assert.deepEqual(
    Formula.validate(res.tree, { vocabulary: Vocab }).errors.map(e => e.code),
    []
  );
});

/* ---------- số hạng miền tháng trong tổng theo ngày ---------- */

test('V1A-S6-7: "tổng theo ngày (tiền OT trong ngày + lương cơ bản)" bị từ chối khi kiểm (FORMULA_DOMAIN_MIXED), không cộng lương cơ bản mỗi ngày', () => {
  const res = Formula.parse('khoản A = tổng theo ngày (tiền OT trong ngày + lương cơ bản của level)', {
    vocabulary: Vocab
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  const v = Formula.validate(res.tree, { vocabulary: Vocab });
  assert.equal(v.ok, false, 'phải bị từ chối: lương cơ bản (miền tháng) bị cộng một lần cho mỗi ngày');
  assert.ok(
    v.errors.some(e => e.code === 'FORMULA_DOMAIN_MIXED'),
    JSON.stringify(v.errors.map(e => e.code))
  );
});

test('V1A-S6-7 (đối chứng): lương cơ bản NHÂN với biến theo ngày trong tổng theo ngày vẫn hợp lệ (không phải số hạng đứng riêng)', () => {
  const res = Formula.parse('khoản A = tổng theo ngày (giờ OT trong ngày × lương cơ bản của level)', {
    vocabulary: Vocab
  });
  assert.equal(Formula.validate(res.tree, { vocabulary: Vocab }).ok, true);
});

/* ---------- công thức đã lưu đọc điểm KPI ---------- */

const voc = FormulaVocab;
function withSaved(name?, text?) {
  const res = Formula.parse(text, { vocabulary: voc });
  assert.ok(res.ok, `${text} -> ${JSON.stringify(res.errors)}`);
  const check = Formula.validate(res.tree, {
    vocabulary: voc,
    target: name,
    formulas: PayrollGraph.treesWith({ [name]: res.tree })
  });
  assert.ok(check.ok, `${text} -> ${JSON.stringify(check.errors.map(e => e.code))}`);
  const saved = { ...params, [`formula.${name}`]: { text, tree: Formula.serialize(res.tree) } };
  for (const p of res.newParameters) saved[p.key] = p.value;
  return PayrollEngine.create(saved);
}
// NV bậc 1, hai ngày đi làm đủ ca, KPI tự đánh giá 100 % trên mức 6.000.000 (đạt mốc), phương pháp KPI cũ
const kpiInput = () =>
  attendDeclaredDays({
    staff: { username: 'qa_kpi_nv1', type: 'nv', level: 1, nightPct: 40, startDate: '2026-01-05' },
    days: {
      '2026-10-05': { kind: 'work', in: '08:00', out: '17:00' },
      '2026-10-06': { kind: 'work', in: '08:00', out: '17:00' }
    },
    approvals: {},
    kpi: { pct: 100, amt: 6000000, admPct: null, admAmt: null },
    holidays: [],
    month: '2026-10',
    upTo: null
  });
const run = (engine?) => engine.computeMonth(clone(kpiInput())).m;
const near = (a?, b?, what?) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} khác ${b}`);

test('V1A-S6-9 (đối chứng): mặc định KPI đạt, hệ số ngày KPI 1, lương KPI 6.000.000 đ, dòng phiếu cộng ra tổng', () => {
  const m = run(PayrollEngine.create(params));
  assert.equal(m.kpiPass, true);
  assert.equal(m.kpiRatio, 1);
  assert.equal(m.kpiPay, 6000000);
  near(m.total, m.work + m.allow + m.kpiPay, 'tổng thu nhập');
});

test('V1A-S6-9: "hệ số ngày KPI = nếu KPI đạt thì 1 ngược lại 0" cho hệ số 1 (KPI đạt) chứ không phải 0', () => {
  const m = run(withSaved('heSoNgayKpi', 'hệ số ngày KPI = nếu KPI đạt thì 1 ngược lại 0'));
  assert.equal(m.kpiPass, true);
  assert.equal(m.kpiRatio, 1, 'KPI đạt thì hệ số phải là 1');
  assert.equal(m.trace.heSoNgayKpi, 1);
  assert.equal(m.kpiPay, 6000000);
  near(m.total, m.work + m.allow + m.kpiPay, 'tổng thu nhập');
});

test('V1A-S6-9: "chuyên cần = nếu KPI đạt thì lương cơ bản × tỷ lệ chuyên cần ngược lại 0" cho 1.500.000 đ ở dòng chuyên cần, dòng phiếu cộng ra tổng', () => {
  const rate = params['type.nv.attendance'];
  const m = run(
    withSaved(
      'phuCapChuyenCan',
      'chuyên cần = nếu KPI đạt thì lương cơ bản của level × tỷ lệ chuyên cần theo loại ngược lại 0'
    )
  );
  assert.equal(m.kpiPass, true);
  assert.equal(m.attendance, 6000000 * rate, `dòng chuyên cần phải là 6.000.000 × ${rate}`);
  assert.equal(m.trace.phuCapChuyenCan, m.attendance);
  near(m.total, m.work + m.allow + m.kpiPay, 'tổng thu nhập');
});
