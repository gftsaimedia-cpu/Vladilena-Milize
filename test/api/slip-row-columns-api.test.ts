'use strict';
// Dòng ngày của phiếu mà trang 1 bản in A4 đọc (GET /periods/:month/estimates/:username và GET /periods/:month/payslips/:username) có
// kèm cot = { luongNgay, phuCapCa, lamThem, truGio } do máy chủ tính (src/domain/payroll/slip-paid.ts → dayFiguresOf → PayrollEngine.columnsOfDay) cho
// ngày đi làm: bốn cột cộng trừ đúng làm tròn của total. Bản chụp lưu trong DB không có cot (chỉ thêm lúc trả). Chỉ người bịa (qa_*).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

function checkRows(rows?, label?) {
  assert.ok(Array.isArray(rows) && rows.length, `${label}: có dòng ngày`);
  let worked = 0;
  for (const r of rows) {
    if (r.kind === 'work' || (r.kind === 'holiday' && r.hours > 0)) {
      worked++;
      const c = r.cot;
      assert.ok(c, `${label} ${r.date}: có cột tiền`);
      assert.equal(
        c.luongNgay + c.phuCapCa + c.lamThem - c.truGio,
        Number.isFinite(r.pay) ? r.pay : Math.round(r.total),
        `${label} ${r.date}`
      );
    } else assert.equal(r.cot, undefined, `${label} ${r.date} (${r.kind}): ngày không đi làm không có cột tiền`);
  }
  assert.ok(worked > 0, `${label}: có ngày đi làm`);
}

test('phiếu ước tính một người: dòng ngày kèm cột tiền cộng đúng Thành tiền', async () => {
  const M = monthOf();
  await P.seed(M, { withActual: true }); // có Check-in/out: có ngày đi làm
  const res = await F.call('GET', `/periods/${M}/estimates/qa_nv1`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  checkRows(res.data.payslip.snapshot.rows, 'estimate');
});

test('phiếu đã tính: dòng ngày kèm cột tiền, bản chụp lưu trong DB không đổi', async () => {
  const M = await P.setupMonth(monthOf(), 'calculated', { withActual: true });
  const res = await F.call('GET', `/periods/${M}/payslips/qa_nv1`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  checkRows(res.data.payslip.snapshot.rows, 'payslip');
  const run = await store.payroll.currentRun(M);
  const stored = (await store.payroll.getPayslip(run.id, 'qa_nv1', { snapshot: true })).snapshot;
  assert.ok(
    stored.rows.every(r => !Object.hasOwn(r, 'cot')),
    'bản chụp lưu không có trường hiển thị'
  );
});
