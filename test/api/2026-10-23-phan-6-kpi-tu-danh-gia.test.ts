'use strict';
// KPI tự đánh giá (hợp đồng máy chủ ↔ giao diện).
//   Nhân sự lưu điểm `self` (0 đến 100) của CHÍNH MÌNH cho tháng: PUT /api/kpi/scores chỉ nhận khoá `self` và chỉ của mình từ nhân sự (không phải Admin).
//   Admin nhập 4 điểm còn lại (wework, user, peer, manager) và sửa được cả `self`. Điểm vào tổng KPI như bình thường (trọng số 40 / 24 / 18 / 12 / 6 của Quy chế lương 3P).
//   GET /api/sheet → kpiParts trả điểm `self` cho chính người đó.
// Số kiểm tính tay: qa_ctv1 (CTV bậc 2) có KPI tối đa 3.000.000 ₫; điểm 100 / 90 / 80 / 85 / self:
//   self 100 → 4000 + 2160 + 1440 + 1020 + 600 = 9220 → 92,2 %; self 50 → 8920 → 89,2 %; self 70 → 9040 → 90,4 %.
// Tháng 2026-10 của qa_ctv1: 21 ngày công trên 26 ngày công chuẩn; 4 ngày 28–31/10 không khai tính vắng = 32 giờ, vượt ngưỡng 24 giờ nên
//   tiền KPI = KPI tối đa × tổng điểm × 21 ÷ 26: 92,2 % → 2.234.077 ₫ (2.766.000 × 21 ÷ 26 = 2.234.076,92); 89,2 % → 2.161.385 ₫; 90,4 % → 2.190.462 ₫.
// Kỳ đã duyệt vẫn nhận điểm, chỉ cảnh báo PERIOD_LOCKED.
// qa_tts1 (TTS) không có KPI; qa_nv1 (NV bậc 1, KPI tối đa 6.000.000 ₫) và qa_nv2 có KPI.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { oracle } = require('../helpers/pay-oracle');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const { F, store } = P;

before(F.start);
after(F.stop);

const M = '2026-10';
const FOUR = { wework: 100, user: 90, peer: 80, manager: 85 };
const KPI_92_2 = 2234077; // 3.000.000 × 92,2 % × 21 ÷ 26
const putScores = (who?, body?) => F.call('PUT', '/kpi/scores', { who, body: { month: M, ...body } });
const mustPut = async (who?, body?) => {
  const res = await putScores(who, body);
  assert.equal(res.status, 200, `${who}: ${res.status} ${JSON.stringify(res.data)}`);
  return res;
};
const kpiOf = async (user?) => {
  const row = (await F.call('GET', `/periods/${M}/estimates?pageSize=200`)).data.rows.find(r => r.username === user);
  return { kpi: row.kpi, gross: row.gross, net: row.net, tax: row.tax, insurance: row.insurance };
};
// Thuế tính tay: luỹ tiến trên (chịu thuế − bảo hiểm − giảm trừ gia cảnh), phát sinh khi chịu thuế − bảo hiểm lớn hơn giảm trừ bản thân
const handTax = async (user?, row?) => {
  const net = (await F.call('GET', `/periods/${M}/estimates/${user}`)).data.payslip.snapshot.net;
  const income = row.gross - Math.min(row.gross, net.exempt) - row.insurance;
  const assessable = Math.max(0, income - (net.deduction || 0));
  return income > DEFAULTS['tax.deduction.personal'] ? Math.round(oracle.progressive(assessable)) : 0;
};
const sheetOf = async (who?) => (await F.call('GET', `/sheet?month=${M}`, { who })).data;
const logOf = async (user?) =>
  await store.db.prepare('SELECT * FROM kpi_score_log WHERE username = ? AND month = ? ORDER BY id').all(user, M);
const scoreRows = async () => await store.db.prepare('SELECT * FROM kpi_scores').all();
const adminItem = async (user?) =>
  (await F.call('GET', `/kpi/scores?month=${M}`)).data.items.find(item => item.username === user);

test('D: Admin nhập 4 điểm, chưa có điểm tự đánh giá thì chưa đủ 5 điểm và KPI 0 ₫; nhân sự lưu self = 100 của mình thì đủ điểm: tổng 92,2 %, tiền KPI 2.766.000 ₫', async () => {
  await P.seed(M);
  await mustPut('admin', { user: 'qa_ctv1', scores: FOUR });
  assert.equal((await adminItem('qa_ctv1')).complete, false);
  assert.equal((await kpiOf('qa_ctv1')).kpi, 0, 'chưa đủ điểm là chờ điểm');
  const before = await kpiOf('qa_ctv1');

  const res = await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 100 } });
  assert.equal(res.data.ok, true);
  const item = await adminItem('qa_ctv1');
  assert.deepEqual(item.scores, { ...FOUR, self: 100 });
  assert.equal(item.complete, true);
  assert.equal(item.total, 92.2);
  assert.equal(item.pass, true);
  assert.equal(item.updatedBy, 'qa_ctv1', 'ghi ai là người nhập lần cuối');

  const after = await kpiOf('qa_ctv1');
  assert.equal(after.kpi, KPI_92_2, '3.000.000 × 92,2 % × 21 ÷ 26');
  assert.equal(after.gross, before.gross + KPI_92_2);
  // KPI là thu nhập chịu thuế: bảo hiểm không đổi; thu nhập chịu thuế trừ bảo hiểm còn dưới giảm trừ bản thân 15.500.000 ₫ nên thuế vẫn 0
  assert.equal(after.insurance, before.insurance, 'bảo hiểm không đổi vì KPI');
  assert.equal(after.tax, 0, '8.320.616 − miễn thuế 519.231 − bảo hiểm 630.000 < 15.500.000');
  assert.equal(after.tax, await handTax('qa_ctv1', after));
  assert.equal(after.net, after.gross - after.insurance - after.tax);
});

test('D: nhân sự đổi điểm tự đánh giá thì tổng KPI đổi theo: self 100 → 50 cho 89,2 % và 2.161.385 ₫; Admin sửa self thành 70 cho 90,4 % và 2.190.462 ₫', async () => {
  await P.seed(M);
  await mustPut('admin', { user: 'qa_ctv1', scores: FOUR });
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 100 } });
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 50 } });
  assert.equal((await adminItem('qa_ctv1')).total, 89.2);
  assert.equal((await kpiOf('qa_ctv1')).kpi, 2161385, '3.000.000 × 89,2 % × 21 ÷ 26 = 2.161.384,62');

  await mustPut('admin', { user: 'qa_ctv1', scores: { self: 70 } });
  assert.equal((await adminItem('qa_ctv1')).scores.self, 70);
  assert.equal((await adminItem('qa_ctv1')).total, 90.4);
  assert.equal((await kpiOf('qa_ctv1')).kpi, 2190462, '3.000.000 × 90,4 % × 21 ÷ 26 = 2.190.461,54');

  // nhân sự sửa lại sau khi Admin sửa: điểm của nhân sự thắng (người lưu sau cùng)
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 80 } });
  assert.equal((await adminItem('qa_ctv1')).scores.self, 80);
});

test('D: nhân sự lưu self trước khi Admin nhập: chưa đủ điểm nên KPI 0 ₫, Admin thấy điểm self đã nhập; GET /api/sheet của chính người đó trả self và không lộ 4 điểm còn lại', async () => {
  await P.seed(M);
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 90 } });
  assert.equal((await kpiOf('qa_ctv1')).kpi, 0);
  const item = await adminItem('qa_ctv1');
  assert.equal(item.scores.self, 90);
  assert.equal(item.complete, false);
  assert.deepEqual(item.missing.sort(), ['manager', 'peer', 'user', 'wework']);

  const sheet = await sheetOf('qa_ctv1');
  assert.equal(sheet.kpiParts.self, 90, JSON.stringify(sheet.kpiParts));
  assert.equal(sheet.kpiParts.complete, false);
  for (const key of ['wework', 'user', 'peer', 'manager'])
    assert.equal(sheet.kpiParts[key], undefined, `chưa đủ điểm thì không lộ ${key}`);
  await mustPut('admin', { user: 'qa_ctv1', scores: FOUR });
  assert.deepEqual(
    (({ complete, wework, user, peer, manager, self }: any) => ({ complete, wework, user, peer, manager, self }))(
      (await sheetOf('qa_ctv1')).kpiParts
    ),
    { complete: true, ...FOUR, self: 90 }
  );
});

test('D: nhật ký điểm KPI ghi người nhập là nhân sự, ô self, giá trị cũ và mới (điểm × 100)', async () => {
  await P.seed(M);
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 100 } });
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 75.5 } });
  const log = await logOf('qa_ctv1');
  assert.equal(log.length, 2);
  assert.deepEqual(
    log.map(row => [row.field, row.old_value, row.new_value, row.by]),
    [
      ['self', null, 10000, 'qa_ctv1'],
      ['self', 10000, 7550, 'qa_ctv1']
    ]
  );
  assert.equal((await scoreRows()).length, 1);
});

test('D: nhân sự chỉ được đổi self: gửi wework, user, peer hay manager, kèm cả self, hoặc kèm mức KPI (amt) bị từ chối (400 hoặc 403) và không lưu gì, kể cả self đi cùng', async () => {
  await P.seed(M);
  await mustPut('admin', { user: 'qa_ctv1', scores: { ...FOUR, self: 60 } });
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 61 } }); // đối chứng: self của mình lưu được, nên các 4xx dưới đây là do nội dung bị cấm
  const tables = await F.snapshot();
  for (const scores of [
    { wework: 100 },
    { user: 100 },
    { peer: 100 },
    { manager: 100 },
    { self: 80, peer: 100 },
    { self: 80, wework: 0 },
    { wework: null }
  ]) {
    const res = await putScores('qa_ctv1', { user: 'qa_ctv1', scores });
    assert.ok([400, 403].includes(res.status), `${JSON.stringify(scores)}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const amt = await putScores('qa_ctv1', { user: 'qa_ctv1', scores: { self: 80 }, amt: 3000000 });
  assert.ok([400, 403].includes(amt.status), `amt: ${amt.status} ${JSON.stringify(amt.data)}`);
  const onlyAmt = await putScores('qa_ctv1', { user: 'qa_ctv1', amt: 3000000 });
  assert.ok([400, 403].includes(onlyAmt.status), `chỉ amt: ${onlyAmt.status}`);
  assert.deepEqual(F.changedTables(tables, await F.snapshot()), [], 'từ chối thì không ghi gì');
  assert.equal((await adminItem('qa_ctv1')).scores.self, 61);
  assert.equal((await adminItem('qa_ctv1')).scores.wework, 100);
});

test('D: nhân sự không đổi được điểm của người khác (403) và không lưu gì: kể cả self của người khác, người không tồn tại, và Admin', async () => {
  await P.seed(M);
  await mustPut('admin', { user: 'qa_nv2', scores: { ...FOUR, self: 60 } }); // đối chứng: qa_nv2 có KPI
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 40 } }); // đối chứng: self của chính mình lưu được
  const tables = await F.snapshot();
  const other = await putScores('qa_ctv1', { user: 'qa_nv2', scores: { self: 100 } });
  assert.equal(other.status, 403, JSON.stringify(other.data));
  const admin = await putScores('qa_ctv1', { user: 'admin', scores: { self: 100 } });
  assert.ok([400, 403].includes(admin.status), `${admin.status}`);
  const ghost = await putScores('qa_ctv1', { user: 'qa_khong_co', scores: { self: 100 } });
  assert.ok([403, 404].includes(ghost.status), `${ghost.status}`);
  assert.deepEqual(F.changedTables(tables, await F.snapshot()), []);
  assert.equal((await adminItem('qa_nv2')).scores.self, 60);
});

test('D: điểm self sai bị 400 và không lưu gì: ngoài 0 đến 100, quá 2 chữ số thập phân, chữ, vô hạn; self = 0 là điểm hợp lệ', async () => {
  await P.seed(M);
  const tables = await F.snapshot();
  for (const self of [101, -1, 80.123, '80', 1e9, [80], { a: 1 }]) {
    const res = await putScores('qa_ctv1', { user: 'qa_ctv1', scores: { self } });
    assert.equal(res.status, 400, `self ${JSON.stringify(self)}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  assert.deepEqual(F.changedTables(tables, await F.snapshot()), []);
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 0 } });
  assert.equal((await adminItem('qa_ctv1')).scores.self, 0, '0 là đã nhập, khác chưa nhập');
});

test('D: người không có KPI (TTS) không lưu được self: bị từ chối và không lưu gì', async () => {
  await P.seed(M);
  await mustPut('qa_ctv1', { user: 'qa_ctv1', scores: { self: 50 } }); // đối chứng: người có KPI lưu được
  const tables = await F.snapshot();
  for (const who of ['qa_tts1']) {
    const res = await putScores(who, { user: who, scores: { self: 100 } });
    assert.ok([400, 403].includes(res.status), `${who}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  assert.deepEqual(F.changedTables(tables, await F.snapshot()), []);
});

test('D: chưa đăng nhập 401; nhân sự vẫn không đọc được bảng điểm của mọi người (GET /api/kpi/scores 403) và không đọc được kpiParts của người khác', async () => {
  await P.seed(M);
  await mustPut('admin', { user: 'qa_nv2', scores: { ...FOUR, self: 60 } });
  assert.equal((await putScores(null, { user: 'qa_ctv1', scores: { self: 100 } })).status, 401);
  assert.equal((await F.call('GET', `/kpi/scores?month=${M}`, { who: 'qa_ctv1' })).status, 403);
  const other = await F.call('GET', `/sheet?month=${M}&user=qa_nv2`, { who: 'qa_ctv1' });
  assert.equal(other.status, 403, JSON.stringify(other.data).slice(0, 200));
  assert.equal(JSON.stringify(other.data).includes('kpiParts'), false);
});

test('D: kỳ đã duyệt vẫn lưu được self của nhân sự và của Admin, kèm cảnh báo PERIOD_LOCKED; phiếu đã duyệt không đổi', async () => {
  await P.setupMonth(M, 'approved');
  const slipsBefore = await P.slipRows(M);
  const admin = await putScores('admin', { user: 'qa_ctv1', scores: { self: 50 } });
  assert.equal(admin.status, 200, JSON.stringify(admin.data));
  assert.ok(
    admin.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
    JSON.stringify(admin.data.warnings)
  );
  const res = await putScores('qa_ctv1', { user: 'qa_ctv1', scores: { self: 60 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const locked = res.data.warnings.find(w => w.code === 'PERIOD_LOCKED');
  assert.ok(locked, JSON.stringify(res.data.warnings));
  assert.equal(locked.details.month, M);
  assert.equal(locked.details.status, 'approved');
  assert.equal((await adminItem('qa_ctv1')).scores.self, 60, 'điểm mới nhất được lưu');
  assert.deepEqual(await P.slipRows(M), slipsBefore, 'phiếu đã duyệt giữ nguyên số đã chốt');
});
