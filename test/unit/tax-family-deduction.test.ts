'use strict';
// Thuế TNCN luỹ tiến (hợp đồng dài): thu nhập tính thuế = thu nhập chịu thuế − bảo hiểm − giảm trừ gia cảnh, phần dương áp biểu luỹ tiến từng phần.
// Giảm trừ gia cảnh = tax.deduction.personal (15.500.000) + số người phụ thuộc × tax.deduction.dependant (6.200.000).
// Thuế phát sinh khi (chịu thuế − bảo hiểm) lớn hơn giảm trừ bản thân; dưới hoặc bằng thì 0.
// Biểu: đến 10 triệu 5 %, đến 30 triệu 10 %, đến 60 triệu 20 %, đến 100 triệu 30 %, trên đó 35 % (tính tay ở đây, không đọc từ tham số).
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const F = require('../helpers/schedule-fixtures');
const { near, plainAll } = require('../helpers/formula-eval');

const PERSONAL = 15500000;
const DEPENDANT = 6200000;
const engine = Engine.create(DEFAULTS);
const LONG = { contract: 'long', taxOn: true };
const deductionOf = (dependants?) => PERSONAL + dependants * DEPENDANT;
// thuế tính tay theo biểu: [trần bậc, tỷ lệ]
function expectedTax(assessable?) {
  const brackets = [
    [10000000, 0.05],
    [30000000, 0.1],
    [60000000, 0.2],
    [100000000, 0.3],
    [Infinity, 0.35]
  ];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    if (assessable <= lower) break;
    tax += (Math.min(assessable, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}
// chịu thuế − bảo hiểm = income, nhân sự có `dependants` người phụ thuộc
const taxAt = (income?, dependants = 0, insurance = 0) =>
  engine.taxFrom(LONG, income + insurance, income + insurance, insurance, deductionOf(dependants));

test('tham số giảm trừ: bản thân 15.500.000, mỗi người phụ thuộc 6.200.000', () => {
  assert.equal(DEFAULTS['tax.deduction.personal'], PERSONAL);
  assert.equal(DEFAULTS['tax.deduction.dependant'], DEPENDANT);
});

test('không người phụ thuộc: dưới hoặc đúng 15.500.000 sau bảo hiểm thì thuế 0, vượt 1 đồng mới phát sinh', () => {
  for (const income of [0, 5000000, 10000000, 15499999, PERSONAL]) {
    const r = taxAt(income);
    assert.equal(r.taxDue, false, `${income}`);
    assert.equal(r.tax, 0, `${income}`);
  }
  const over = taxAt(PERSONAL + 1);
  assert.equal(over.taxDue, true);
  assert.equal(over.assessable, 1);
  assert.equal(over.tax, 0, '1 đồng × 5 % làm tròn về 0');
  assert.equal(taxAt(PERSONAL + 20).tax, 1);
});

test('không người phụ thuộc: các mốc của biểu (thu nhập tính thuế = sau bảo hiểm − 15.500.000)', () => {
  const cases = [
    [10000000, 500000], // hết bậc 5 %
    [10000001, 500000], // 1 đồng đầu của bậc 10 % làm tròn về 0
    [10000010, 500001],
    [30000000, 2500000], // hết bậc 10 %
    [60000000, 8500000], // hết bậc 20 %
    [100000000, 20500000], // hết bậc 30 %
    [120000000, 27500000] // bậc 35 %
  ];
  for (const [assessable, tax] of cases) {
    const r = taxAt(PERSONAL + assessable);
    assert.equal(r.assessable, assessable);
    assert.equal(r.tax, tax, `thu nhập tính thuế ${assessable}`);
    assert.equal(r.tax, expectedTax(assessable));
  }
});

test('hai người phụ thuộc: giảm trừ 27.900.000, thuế 0 tới đúng mức đó và các mốc biểu dịch theo giảm trừ', () => {
  const deduction = deductionOf(2);
  assert.equal(deduction, 27900000);
  const below = taxAt(deduction, 2);
  assert.equal(below.assessable, 0);
  assert.equal(below.tax, 0);
  assert.equal(taxAt(PERSONAL + 1, 2).tax, 0, 'qua giảm trừ bản thân nhưng còn dưới giảm trừ gia cảnh');
  for (const assessable of [10000000, 30000000, 60000000, 100000000]) {
    const r = taxAt(deduction + assessable, 2);
    assert.equal(r.assessable, assessable);
    assert.equal(r.tax, expectedTax(assessable));
  }
  assert.equal(taxAt(deduction + 10000000, 2).tax, 500000);
});

test('bảo hiểm được trừ trước khi áp giảm trừ: sau bảo hiểm 25.500.000 và không phụ thuộc thì tính thuế trên 10.000.000', () => {
  const r = engine.taxFrom(LONG, 28000000, 28000000, 2500000, deductionOf(0));
  assert.equal(r.assessable, 10000000);
  assert.equal(r.tax, 500000);
});

test('mỗi người phụ thuộc giảm thu nhập tính thuế đúng 6.200.000: thuế giảm theo bậc đang chịu', () => {
  const income = PERSONAL + 40000000; // không phụ thuộc: tính thuế trên 40.000.000
  const taxes = [0, 1, 2, 3].map(n => taxAt(income, n).tax);
  assert.deepEqual(
    taxes,
    [0, 1, 2, 3].map(n => expectedTax(40000000 - n * DEPENDANT))
  );
  assert.ok(taxes[0] > taxes[1] && taxes[1] > taxes[2] && taxes[2] > taxes[3]);
});

test('khoản giảm trừ đưa theo bản chụp (contractInfo.deduction) cho cùng thuế với tham số thứ năm', () => {
  const income = PERSONAL + 40000000;
  const viaArg = engine.taxFrom(LONG, income, income, 0, deductionOf(2));
  const viaSnapshot = engine.taxFrom({ ...LONG, deduction: deductionOf(2) }, income, income, 0);
  assert.deepEqual(viaSnapshot, viaArg);
});

test('hợp đồng ngắn hạn khấu trừ cố định trên tổng thu nhập, không áp giảm trừ gia cảnh', () => {
  const short = { contract: 'short', taxOn: true };
  const r = engine.taxFrom(short, 20000000, 20000000, 0, deductionOf(2));
  assert.equal(r.tax, 2000000);
  assert.equal(r.assessable, 0);
});

/* ---------- cả tháng: thuế trên phiếu từ bộ máy ---------- */
const BIG = { ...DEFAULTS, 'level.nv.1.base': 60000000 };
const slipOf = (dependants?) => {
  const staff = F.nvStaff({ dependants });
  const m = Engine.create(BIG).calcMonth(
    staff,
    F.fullDays('2026-10', F.MON_SAT),
    null,
    [],
    '2026-10',
    null,
    undefined,
    '2026-11-05T00:00:00Z'
  );
  return { staff, m, n: m.net };
};

test('phiếu cả tháng: thuế = biểu luỹ tiến trên (chịu thuế − bảo hiểm − 15.500.000 − 6.200.000 × số người phụ thuộc)', async () => {
  const taxes: any[] = [];
  for (const dependants of [0, 2]) {
    const { n } = await slipOf(dependants);
    assert.equal(n.dependants, dependants);
    assert.equal(n.deduction, deductionOf(dependants));
    const assessable = Math.max(0, n.taxable - n.insurance - deductionOf(dependants));
    assert.equal(n.assessable, assessable);
    assert.ok(assessable > 0);
    assert.equal(n.tax, expectedTax(assessable));
    assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance);
    taxes.push(n.tax);
  }
  assert.ok(taxes[0] > taxes[1], 'hai người phụ thuộc đóng ít thuế hơn không người phụ thuộc');
});

test('phiếu cả tháng của người lương thấp: sau bảo hiểm dưới giảm trừ bản thân thì thuế 0 dù có hay không người phụ thuộc', () => {
  for (const dependants of [0, 2]) {
    const m = Engine.create(DEFAULTS).calcMonth(
      F.nvStaff({ dependants }),
      F.fullDays('2026-10', F.MON_SAT),
      null,
      [],
      '2026-10',
      null,
      undefined,
      '2026-11-05T00:00:00Z'
    );
    assert.equal(m.net.tax, 0);
    assert.equal(m.net.taxDue, false);
  }
});

test('công thức Chi tiết của thuế tính ra đúng số thuế trên phiếu (0 và 2 người phụ thuộc) và nêu giảm trừ gia cảnh', async () => {
  for (const dependants of [0, 2]) {
    const { staff, m } = await slipOf(dependants);
    const snapshot = JSON.parse(JSON.stringify(m));
    const f = plainAll(
      formulasOf({ snapshot, staffTerms: staff, params: BIG, month: '2026-10', cells: cellsOf(snapshot) })
    );
    near(f.tax, snapshot.net.tax, `thuế ${dependants} người phụ thuộc`);
    assert.match(f.tax, /15\.500\.000 đ giảm trừ/);
    if (dependants > 0) assert.match(f.tax, new RegExp(`${dependants} người phụ thuộc`));
  }
});
