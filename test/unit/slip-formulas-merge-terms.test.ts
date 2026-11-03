'use strict';
// Gộp mảnh cùng đơn giá trong công thức phiếu Admin (src/domain/payroll/slip-formulas.ts → netSum): các mảnh giờ × lương giờ × hệ số cùng đơn giá và
// cùng hệ số cộng trừ thành một mảnh ròng, mảnh ròng bằng 0 không in. Test tự đọc chuỗi công thức rồi tính, so với số trên dòng. Người mẫu: NV bậc 1, lương cơ bản 6.000.000 ₫, ngày công chuẩn 26, lương giờ 28.846,15 ₫.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const F = require('../helpers/schedule-fixtures');

const { near, plain, plainAll } = require('../helpers/formula-eval');
const vn = (v?) => Math.round(v).toLocaleString('vi-VN');

/* ---------- dựng phiếu từ bộ máy ---------- */
const ASSIGNED = { ...DEFAULTS, 'shift.allowance.basis': 'assigned', 'type.nv.nightPct': 40 };
for (const code of ['Night1', 'Night2', 'g2']) ASSIGNED[`shift.kind.${code}`] = 'night';
ASSIGNED['shift.kind.Normal1'] = 'normal';
const NIGHT = {
  username: 'qa_x_night',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const DAY = { ...NIGHT, username: 'qa_x_day', shiftCode: 'Normal1' };
const work = (extra: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1', ...extra });
const nightShift = () => ({ kind: 'work', in: '22:00', out: '07:00', preset: 'Night2' });
const clone = (v?) => JSON.parse(JSON.stringify(v));

function fromMonth(m?, staff?, params?, month?, { dropRows = false }: any = {}) {
  const full = clone({ ...m, trace: m.trace });
  const cells = cellsOf(full);
  // bản chụp cũ: số tự tính lấy từ bản đủ dòng ngày, công thức dựng từ bản không có dòng ngày
  const snapshot = clone(full);
  if (dropRows) delete snapshot.rows;
  const f = plainAll(formulasOf({ snapshot, staffTerms: staff, params, month, cells }));
  return { snapshot, cells, f, n: snapshot.net };
}
function slipOf(staff?, days?, { holidays = [], params = ASSIGNED, dropRows = false }: any = {}) {
  const m = Engine.create(params).calcMonth(
    staff,
    days,
    null,
    holidays,
    '2026-10',
    null,
    undefined,
    '2026-11-05T00:00:00Z'
  );
  return fromMonth(m, staff, params, '2026-10', { dropRows });
}
const exemptNear = (s?, label?) => near(s.f.exempt, s.n.exempt, label);

const OT_HOLIDAY = ['2026-10-10'];
const nightRows = (...dates) => Object.fromEntries(dates.map(d => [d, nightShift()]));

/* ---------- các mảnh triệt tiêu ---------- */
test('ca đêm trước lễ và ca đêm bắt đầu ở lễ: +6 giờ và −6 giờ triệt tiêu, lương cơ bản chỉ còn lương ngày × số ngày', async () => {
  const s = await slipOf(NIGHT, nightRows('2026-10-09', '2026-10-10'), { holidays: OT_HOLIDAY });
  assert.ok(s.cells.workBase > 0);
  assert.match(s.f.workBase, /^6\.000\.000 đ ÷ 26 ngày chuẩn × \d+ ngày công$/, `workBase: ${s.f.workBase}`);
  assert.ok(!/28\.846/.test(s.f.workBase), 'không còn mảnh giờ triệt tiêu');
  near(s.f.workBase, s.cells.workBase, 'lương cơ bản');
});

test('cả tháng đi làm, ca đêm 09/10 và 10/10 (lễ): lương cơ bản in đúng 6.000.000 đ ÷ 26 ngày chuẩn × 22 ngày công, không còn mảnh giờ', async () => {
  const days: Record<string, any> = {};
  for (const d of [
    '05',
    '06',
    '07',
    '08',
    '09',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '19',
    '20',
    '21',
    '22',
    '23',
    '24',
    '26',
    '27',
    '28',
    '29',
    '30'
  ])
    days[`2026-10-${d}`] = work();
  const s = await slipOf(NIGHT, { ...days, ...nightRows('2026-10-09', '2026-10-10') }, { holidays: OT_HOLIDAY });
  assert.equal(s.f.workBase, '6.000.000 đ ÷ 26 ngày chuẩn × 22 ngày công');
  near(s.f.workBase, s.cells.workBase, 'lương cơ bản');
});

/* ---------- các mảnh triệt tiêu một phần ---------- */
test('ca đêm 09/10 vào lễ, ca ngày 10/10 không có giờ thường: còn mảnh trừ ròng 6 giờ, giá trị vẫn khớp dòng', async () => {
  const s = await slipOf(NIGHT, { '2026-10-09': nightShift(), '2026-10-10': work() }, { holidays: OT_HOLIDAY });
  assert.equal(s.f.workBase, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày công − 6 giờ trùng ngày lễ × 28.846,15 đ/giờ');
  near(s.f.workBase, s.cells.workBase, 'lương cơ bản');
  assert.ok(!/(\d+(?:,\d+)?) × 28\.846,15 [+−]  × 28\.846,15/.test(s.f.workBase), s.f.workBase);
  assert.ok(!/ [+−] 0 × /.test(s.f.workBase), s.f.workBase);
});

test('gộp mảnh trong chuỗi: cùng đơn giá, cùng hệ số thì cộng giờ; khác hệ số thì để riêng; triệt tiêu một phần in mảnh ròng', () => {
  const { netSum: rawNetSum, hourTerm, sharedName } = require('../../src/domain/payroll/slip-formulas')._test;
  const netSum = (terms?) => ({ ...rawNetSum(terms), t: plain(rawNetSum(terms).t) });
  const unit = { t: '28.846,15 đ/giờ', v: 28846.15, k: 'a' };
  const x15 = { t: '1,5', v: 1.5, k: 'a' };
  const x20 = { t: '2', v: 2, k: 'a' };
  const h = (sign, hours, ...mults) => hourTerm(sign, hours, unit, 'giờ OT', ...mults);
  assert.equal(netSum([h(1, 6), h(1, 2, x15), h(-1, 6)]).t, '2 giờ OT × 28.846,15 đ/giờ × 1,5');
  assert.equal(netSum([h(1, 2, x20), h(1, 3, x20)]).t, '5 giờ OT × 28.846,15 đ/giờ × 2');
  assert.equal(netSum([h(1, 6), h(-1, 2)]).t, '4 giờ OT × 28.846,15 đ/giờ');
  assert.equal(netSum([h(1, 2), h(1, 4, x20), h(-1, 2)]).t, '4 giờ OT × 28.846,15 đ/giờ × 2');
  assert.equal(
    netSum([h(1, 2, x15), h(1, 2, x20)]).t,
    '2 giờ OT × 28.846,15 đ/giờ × 1,5 + 2 giờ OT × 28.846,15 đ/giờ × 2'
  );
  assert.equal(
    netSum([h(1, 3), h(-1, 5), h(1, 4, x15)]).t,
    '4 giờ OT × 28.846,15 đ/giờ × 1,5 − 2 giờ OT × 28.846,15 đ/giờ'
  );
  // mảnh cùng khoá khác tên: tên chung của mảnh (nếu có), mảnh có số lượng 0 không đổi tên
  const named = (sign?, hours?, label?) => sharedName(hourTerm(sign, hours, unit, label), 'giờ chênh');
  assert.equal(netSum([named(1, 6, 'giờ thường'), named(-1, 2, 'giờ trùng')]).t, '4 giờ chênh × 28.846,15 đ/giờ');
  assert.equal(netSum([named(1, 0, 'giờ thường'), named(1, 3, 'giờ trùng')]).t, '3 giờ trùng × 28.846,15 đ/giờ');
});
