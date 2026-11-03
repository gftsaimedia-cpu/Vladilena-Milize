'use strict';
// Công thức miễn thuế và thu nhập chịu thuế trên phiếu Admin (src/domain/payroll/slip-formulas.ts → exemptOf): chỉ phần trả cao hơn lương giờ thường
// của cùng số giờ được miễn. Test tự đọc chuỗi công thức (số vi-VN, × ÷ + −) rồi tính, so với số miễn thuế của bộ máy, sai không quá
// 1 đồng mỗi bước làm tròn. Người mẫu: NV bậc 1, lương cơ bản 6.000.000 ₫, ngày công chuẩn 26, lương giờ 28.846,15 ₫.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const F = require('../helpers/schedule-fixtures');

const { near, plainAll } = require('../helpers/formula-eval');
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

/* ---------- các nhóm miễn thuế ---------- */
test('7 giờ đêm ngày thường: chỉ phụ trội đêm 7 × 28.846,15 × 0,3 = 60.577, thu nhập chịu thuế = tổng thu nhập − 60.577', async () => {
  const s = await slipOf(NIGHT, { '2026-10-05': nightShift() });
  assert.equal(s.n.exempt, 60577);
  assert.equal(s.f.exempt, '7 giờ đêm × 28.846,15 đ/giờ × 30%');
  exemptNear(s, 'đêm');
  assert.equal(s.f.taxable, `${vn(s.n.gross)} tổng thu nhập − 60.577 miễn thuế`);
  near(s.f.taxable, s.n.taxable, 'chịu thuế');
});

test('OT ngày thường 4 giờ: tiền OT trừ 4 giờ lương thường = 173.077 − 4 × 28.846,15 = 57.692', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work({ extraKind: 'ot', extraOut: '21:00' }) });
  assert.equal(s.n.exempt, 57692);
  assert.equal(s.f.exempt, '(173.077 đ OT − 4 giờ OT × 28.846,15 đ/giờ)');
  exemptNear(s, 'OT thường');
  near(s.f.taxable, s.n.taxable, 'chịu thuế');
});

test('OT Chủ nhật ngoài lịch ×2: 230.769 − 4 × 28.846,15 = 115.385', async () => {
  const SUN = '2026-10-04';
  const staff = F.nvStaff();
  const days = { ...F.fullDays('2026-10', F.MON_SAT), [SUN]: { ...F.WORK, extraKind: 'ot', extraOut: '21:00' } };
  const sessions = [
    ...F.punches(staff, F.datesOn('2026-10', F.MON_SAT), { sched: F.MON_SAT }),
    ...F.punches(staff, [SUN], { sched: F.MON_SAT, to: 240 })
  ];
  const r = F.run(staff, days, {
    actualFrom: '2026-10-01',
    sessions,
    approvals: await F.approved(days, [], 'nv', [SUN])
  });
  const s = fromMonth(r.m, staff, r.params, '2026-10');
  assert.equal(s.n.exemptOt, 115385);
  assert.equal(s.f.exempt, '(230.769 đ OT cuối tuần − 4 giờ OT cuối tuần × 28.846,15 đ/giờ)');
  exemptNear(s, 'OT Chủ nhật');
});

test('ca đêm qua lễ 01/10: miễn thuế 193.269 = 5 giờ đêm ngoài lễ 43.269 + làm lễ 207.692 − 2 × 28.846,15 = 150.000', async () => {
  const s = await slipOf(NIGHT, { '2026-10-01': nightShift() }, { holidays: ['2026-10-01'] });
  assert.equal(s.n.exempt, 193269);
  assert.equal(s.f.exempt, '5 giờ đêm × 28.846,15 đ/giờ × 30% + (207.692 đ làm lễ − 2 giờ lễ × 28.846,15 đ/giờ)');
  exemptNear(s, 'đêm lễ');
  near(s.f.taxable, s.n.taxable, 'chịu thuế');
});

test('phụ cấp ca nhỏ hơn phụ trội đêm: ngày đó chỉ miễn đúng số phụ cấp ca đã trả, công thức ghi số phụ cấp', async () => {
  const params = { ...ASSIGNED, 'type.nv.nightPct': 5 };
  const s = await slipOf({ ...NIGHT, nightPct: 5 }, { '2026-10-05': nightShift() }, { params });
  assert.ok(s.cells.nightPay > 0);
  assert.equal(s.f.exempt, `${vn(s.cells.nightPay)} đ phụ cấp ca đêm`);
  assert.equal(s.n.exempt, Math.round(s.cells.nightPay));
});

test('tiền trả vượt mức miễn của luật: lấy mức luật trừ giờ thường (4 × 28.846,15 × 1,2 − 4 × 28.846,15)', async () => {
  const params = { ...ASSIGNED, 'tax.exempt.otRate': 1.2 };
  const s = await slipOf(DAY, { '2026-10-05': work({ extraKind: 'ot', extraOut: '21:00' }) }, { params });
  assert.equal(s.f.exempt, '(4 giờ OT × 28.846,15 đ/giờ × 1,2 − 4 giờ OT × 28.846,15 đ/giờ)');
  exemptNear(s, 'vượt mức luật');
  assert.ok(s.n.exempt < 57692);
});

test('bản chụp cũ không có dòng ngày: tổng giờ đêm × lương giờ × phụ trội đêm', async () => {
  const s = await slipOf(NIGHT, { '2026-10-05': nightShift() }, { dropRows: true });
  assert.equal(s.f.exempt, '7 giờ đêm × 28.846,15 đ/giờ × 30%');
  exemptNear(s, 'bản chụp cũ');
});

test('ngày thường không giờ đêm, không OT: không có công thức miễn thuế, chịu thuế = tổng thu nhập − 0', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work() });
  assert.equal(s.f.exempt, undefined);
  assert.equal(s.n.exempt, 0);
  assert.equal(s.f.taxable, `${vn(s.n.gross)} tổng thu nhập − 0 miễn thuế`);
});
