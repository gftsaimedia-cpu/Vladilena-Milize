'use strict';
// Dòng tiền tháng (m.lines) của người xếp ca thường làm đêm ngày lễ: phụ trội đêm của giờ làm sau 22:00 nằm ở dòng nightPay (flexPay chỉ của ca Flex, nightPay của mọi ca còn lại),
// nên các dòng ngày cộng lại đúng tiền ngày (m.work) và pay của các dòng ngày cộng lại đúng bằng nó.
// Người mẫu qa_s_nv: NV bậc 1, lương cơ bản 6.000.000, ca n1 xếp loại thường; lễ Thứ Bảy 10/10/2026 làm 08:00–23:30 (đã duyệt OT lễ), có 1,5 giờ sau 22:00.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');
const { monthProblems } = require('../helpers/payroll-invariants');

const HOLIDAY = '2026-10-10';
const run = async () => {
  const days = { ...F.fullDays('2026-10', F.MON_SAT), [HOLIDAY]: { kind: 'work', in: '08:00', out: '23:30' } };
  const approvals = await F.approved(days, [HOLIDAY], 'nv', [HOLIDAY]);
  return F.run(F.nvStaff({ nightPct: undefined }), days, {
    holidays: [HOLIDAY],
    approvals,
    over: { 'shift.allowance.basis': 'assigned', 'tax.contract.basis': 'declared', 'shift.kind.n1': 'normal' }
  });
};

test('dòng tiền: ca thường làm đêm ngày lễ có phụ trội đêm 1,5 giờ × 28.846,15 × 30 % = 12.981 ở nightPay, flexPay 0', async () => {
  const { m } = await run();
  // lương giờ = 6.000.000 ÷ 26 ÷ 8 = 28.846,15; 1,5 giờ đêm × 28.846,15 × 30 % = 12.980,77 → 12.981
  assert.equal(m.lines.nightPay, 12981);
  assert.equal(m.lines.flexPay, 0);
});

test('dòng tiền: các dòng ngày cộng lại đúng tiền ngày và tổng thu nhập, pay của các dòng ngày cộng lại đúng tiền ngày', async () => {
  const { m } = await run();
  assert.deepEqual(monthProblems(m), []);
  const { lines } = m;
  const dayPay =
    lines.workBase +
    lines.leavePay +
    lines.isatPay +
    lines.holidayPay +
    lines.otPay +
    lines.flexPay +
    lines.nightPay +
    lines.breakPay -
    lines.lateCut;
  assert.equal(m.work, dayPay);
  assert.equal(
    m.rows.reduce((sum, row) => sum + row.pay, 0),
    dayPay
  );
});
