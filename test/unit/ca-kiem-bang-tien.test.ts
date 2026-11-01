'use strict';
// Ca kiểm bằng tiền: số do bộ máy tính khi đổi tham số trong bộ nhớ, cộng phần đuôi luật tái tính độc lập
// (test/helpers/pay-oracle.ts). Mỗi số được viết lại bằng phép tính tay ở đây (không sao chép từ bộ máy) nên được kiểm
// bằng hai đường độc lập; lệch một đồng là đỏ.
// Người dùng toàn người bịa của bộ ca vàng (qa_gen_*, qa_known_*); không đụng DB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, closeTo, oracle } = require('../helpers/pay-oracle');
const { attendDeclaredDays } = require('../helpers/payroll-cases');

const NV1 = 'known-kpi-five-100-90-80-85-100';
const NV3 = 's20261015-00018';

test('ca tiền: NV bậc 1 có tạm ứng đã duyệt: tổng thu nhập 5.855.076, bảo hiểm 630.000, thuế 0, tạm ứng 184.615, thực lĩnh 5.040.461', async () => {
  const { m } = await runGolden(NV1, {}, input => {
    input.advanceApproved = true;
  });
  assert.equal(m.net.gross, 5855076);
  assert.equal(m.net.insurance, 630000);
  assert.equal(m.net.tax, 0);
  assert.equal(m.net.advance, 184615);
  assert.equal(m.net.net, 5040461);
  assert.equal(m.net.employer, 1290000);
  // kiểm độc lập bằng tay: 6.000.000 ÷ 26 + 15 % × 6.000.000 ÷ 26 + 25 % × 6.000.000 ÷ 26 + 92,2 % × 6.000.000
  const day = 6000000 / 26;
  assert.ok(closeTo(m.total, day + day * 0.15 + day * 0.25 + 6000000 * 0.922, 1));
});

test('ca tiền ①: NV bậc 1 làm 1 ngày được 6.000.000 ÷ 26 = 230.769,23', async () => {
  const { m } = await runGolden(NV1);
  assert.ok(closeTo(m.basePay, 230769.23));
  assert.ok(closeTo(m.basePay, 6000000 / 26, 1e-6));
});

test('ca tiền ③: NV bậc 1, đi lại 15 % và chuyên cần 25 % của một ngày là 34.615,38 và 57.692,31', async () => {
  const { m } = await runGolden(NV1);
  assert.ok(closeTo(m.travel, 34615.38, 0.5));
  assert.ok(closeTo(m.attendance, 57692.31, 0.5));
});

test('ca tiền ④: NV bậc 1, KPI 5 thành phần 92,2 % cho 5.532.000', async () => {
  const { m } = await runGolden(NV1);
  assert.equal(m.kpiPay, 5532000);
  // kiểm tay theo trọng số của Quy chế lương 3P: Base Wework 40 %, người dùng 24 %, đồng nghiệp 18 %, quản lý 12 %, tự đánh giá 6 %
  const pct = (100 * 40 + 90 * 24 + 80 * 18 + 85 * 12 + 100 * 6) / 100;
  assert.equal(pct, 92.2);
  assert.equal(Math.round((6000000 * pct) / 100), 5532000);
});

test('ca tiền ③ mất chuyên cần (T6-5): 23,75 giờ vượt ngưỡng còn chuyên cần 115.384,62, KPI 6.000.000, thực lĩnh 5.602.211; 24,25 giờ mất chuyên cần, KPI 461.538,46, thực lĩnh −54.520', async () => {
  const approve = (input?) => {
    input.advanceApproved = true;
  };
  const a = (await runGolden('known-t65-over-limit-23.75h', {}, approve)).m;
  assert.ok(closeTo(a.attendance, 115384.62, 0.5));
  assert.equal(a.kpiPay, 6000000);
  assert.equal(a.net.net, 5602211);
  const b = (await runGolden('known-t65-over-limit-24.25h', {}, approve)).m;
  assert.equal(b.attendance, 0);
  assert.ok(closeTo(b.kpiPay, 461538.46, 0.5));
  assert.ok(closeTo(b.kpiPay, (6000000 * 2) / 26, 0.5));
  assert.equal(b.net.net, -54520);
});

test('ca tiền ⑤: ca known-nv4-short-4h (NV bậc 4, thiếu 4 giờ) bị trừ 144.230,77 = 7.500.000 ÷ 26 ÷ 8 × 4', async () => {
  const { m } = await runGolden('known-nv4-short-4h');
  assert.ok(closeTo(m.cut, 144230.77));
  assert.ok(closeTo(m.cut, (7500000 / 26 / 8) * 4, 1e-6));
});

test('ca tiền ②: ca s20261015-00018 (NV bậc 3, 2,5 giờ OT ngày có lịch) cho OT 126.201,92 ở hệ số 1,5; hệ số 2 cho 168.269,23 và hệ số 2,5 cho 210.336,54; thực lĩnh (tạm ứng đã duyệt) 966.201 → 1.008.268 → 1.050.336', async () => {
  const approve = (input?) => {
    input.advanceApproved = true;
    attendDeclaredDays(input); // đi làm đủ mọi ngày đã khai, không ngày vắng nào làm mất chuyên cần
  };
  const hourly = 7000000 / 26 / 8;
  const base = (await runGolden(NV3, {}, approve)).m;
  assert.ok(closeTo(base.otPay, 126201.92, 0.5));
  assert.ok(closeTo(base.otPay, 2.5 * hourly * 1.5, 0.5));
  assert.equal(base.net.net, 966201);
  const two = (await runGolden(NV3, { 'ot.rate': 2 }, approve)).m;
  assert.ok(closeTo(two.otPay, 168269.23, 0.5));
  assert.equal(two.net.net, 1008268);
  assert.equal(two.net.net - base.net.net, 42067);
  const up = (await runGolden(NV3, { 'ot.rate': 2.5 }, approve)).m;
  assert.ok(closeTo(up.otPay, 210336.54, 0.5));
  assert.ok(closeTo(up.otPay, 2.5 * hourly * 2.5, 0.5));
  assert.equal(up.net.net, 1050336);
});

test('ca tiền lan truyền: level.nv.3.base 7.000.000 → 8.000.000 ở ca s20261015-00018 đổi cả chuỗi đúng số của bảng', async () => {
  const approve = (input?) => {
    input.advanceApproved = true;
    attendDeclaredDays(input); // đi làm đủ mọi ngày đã khai, không ngày vắng nào làm mất chuyên cần
  };
  const before = (await runGolden(NV3, {}, approve)).m;
  const after = (await runGolden(NV3, { 'level.nv.3.base': 8000000 }, approve)).m;
  const expected = [
    ['ngày công', before.basePay, after.basePay, 2423076.92, 2769230.77],
    ['phụ cấp ca', before.bonus, after.bonus, 484615.38, 553846.15],
    ['OT', before.otPay, after.otPay, 126201.92, 144230.77],
    ['chuyên cần', before.attendance, after.attendance, 605769.23, 692307.69]
  ];
  for (const [name, b, a, eb, ea] of expected) {
    assert.ok(closeTo(b, eb, 0.5), `${name} trước: ${b}`);
    assert.ok(closeTo(a, ea, 0.5), `${name} sau: ${a}`);
  }
  assert.equal(before.net.advance, 1938462);
  assert.equal(after.net.advance, 2215385);
  assert.equal(before.net.insurance, 735000);
  assert.equal(after.net.insurance, 840000);
  assert.equal(before.net.gross, 3639663);
  assert.equal(after.net.gross, 4159616);
  assert.equal(before.net.net, 966201);
  assert.equal(after.net.net, 1104231);
  // chi phí công ty = tổng thu nhập + bảo hiểm công ty đóng (21,5 % lương cơ bản)
  assert.equal(before.net.gross + before.net.employer, 5144663);
  assert.equal(after.net.gross + after.net.employer, 5879616);
  assert.equal(after.net.gross + after.net.employer - (before.net.gross + before.net.employer), 734953);
});

test('ca tiền dưới lương tối thiểu: level.nv.1.base 5.000.000 thấp hơn 5.310.000 (vùng I) ở ca known-kpi, hợp đồng dài đóng bảo hiểm', async () => {
  const { m } = await runGolden(NV1, { 'level.nv.1.base': 5000000 });
  assert.equal(m.net.contract, 'long');
  assert.equal(m.net.insured, true);
  assert.ok(5000000 < 5310000);
  assert.equal(m.net.insurance, 525000, '5.000.000 × 10,5 %');
});

test('ca tiền ①: ngày công chuẩn 27, 22, 13 của tháng 10/2026 (cho S1 và pay.method C): 222.222,22; 272.727,27; 461.538,46', () => {
  assert.ok(closeTo(6000000 / 27, 222222.22));
  assert.ok(closeTo(6000000 / 22, 272727.27));
  assert.ok(closeTo(6000000 / 13, 461538.46));
  // tháng 10/2026: 1/10 là thứ Năm; đếm ngày thứ Hai–Bảy, thứ Hai–Sáu, thứ Hai–Tư–Sáu
  const days = Array.from({ length: 31 }, (_, i) => new Date(Date.UTC(2026, 9, i + 1)).getUTCDay());
  assert.equal(days.filter(d => d >= 1 && d <= 6).length, 27);
  assert.equal(days.filter(d => d >= 1 && d <= 5).length, 22);
  assert.equal(days.filter(d => [1, 3, 5].includes(d)).length, 13);
});

/* ---------- phần đuôi luật tái tính độc lập (khối thêm, khoản điền thêm) ---------- */
test('ca tiền oracle: không thêm gì thì oracle trùng bộ máy ở ba ca (thực lĩnh, thuế, bảo hiểm)', async () => {
  for (const id of ['known-short-nv2-full-month', 's20261015-00129', NV1]) {
    const { m } = await runGolden(id);
    const o = oracle.netAfter(m);
    assert.equal(o.net, m.net.net, id);
    assert.equal(o.tax, m.net.tax, id);
    assert.equal(o.insurance, m.net.insurance, id);
  }
});

test('ca tiền ③ khối "ăn trưa" 500.000 cố định, chịu thuế, không vào nền bảo hiểm (ca known-short-nv2-full-month): tổng thu nhập 9.950.000, bảo hiểm 682.500, thuế 995.000, thực lĩnh 8.272.500', async () => {
  const { m } = await runGolden('known-short-nv2-full-month');
  assert.equal(m.net.contract, 'short');
  const o = oracle.netAfter(m, { addTaxable: 500000 });
  assert.equal(o.total, 9950000);
  assert.equal(o.insurance, 682500);
  assert.equal(o.tax, 995000); // hợp đồng ngắn: 10 % trên toàn bộ tổng thu nhập
  assert.equal(o.net, 8272500); // 9.950.000 − 682.500 − 995.000
});

test('ca tiền khoản điền thêm (1c): cộng 500.000 chịu thuế cho thực lĩnh 8.272.500; trừ 300.000 sau thuế cho 7.522.500 mà tổng thu nhập và thuế không đổi', async () => {
  const { m } = await runGolden('known-short-nv2-full-month');
  const add = oracle.netAfter(m, { addTaxable: 500000 });
  assert.equal(add.net, 8272500);
  const minus = oracle.netAfter(m, { deductAfterTax: 300000 });
  assert.equal(minus.net, 7522500); // 7.822.500 − 300.000
  assert.equal(minus.total, 9450000);
  assert.equal(minus.tax, 945000);
});

test('ca tiền ③/⑧ khối +20.000.000 (số giả) ở ca s20261015-00129 (hợp đồng dài): thuế tính tay trên (chịu thuế − bảo hiểm − giảm trừ 21.700.000) khi chịu thuế / miễn toàn bộ / miễn đến 5.000.000', async () => {
  const { m } = await runGolden('s20261015-00129');
  assert.equal(m.net.contract, 'long');
  assert.equal(m.net.deduction, 21700000);
  // thuế tính tay: 5 % đến 10 triệu, 10 % đến 30 triệu, 20 % đến 60 triệu
  const hand = (a?) =>
    Math.round(
      0.05 * Math.min(a, 10e6) +
        0.1 * Math.max(0, Math.min(a, 30e6) - 10e6) +
        0.2 * Math.max(0, Math.min(a, 60e6) - 30e6)
    );
  const assessable = (extra?) => Math.max(0, m.net.taxable + extra - m.net.insurance - m.net.deduction);
  const taxed = oracle.netAfter(m, { addTaxable: 20000000 });
  assert.equal(taxed.tax, hand(assessable(20000000)));
  const exempt = oracle.netAfter(m, { addExempt: 20000000 });
  assert.equal(exempt.tax, hand(assessable(0)));
  const capped = oracle.netAfter(m, { addTaxable: 15000000, addExempt: 5000000 });
  assert.equal(capped.tax, hand(assessable(15000000)));
  assert.ok(taxed.tax > capped.tax && capped.tax >= exempt.tax);
  for (const o of [taxed, exempt, capped]) assert.equal(o.net, o.total - o.insurance - o.tax - m.net.advance);
});

test('ca tiền ⑦: ca known-kpi + khoản 500.000 đã xác nhận cờ bảo hiểm, insurance.base = withFlaggedAllowances: bảo hiểm 630.000 → 682.500, công ty đóng 1.290.000 → 1.397.500, thực lĩnh 5.040.461 → 5.487.961 (tạm ứng đã duyệt)', async () => {
  const { m } = await runGolden(NV1, {}, input => {
    input.advanceApproved = true;
  });
  const o = oracle.netAfter(m, { addTaxable: 500000, addInsBase: 500000 });
  assert.equal(o.insurance, 682500);
  assert.equal(o.employer, 1397500);
  assert.equal(o.net, 5487961);
});
