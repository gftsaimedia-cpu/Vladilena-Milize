'use strict';
// Phép tính của khoản điền thêm.
// Hàm thuần src/engine/pay-entries-calc.ts và móc nhỏ của src/engine/payroll-engine.ts: khoản cộng vào tổng thu nhập, cờ miễn thuế chỉ có hiệu lực khi đã xác nhận,
// cờ bảo hiểm chỉ khi insurance.base = withFlaggedAllowances, khoản trừ sau thuế; không có khoản nào thì kết quả không đổi.
// Mọi số tiền là đồng nguyên của người bịa (ca known-short-nv2-full-month và known-kpi-five-100-90-80-85-100).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayEntriesCalc = require('../../src/engine/pay-entries-calc');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { legacyParams } = require('../helpers/legacy-params');
const golden = require('../fixtures/payroll-golden-v0.json');

const caseOf = (id?) => golden.cases.find(c => c.id === id);
const engine = PayrollEngine.create(legacyParams());
const flaggedEngine = PayrollEngine.create({ ...legacyParams(), 'insurance.base': 'withFlaggedAllowances' });
const copy = (value?) => JSON.parse(JSON.stringify(value));
const compute = (id?, entries?, e = engine) => {
  const input = copy(caseOf(id).input);
  if (entries !== undefined) input.entries = entries;
  return e.computeMonth(input).m;
};
const add = (amount?, extra: any = {}) => ({ id: 1, direction: 'add', amount, label: 'Khoản cộng thử', ...extra });
const deduct = (amount?, extra: any = {}) => ({ id: 2, direction: 'deduct', amount, label: 'Khoản trừ thử', ...extra });
const figures = (m?) => ({
  total: m.total,
  insurance: m.net.insurance,
  tax: m.net.tax,
  net: m.net.net,
  exempt: m.net.exempt
});

const SHORT = 'known-short-nv2-full-month'; // hợp đồng ngắn, không tạm ứng
const LONG = 'known-kpi-five-100-90-80-85-100'; // hợp đồng dài, có bảo hiểm 630.000 ₫

test('1c: sums gom khoản cộng, khoản trừ, khoản miễn thuế đã xác nhận và nền bảo hiểm', () => {
  const sums = PayEntriesCalc.sums(
    [
      add(500000),
      add(300000, { taxMode: 'full', flagsConfirmedBy: 'ketoan' }),
      add(900000, { taxMode: 'cap', taxCap: 400000, flagsConfirmedBy: 'ketoan', insuranceBase: 200000 }),
      add(100000, { taxMode: 'full' }), // chưa xác nhận: chịu thuế
      deduct(250000)
    ],
    { insuranceFlagged: true }
  );
  assert.deepEqual(sums, { add: 1800000, deduct: 250000, exempt: 700000, insuranceBase: 200000 });
  // không bật nền có cờ: nền bảo hiểm không đổi
  assert.equal(
    PayEntriesCalc.sums([add(500000, { insuranceBase: 500000, flagsConfirmedBy: 'ketoan' })]).insuranceBase,
    0
  );
});

test('1c: sums từ chối dữ liệu sai dạng (chuỗi số, số thập phân, số 0, hướng lạ, cờ lạ)', () => {
  for (const entry of [
    add('500000'),
    add(500000.5),
    add(0),
    add(-1),
    add(Infinity),
    { id: 3, direction: 'bonus', amount: 1000, label: 'x' },
    add(1000, { taxMode: 'half' })
  ])
    assert.throws(() => PayEntriesCalc.sums([entry]), { code: 'PAYROLL_BAD_ENTRY' }, JSON.stringify(entry));
});

test('1c: ca known-short-nv2-full-month cộng 500.000 ₫ chịu thuế: tổng thu nhập 9.450.000 → 9.950.000, bảo hiểm 682.500 giữ nguyên, thuế 945.000 → 995.000, thực lĩnh 7.822.500 → 8.272.500', async () => {
  const before = figures(await compute(SHORT));
  assert.deepEqual(before, { total: 9450000, insurance: 682500, tax: 945000, net: 7822500, exempt: 0 });
  const m = await compute(SHORT, [add(500000)]);
  assert.deepEqual(figures(m), { total: 9950000, insurance: 682500, tax: 995000, net: 8272500, exempt: 0 });
  assert.equal(m.net.entriesAdd, 500000);
  assert.equal(m.net.entriesDeduct, 0);
  assert.deepEqual(
    m.entries.map(e => [e.id, e.direction, e.amount]),
    [[1, 'add', 500000]]
  );
});

test('1c: ca known-short-nv2-full-month trừ 300.000 ₫: thực lĩnh 7.822.500 → 7.522.500, tổng thu nhập và thuế không đổi (trừ sau thuế)', async () => {
  const m = await compute(SHORT, [deduct(300000)]);
  assert.deepEqual(figures(m), { total: 9450000, insurance: 682500, tax: 945000, net: 7522500, exempt: 0 });
  assert.equal(m.net.entriesAdd, 0);
  assert.equal(m.net.entriesDeduct, 300000);
});

test('1c: khoản trừ mang cờ thuế hay nền bảo hiểm vẫn trừ sau thuế, không giảm thu nhập chịu thuế', async () => {
  const plain = figures(await compute(LONG, [deduct(300000)]));
  const flagged = figures(
    await compute(
      LONG,
      [deduct(300000, { taxMode: 'full', insuranceBase: 300000, flagsConfirmedBy: 'ketoan' })],
      flaggedEngine
    )
  );
  assert.deepEqual(flagged, plain);
});

test('1c: không có khoản nào (không có trường, mảng rỗng): m y hệt hôm nay, không có m.entries, m.net.entriesAdd, m.net.entriesDeduct', async () => {
  const base = await compute(SHORT);
  for (const entries of [undefined, []]) {
    const m = await compute(SHORT, entries);
    assert.deepEqual(m, base);
    assert.equal(JSON.stringify(m), JSON.stringify(base));
    assert.equal(Object.hasOwn(m, 'entries'), false);
    assert.equal(Object.hasOwn(m.net, 'entriesAdd'), false);
    assert.equal(Object.hasOwn(m.net, 'entriesDeduct'), false);
  }
  assert.equal((await compute(SHORT, [add(1000)])).net.entriesAdd, 1000);
});

test('1c: calcNet(staff, m) từ m có khoản dựng lại đúng thực lĩnh (đường số sửa phiếu đọc lại m)', () => {
  const input = copy(caseOf(SHORT).input);
  input.entries = [add(500000), deduct(300000)];
  const { m } = engine.computeMonth(input);
  assert.equal(m.net.net, 7972500); // 7.822.500 + 500.000 − 50.000 thuế − 300.000
  assert.deepEqual(engine.calcNet(input.staff, m), m.net);
});

test('1c: khoản sai dạng làm phiếu của người đó lỗi (PAYROLL_BAD_ENTRY), không tính ra số lạ', () => {
  const input = copy(caseOf(SHORT).input);
  input.entries = [add('500000')];
  assert.throws(() => engine.computeMonth(input), { code: 'PAYROLL_BAD_ENTRY' });
});
