'use strict';
// Công thức dưới từng dòng Chi tiết của phiếu Admin (src/domain/payroll/slip-formulas.ts, gắn ở src/domain/period/periods.ts):
//   - GET /periods/:m/estimates/:u (ước tính) và GET /periods/:m/payslips/:u (đã tính lương) cho Admin đều có `formulas`;
//   - nhân sự xem phiếu của chính mình (selfView) không nhận `formulas`;
//   - Admin sửa một ô của phiếu thì công thức vẫn là công thức của số tự tính (không đổi).
// Người bịa của helpers/period-flow.js; mỗi test một tháng riêng.
const P = require('../helpers/period-api');
const { plain } = require('../helpers/formula-eval');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const estimateOf = async (month?, user?, who = 'admin') =>
  await F.call('GET', `/periods/${month}/estimates/${user}`, { who });
const payslipOf = async (month?, user?, who = 'admin') =>
  await F.call('GET', `/periods/${month}/payslips/${user}`, { who });

test('Phiếu đã tính lương: Admin có formulas, nhân sự xem số của mình (GET /me/estimate) không có', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const admin = P.must(await payslipOf(M, 'qa_nv1'), 'phiếu Admin').data.payslip;
  assert.ok(admin.formulas && admin.formulas.leavePay, `Admin: ${JSON.stringify(admin.formulas)}`);
  const self = P.must(await F.call('GET', `/me/estimate?month=${M}`, { who: 'qa_nv1' }), 'số của nhân sự');
  assert.doesNotMatch(JSON.stringify(self.data), /formulas|÷ 26/);
});

test('Phiếu ước tính của Admin có formulas: chuỗi công thức cho dòng có số, Thực nhận là chuỗi cộng trừ', async () => {
  const M = monthOf();
  await P.seed(M);
  const res = await estimateOf(M, 'qa_nv1');
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  const fm = res.data.payslip.formulas;
  assert.ok(fm && typeof fm === 'object', 'có formulas');
  for (const [key, text] of Object.entries<any>(fm)) assert.equal(typeof text, 'string', key);
  assert.match(plain(fm.leavePay), /÷ 26 ngày chuẩn × /, `leavePay: ${fm.leavePay}`);
  assert.ok(fm.gross && fm.net, 'có công thức Tổng thu nhập và Thực nhận');
});

test('Admin sửa ô chuyên cần: số trên phiếu đổi nhưng công thức vẫn là của số tự tính', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const before = P.must(await payslipOf(M, 'qa_nv1'), 'phiếu trước khi sửa').data.payslip;
  const put = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv1', month: M, values: { attendance: 500000 }, reason: 'Điều chỉnh theo biên bản chi trả' }
  });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const after = P.must(await payslipOf(M, 'qa_nv1'), 'phiếu sau khi sửa').data.payslip;
  assert.equal(after.gross, before.gross + 500000, 'tổng thu nhập có số sửa');
  assert.deepEqual(after.formulas.attendance, before.formulas.attendance);
  assert.equal(after.formulas.workBase, before.formulas.workBase);
});
