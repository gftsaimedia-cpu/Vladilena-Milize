'use strict';
// Khoản điền thêm đi vào thuế và bảo hiểm của hợp đồng dài (người mẫu known-kpi-five-100-90-80-85-100: NV bậc 1, không người phụ thuộc,
// giảm trừ gia cảnh 15.500.000, bảo hiểm 630.000, chưa có tạm ứng đã duyệt):
//   khoản cộng chịu thuế vào tổng thu nhập; thu nhập tính thuế = chịu thuế − bảo hiểm − giảm trừ, biểu luỹ tiến 5 % đến 10 triệu đầu;
//   cờ miễn thuế (full / cap) chỉ có hiệu lực khi đã xác nhận; cờ bảo hiểm chỉ vào nền khi insurance.base = withFlaggedAllowances và đã xác nhận.
// Thực lĩnh = tổng thu nhập − bảo hiểm − thuế − tạm ứng đã duyệt (0 ở đây).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { legacyParams } = require('../helpers/legacy-params');
const golden = require('../fixtures/payroll-golden-v0.json');

const LONG = 'known-kpi-five-100-90-80-85-100';
const PERSONAL = 15500000;
const engine = PayrollEngine.create(legacyParams());
const flaggedEngine = PayrollEngine.create({ ...legacyParams(), 'insurance.base': 'withFlaggedAllowances' });
const copy = (value?) => JSON.parse(JSON.stringify(value));
const compute = (entries?, e = engine) => {
  const input = copy(golden.cases.find(c => c.id === LONG).input);
  if (entries !== undefined) input.entries = entries;
  return e.computeMonth(input).m;
};
const add = (amount?, extra: any = {}) => ({ id: 1, direction: 'add', amount, label: 'Khoản cộng thử', ...extra });
const firstBracket = (assessable?) => Math.round(assessable * 0.05); // đến 10 triệu: 5 %

test('cộng 20.000.000 ₫ chịu thuế: thuế 5 % trên (chịu thuế − bảo hiểm − 15.500.000); cờ miễn thuế CHƯA xác nhận vẫn chịu thuế', async () => {
  const none = await compute();
  assert.equal(none.net.tax, 0);
  assert.equal(none.net.advance, 0);
  assert.equal(none.net.net, none.net.gross - none.net.insurance);
  const taxed = await compute([add(20000000)]);
  assert.equal(taxed.net.gross, none.net.gross + 20000000);
  assert.equal(taxed.net.exempt, 0);
  assert.equal(taxed.net.insurance, none.net.insurance, 'khoản không có cờ bảo hiểm không vào nền');
  assert.equal(taxed.net.deduction, PERSONAL);
  assert.equal(taxed.net.tax, firstBracket(taxed.net.taxable - taxed.net.insurance - PERSONAL));
  assert.equal(taxed.net.tax, 486254);
  assert.equal(taxed.net.net, taxed.net.gross - taxed.net.insurance - taxed.net.tax);
  const unconfirmed = await compute([add(20000000, { taxMode: 'full' })]);
  assert.deepEqual(unconfirmed.net, taxed.net);
});

test('cờ miễn thuế ĐÃ xác nhận: full miễn cả khoản (thuế 0), cap miễn tới hạn mức; hạn mức lớn hơn khoản thì chỉ miễn đúng khoản', async () => {
  const none = await compute();
  const full = await compute([add(20000000, { taxMode: 'full', flagsConfirmedBy: 'ketoan' })]);
  assert.equal(full.net.exempt, 20000000);
  assert.equal(full.net.taxable, none.net.taxable);
  assert.equal(full.net.tax, 0);
  assert.equal(full.net.net, none.net.gross + 20000000 - full.net.insurance);
  const cap = await compute([add(20000000, { taxMode: 'cap', taxCap: 8000000, flagsConfirmedBy: 'ketoan' })]);
  assert.equal(cap.net.exempt, 8000000);
  assert.equal(cap.net.tax, firstBracket(cap.net.taxable - cap.net.insurance - PERSONAL));
  assert.equal(cap.net.tax, 86254);
  assert.equal(cap.net.net, cap.net.gross - cap.net.insurance - cap.net.tax);
  const wide = await compute([add(1000000, { taxMode: 'cap', taxCap: 9000000, flagsConfirmedBy: 'ketoan' })]);
  assert.equal(wide.net.exempt, 1000000);
});

test('cờ bảo hiểm chỉ vào nền khi insurance.base = withFlaggedAllowances VÀ đã xác nhận: bảo hiểm 630.000 → 682.500, công ty đóng 1.290.000 → 1.397.500', async () => {
  const entries = (confirmed?) => [
    add(500000, { insuranceBase: 500000, ...(confirmed ? { flagsConfirmedBy: 'ketoan' } : {}) })
  ];
  const base = await compute();
  // mặc định (insurance.base = baseSalary): cờ không có tác dụng
  const byDefault = await compute(entries(true));
  assert.equal(byDefault.net.insurance, 630000);
  assert.equal(byDefault.net.net, byDefault.net.gross - 630000 - byDefault.net.tax);
  // bật nền có cờ nhưng chưa xác nhận: không vào nền
  assert.equal((await compute(entries(false), flaggedEngine)).net.insurance, 630000);
  // bật nền có cờ và đã xác nhận: nền tăng tới trần đóng
  const m = await compute(entries(true), flaggedEngine);
  assert.equal(m.net.insurance, 682500);
  assert.equal(m.net.employer, 1397500);
  assert.equal(m.net.gross, base.net.gross + 500000);
  assert.equal(m.net.net, m.net.gross - 682500 - m.net.tax);
});
