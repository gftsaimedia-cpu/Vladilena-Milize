'use strict';
// Soát AI theo quy tắc bảo hiểm tính theo ngày có lương: người có 1 ngày công không đóng bảo hiểm nên thực nhận không âm (không còn gắn net-nonpositive);
// 13 ngày có lương thì đóng 630.000 ₫ (NV bậc 1); người có cột staff.insured còn NULL (input.insuredUnset) đóng theo insurance.coverage.<hợp đồng> của tháng.
// Chỉ người giả (qa_*), tháng 10/2026. Bảo hiểm đọc từ kết quả tính của bộ máy mà bộ soát gọi (bọc computeMonth để ghi lại).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review } = require('../../lib/ai/review.js');
const { loadPayroll } = require('../../lib/ai/payroll-loader.js');
const { DEFAULTS } = require('../../public/payroll-params.js');
const W = require('./ai-review-world.js');
const { declaredPunches } = require('../helpers/declared-punches');

const { person, world, find, workDay, onePaidDayMonth } = W;
// 13 ngày Thứ Hai đến Thứ Bảy đầu tháng 10/2026 (1–15/10) đi làm đủ ca: đúng số ngày có lương để bắt đầu đóng bảo hiểm của NV
const thirteenDays = () =>
  Object.fromEntries(
    [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15].map(d => [`2026-10-${String(d).padStart(2, '0')}`, workDay()])
  );

function run(params, days, extra = {}) {
  const real = loadPayroll(params);
  const seen = [];
  const payroll = {
    ...real,
    computeMonth(args) {
      const out = real.computeMonth(args);
      seen.push({ insured: args.staff.insured, insurance: out.m.net.insurance, paidDays: out.m.paidDays });
      return out;
    }
  };
  const staff = person('qa_a', { contract: 'long', insured: true });
  const base = world({ people: [staff], days: { qa_a: days }, sessions: declaredPunches(staff, days) }); // chỉ đi làm đúng những ngày đã khai
  const result = review({ ...base, params, payroll, ...extra });
  return { result, seen };
}

test('1 ngày công: không đóng bảo hiểm nên thực nhận không âm và không bị gắn net-nonpositive', () => {
  const { result, seen } = run(DEFAULTS, onePaidDayMonth());
  assert.deepEqual(find(result, 'net-nonpositive'), []);
  assert.ok(seen.length > 0);
  assert.ok(seen.some(x => x.paidDays === 1));
  assert.ok(seen.every(x => x.insurance === 0));
});

test('13 ngày công: bộ soát tính ra bảo hiểm 630.000 ₫', () => {
  const { seen } = run(DEFAULTS, thirteenDays());
  assert.ok(seen.length > 0);
  assert.ok(seen.every(x => x.paidDays === 13 && x.insurance === 630000));
});

test('hồ sơ ghi insured = true: đóng bảo hiểm như hồ sơ, dù Kế toán đổi coverage.long thành không đóng', () => {
  const { seen } = run({ ...DEFAULTS, 'insurance.coverage.long': false }, thirteenDays());
  assert.ok(seen.every(x => x.insured === true && x.insurance === 630000));
});

test('cột insured NULL (insuredUnset): coverage.long = không đóng thì không có bảo hiểm; mặc định vẫn đóng như cũ', () => {
  const off = run({ ...DEFAULTS, 'insurance.coverage.long': false }, thirteenDays(), { insuredUnset: ['qa_a'] });
  assert.ok(off.seen.length > 0);
  assert.ok(off.seen.every(x => x.insured === null && x.insurance === 0));
  const byDefault = run(DEFAULTS, thirteenDays(), { insuredUnset: ['qa_a'] });
  assert.ok(byDefault.seen.every(x => x.insured === null && x.insurance === 630000));
});

test('insuredUnset không sửa đầu vào', () => {
  const base = world({ people: [person('qa_a', { contract: 'long', insured: true })], days: { qa_a: thirteenDays() } });
  const input = { ...base, params: DEFAULTS, payroll: loadPayroll(DEFAULTS), insuredUnset: ['qa_a'] };
  const before = JSON.stringify(input.staff);
  review(input);
  assert.equal(JSON.stringify(input.staff), before);
});
