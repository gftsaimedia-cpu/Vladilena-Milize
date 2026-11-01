'use strict';
// "Số đã sửa" trên phiếu là số CHI TRẢ (src/domain/period/periods.ts → slipBasisOf, paidFigures, withPaid, paidRows, runScan):
//   GET /api/periods/:m/payslips, tổng kỳ ở GET /api/periods/:m và GET /api/periods/:m/payslips/:u (Admin, và nhân sự xem phiếu của mình sau khi chi trả)
//   trả số tự tính của bản chụp đã áp các ô Admin sửa, tính lại tổng lương, thuế TNCN và thực lĩnh. Bản chụp và bảng phiếu không đổi.
// Người xem là nhân sự không bao giờ thấy computed, overridden, override.
// Số kiểm tính độc lập: biểu thuế lũy tiến viết tay ở helpers/pay-oracle.js (oracle.progressive), không đọc bộ máy.
// Người bịa của helpers/period-flow.js; qa_nv1 (NV bậc 1, hợp đồng dài hạn) không có chuyên cần và KPI, nên ô tự tính của hai ô đó là 0.
// Mỗi test lấy một tháng riêng (helpers/period-api.js → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { oracle } = require('../helpers/pay-oracle');

const { F, store, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const USER = 'qa_nv1';
const REASON = 'Điều chỉnh theo biên bản chi trả';
const FIGS = ['gross', 'insurance', 'tax', 'advance', 'net'];
const figsOf = (row?) => Object.fromEntries(FIGS.map(key => [key, row[key]]));
const sumOf = (rows?) => Object.fromEntries(FIGS.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));

const override = async (month?, values?, user = USER, who = 'admin') =>
  await F.call('PUT', '/slip-override', { who, body: { user, month, values, reason: REASON } });
const mustOverride = async (month?, values?) => {
  const res = await override(month, values);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res;
};
const rowsOf = async (month?) => await P.slipRows(month);
const rowOf = async (month?, user = USER) => (await rowsOf(month)).find(row => row.username === user);
const totalsOf = async (month?) => (await F.call('GET', `/periods/${month}`)).data.totals;
const detailOf = async (month?, user = USER, who = 'admin') =>
  await F.call('GET', `/periods/${month}/payslips/${user}`, { who });
// Số tự tính đã lưu của phiếu (đọc thẳng bảng payslips, bản chụp không đổi được)
const storedOf = async (month?, user = USER) => figsOf((await flow.payslipsOf(month)).slips[user]);
const storedRows = async (month?) => Object.values<any>((await flow.payslipsOf(month)).slips);

// Thuế tính độc lập cho một phiếu sau khi cộng delta đồng chịu thuế vào tổng lương: đuôi luật viết lại ở helpers/pay-oracle.js (netAfter),
// theo hợp đồng ghi trong bản chụp (dài hạn: trừ giảm trừ gia cảnh rồi biểu lũy tiến; ngắn hạn: khấu trừ một lần)
async function expectedAfterIncome(month?, delta?, user = USER) {
  const out = oracle.netAfter((await flow.payslipsOf(month)).slips[user].snapshot, { addTaxable: delta });
  return { gross: out.total, insurance: out.insurance, tax: out.tax, advance: out.advance, net: out.net };
}

/* ================= (a) không sửa gì: số bằng số tự tính, từng đồng ================= */
test('Số chi trả: không có số đã sửa thì mọi số của danh sách phiếu, chi tiết phiếu và tổng kỳ bằng số tự tính đã lưu, từng đồng, không có computed', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const rows = await rowsOf(M);
  assert.equal(rows.length, 4);
  const stored = (await flow.payslipsOf(M)).slips;
  for (const row of rows) {
    assert.deepEqual(figsOf(row), await storedOf(M, row.username), row.username);
    assert.equal(row.computed, undefined, `${row.username}: không sửa thì không có computed`);
    assert.equal(row.overridden, undefined);
    assert.deepEqual(
      figsOf((await detailOf(M, row.username)).data.payslip),
      figsOf(stored[row.username]),
      row.username
    );
    assert.equal((await detailOf(M, row.username)).data.payslip.computed, undefined);
  }
  const totals = await totalsOf(M);
  for (const key of FIGS) assert.equal(totals[key], sumOf(await storedRows(M))[key], `tổng ${key}`);
});

test('Số chi trả: có lưu số đã sửa nhưng bằng đúng số tự tính (chuyên cần 0 ₫ của người không có chuyên cần) thì số vẫn bằng số tự tính từng đồng', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  assert.equal(
    (await flow.payslipsOf(M)).slips[USER].snapshot.attendance ?? 0,
    0,
    'điều kiện: chuyên cần tự tính là 0'
  );
  const before = figsOf(await rowOf(M));
  await mustOverride(M, { attendance: 0 });
  assert.deepEqual(figsOf(await rowOf(M)), before);
  assert.deepEqual(figsOf((await detailOf(M)).data.payslip), before);
  assert.deepEqual(await storedOf(M), before, 'bảng phiếu không đổi');
  // values rỗng (bỏ hết số đã sửa) cũng cho đúng số tự tính và bỏ hẳn computed
  await mustOverride(M, {});
  const row = await rowOf(M);
  assert.deepEqual(figsOf(row), before);
  assert.equal(row.computed, undefined);
});

/* ================= (b) sửa một ô thu nhập ================= */
test('Số chi trả: sửa chuyên cần +500.000 ₫ (có lý do) thì tổng lương và thực lĩnh của phiếu và tổng kỳ tăng đúng 500.000 ₫, thuế không đổi, computed giữ số cũ', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const beforeRows = await rowsOf(M);
  const old = figsOf(beforeRows.find(row => row.username === USER));
  const beforeTotals = await totalsOf(M);
  assert.equal(old.tax, 0, 'điều kiện: người này chưa chịu thuế');

  await mustOverride(M, { attendance: 500000 });

  const row = await rowOf(M);
  assert.deepEqual(figsOf(row), {
    gross: old.gross + 500000,
    insurance: old.insurance,
    tax: 0,
    advance: old.advance,
    net: old.net + 500000
  });
  assert.deepEqual(row.computed, old, 'computed giữ số tự tính cũ');
  assert.equal(row.overridden, true);
  assert.equal(row.net, row.gross - row.insurance - row.tax - row.advance, 'thực lĩnh khớp công thức');
  assert.deepEqual(figsOf(row), await expectedAfterIncome(M, 500000));

  // người khác không đổi
  const afterRows = await rowsOf(M);
  for (const other of beforeRows.filter(r => r.username !== USER))
    assert.deepEqual(figsOf(afterRows.find(r => r.username === other.username)), figsOf(other), other.username);

  // tổng kỳ
  const totals = await totalsOf(M);
  assert.equal(totals.gross, beforeTotals.gross + 500000);
  assert.equal(totals.net, beforeTotals.net + 500000);
  for (const key of ['insurance', 'tax', 'advance']) assert.equal(totals[key], beforeTotals[key], key);
  assert.equal(totals.people, beforeTotals.people);

  // chi tiết phiếu cho Admin: số chi trả, computed, override; bản chụp và bảng phiếu vẫn là số tự tính
  const detail = (await detailOf(M)).data.payslip;
  assert.deepEqual(figsOf(detail), figsOf(row));
  assert.deepEqual(detail.computed, old);
  assert.equal(
    detail.override,
    null,
    'số đóng băng chỉ có sau khi duyệt kỳ; trước đó số đang sửa đọc ở GET /api/slip-override'
  );
  assert.equal((await F.call('GET', `/slip-override?user=${USER}&month=${M}`)).data.values.attendance, 500000);
  assert.deepEqual(await storedOf(M), old, 'bảng phiếu không đổi');
  assert.equal(Math.round(detail.snapshot.total), old.gross, 'bản chụp không đổi');
});

test('Số chi trả: sửa KPI +30.000.000 ₫ làm thu nhập chịu thuế tăng thì thuế được bộ máy tính lại theo biểu lũy tiến, thực lĩnh và tổng kỳ theo đó', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = figsOf(await rowOf(M));
  const beforeTotals = await totalsOf(M);
  assert.equal((await flow.payslipsOf(M)).slips[USER].snapshot.kpiPay ?? 0, 0, 'điều kiện: KPI tự tính là 0');

  await mustOverride(M, { kpiPay: 30000000 });

  const row = await rowOf(M);
  const expected = await expectedAfterIncome(M, 30000000);
  assert.deepEqual(figsOf(row), expected);
  // tính tay trên số của bản chụp: chịu thuế = tổng - miễn thuế; thu nhập tính thuế = chịu thuế - bảo hiểm - giảm trừ gia cảnh.
  // Biểu 5 % đến 10 triệu, 10 % đến 30 triệu, 20 % đến 60 triệu (cộng dồn từng bậc):
  const bracketTax = (a?) =>
    Math.round(
      0.05 * Math.min(a, 10e6) +
        0.1 * Math.max(0, Math.min(a, 30e6) - 10e6) +
        0.2 * Math.max(0, Math.min(a, 60e6) - 30e6)
    );
  const net = (await flow.payslipsOf(M)).slips[USER].snapshot.net;
  assert.equal(row.gross, old.gross + 30000000);
  const assessable = row.gross - Math.min(row.gross, net.exempt) - net.insurance - net.deduction;
  assert.ok(assessable > 0 && assessable <= 60000000, 'điều kiện: trong ba bậc đầu, assessable=' + assessable);
  assert.equal(row.tax, bracketTax(assessable));
  assert.ok(row.tax > 0);
  assert.equal(row.insurance, old.insurance, 'bảo hiểm không đổi');
  assert.equal(row.net, row.gross - old.insurance - row.tax - old.advance);
  assert.deepEqual(row.computed, old);

  const totals = await totalsOf(M);
  assert.equal(totals.gross, beforeTotals.gross + 30000000);
  assert.equal(totals.tax, beforeTotals.tax + row.tax);
  assert.equal(totals.net, beforeTotals.net + (row.net - old.net));
  assert.equal(totals.insurance, beforeTotals.insurance);
  assert.equal(totals.advance, beforeTotals.advance);
});

test('Số chi trả: số Admin đang sửa đọc mỗi lần (không nằm trong bộ nhớ đệm): sửa lại giá trị khác thì số đổi ngay, bỏ hết số sửa thì về số tự tính', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = figsOf(await rowOf(M));
  await mustOverride(M, { attendance: 500000 });
  assert.equal((await rowOf(M)).gross, old.gross + 500000);
  assert.equal((await totalsOf(M)).gross, sumOf(await storedRows(M)).gross + 500000);
  await mustOverride(M, { attendance: 1200000 });
  assert.equal((await rowOf(M)).gross, old.gross + 1200000);
  assert.equal((await totalsOf(M)).gross, sumOf(await storedRows(M)).gross + 1200000);
  await mustOverride(M, {});
  const row = await rowOf(M);
  assert.deepEqual(figsOf(row), old);
  assert.equal(row.computed, undefined);
  assert.equal((await totalsOf(M)).gross, sumOf(await storedRows(M)).gross);
});

/* ================= (c) sửa tay thuế ================= */
test('Số chi trả: Admin sửa tay thuế thì dùng đúng số thuế đó (kể cả 0 ₫), không tính lại', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = figsOf(await rowOf(M));
  const beforeTotals = await totalsOf(M);

  // thuế một mình: tổng lương không đổi, thực lĩnh giảm đúng số thuế
  await mustOverride(M, { tax: 100000 });
  let row = await rowOf(M);
  assert.deepEqual(figsOf(row), { ...old, tax: 100000, net: old.net - 100000 });
  assert.deepEqual(row.computed, old);
  assert.equal((await totalsOf(M)).tax, beforeTotals.tax + 100000);
  assert.equal((await totalsOf(M)).net, beforeTotals.net - 100000);

  // thuế sửa tay cùng ô thu nhập: thuế tay thắng thuế bộ máy tính lại
  await mustOverride(M, { kpiPay: 30000000, tax: 2000000 });
  row = await rowOf(M);
  const auto = await expectedAfterIncome(M, 30000000);
  assert.ok(auto.tax > 0 && auto.tax !== 2000000, 'điều kiện: thuế tự tính khác 2.000.000');
  assert.equal(row.gross, old.gross + 30000000);
  assert.equal(row.tax, 2000000, 'không phải số bộ máy tính lại');
  assert.equal(row.net, row.gross - old.insurance - 2000000 - old.advance);

  // thuế tay 0 ₫ cũng là số sửa
  await mustOverride(M, { kpiPay: 30000000, tax: 0 });
  row = await rowOf(M);
  assert.equal(row.tax, 0);
  assert.equal(row.net, row.gross - old.insurance - 0 - old.advance);
  assert.equal(row.computed.tax, 0);
});

/* ================= (d) kỳ đã duyệt dùng số đã đóng băng ================= */
test('Số chi trả: sau khi duyệt kỳ, số sửa đã đóng băng vào phiếu là số được dùng, đổi dòng slip_overrides về sau không ảnh hưởng', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = figsOf(await rowOf(M));
  const beforeTotals = await totalsOf(M);
  await mustOverride(M, { kpiPay: 30000000 });
  const paid = figsOf(await rowOf(M));
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');

  const run = await store.db
    .prepare("SELECT status FROM payroll_runs WHERE month = ? AND status != 'superseded'")
    .get(M);
  assert.equal(run.status, 'final', 'duyệt kỳ chốt lần chạy');
  const frozen = await store.db
    .prepare(
      'SELECT override_json FROM payslips WHERE username = ? AND run_id = (SELECT id FROM payroll_runs WHERE month = ? AND status = ?)'
    )
    .get(USER, M, 'final');
  assert.equal(JSON.parse(frozen.override_json).values.kpiPay, 30000000, 'số sửa đã đóng băng vào phiếu');

  assert.deepEqual(figsOf(await rowOf(M)), paid, 'sau duyệt kỳ vẫn là số chi trả');
  assert.equal((await rowOf(M)).computed.gross, old.gross);
  const totals = await totalsOf(M);
  assert.equal(totals.gross, beforeTotals.gross + 30000000);
  assert.equal(totals.net, beforeTotals.net + (paid.net - old.net));

  // dòng đang sửa bị đổi sau khi đã đóng băng (qua DB, vì API từ chối từ kỳ approved): số chi trả vẫn theo số đã đóng băng
  await store.db
    .prepare('UPDATE slip_overrides SET values_json = ? WHERE username = ? AND month = ?')
    .run(JSON.stringify({ kpiPay: 1000000 }), USER, M);
  assert.deepEqual(figsOf(await rowOf(M)), paid);
  assert.deepEqual(figsOf((await detailOf(M)).data.payslip), paid);
  assert.equal((await totalsOf(M)).gross, beforeTotals.gross + 30000000);

  // và sửa tiếp từ kỳ đã duyệt chỉ cảnh báo PERIOD_LOCKED, số chi trả vẫn theo số đã đóng băng
  const warned = await override(M, { kpiPay: 5 });
  assert.equal(warned.status, 200, JSON.stringify(warned.data));
  assert.ok(
    warned.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
    JSON.stringify(warned.data.warnings)
  );
  assert.deepEqual(figsOf(await rowOf(M)), paid);
});

/* ================= (e) nhân sự xem phiếu của mình sau khi chi trả ================= */
test('Số chi trả: nhân sự xem phiếu của mình sau khi chi trả thấy số chi trả, không thấy computed, overridden, override, cờ AI hay ghi chú; không xem được phiếu người khác', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = figsOf(await rowOf(M));
  await mustOverride(M, { kpiPay: 30000000 });
  const paid = figsOf(await rowOf(M));
  assert.notDeepEqual(paid, old);
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');

  // trước khi chi trả nhân sự chưa xem được
  const early = await detailOf(M, USER, USER);
  assert.equal(early.status, 403, JSON.stringify(early.data));
  assert.equal(early.data.code, 'PAYSLIP_NOT_VISIBLE');

  P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  const mine = await detailOf(M, USER, USER);
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.deepEqual(figsOf(mine.data.payslip), paid, 'nhân sự thấy số chi trả');
  for (const hidden of ['computed', 'overridden', 'override', 'flags', 'note', 'decidedBy', 'decidedAt', 'errorDetail'])
    assert.equal(Object.hasOwn(mine.data.payslip, hidden), false, `nhân sự không được thấy ${hidden}`);
  assert.equal(JSON.stringify(mine.data).includes('"computed"'), false);
  assert.equal(JSON.stringify(mine.data).includes('"override"'), false);

  // Admin vẫn thấy cả hai
  const admin = (await detailOf(M)).data.payslip;
  assert.deepEqual(figsOf(admin), paid);
  assert.deepEqual(admin.computed, old);

  // người khác và danh sách cả kỳ: nhân sự bị chặn
  assert.equal((await detailOf(M, 'qa_nv2', USER)).status, 403);
  assert.equal((await F.call('GET', `/periods/${M}/payslips`, { who: USER })).status, 403);
  // phiếu của người không sửa số vẫn đúng số tự tính khi chính họ xem
  const other = await detailOf(M, 'qa_nv2', 'qa_nv2');
  assert.equal(other.status, 200);
  assert.deepEqual(figsOf(other.data.payslip), await storedOf(M, 'qa_nv2'));
});
