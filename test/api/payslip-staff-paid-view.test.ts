'use strict';
// Nhân sự KHÔNG thấy số tự tính khi phiếu có số Admin sửa (src/domain/period/periods.ts → staffPaidSnapshot, staffLinesOf, selfView, estimate nhánh chính thức):
//   - phiếu của chính mình (GET /api/periods/:m/payslips/:u) và GET /api/me/estimate: bản chụp gửi đi là BẢN SAO theo số chi trả (m.total, m.net, m.trace),
//     ô sửa ánh xạ thẳng một dòng thì dòng đó mang giá trị sửa; ô sửa mà tiền nằm rải nhiều dòng thì bỏ các dòng chi tiết đó (không đoán cách chia);
//   - Admin (không selfView) vẫn nhận bản chụp gốc cùng computed; phiếu không có số sửa thì nhân sự nhận đúng bản chụp đã lưu.
// Cùng với: engineVersion của lần tính là Engine.ENGINE_VERSION, verify báo engineChanged, danh sách phiếu không 500 khi params_json hỏng.
// Người bịa của helpers/period-flow.js; mỗi test một tháng riêng (helpers/period-api.js → monthPool).
// Số của qa_nv1 (NV bậc 1, ca đêm, 19 ngày công, tháng 2026-10): tổng lương tự tính 8.988.461 = thành phần ngày 8.330.769 (ngày làm 5.076.923 + phụ cấp ca đêm 19 × 40 % × 230.769,23 = 1.753.846
// + giờ nghỉ trả lương 18 × 28.846,15 × 130 % = 675.000 + OT 115.385 + làm lễ 709.615) + đi lại 6.000.000 × 15 % × 19 ÷ 26 = 657.692; chuyên cần 0 (nghỉ vắng vượt 24 giờ).
// Bảo hiểm 630.000, thuế 0 (dưới giảm trừ 15.500.000), tạm ứng 0 (chưa có yêu cầu được duyệt): thực lĩnh 8.988.461 − 630.000 = 8.358.461.
// Thu nhập chịu thuế 7.328.364 = 8.988.461 − miễn thuế 1.660.097 (phần đêm 1.094.712 + phần OT 565.385). Chuyên cần sửa +500.000 cộng đủ vào tổng, chịu thuế và thực lĩnh.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');

const { F, store, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const REASON = 'Điều chỉnh theo biên bản chi trả';
const override = async (month?, user?, values?) => {
  const res = await F.call('PUT', '/slip-override', { body: { user, month, values, reason: REASON } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
};
const payslipOf = async (month?, user?, who = user) =>
  await F.call('GET', `/periods/${month}/payslips/${user}`, { who });
const estimateOf = async (month?, who?) => await F.call('GET', `/me/estimate?month=${month}`, { who });
// Dựng một kỳ đã chi trả, có số Admin sửa cho từng người trong `edits` ({ user: values })
async function paidMonth(edits?) {
  const month = monthOf();
  await P.setupMonth(month, 'reviewed');
  for (const [user, values] of Object.entries<any>(edits)) await override(month, user, values);
  P.must(await P.approveAllPending(month), 'duyệt phiếu');
  P.must(await P.step(month, 'approve'), 'duyệt kỳ');
  P.must(await P.step(month, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  return month;
}
const dump = (value?) => JSON.stringify(value);
// Sửa cột của lần chạy trong DB TEST (trong bộ nhớ): trigger payroll_runs_guard_update chặn sửa engine_version và params_json, nên gỡ tạm rồi dựng lại đúng câu cũ
async function editRun(month?, column?, value?) {
  await store.db.exec('ALTER TABLE payroll_runs DISABLE TRIGGER payroll_runs_guard_update');
  try {
    await store.db
      .prepare(`UPDATE payroll_runs SET ${column} = ? WHERE month = ? AND status != 'superseded'`)
      .run(value, month);
  } finally {
    await store.db.exec('ALTER TABLE payroll_runs ENABLE TRIGGER payroll_runs_guard_update');
  }
}

/* ================= (1) chuyên cần +500.000 ₫ của qa_nv1 ================= */
test('Nhân sự thấy số chi trả khi Admin sửa chuyên cần +500.000: phiếu và /me/estimate không chứa số tự tính 8988461, 8358461, 7328364; tổng thu nhập 9.488.461, thực lĩnh 8.858.461', async () => {
  const M = await paidMonth({ qa_nv1: { attendance: 500000 } });
  // tự tính lại: tổng tự tính 8.988.461 + 500.000; không chịu thuế nên thực lĩnh 8.358.461 + 500.000
  const orig = (await flow.payslipsOf(M)).slips.qa_nv1;
  assert.equal(orig.gross, 8988461, 'điều kiện: số tự tính');
  assert.equal(orig.net, 8358461);
  assert.equal(orig.snapshot.net.taxable, 7328364);
  const forbidden = ['8988461', '8358461', '7328364'];

  const slip = await payslipOf(M, 'qa_nv1');
  assert.equal(slip.status, 200, dump(slip.data));
  const est = await estimateOf(M, 'qa_nv1');
  assert.equal(est.status, 200, dump(est.data));
  assert.equal(est.data.source, 'snapshot');
  assert.equal(est.data.overridden, true);
  for (const [name, body] of [
    ['phiếu', slip.data],
    ['/me/estimate', est.data]
  ])
    for (const number of forbidden) assert.equal(dump(body).includes(number), false, `${name} lộ số tự tính ${number}`);

  const snapshot = slip.data.payslip.snapshot;
  assert.equal(slip.data.payslip.gross, 9488461);
  assert.equal(slip.data.payslip.net, 8858461);
  assert.equal(snapshot.total, 9488461);
  assert.equal(snapshot.net.gross, 9488461);
  assert.equal(snapshot.net.net, 8858461);
  assert.equal(snapshot.net.taxable, 7828364);
  assert.equal(snapshot.attendance, 500000, 'ô chuyên cần mang giá trị sửa');
  assert.equal(snapshot.trace.phuCapChuyenCan, 500000);
  assert.equal(snapshot.trace.tongThuNhap, 9488461);
  assert.equal(snapshot.trace.thucLinh, 8858461);
  assert.equal(snapshot.trace.thuNhapChiuThue, 7828364);
  assert.equal(slip.data.payslip.phuCap, 657692 + 500000, 'dòng phụ cấp = đi lại + chuyên cần đã sửa');

  assert.equal(est.data.m.total, 9488461);
  assert.equal(est.data.net.net, 8858461);
  assert.equal(est.data.m.net.net, 8858461);
  assert.equal(est.data.trace.thucLinh, 8858461);
  assert.equal(est.data.trace.tongThuNhap, 9488461);
  assert.equal(est.data.trace.phuCapChuyenCan, 500000);
  assert.equal(est.data.m.attendance, 500000);
  // không có cờ nội bộ
  for (const hidden of ['computed', 'overridden', 'override', 'flags'])
    assert.equal(Object.hasOwn(slip.data.payslip, hidden), false, hidden);
});

/* ================= (2) OT của qa_nv2: tiền rải nhiều dòng thì bỏ dòng chi tiết ================= */
test('Sửa otPay 4.242.424 của qa_nv2: nhân sự không còn thấy tienOt, tienLamLe, dòng OT và dòng ngày; tổng thu nhập trong trace là số chi trả', async () => {
  const M = await paidMonth({ qa_nv2: { otPay: 4242424 } });
  const orig = (await flow.payslipsOf(M)).slips.qa_nv2;
  assert.ok(
    orig.snapshot.trace.tienOt !== undefined && Array.isArray(orig.snapshot.rows),
    'điều kiện: bản chụp gốc có cả hai'
  );
  const slip = (await payslipOf(M, 'qa_nv2')).data.payslip;
  const est = (await estimateOf(M, 'qa_nv2')).data;
  const paidGross = slip.gross;
  assert.notEqual(paidGross, orig.gross, 'số chi trả khác số tự tính');
  for (const [name, trace, m] of [
    ['phiếu', slip.snapshot.trace, slip.snapshot],
    ['/me/estimate', est.trace, est.m]
  ]) {
    assert.equal(Object.hasOwn(trace, 'tienOt'), false, `${name}: trace không có tienOt`);
    assert.equal(Object.hasOwn(trace, 'tienLamLe'), false, `${name}: trace không có tienLamLe`);
    assert.equal(trace.tongThuNhap, paidGross, `${name}: tongThuNhap là số chi trả`);
    assert.equal(Object.hasOwn(m, 'otPay'), false, `${name}: m không có otPay tự tính`);
    assert.equal(Object.hasOwn(m, 'holWorkPay'), false);
  }
  assert.equal(slip.ot, null, 'dòng OT của phiếu là null (không hiện 0 giả)');
  assert.equal(Object.hasOwn(slip.snapshot, 'rows'), false, 'dòng ngày vắng');
  assert.equal(Object.hasOwn(est.m, 'rows'), false);
  assert.equal(slip.snapshot.net.net, slip.net);
  assert.equal(est.net.net, slip.net);
  // Admin vẫn thấy bản chụp gốc cùng computed
  const admin = (await payslipOf(M, 'qa_nv2', 'admin')).data.payslip;
  assert.equal(admin.snapshot.trace.tienOt, orig.snapshot.trace.tienOt);
  assert.ok(Array.isArray(admin.snapshot.rows));
  assert.equal(admin.computed.gross, orig.gross);
  assert.equal(admin.gross, paidGross);
});

test('Sửa bảo hiểm của qa_nv2: nhân sự không thấy bhxh, bhyt, bhtn (số tự tính); net.insurance bằng số sửa', async () => {
  const M = await paidMonth({ qa_nv2: { insurance: 600000 } });
  const orig = (await flow.payslipsOf(M)).slips.qa_nv2;
  assert.notEqual(orig.snapshot.net.insurance, 600000, 'điều kiện: số tự tính khác');
  const slip = (await payslipOf(M, 'qa_nv2')).data.payslip;
  const est = (await estimateOf(M, 'qa_nv2')).data;
  for (const [name, net] of [
    ['phiếu', slip.snapshot.net],
    ['/me/estimate', est.net],
    ['/me/estimate m.net', est.m.net]
  ]) {
    assert.equal(net.insurance, 600000, `${name}: bảo hiểm là số sửa`);
    for (const gone of ['bhxh', 'bhyt', 'bhtn'])
      assert.equal(Object.hasOwn(net, gone), false, `${name}: không có ${gone}`);
    assert.equal(Object.hasOwn(net, 'employer'), false, `${name}: không có phần công ty đóng`);
  }
  assert.equal(slip.insurance, 600000);
  assert.equal(slip.snapshot.trace.baoHiem, 600000);
  // Admin vẫn thấy chia nhỏ gốc
  const admin = (await payslipOf(M, 'qa_nv2', 'admin')).data.payslip;
  assert.equal(admin.snapshot.net.bhxh, orig.snapshot.net.bhxh);
  assert.equal(admin.computed.insurance, orig.snapshot.net.insurance);
});

/* ================= (3) Admin nhận bản gốc; phiếu không sửa giữ nguyên ================= */
test('Admin (không selfView) vẫn nhận bản chụp gốc và computed; phiếu không có số sửa thì phản hồi cho nhân sự giữ nguyên bản chụp đã lưu', async () => {
  const M = await paidMonth({ qa_nv1: { attendance: 500000 } });
  const stored = (await flow.payslipsOf(M)).slips;
  const admin = (await payslipOf(M, 'qa_nv1', 'admin')).data.payslip;
  const own = stored.qa_nv1;
  assert.equal(admin.gross, own.gross + 500000, 'Admin: hàng phiếu là số chi trả');
  assert.deepEqual(admin.computed, {
    gross: own.gross,
    insurance: own.insurance,
    tax: own.tax,
    advance: own.advance,
    net: own.net
  });
  assert.equal(admin.overridden, true);
  assert.equal(admin.snapshot.trace.phuCapChuyenCan, 0, 'Admin: bản chụp gốc còn nguyên');
  assert.equal(admin.snapshot.net.net, own.net);
  assert.equal(admin.snapshot.net.taxable, own.snapshot.net.taxable);
  assert.equal(Math.round(admin.snapshot.total), Math.round(own.snapshot.total));
  assert.equal(admin.override.values.attendance, 500000);

  // người không có số sửa: nhân sự nhận đúng bản chụp đã lưu, từng khoá
  for (const user of ['qa_ctv1', 'qa_nv2', 'qa_tts1']) {
    const mine = (await payslipOf(M, user)).data.payslip;
    assert.deepEqual(
      JSON.parse(dump(mine.snapshot)),
      JSON.parse(dump(stored[user].snapshot)),
      `${user}: bản chụp nguyên`
    );
    assert.equal(mine.gross, stored[user].gross);
    assert.equal(mine.net, stored[user].net);
    const est = (await estimateOf(M, user)).data;
    assert.equal(Object.hasOwn(est, 'overridden'), false, `${user}: không có cờ overridden`);
    assert.deepEqual(JSON.parse(dump(est.trace)), JSON.parse(dump(stored[user].snapshot.trace)));
    assert.equal(est.net.net, stored[user].net);
  }
});

/* ================= (5) engineVersion ================= */
test('engineVersion của lần tính mới là Engine.ENGINE_VERSION; bản chụp có engineVersion cũ thì verify báo engineChanged: true', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  assert.equal(Engine.ENGINE_VERSION, 'payroll-engine-14');
  assert.equal((await store.payroll.currentRun(M)).engineVersion, Engine.ENGINE_VERSION);
  const fresh = await F.call('GET', `/periods/${M}/verify`);
  assert.equal(fresh.status, 200, dump(fresh.data));
  assert.equal(fresh.data.engineVersion, Engine.ENGINE_VERSION);
  assert.equal(fresh.data.engineChanged, false);
  assert.deepEqual(fresh.data.mismatched, []);
  assert.equal(fresh.data.checked, 4);
  // dựng bản chụp cũ: sửa cột engine_version của lần chạy trong DB test
  await editRun(M, 'engine_version', 'payroll-engine-1');
  const old = await F.call('GET', `/periods/${M}/verify`);
  assert.equal(old.status, 200, dump(old.data));
  assert.equal(old.data.engineVersion, 'payroll-engine-1');
  assert.equal(old.data.engineChanged, true);
  assert.deepEqual(old.data.mismatched, [], 'số liệu vẫn khớp, chỉ phiên bản bộ máy khác');
  const slip = await payslipOf(M, 'qa_nv1', 'admin');
  assert.equal(slip.data.run.engineVersion, 'payroll-engine-1', 'phiếu báo phiên bản đã chụp');
});

/* ================= (6) params_json hỏng ================= */
// Dựng kỳ có số sửa (cần bộ tính thuế của lần chạy), gán params_json hỏng rồi gọi danh sách, chi tiết (Admin và nhân sự) và tổng kỳ
async function brokenParamsStatuses(broken?) {
  const M = await paidMonth({ qa_nv1: { attendance: 500000 } });
  await editRun(M, 'params_json', broken);
  return {
    list: (await F.call('GET', `/periods/${M}/payslips?pageSize=200`)).status,
    admin: (await payslipOf(M, 'qa_nv1', 'admin')).status,
    self: (await payslipOf(M, 'qa_nv1')).status,
    estimate: (await estimateOf(M, 'qa_nv1')).status,
    view: (await F.call('GET', `/periods/${M}`)).status
  };
}
test('Lần tính có params_json là JSON null, chuỗi không phải JSON hoặc mảng rỗng (cột NOT NULL nên null thật không có): danh sách phiếu, chi tiết phiếu (Admin và nhân sự) và tổng kỳ không trả 500', async () => {
  for (const broken of ['null', 'không phải JSON', '[]']) {
    const { estimate, ...status } = await brokenParamsStatuses(broken);
    for (const [where, code] of Object.entries<any>(status))
      assert.notEqual(code, 500, `${where}, params_json=${broken}`);
    assert.equal(status.list, 200, `danh sách vẫn đọc được, params_json=${broken}`);
  }
});
//   1. params_json là số hoặc chuỗi JSON: src/engine/payroll-params.ts → fillLate gọi WeakMap.set với khoá không phải đối tượng
//      (TypeError qua src/domain/period/periods.ts → workdaysStdOf) nên chi tiết phiếu trả 500;
//   2. params_json = 'null': src/domain/period/periods.ts → allowanceStatus đọc params.<khoá> khi run.params là null nên GET /api/me/estimate nhánh chính thức trả 500.
test('params_json hỏng (số, chuỗi JSON, null): chi tiết phiếu và /me/estimate không trả 500', async () => {
  for (const broken of ['123', '"chuỗi"', 'null', '[]']) {
    const status = await brokenParamsStatuses(broken);
    for (const [where, code] of Object.entries<any>(status))
      assert.notEqual(code, 500, `${where}, params_json=${broken}`);
  }
});
