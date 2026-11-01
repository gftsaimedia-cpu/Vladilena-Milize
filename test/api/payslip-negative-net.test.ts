'use strict';
// Phiếu thực lĩnh âm chỉ cảnh báo (src/domain/period/periods.ts → negativePaidNets, decidePayslips, approve; src/domain/period/period-warnings.ts → warnNegativeNet):
//   - duyệt phiếu (PUT /api/periods/:m/payslips/decide, action approve) có phiếu thực lĩnh CHI TRẢ (sau số Admin đã sửa) < 0 vẫn là 200 kèm cảnh báo đỏ PAYSLIP_NEGATIVE_NET
//     nêu tên tài khoản và số âm; thực lĩnh đúng 0 không cảnh báo;
//   - duyệt kỳ (POST /api/periods/:m/approve) cũng 200 kèm cảnh báo khi còn phiếu âm, kể cả số sửa lưu SAU khi phiếu đã duyệt; số âm đóng băng trên phiếu.
// Phiếu âm dựng bằng số tạm ứng Admin sửa trên phiếu của qa_nv1 (helpers/period-flow.js; bảo hiểm 10,5 % × 6.000.000 = 630.000 ₫, thuế 0 ₫).
//   thực lĩnh = tổng lương − 630.000 − 0 − tạm ứng sửa. Tạm ứng sửa = tổng lương + 1.000.000 → thực lĩnh −1.630.000; tổng lương + 5.000.000 → −5.630.000.
// Mỗi test lấy một tháng riêng.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const USER = 'qa_nv1';
const INSURANCE = 630000;
const REASON = 'Điều chỉnh theo biên bản chi trả';
const override = async (month?, values?, user = USER) =>
  await F.call('PUT', '/slip-override', { body: { user, month, values, reason: REASON } });
const mustOverride = async (month?, values?) => {
  const res = await override(month, values);
  assert.equal(res.status, 200, JSON.stringify(res.data));
};
const rowOf = async (month?, user = USER) => (await P.slipRows(month)).find(row => row.username === user);
const statusOf = async (month?) => (await store.periods.get(month)).status;
const negativeWarning = (res?) => (res.data.warnings || []).find(w => w.code === 'PAYSLIP_NEGATIVE_NET');

test('Thực lĩnh âm: duyệt phiếu có phiếu âm vẫn được, kèm cảnh báo đỏ nêu qa_nv1 và số âm −1.630.000; phiếu âm thành đã duyệt', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = await rowOf(M);
  assert.equal(old.insurance, INSURANCE, 'điều kiện: bảo hiểm 10,5 % × 6.000.000');
  await mustOverride(M, { advance: old.gross + 1000000 }); // tạm ứng lớn hơn tổng lương: thực lĩnh âm
  const negative = await rowOf(M);
  assert.equal(negative.net, -INSURANCE - 1000000, 'điều kiện: tổng lương − 630.000 − (tổng lương + 1.000.000)');

  const rows = await P.slipRows(M);
  assert.equal(rows.length, 4);
  assert.ok(rows.every(row => row.status === 'draft'));
  const res = await P.decide(M, P.itemsOf(rows));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const warning = negativeWarning(res);
  assert.ok(warning, JSON.stringify(res.data.warnings));
  assert.equal(warning.severity, 'danger');
  assert.match(warning.message, /qa_nv1/, 'nêu tên tài khoản bị âm');
  assert.match(warning.message, /âm/);
  assert.deepEqual(warning.details.items, [{ username: USER, net: -1630000 }]);
  assert.deepEqual(
    (await P.slipRows(M)).map(row => [row.username, row.status]),
    rows.map(row => [row.username, 'approved'])
  );
  assert.equal((await rowOf(M)).net, -1630000, 'số chi trả vẫn là số âm đã sửa');
  assert.equal(await statusOf(M), 'calculated');
});

test('Thực lĩnh âm: chỉ duyệt riêng các phiếu không âm thì không có cảnh báo; duyệt riêng phiếu âm có cảnh báo; số tính ra bình thường không cảnh báo', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = await rowOf(M);
  assert.ok(old.net > 0, 'điều kiện: số tự tính dương');
  await mustOverride(M, { advance: old.gross + 1 });

  // cảnh báo chỉ xét những phiếu được chọn
  const others = (await P.slipRows(M)).filter(row => row.username !== USER);
  const ok = await P.decide(M, P.itemsOf(others));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(negativeWarning(ok), undefined, 'các phiếu được chọn đều không âm');

  const alone = await P.decide(M, P.itemsOf([await rowOf(M)]));
  assert.equal(alone.status, 200, JSON.stringify(alone.data));
  assert.deepEqual(negativeWarning(alone).details.items, [{ username: USER, net: -INSURANCE - 1 }]);

  // tháng khác không sửa gì: duyệt không cảnh báo
  const M2 = monthOf();
  await P.setupMonth(M2, 'reviewed');
  const res = await P.approveAllPending(M2);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(negativeWarning(res), undefined);
});

test('Thực lĩnh âm: thực lĩnh đúng 0 ₫ duyệt không cảnh báo, cả duyệt phiếu lẫn duyệt kỳ; âm 1 ₫ thì cảnh báo', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = await rowOf(M);
  assert.equal(old.tax, 0, 'điều kiện: chưa chịu thuế nên tạm ứng không làm đổi thuế');
  await mustOverride(M, { advance: old.gross - old.insurance }); // thực lĩnh = tổng lương - bảo hiểm - thuế 0 - tạm ứng = 0
  const zero = await rowOf(M);
  assert.equal(zero.net, 0);
  const res = await P.approveAllPending(M);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(negativeWarning(res), undefined, 'thực lĩnh 0 không âm');
  assert.equal((await rowOf(M)).status, 'approved');
  const period = await P.step(M, 'approve');
  assert.equal(period.status, 200, JSON.stringify(period.data));
  assert.equal(negativeWarning(period), undefined);
  assert.equal(period.data.status, 'approved');
  assert.equal((await rowOf(M)).net, 0);

  // tạm ứng nhiều hơn 1 ₫ là âm 1 ₫
  const M2 = monthOf();
  await P.setupMonth(M2, 'reviewed');
  const old2 = await rowOf(M2);
  await mustOverride(M2, { advance: old2.gross - old2.insurance - old2.tax + 1 }); // tháng này có quyết toán phép dư nên có thuế: thực lĩnh = tổng lương − bảo hiểm − thuế − tạm ứng
  assert.equal((await rowOf(M2)).net, -1);
  const warned = await P.decide(M2, P.itemsOf(await P.slipRows(M2)));
  assert.equal(warned.status, 200, JSON.stringify(warned.data));
  assert.deepEqual(negativeWarning(warned).details.items, [{ username: USER, net: -1 }]);
});

test('Thực lĩnh âm: duyệt kỳ vẫn được kèm cảnh báo khi số sửa âm được lưu SAU khi phiếu đã duyệt; số âm −5.630.000 đóng băng trên phiếu', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  assert.ok((await P.slipRows(M)).every(row => row.status === 'approved'));
  const old = await rowOf(M);

  await mustOverride(M, { advance: old.gross + 5000000 }); // lưu sau khi phiếu đã duyệt (kỳ còn reviewed)
  assert.equal((await rowOf(M)).net, -INSURANCE - 5000000);
  assert.equal(await statusOf(M), 'calculated');

  const approved = await P.step(M, 'approve');
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.equal(approved.data.status, 'approved');
  const warning = negativeWarning(approved);
  assert.ok(warning, JSON.stringify(approved.data.warnings));
  assert.deepEqual(warning.details.items, [{ username: USER, net: -5630000 }]);
  assert.equal(await statusOf(M), 'approved');
  assert.equal((await rowOf(M)).net, -5630000, 'số âm giữ nguyên sau khi duyệt kỳ');
  assert.equal(
    (await flow.payslipsOf(M)).slips[USER].net,
    old.net,
    'bản chụp lưu vẫn là số tự tính; số chi trả là số Admin sửa'
  );
});

test('Thực lĩnh âm: người không có quyền duyệt phiếu vẫn nhận 403 (không lộ thông tin phiếu âm), nhân sự không gọi được', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const old = await rowOf(M);
  await mustOverride(M, { advance: old.gross + 1000000 });
  const rows = await P.slipRows(M);
  const staff = await P.decide(M, P.itemsOf(rows), 'approve', undefined, USER);
  assert.equal(staff.status, 403, JSON.stringify(staff.data));
  assert.notEqual(staff.data.code, 'PAYSLIP_NEGATIVE_NET');
  const anonymous = await F.call('PUT', `/periods/${M}/payslips/decide`, {
    who: null,
    body: { items: P.itemsOf(rows), action: 'approve' }
  });
  assert.equal(anonymous.status, 401);
});
