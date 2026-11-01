'use strict';
// insurance-options.
// ⑦ Bảo hiểm do Kế toán cấu hình: ai đóng (insurance.coverage.<hợp đồng>), nền đóng (insurance.base: lương cơ bản, cộng phụ cấp có cờ đã xác nhận,
// thuộc tính của bậc), sàn (insurance.floorMode) và ngưỡng ngày không lương của quy tắc 14 ngày (tax.insurance.skipDays).
// Mọi lựa chọn mặc định không đổi một đồng; phương án chưa có xác nhận của kế toán bị từ chối rõ ràng.
// Số tiền là đồng nguyên của người bịa (ca vàng known-kpi-five-100-90-80-85-100 và s20261015-00129), tham số giả chỉ ở bộ nhớ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../helpers/defaults-old-basis.js');
const { legacyParams } = require('../helpers/legacy-params');
const golden = require('../fixtures/payroll-golden-v0.json');

const REAL = PayrollParams.DEFAULTS;
// Ca vàng của khối cũ có ít ngày có lương: đặt ngưỡng không đóng rất lớn (xem test/helpers/legacy-params.ts; quy tắc ngày có lương có test riêng ở insurance-paid-days)
const D = legacyParams();
const LONG = 'known-kpi-five-100-90-80-85-100'; // NV bậc 1, hợp đồng dài, lương cơ bản 6.000.000 ₫, bảo hiểm 630.000 ₫
const BIG = 's20261015-00129'; // NV bậc 3, hợp đồng dài, bảo hiểm 735.000 ₫
const SHORT = 's20261015-00048'; // NV bậc 2, hợp đồng ngắn
const copy = (v?) => JSON.parse(JSON.stringify(v));
const inputOf = (id?) => copy(golden.cases.find(c => c.id === id).input);
const run = async (id?, params = D, edit?) => {
  const input = inputOf(id);
  if (edit) await edit(input);
  return PayrollEngine.create(params).computeMonth(input).m;
};
// Khối "ăn trưa" 500.000 ₫ cố định cho NV, cờ bảo hiểm đã Kế toán xác nhận (flagsConfirmedBy khác rỗng)
const lunch = (extra: any = {}) => ({
  'block.def.lunch': {
    label: 'Ăn trưa thử',
    component: '3',
    method: 'fixed',
    scalesWithDays: false,
    tax: 'none',
    insuranceBase: true,
    flagsConfirmedBy: 'ketoan',
    ...extra
  },
  'type.nv.block.lunch.on': true,
  'type.nv.block.lunch.amount': 500000
});
const insuranceOf = (m?) => m.net.insurance;

test('GĐ3: insurance-options: mặc định giữ nguyên (coverage dài Có, ngắn Không; nền lương cơ bản; không sàn)', async () => {
  assert.equal(REAL['insurance.coverage.long'], true);
  assert.equal(REAL['insurance.coverage.short'], false);
  assert.equal(REAL['insurance.base'], 'baseSalary');
  assert.equal(REAL['insurance.floorMode'], 'none');
  assert.equal(REAL['tax.insurance.skipDays'], 14);
  assert.equal(REAL['tax.insurance.skipCompare'], 'gte');
  const m = await run(LONG);
  assert.equal(insuranceOf(m), 630000);
  assert.equal(m.net.employer, 1290000);
  assert.equal(m.net.net, 5225076); // 5.855.076 − 630.000 (tạm ứng chưa duyệt nên không trừ)
});

test('GĐ3: insurance-options: khối 500.000 ₫ có cờ bảo hiểm đã xác nhận, insurance.base = withFlaggedAllowances: bảo hiểm 630.000 → 682.500, công ty đóng 1.290.000 → 1.397.500, thực lĩnh 5.225.076 → 5.672.576', async () => {
  const before = await run(LONG);
  const after = await run(LONG, { ...D, ...lunch(), 'insurance.base': 'withFlaggedAllowances' });
  assert.equal(before.net.insurance, 630000);
  assert.equal(before.net.employer, 1290000);
  assert.equal(before.net.net, 5225076);
  assert.equal(after.net.gross, 6355076); // 5.855.076 + 500.000
  assert.equal(after.net.insurance, 682500); // (6.000.000 + 500.000) × 10,5 %
  assert.equal(after.net.employer, 1397500); // (6.000.000 + 500.000) × 21,5 %
  assert.equal(after.net.tax, 0);
  assert.equal(after.net.net, 5672576); // 6.355.076 − 682.500 (tạm ứng chưa duyệt nên không trừ)
});

test('GĐ3: insurance-options: cờ bảo hiểm CHƯA xác nhận, hoặc insurance.base = baseSalary, thì khối không vào nền (bảo hiểm 630.000)', async () => {
  const unconfirmed = await run(LONG, {
    ...D,
    ...lunch({ flagsConfirmedBy: null }),
    'insurance.base': 'withFlaggedAllowances'
  });
  assert.equal(unconfirmed.net.insurance, 630000);
  assert.equal(unconfirmed.net.net, 5725076);
  const baseOnly = await run(LONG, { ...D, ...lunch() }); // phương án mặc định baseSalary
  assert.equal(baseOnly.net.insurance, 630000);
  assert.equal(baseOnly.net.employer, 1290000);
  assert.equal(baseOnly.net.net, 5725076);
});

test('GĐ3: insurance-options: coverage.long = Không thì người hợp đồng dài (chưa ghi riêng) không đóng; hồ sơ từng người vẫn đè lên', async () => {
  const off = { ...D, 'insurance.coverage.long': false };
  const m = await run(BIG, off);
  assert.equal(m.net.insured, false);
  assert.equal(m.net.insurance, 0);
  assert.equal(m.net.employer, 0);
  // thực lĩnh = tổng thu nhập − bảo hiểm − thuế − tạm ứng: không bảo hiểm, thuế 0 (thu nhập chịu thuế dưới giảm trừ gia cảnh 15,5 triệu + 6,2 triệu × 1 người phụ thuộc), tạm ứng chưa duyệt nên không trừ
  assert.equal(m.net.tax, 0);
  assert.equal(m.net.advance, 0);
  assert.equal(m.net.net, m.net.gross);
  assert.equal(
    m.net.gross,
    (await run(BIG)).net.gross,
    'tổng thu nhập không phụ thuộc việc có đóng bảo hiểm hay không'
  );
  // hồ sơ ghi riêng insured = true: vẫn đóng 10,5 % × 7.000.000 (lương cơ bản NV bậc 3) = 735.000
  const own = await run(BIG, off, input => (input.staff.insured = true));
  assert.equal(own.net.insurance, 735000);
  assert.equal(own.net.net, m.net.gross - 735000);
});

test('GĐ3: insurance-options: coverage.short = Có thì người hợp đồng ngắn chưa ghi riêng đóng bảo hiểm 682.500 ₫; mặc định (Không) thì không đóng', async () => {
  const unset = (input?) => {
    delete input.staff.insured; // chưa ghi riêng: theo coverage của hợp đồng
  };
  const byDefault = await run(SHORT, D, unset);
  assert.equal(byDefault.net.contract, 'short');
  assert.equal(byDefault.net.insured, false);
  assert.equal(byDefault.net.insurance, 0);
  const paid = await run(SHORT, { ...D, 'insurance.coverage.short': true }, unset);
  assert.equal(paid.net.insured, true);
  assert.equal(paid.net.insurance, 682500);
  assert.equal(paid.net.net, byDefault.net.net - 682500);
});

test('GĐ3: insurance-options: tax.insurance.skipDays là ngưỡng ngày không lương (ngày công chuẩn trừ ngày có lương) của quy tắc 14 ngày', async () => {
  const staff = inputOf(LONG).staff;
  const m = { ...(await run(LONG)), paidDays: 12 };
  const byDefault = PayrollEngine.create(REAL).calcNet(staff, m);
  assert.equal(byDefault.noPayDays, 14);
  assert.equal(byDefault.insuredMonth, false); // đủ 14 ngày không lương: tháng đó không đóng
  assert.equal(byDefault.insurance, 0);
  const lenient = PayrollEngine.create({ ...REAL, 'tax.insurance.skipDays': 15 }).calcNet(staff, m);
  assert.equal(lenient.noPayDays, 14);
  assert.equal(lenient.insuredMonth, true);
  assert.equal(lenient.insurance, 630000);
  const thirteen = PayrollEngine.create(REAL).calcNet(staff, { ...m, paidDays: 13 });
  assert.equal(thirteen.noPayDays, 13);
  assert.equal(thirteen.insurance, 630000);
});

test('GĐ3: insurance-options: insurance.floorMode = raiseToRegionMin nâng nền lên lương tối thiểu vùng (5.310.000 ₫): lương cơ bản 5.000.000 ₫ đóng 525.000 → 557.550', async () => {
  const low = { ...D, 'level.nv.1.base': 5000000 };
  assert.equal((await run(LONG, low)).net.insurance, 525000);
  const raised = await run(LONG, { ...low, 'insurance.floorMode': 'raiseToRegionMin' });
  assert.equal(raised.net.insurance, 557550); // 5.310.000 × 10,5 %
  // nền đã trên sàn thì không đổi
  assert.equal((await run(LONG, { ...D, 'insurance.floorMode': 'raiseToRegionMin' })).net.insurance, 630000);
});

test('GĐ3: insurance-options: insurance.base = insuranceAttr lấy nền từ thuộc tính tiền của bậc; thiếu thuộc tính là lỗi rõ ràng, không rơi về lương cơ bản', async () => {
  const attr = {
    ...D,
    'class.level.attr.lbh': { label: 'Lương đóng BH thử', component: 'money', unit: 'vnd' },
    'level.nv.1.attr.lbh': 8000000,
    'insurance.base': 'insuranceAttr',
    'insurance.baseAttr': 'lbh'
  };
  assert.equal((await run(LONG, attr)).net.insurance, 840000); // 8.000.000 × 10,5 %
  await assert.rejects(
    async () => run(LONG, { ...D, 'insurance.base': 'insuranceAttr' }),
    error => error.code === 'PARAM_MISSING' && error.key === 'insurance.baseAttr'
  );
});

test('GĐ3: insurance-options: giá trị lạ hoặc phương án chưa dùng được là lỗi khi dựng bộ máy, không bao giờ rơi về mặc định', () => {
  for (const [key, value] of [
    ['insurance.base', 'tuyChon'],
    ['insurance.floorMode', 'tuyChon'],
    ['insurance.coverage.long', 'co'],
    ['tax.method.long', 'tuyChon']
  ])
    assert.throws(
      () => PayrollEngine.create({ ...D, [key]: value }),
      error => error.code === 'PARAM_INVALID_VALUE' && error.key === key,
      key
    );
  assert.throws(
    () => PayrollEngine.create({ ...D, 'tax.exempt.otMethod': 'byHours' }),
    error => error.code === 'PARAM_OPTION_UNAVAILABLE' && /kế toán hoặc pháp chế/.test(error.message)
  );
});
