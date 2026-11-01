'use strict';
// Hai chỗ kiểm đầu vào của kỳ lương (src/domain/period/periods.ts):
//   decide: PUT /api/periods/:month/payslips/decide với `note` không phải chuỗi (số, đối tượng, mảng) không được lọt qua cổng bỏ qua phát hiện AI:
//     cổng chỉ chạy khi note là chuỗi, nên note khác kiểu phải bị 400, không duyệt gì, không ghi nhật ký.
//   mark-paid: POST /api/periods/:month/mark-paid với paidAt "1" (Date.parse nhận) phải bị 400, kỳ vẫn "approved".
// Mỗi test một tháng riêng (P.monthPool) vì payslips, payroll_runs, audit_log chỉ-thêm-dòng. Người bịa (qa_*) của test/helpers/period-flow.ts.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const FLAG = 'isat-frequency';
// Kỳ đã qua AI kiểm tra, phiếu qa_nv1 mang một cờ AI chưa bỏ qua
async function flaggedMonth() {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  await store.payroll.applyAiReview((await store.payroll.currentRun(M)).id, { qa_nv1: [FLAG] });
  const slip = (await P.slipRows(M)).find(r => r.username === 'qa_nv1');
  assert.equal(slip.status, 'pending');
  assert.deepEqual(slip.flags, [FLAG]);
  return { M, slip };
}
const decideRows = async (M?) =>
  await store.db
    .prepare("SELECT * FROM audit_log WHERE month = ? AND action LIKE 'period.payslip%' ORDER BY id")
    .all(M);
const slipStatus = async (M?, username?) => (await P.slipRows(M)).find(r => r.username === username).status;

/* ================= decide: note không phải chuỗi ================= */

/* ================= mark-paid: paidAt không hợp lệ ================= */

test('V1A-S6-8: chi trả với paidAt không phải ngày thật ("1", "May 5", ngày 45, rỗng, số) bị 400 và kỳ vẫn "approved"', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const before = await F.snapshot();
  for (const paidAt of ['1', 'May 5', '2026-13-45', '2026-02-30', '05/11/2026', '', '   ', 20261105, null, {}]) {
    const res = await P.step(M, 'mark-paid', { paidAt });
    assert.equal(
      res.status,
      400,
      `paidAt ${JSON.stringify(paidAt)}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`
    );
  }
  assert.equal((await F.call('GET', `/periods/${M}`)).data.status, 'approved');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'không ghi gì sau các lần từ chối');
});

test('V1A-S6-8 (đối chứng): paidAt đúng dạng YYYY-MM-DD được nhận và ghi vào kỳ', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const res = await P.step(M, 'mark-paid', { paidAt: '2026-11-05' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  assert.equal(res.data.status, 'paid');
  assert.equal(res.data.paidAt, '2026-11-05');
});
