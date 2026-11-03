'use strict';
// Công thức dưới từng dòng "Chi tiết" của phiếu Admin (src/domain/payroll/slip-formulas.ts → formulasOf) ghi tên hoặc đơn vị ngay sau mỗi số
// (6.000.000 đ, 23 ngày công, 28.846,15 đ/giờ), nhóm cộng trừ nằm trong ngoặc. Test này kiểm: mọi số trong mọi công thức của một loạt phiếu
// sinh có hạt đều có tên, là tỷ lệ (30%) hoặc là hệ số nhân (× 1,5); ngoặc cân; công thức tính ra đúng số của dòng (bộ đọc bỏ tên);
// các ví dụ chốt in đúng từng chữ. Người mẫu: NV bậc 1, lương cơ bản 6.000.000 ₫, ngày công chuẩn 26, lương giờ 28.846,15 ₫.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { allowanceTotalOf } = require('../../src/domain/period/period-allowance');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const F = require('../helpers/schedule-fixtures');
const Cases = require('../helpers/payroll-cases');
const { near, isArithmetic, plainAll } = require('../helpers/formula-eval');

/* ---------- dựng phiếu từ bộ máy ---------- */
const ASSIGNED = { ...DEFAULTS, 'shift.allowance.basis': 'assigned', 'type.nv.nightPct': 40 };
for (const code of ['Night1', 'Night2', 'g2']) ASSIGNED[`shift.kind.${code}`] = 'night';
ASSIGNED['shift.kind.Normal1'] = 'normal';
const NIGHT = {
  username: 'qa_n_night',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const DAY = { ...NIGHT, username: 'qa_n_day', shiftCode: 'Normal1' };
const work = (extra: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1', ...extra });
const nightShift = () => ({ kind: 'work', in: '22:00', out: '07:00', preset: 'Night2' });
const clone = (v?) => JSON.parse(JSON.stringify(v));

function fromMonth(m?, staff?, params?, month?) {
  const snapshot = clone({ ...m, trace: m.trace });
  const cells = cellsOf(snapshot);
  const f = plainAll(formulasOf({ snapshot, staffTerms: staff, params, month, cells }));
  return { snapshot, cells, f, n: snapshot.net };
}
function slipOf(staff?, days?, { holidays = [], params = ASSIGNED, month = '2026-10' }: any = {}) {
  const m = Engine.create(params).calcMonth(
    staff,
    days,
    null,
    holidays,
    month,
    null,
    undefined,
    '2026-11-05T00:00:00Z'
  );
  return fromMonth(m, staff, params, month);
}

/* ---------- kiểm một chuỗi công thức ---------- */
const NUMBER = /(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?/g;
// dòng đếm liệt kê ngày, giờ theo ngày (01–03/10; 05/10 (4 giờ)): không phải công thức tính
const COUNT_KEYS = new Set<any>([
  'workDays',
  'unpaidDays',
  'leaveDays',
  'isatDays',
  'holidayDays',
  'ot15H',
  'ot20H',
  'ot30H',
  'makeupHours'
]);
// số không tên: chỉ được là tỷ lệ (…%), hệ số sau dấu × đứng cuối nhóm, tử số phân số (56/9 giờ)
function unnamedNumbers(text?) {
  const bad: any[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (/^%/.test(after)) continue;
    if (/^\/\d/.test(after)) continue;
    if (/^ \p{L}/u.test(after)) continue;
    if (/\d\/$/.test(before)) {
      // mẫu số của phân số: phải có tên
      bad.push(m[0]);
      continue;
    }
    if (/× $/.test(before) && /^(?: [×÷+−)=≥≤<>]|\)|$)/u.test(after)) continue;
    bad.push(m[0]);
  }
  return bad;
}
const balanced = (text?) => {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};
function checkNamed(slip?, label?) {
  const targets = {
    workBase: slip.cells.workBase,
    leavePay: slip.cells.leavePay,
    settlePay: slip.cells.settlePay,
    isatPay: slip.cells.isatPay,
    holidayPay: slip.cells.holidayPay,
    otPay: slip.cells.otPay,
    attendance: slip.cells.attendance,
    travel: slip.cells.travel,
    flexPay: slip.cells.flexPay,
    breakPay: slip.cells.breakPay,
    nightPay: slip.cells.nightPay,
    kpiPay: slip.cells.kpiPay,
    lateCut: slip.cells.lateCut,
    allowanceTotal: allowanceTotalOf(slip.snapshot),
    gross: slip.n.gross,
    exempt: slip.n.exempt,
    taxable: slip.n.taxable,
    afterInsurance: slip.n.gross - slip.n.insurance,
    insurance: slip.n.insurance,
    tax: slip.n.tax,
    advance: slip.n.advance,
    net: slip.n.net
  };
  let count = 0;
  for (const [key, text] of Object.entries<any>(slip.f)) {
    if (COUNT_KEYS.has(key)) continue;
    count += 1;
    assert.deepEqual(unnamedNumbers(text), [], `${label} ${key}: số chưa có tên trong "${text}"`);
    assert.ok(balanced(text), `${label} ${key}: ngoặc không cân trong "${text}"`);
    if (key in targets && targets[key] != null && isArithmetic(text)) near(text, targets[key], `${label} ${key}`);
  }
  return count;
}

/* ---------- quét ---------- */
test('quét 400 ca sinh có hạt: mọi số trong mọi công thức có tên, ngoặc cân, tính ra đúng số của dòng', () => {
  let slips = 0;
  let formulas = 0;
  for (const cs of Cases.generateCases(20261030, 400)) {
    const r = Engine.computeMonth(cs.input, DEFAULTS);
    const s = fromMonth(r.m, cs.input.staff, DEFAULTS, cs.input.month);
    if (!s.cells) continue;
    slips += 1;
    formulas += checkNamed(s, cs.id);
  }
  assert.ok(slips > 300, `số phiếu đã quét: ${slips}`);
  assert.ok(formulas > 1000, `số công thức đã quét: ${formulas}`);
});

test('bộ kiểm số chưa tên bắt đúng: số trần bị bắt, tỷ lệ, hệ số cuối nhóm và vế phải phép so không bị bắt', () => {
  assert.deepEqual(unnamedNumbers('6.000.000 ÷ 26 × 23 ngày công'), ['6.000.000', '26']);
  assert.deepEqual(unnamedNumbers('6.000.000 đ × 25% × 23 ngày đi làm ÷ 26 ngày chuẩn'), []);
  assert.deepEqual(unnamedNumbers('4 giờ OT × 28.846,15 đ/giờ × 1,5'), []);
  assert.deepEqual(unnamedNumbers('1/6 giờ thiếu × 28.846,15 đ/giờ'), []);
  assert.deepEqual(unnamedNumbers('25 ngày không lương ≥ 14 ngày'), []);
  assert.deepEqual(unnamedNumbers('25 ngày không lương ≥ 14'), ['14']);
  assert.deepEqual(unnamedNumbers('3 giờ lễ × 1,5 + 2'), ['2']);
  assert.ok(balanced('(a + (b − c))') && !balanced('(a + b') && !balanced('a) + (b'));
});

/* ---------- ví dụ chốt ---------- */
test('cả tháng đi làm: lương cơ bản, chuyên cần, đi lại, tổng phụ cấp, thu nhập, bảo hiểm, thuế, thực nhận', () => {
  const staff = F.nvStaff();
  const r = F.run(staff, F.fullDays('2026-10', F.MON_SAT), {});
  const s = fromMonth(r.m, staff, r.params, '2026-10');
  assert.equal(s.f.workBase, '6.000.000 đ ÷ 26 ngày chuẩn × 27 ngày công');
  assert.equal(s.f.leavePay, undefined, 'số lượng 0 thì không có công thức × 0');
  assert.equal(s.f.holidayPay, undefined, 'số lượng 0 thì không có công thức × 0');
  assert.equal(s.f.attendance, '6.000.000 đ × 25% × 27 ngày đi làm ÷ 26 ngày chuẩn');
  assert.equal(s.f.travel, '6.000.000 đ × 15% × 27 ngày đi làm ÷ 26 ngày chuẩn');
  assert.equal(s.f.allowanceTotal, '1.557.692 chuyên cần + 934.615 đi lại');
  assert.equal(s.f.gross, '6.230.769 lương ngày công + 2.492.307 phụ cấp');
  assert.equal(s.f.insurance, '6.000.000 đ lương đóng bảo hiểm × 10,5%');
  assert.equal(s.f.tax, '8.723.076 đ thu nhập chịu thuế − 630.000 đ bảo hiểm ≤ 15.500.000 đ ngưỡng phát sinh thuế');
  assert.equal(s.f.taxable, '8.723.076 tổng thu nhập − 0 miễn thuế');
  assert.equal(s.f.afterInsurance, '8.723.076 tổng thu nhập − 630.000 bảo hiểm');
  assert.equal(s.f.net, '8.723.076 tổng thu nhập − 630.000 bảo hiểm − 0 thuế − 0 tạm ứng');
  checkNamed(s, 'cả tháng');
});

test('ca đêm 40 % qua ngày lễ 01/10: giờ lễ, giờ đêm lễ, ca đêm, giờ nghỉ đêm, miễn thuế có tên và ngoặc', async () => {
  const s = await slipOf(NIGHT, { '2026-10-01': nightShift() }, { holidays: ['2026-10-01'] });
  assert.equal(s.f.holidayPay, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày lễ');
  assert.equal(s.f.workBase, '6 giờ thường của ca ngày lễ × 28.846,15 đ/giờ');
  assert.equal(s.f.otPay, '2 giờ lễ × 28.846,15 đ/giờ × 3 + 2 giờ đêm lễ × 28.846,15 đ/giờ × 0,6');
  assert.equal(s.f.nightPay, '1 ca đêm × 230.769 đ/ngày × 40%');
  assert.equal(s.f.breakPay, '1 giờ nghỉ đêm × 28.846,15 đ/giờ × 1,3');
  assert.equal(s.f.allowanceTotal, '57.692 chuyên cần + 34.615 đi lại + 37.500 nghỉ đêm + 92.308 ca đêm');
  assert.equal(s.f.exempt, '5 giờ đêm × 28.846,15 đ/giờ × 30% + (207.692 đ làm lễ − 2 giờ lễ × 28.846,15 đ/giờ)');
  checkNamed(s, 'ca đêm lễ');
});

test('nhiều ca đêm: số ca × lương ngày × tỷ lệ, lương ngày ghi hai chữ số thập phân khi làm tròn lệch quá 0,25 đồng', async () => {
  const days: Record<string, any> = {};
  for (const d of ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16']) days[`2026-10-${d}`] = nightShift();
  const s = await slipOf(NIGHT, days);
  assert.equal(s.f.nightPay, '10 ca đêm × 230.769,23 đ/ngày × 40%');
  assert.equal(s.f.exempt, '70 giờ đêm × 28.846,15 đ/giờ × 30%');
  checkNamed(s, 'nhiều ca đêm');
});

test('OT ngày thường 4 giờ: làm thêm và miễn thuế đều có tên giờ, miễn thuế là nhóm trong ngoặc', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work({ extraKind: 'ot', extraOut: '21:00' }) });
  assert.equal(s.f.otPay, '4 giờ OT × 28.846,15 đ/giờ × 1,5');
  assert.equal(s.f.exempt, '(173.077 đ OT − 4 giờ OT × 28.846,15 đ/giờ)');
  assert.equal(s.f.gross, '230.769 lương ngày công + 173.077 làm thêm + 92.307 phụ cấp');
  assert.equal(s.f.taxable, '496.153 tổng thu nhập − 57.692 miễn thuế');
  checkNamed(s, 'OT');
});

test('ca đêm 09/10 vào lễ, ca ngày 10/10: mảnh giờ trừ ròng có tên, không còn mảnh triệt tiêu', async () => {
  const s = await slipOf(NIGHT, { '2026-10-09': nightShift(), '2026-10-10': work() }, { holidays: ['2026-10-10'] });
  assert.equal(s.f.workBase, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày công − 6 giờ trùng ngày lễ × 28.846,15 đ/giờ');
  checkNamed(s, 'trừ ròng');
});

test('đi muộn 10 phút: giờ lẻ ghi phân số kèm tên; nghỉ phép có tên ngày; tổng thu nhập trừ khoản đi muộn có tên', async () => {
  const s = await slipOf(DAY, { '2026-10-05': { kind: 'leave' }, '2026-10-06': work({ in: '08:10' }) });
  assert.equal(s.f.lateCut, '1/6 giờ thiếu × 28.846,15 đ/giờ');
  assert.equal(s.f.leavePay, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày phép');
  assert.match(s.f.gross, / − [\d.]+ đi muộn về sớm$/);
  checkNamed(s, 'đi muộn');
});

test('bảo hiểm không đóng: ngày chuẩn trừ ngày có lương so với ngưỡng, mỗi số có tên', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work() });
  assert.equal(s.f.insurance, '26 ngày chuẩn − 1 ngày có lương = 25 ngày không lương ≥ 14 ngày');
  assert.equal(s.f.attendance, '6.000.000 đ × 25% × 1 ngày đi làm ÷ 26 ngày chuẩn');
  checkNamed(s, 'bảo hiểm');
});
