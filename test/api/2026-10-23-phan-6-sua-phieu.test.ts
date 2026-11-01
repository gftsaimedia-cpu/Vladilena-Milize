'use strict';
// Sửa số trên phiếu (hợp đồng máy chủ ↔ giao diện).
//   1. Số sửa (slip_overrides) áp cả phiếu ƯỚC TÍNH (tháng chưa có lần tính lương): GET /periods/:m/estimates và /estimates/:u, dòng và tổng ước tính.
//   2. Ô số lượng sửa được (workDays, leaveDays, unpaidDays, isatDays, holidayDays, ot15H/ot20H/ot30H, kpiAmt, kpiPct, kpiBase…kpiSelf, debtH) là ĐẦU VÀO GHIM của bộ máy:
//       máy chủ tính lại các ô tiền phụ thuộc, bảo hiểm, thuế, thực nhận; ô tiền sửa thẳng giữ đúng số sửa. Phản hồi giữ cặp "số tự tính (computed) / số trên phiếu".
// Số tiền tính tay độc lập với bộ máy: số ngày × lương một ngày (6.000.000 ÷ 26 cho CTV/NV, 2.000.000 ÷ 22 cho TTS bậc 3 ...), biểu thuế lũy tiến viết tay ở helpers/pay-oracle.js.
// Tháng 2026-10 do helpers/period-flow.js dựng (qa_ctv1, qa_nv1, qa_nv2, qa_tts1; đồng hồ 02/11/2026); số cụ thể ghi trong test là số của tháng này.
// Ngày công là ngày có Check-in/out; ngày trống tính vắng. Trễ quá 15 phút hoặc về sớm quá 15 phút bị trừ theo bậc 30 phút (làm tròn nửa lên), số giờ trừ = số bậc × 0,5 giờ.
//   qa_ctv1 (CTV bậc 2, lương cơ bản 6.000.000 ₫, một ngày 230.769,23 ₫, một giờ 28.846,15 ₫): 21 ngày công (20 ngày thường chấm + ngày lễ 07/10 chấm), 2 ngày phép, 4 ngày 28–31/10 không khai nên vắng.
//     Tổng lương 6.086.539 ₫ = ngày làm 20 × 230.769,23 (4.615.384,6) + phép 2 × 230.769,23 (461.538,5) + lương ngày lễ (230.769,2) − trừ 5 lượt trễ/về sớm × 0,5 giờ × 28.846,15 (72.115,4)
//     + làm bù 1 giờ × 28.846,15 (28.846,2) + OT 2 giờ × 1,5 × 28.846,15 (86.538,5) + làm lễ 8,5 giờ × 3 × 28.846,15 (735.576,9); bảo hiểm 10,5 % × 6.000.000 = 630.000 ₫, thuế 0 ₫.
//     KPI tối đa 3.000.000 ₫; nghỉ vắng 4 ngày × 8 = 32 giờ vượt ngưỡng 24 giờ nên tiền KPI nhân tỷ lệ ngày đi làm 21 ÷ 26.
//   qa_tts1 (TTS bậc 3, lương cơ bản 2.000.000 ₫, một ngày 90.909,09 ₫, một giờ 11.363,64 ₫): 19 ngày công, trừ 5 lượt × 0,5 giờ.
//     Tổng lương 1.698.864 ₫ = 19 × 90.909,09 (1.727.272,7) − 2,5 giờ × 11.363,64 (28.409,1); hợp đồng dài nên đóng bảo hiểm 10,5 % × 2.000.000 = 210.000 ₫, thuế 0 ₫.
//   qa_nv1 (NV bậc 1, ca đêm): 19 ngày công, đi lại 6.000.000 × 15 % × 19 ÷ 26 = 657.692 ₫.
// Tạm ứng không dùng để kiểm số ở đây: thực lĩnh luôn kiểm bằng gross - bảo hiểm - thuế - tạm ứng của chính dòng đó.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { oracle } = require('../helpers/pay-oracle');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const { F, store } = P;
const monthOf = P.monthPool();
monthOf(); // bỏ 2026-10: tháng đó dùng cố định cho các test có số cụ thể, tháng riêng chỉ cho test đi qua bước tính lương

before(F.start);
after(F.stop);

const M = '2026-10';
const REASON = 'Điều chỉnh theo biên bản đối chiếu';
const FIGS = ['gross', 'insurance', 'tax', 'advance', 'net'];
const figsOf = (row?) => Object.fromEntries(FIGS.map(key => [key, row[key]]));

const rowsOf = async (month?) => (await F.call('GET', `/periods/${month}/estimates?pageSize=200`)).data;
const rowOf = async (month?, user?) => (await rowsOf(month)).rows.find(row => row.username === user);
const detailOf = async (month?, user?) => {
  const res = await F.call('GET', `/periods/${month}/estimates/${user}`);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  return res.data.payslip;
};
const put = (month?, user?, values?) =>
  F.call('PUT', '/slip-override', { body: { user, month, values, reason: REASON } });
const mustPut = async (month?, user?, values?) => {
  const res = await put(month, user, values);
  assert.equal(res.status, 200, JSON.stringify(res.data));
};
// Thực lĩnh phải khớp công thức của chính dòng đó
const assertNetIdentity = (row?, what?) =>
  assert.equal(
    row.net,
    row.gross - row.insurance - row.tax - row.advance,
    `${what}: thực lĩnh = tổng - BH - thuế - tạm ứng`
  );
const sumOf = (rows?) => Object.fromEntries(FIGS.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));

// Thuế tính độc lập cho một tổng lương mới `total` của một người, từ các số không đổi của bản chụp (miễn thuế, bảo hiểm).
// Thu nhập tính thuế = chịu thuế − bảo hiểm − giảm trừ gia cảnh của bản chụp, áp biểu luỹ tiến; phát sinh khi chịu thuế − bảo hiểm
// lớn hơn giảm trừ bản thân tax.deduction.personal.
function expectedTax(snapshotNet?, total?, insurance = snapshotNet.insurance) {
  const exempt = Math.min(total, snapshotNet.exempt);
  const income = total - exempt - insurance;
  const assessable = Math.max(0, income - (snapshotNet.deduction || 0));
  return income > DEFAULTS['tax.deduction.personal'] ? Math.round(oracle.progressive(assessable)) : 0;
}

/* ================= 1. số sửa áp cả phiếu ước tính ================= */
test('A1: tháng chưa tính lương, sửa chuyên cần +500.000 ₫ thì dòng, chi tiết và tổng ước tính tăng đúng 500.000 ₫ (thuế không đổi), computed giữ số tự tính', async () => {
  await P.seed(M);
  const prior = await rowsOf(M);
  const old = figsOf(prior.rows.find(row => row.username === 'qa_nv1'));
  assert.equal(old.tax, 0, 'điều kiện: chưa chịu thuế');
  const tables = await F.snapshot();

  await mustPut(M, 'qa_nv1', { attendance: 500000 });

  const row = await rowOf(M, 'qa_nv1');
  assert.deepEqual(figsOf(row), {
    gross: old.gross + 500000,
    insurance: old.insurance,
    tax: 0,
    advance: old.advance,
    net: old.net + 500000
  });
  assertNetIdentity(row, 'dòng');
  assert.deepEqual(row.computed, old, 'computed giữ số tự tính');
  assert.equal(row.overridden, true);
  const detail = await detailOf(M, 'qa_nv1');
  assert.deepEqual(figsOf(detail), figsOf(row), 'chi tiết phiếu ước tính bằng dòng của danh sách');
  assert.deepEqual(detail.computed, old);

  const later = await rowsOf(M);
  for (const other of prior.rows.filter(r => r.username !== 'qa_nv1'))
    assert.deepEqual(figsOf(later.rows.find(r => r.username === other.username)), figsOf(other), other.username);
  assert.equal(later.totals.gross, prior.totals.gross + 500000);
  assert.equal(later.totals.net, prior.totals.net + 500000);
  for (const key of ['insurance', 'tax', 'advance']) assert.equal(later.totals[key], prior.totals[key], key);
  assert.equal(later.totals.gross, sumOf(later.rows).gross, 'tổng bằng tổng các dòng');

  // vẫn là ước tính: không có lần tính hay phiếu nào được tạo, chỉ có số sửa và nhật ký
  assert.equal(await store.payroll.currentRun(M), null);
  assert.deepEqual(F.changedTables(tables, await F.snapshot()).sort(), ['audit_log', 'slip_overrides']);
});

test('A1: tháng chưa tính lương, ghim bảo hiểm = 0 ₫ thì thực lĩnh của phiếu và tổng kỳ tăng đúng bằng số bảo hiểm tự tính (630.000 ₫), tổng lương không đổi', async () => {
  await P.seed(M);
  const prior = await rowsOf(M);
  const old = prior.rows.find(row => row.username === 'qa_nv1');
  assert.equal(old.insurance, 630000, 'điều kiện');

  await mustPut(M, 'qa_nv1', { insurance: 0 });

  const row = await rowOf(M, 'qa_nv1');
  assert.deepEqual(figsOf(row), { ...figsOf(old), insurance: 0, net: old.net + 630000 });
  assert.equal(row.computed.insurance, 630000);
  const totals = (await rowsOf(M)).totals;
  assert.equal(totals.insurance, prior.totals.insurance - 630000);
  assert.equal(totals.net, prior.totals.net + 630000);
  assert.equal(totals.gross, prior.totals.gross);
});

test('A1: bỏ hết số sửa (values rỗng) thì dòng, chi tiết và tổng ước tính về đúng số tự tính, không còn computed', async () => {
  await P.seed(M);
  const prior = await rowsOf(M);
  const old = prior.rows.find(row => row.username === 'qa_ctv1');
  await mustPut(M, 'qa_ctv1', { workDays: 22, attendance: 300000 });
  assert.notEqual((await rowOf(M, 'qa_ctv1')).gross, old.gross, 'điều kiện: đã đổi');
  await mustPut(M, 'qa_ctv1', {});
  const row = await rowOf(M, 'qa_ctv1');
  assert.deepEqual(figsOf(row), figsOf(old));
  assert.equal(row.computed, undefined);
  assert.deepEqual((await rowsOf(M)).totals, prior.totals);
  assert.deepEqual(figsOf(await detailOf(M, 'qa_ctv1')), figsOf(old));
});

test('A1: ước tính, tính lương rồi đọc phiếu cho cùng một số: ghim ngày công và chuyên cần ở kỳ chưa tính thì sau chốt công và tính lương phiếu bằng số ước tính từng đồng', async () => {
  const month = monthOf();
  await P.seed(month);
  await mustPut(month, 'qa_ctv1', { workDays: 22, attendance: 300000 });
  const estimate = figsOf(await rowOf(month, 'qa_ctv1'));
  const old = figsOf((await rowsOf(month)).rows.find(r => r.username === 'qa_ctv1').computed);
  assert.notDeepEqual(estimate, old, 'điều kiện: số ghim khác số tự tính');
  P.must(await P.step(month, 'lock-attendance'), 'chốt công');
  P.must(await P.step(month, 'calculate'), 'tính lương');
  const slip = (await P.slipRows(month)).find(row => row.username === 'qa_ctv1');
  assert.deepEqual(figsOf(slip), estimate);
  assert.deepEqual(figsOf(slip.computed), old, 'phiếu giữ số tự tính của bản chụp');
  assert.deepEqual(figsOf((await F.call('GET', `/periods/${month}/payslips/qa_ctv1`)).data.payslip), estimate);
});

/* ================= 2. ô số lượng là đầu vào ghim ================= */
test('A2: TTS ghim ngày công 19 → 21 thì tiền ngày công tăng đúng 2 ngày: tổng lương 1.880.682 ₫ (1.698.864 + 2 × 90.909,09), bảo hiểm 210.000 ₫, thuế 0, thực lĩnh = tổng lương trừ bảo hiểm và tạm ứng', async () => {
  await P.seed(M);
  const prior = await rowsOf(M);
  const old = prior.rows.find(row => row.username === 'qa_tts1');
  assert.equal(old.gross, 1698864, 'điều kiện: 19 × 90.909,09 − 2,5 giờ × 11.363,64');
  assert.equal(old.insurance, 210000, 'điều kiện: 10,5 % × 2.000.000');

  await mustPut(M, 'qa_tts1', { workDays: 21 });

  const row = await rowOf(M, 'qa_tts1');
  assert.equal(row.gross, 1880682, '1.698.863,64 + 2 × 90.909,09 = 1.880.681,82');
  assert.equal(row.insurance, 210000);
  assert.equal(row.tax, 0);
  assert.equal(row.advance, old.advance, 'tạm ứng không phụ thuộc ngày công đã ghim');
  assertNetIdentity(row, 'TTS');
  assert.deepEqual(row.computed, figsOf(old), 'computed giữ số tự tính');
  assert.equal(row.overridden, true);
  assert.deepEqual(figsOf(await detailOf(M, 'qa_tts1')), figsOf(row));
  const totals = (await rowsOf(M)).totals;
  assert.equal(totals.gross, prior.totals.gross + (1880682 - 1698864));
  assert.equal(totals.insurance, prior.totals.insurance);
});

test('A2: CTV ghim ngày công 22 thì tổng lương tăng đúng 22 ngày × 230.769,2308 so với số tự tính, bảo hiểm 630.000 ₫, thuế theo luật cuối (chịu thuế − bảo hiểm − giảm trừ 15.500.000 ₫), thực lĩnh khớp công thức', async () => {
  await P.seed(M);
  const old = await rowOf(M, 'qa_ctv1');
  const base = await detailOf(M, 'qa_ctv1');

  await mustPut(M, 'qa_ctv1', { workDays: 22 });

  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, old.gross + Math.round(((22 - old.workDays) * 6000000) / 26));
  assert.equal(row.insurance, 630000);
  assert.equal(base.snapshot.net.deduction, 15500000, 'CTV không người phụ thuộc: giảm trừ bản thân');
  assert.equal(
    row.tax,
    expectedTax(base.snapshot.net, row.gross, row.insurance),
    'thuế tính tay trên chịu thuế − bảo hiểm − giảm trừ'
  );
  assert.equal(row.advance, old.advance);
  assertNetIdentity(row, 'CTV');
  assert.deepEqual(figsOf(row.computed), figsOf(old));
  assert.equal(row.overridden, true);
});

test('A2: ghim ngày công thấp hơn: CTV 21 → 18 thì tổng lương giảm đúng 3 ngày: 5.394.231 ₫', async () => {
  await P.seed(M);
  const old = await rowOf(M, 'qa_ctv1');
  assert.equal(old.workDays, 21, 'điều kiện: 20 ngày thường + ngày lễ');
  assert.equal(old.gross, 6086539, 'điều kiện: tổng lương tự tính của qa_ctv1');
  await mustPut(M, 'qa_ctv1', { workDays: 18 });
  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, 5394231, '6.086.538,46 - 3 × 230.769,23 = 5.394.230,77');
  assert.equal(row.insurance, 630000);
  assertNetIdentity(row, 'CTV');
});

test('A2: phụ cấp phụ thuộc số ngày tính lại theo: NV 19 → 21 ngày thì phụ cấp đi lại 657.692 ₫ thành 726.923 ₫ (tỷ lệ theo ngày), tổng lương tăng ít nhất 2 ngày tiền công và 2 ngày đi lại', async () => {
  await P.seed(M);
  const old = await rowOf(M, 'qa_nv1');
  assert.equal(old.workDays, 19, 'điều kiện');
  const perDayTravel = old.phuCap / 19;
  const perDayBase = 6000000 / 26;

  await mustPut(M, 'qa_nv1', { workDays: 21 });

  const row = await rowOf(M, 'qa_nv1');
  assert.equal(Math.round(row.phuCap), Math.round(perDayTravel * 21));
  assert.ok(
    row.gross - old.gross >= Math.floor(2 * (perDayBase + perDayTravel)),
    `tổng lương tăng ${row.gross - old.gross}, ít hơn 2 ngày tiền công + 2 ngày đi lại`
  );
  assertNetIdentity(row, 'NV');
  assert.deepEqual(figsOf(row.computed), figsOf(old));
});

test('A2: ô tiền ghim giữ đúng số sửa khi ngày công đổi: CTV chuyên cần ghim 500.000 ₫ + ngày công 22 → tổng lương 6.817.308 ₫; đổi ngày công 23 thì tiền ngày công đổi, chuyên cần vẫn 500.000 ₫', async () => {
  await P.seed(M);
  await mustPut(M, 'qa_ctv1', { workDays: 22, attendance: 500000 });
  let row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, 6817308, '6.086.538,46 + 1 × 230.769,23 + 500.000');
  assert.equal(row.insurance, 630000);
  assertNetIdentity(row, 'ngày 22');

  await mustPut(M, 'qa_ctv1', { workDays: 23, attendance: 500000 });
  row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, 7048077, '6.086.538,46 + 2 × 230.769,23 + 500.000: chỉ phần ngày công đổi theo ngày');
  assertNetIdentity(row, 'ngày 23');
});

test('A2: ghim ngày công 22 và chuyên cần 20.000.000 ₫ làm thu nhập tăng thì thuế TNCN tính lại trên (chịu thuế − bảo hiểm − giảm trừ 15.500.000 ₫) theo biểu lũy tiến, thực lĩnh theo đó (số kiểm tính tay)', async () => {
  await P.seed(M);
  const base = await detailOf(M, 'qa_ctv1');
  const prior = await rowsOf(M);
  const oldRow = prior.rows.find(r => r.username === 'qa_ctv1');
  assert.equal(
    oldRow.tax,
    expectedTax(base.snapshot.net, Math.round(base.snapshot.total)),
    'thuế tự tính trước khi ghim'
  );

  await mustPut(M, 'qa_ctv1', { workDays: 22, attendance: 20000000 });

  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, oldRow.gross + Math.round(((22 - oldRow.workDays) * 6000000) / 26) + 20000000);
  assert.equal(row.insurance, 630000);
  const tax = expectedTax(base.snapshot.net, row.gross, row.insurance);
  assert.ok(tax > 0, 'điều kiện: có thuế, ' + tax);
  assert.equal(row.tax, tax);
  assertNetIdentity(row, 'có thuế');
  assert.equal(row.computed.tax, oldRow.tax, 'computed giữ số thuế tự tính');
  const totals = (await rowsOf(M)).totals;
  assert.equal(totals.tax, prior.totals.tax - oldRow.tax + tax, 'tổng kỳ đổi đúng bằng chênh lệch thuế của phiếu này');
});

test('A2: thuế sửa tay thắng thuế tính lại: ghim ngày công 22, chuyên cần 20.000.000 ₫ và thuế 1.000.000 ₫ thì thuế đúng 1.000.000 ₫', async () => {
  await P.seed(M);
  const old = await rowOf(M, 'qa_ctv1');
  await mustPut(M, 'qa_ctv1', { workDays: 22, attendance: 20000000, tax: 1000000 });
  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, old.gross + Math.round(((22 - old.workDays) * 6000000) / 26) + 20000000);
  assert.equal(row.tax, 1000000);
  assertNetIdentity(row, 'thuế tay');
});

test('A2: ghim giờ OT: CTV ot20H = 10 giờ (tự tính chỉ có 2 giờ OT ngày thường ×1,5) thì tiền OT cộng thêm 10 giờ × 2 × 28.846,15 = 576.923 ₫, tổng lương 6.663.462 ₫', async () => {
  await P.seed(M);
  const old = await rowOf(M, 'qa_ctv1');
  assert.equal(Math.round(old.ot), 86539, 'điều kiện: 2 giờ OT × 1,5 × 28.846,15');
  await mustPut(M, 'qa_ctv1', { ot20H: 10 });
  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.gross, 6663462, '6.086.538,46 + 576.923,08');
  assert.equal(Math.round(row.ot), 663462, '86.538,46 + 576.923,08');
  assertNetIdentity(row, 'OT');
});

test('A2: ghim nhiều ô số lượng cùng lúc rồi bỏ một ô thì chỉ ô còn lại được áp: ngày công 22 + OT 10 giờ → 6.894.231 ₫; bỏ OT → 6.317.308 ₫', async () => {
  await P.seed(M);
  await mustPut(M, 'qa_ctv1', { workDays: 22, ot20H: 10 });
  assert.equal((await rowOf(M, 'qa_ctv1')).gross, 6894231, '6.086.538,46 + 230.769,23 + 576.923,08');
  await mustPut(M, 'qa_ctv1', { workDays: 22 });
  assert.equal((await rowOf(M, 'qa_ctv1')).gross, 6317308, '6.086.538,46 + 230.769,23');
});

/* ================= 2. KPI ================= */
const FIVE = { wework: 100, user: 90, peer: 80, manager: 85, self: 100 }; // tổng 92,2 %: 4000 + 2160 + 1440 + 1020 + 600
async function giveScores(user?, scores = FIVE) {
  const res = await F.call('PUT', '/kpi/scores', { body: { user, month: M, scores } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

// Tiền KPI = mức KPI × tổng điểm × tỷ lệ ngày đi làm; qa_ctv1 nghỉ vắng 4 ngày × 8 = 32 giờ vượt ngưỡng 24 giờ nên tỷ lệ ngày đi làm = 21 ÷ 26
test('A2: đủ 5 điểm KPI thì ghim kpiAmt = 2.000.000 ₫ tính lại tiền KPI = 2.000.000 × 92,2 % × 21 ÷ 26 = 1.489.385 ₫ (không ghim: 3.000.000 × 92,2 % × 21 ÷ 26 = 2.234.077 ₫)', async () => {
  await P.seed(M);
  await giveScores('qa_ctv1');
  const old = await rowOf(M, 'qa_ctv1');
  assert.equal(old.workDays, 21, 'điều kiện: 21 ngày công trên 26 ngày công chuẩn');
  assert.equal(old.workdaysStd, 26);
  assert.equal(old.kpi, 2234077, 'điều kiện: trần bậc 2 là 3.000.000 ₫, 2.766.000 × 21 ÷ 26 = 2.234.076,92');
  assert.equal(old.gross, 8320616, '6.086.539 + 2.234.077');

  await mustPut(M, 'qa_ctv1', { kpiAmt: 2000000 });

  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.kpi, 1489385, '1.844.000 × 21 ÷ 26 = 1.489.384,62');
  assert.equal(row.gross, 7575924, '6.086.539 + 1.489.385');
  assert.equal(row.insurance, 630000);
  assertNetIdentity(row, 'KPI');
  assert.equal(row.computed.gross, 8320616);
});

test('A2: ghim điểm tự đánh giá kpiSelf = 50 (đủ 5 điểm) thì tổng KPI 89,2 % và tiền KPI = 3.000.000 × 89,2 % × 21 ÷ 26 = 2.161.385 ₫', async () => {
  await P.seed(M);
  await giveScores('qa_ctv1');
  await mustPut(M, 'qa_ctv1', { kpiSelf: 50 });
  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.kpi, 2161385, '4000 + 2160 + 1440 + 1020 + 300 = 8920 → 89,2 %; 2.676.000 × 21 ÷ 26 = 2.161.384,62');
  assert.equal(row.gross, 8247924, '6.086.539 + 2.161.385');
  assertNetIdentity(row, 'kpiSelf');
});

test('A2: chưa đủ 5 điểm KPI thì ghim kpiAmt không làm có tiền KPI (chưa đủ điểm là chờ điểm, KPI 0 ₫): tổng lương không đổi', async () => {
  await P.seed(M);
  const old = await rowOf(M, 'qa_ctv1');
  assert.equal(old.kpi, 0);
  await mustPut(M, 'qa_ctv1', { kpiAmt: 2000000 });
  const row = await rowOf(M, 'qa_ctv1');
  assert.equal(row.kpi, 0);
  assert.equal(row.gross, old.gross);
});

/* ================= quyền và kiểm tra ================= */
test('A: nhân sự không đọc được phiếu ước tính đã ghim của mình hay của người khác (403) và không gọi được PUT /slip-override; số sửa không lộ computed cho nhân sự', async () => {
  await P.seed(M);
  await mustPut(M, 'qa_ctv1', { workDays: 22 });
  const tables = await F.snapshot();
  for (const who of ['qa_ctv1', 'qa_nv1']) {
    const list = await F.call('GET', `/periods/${M}/estimates`, { who });
    assert.equal(list.status, 403, `${who}: danh sách`);
    const one = await F.call('GET', `/periods/${M}/estimates/qa_ctv1`, { who });
    assert.equal(one.status, 403, `${who}: một phiếu`);
    const write = await F.call('PUT', '/slip-override', {
      who,
      body: { user: 'qa_ctv1', month: M, values: { workDays: 1 }, reason: REASON }
    });
    assert.equal(write.status, 403, `${who}: ghi`);
    assert.equal(
      JSON.stringify([list.data, one.data, write.data]).includes('computed'),
      false,
      `${who}: không lộ computed`
    );
  }
  assert.deepEqual(F.changedTables(tables, await F.snapshot()), [], 'từ chối thì không ghi gì');
  assert.equal((await F.call('GET', `/slip-override?user=qa_ctv1&month=${M}`, { who: 'qa_ctv1' })).status, 403);
});

test('A2: giá trị ghim sai kiểu hoặc ngoài giới hạn bị từ chối 400 và không lưu gì: ngày công chữ, vô hạn, quá lớn; ô lạ', async () => {
  await P.seed(M);
  const tables = await F.snapshot();
  for (const values of [
    { workDays: '22' },
    { workDays: null },
    { workDays: 1e9 },
    { workDays: Number.NaN },
    { khongCo: 1 }
  ]) {
    const res = await put(M, 'qa_ctv1', values);
    assert.equal(res.status, 400, JSON.stringify(values));
  }
  assert.deepEqual(F.changedTables(tables, await F.snapshot()), []);
  assert.equal((await rowOf(M, 'qa_ctv1')).computed, undefined);
});
