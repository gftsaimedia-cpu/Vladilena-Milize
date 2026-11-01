'use strict';
// pay-method-options, attendance-loss-tiers, entitlement-override.
// 5 khoá nối vào bộ máy: pay.method (B, C, D), attendance.lossMode + attendance.tiers, attendance.overLimitTolerance,
// attendance.shortHoursRounding; và ghi đè theo chức vụ type.<mã>.overLimitHours, type.<mã>.advanceRate, type.<mã>.ot.rate (null = kế thừa).
// Phương án mặc định (A, all, 0, none) KHÔNG đổi tiền (các ca mặc định bên dưới giữ chuẩn).
// Test kiểm bộ máy trực tiếp bằng cách đổi tham số trong bộ nhớ; cờ `available` của phương án ở registry không thuộc test này.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, closeTo, DEFAULTS } = require('../helpers/pay-oracle');
const registry = require('../../src/params/registry');

const NV1 = 'known-kpi-five-100-90-80-85-100';
const T65_BELOW = 'known-t65-over-limit-23.75h';
const T65_ABOVE = 'known-t65-over-limit-24.25h';
const NV3 = 's20261015-00018';

// Ngày làm việc thứ Hai–Bảy của tháng 10/2026 (27 ngày), mỗi ngày 08:00–17:00; `kinds` ghi đè loại ngày theo thứ tự
const monthDays = (count?, unpaid = 0) => {
  const days: Record<string, any> = {};
  let n = 0;
  for (let d = 1; d <= 31 && n < count + unpaid; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (dow === 0) continue;
    days[date] = n < count ? { kind: 'work', in: '08:00', out: '17:00' } : { kind: 'unpaid' };
    n++;
  }
  return days;
};
const withDays = (days?) => input => {
  input.days = days;
};
const basePay = async (over?, days?) => (await runGolden(NV1, over, withDays(days))).m.basePay;
const DAILY = 6000000 / 26;

test('pay-method-options: pay.method hết `wired: false` (đã nối vào bộ máy); phương án nào available do chủ dự án chốt (Q11)', () => {
  const entry = registry.entryFor('pay.method').entry;
  assert.notEqual(entry.wired, false, 'pay.method vẫn wired: false');
  assert.ok(
    entry.options.some(o => o.value === 'A' && o.available && o.isDefault),
    'A (mặc định, không trần) luôn sẵn sàng'
  );
});
test('pay-method-options: A (mặc định) không trần: 27 ngày đi làm của NV bậc 1 trả 27 × 6.000.000 ÷ 26 = 6.230.769,23, bằng lương mỗi ngày nhân số ngày (hành vi hôm nay giữ nguyên)', async () => {
  assert.equal(DEFAULTS['pay.method'], 'A');
  assert.ok(closeTo(await basePay({}, monthDays(27)), 27 * DAILY, 1e-6));
  assert.ok(closeTo(await basePay({ 'pay.method': 'A' }, monthDays(27)), 6230769.23));
});

test('pay-method-options: B (trần 100 %): 27 ngày đi làm bị chặn ở lương tháng 6.000.000; 20 ngày vẫn 20 × 230.769,23 = 4.615.384,62', async () => {
  assert.ok(closeTo(await basePay({ 'pay.method': 'B' }, monthDays(27)), 6000000));
  assert.ok(closeTo(await basePay({ 'pay.method': 'B' }, monthDays(20)), 4615384.62));
});

test('pay-method-options: C (mẫu số = số ngày làm việc thực của tháng): 27 ngày thứ Hai–Bảy của 10/2026 → mỗi ngày 6.000.000 ÷ 27 = 222.222,22; 20 ngày trả 4.444.444,44; 27 ngày trả đúng 6.000.000', async () => {
  assert.ok(closeTo(await basePay({ 'pay.method': 'C' }, monthDays(1)), 222222.22));
  assert.ok(closeTo(await basePay({ 'pay.method': 'C' }, monthDays(20)), 4444444.44));
  assert.ok(closeTo(await basePay({ 'pay.method': 'C' }, monthDays(27)), 6000000));
});

test('pay-method-options: D (lương tháng trừ ngày không lương): 25 ngày đi làm + 2 ngày nghỉ không lương trả 6.000.000 − 2 × 230.769,23 = 5.538.461,54 (cách đọc: mỗi ngày không lương trừ theo lương ngày 6.000.000 ÷ 26)', async () => {
  assert.ok(closeTo(await basePay({ 'pay.method': 'D' }, monthDays(25, 2)), 6000000 - 2 * DAILY));
  // khác A: A trả 25 × 230.769,23 = 5.769.230,77 (không tính ngày không lương)
  assert.ok(closeTo(await basePay({}, monthDays(25, 2)), 25 * DAILY, 1e-6));
});

/* ---------- attendance-loss-tiers ---------- */
const attendanceOf = async (over?, days?) => (await runGolden(NV1, over, withDays(days))).m;
const TIERS = [
  { fromDays: 1, keepRatio: 0.75 },
  { fromDays: 2, keepRatio: 0.5 }
];

test('attendance-loss-tiers: bốn khoá chuyên cần (lossMode, tiers, overLimitTolerance, shortHoursRounding) hết `wired: false`', () => {
  for (const key of [
    'attendance.lossMode',
    'attendance.tiers',
    'attendance.overLimitTolerance',
    'attendance.shortHoursRounding'
  ])
    assert.notEqual(registry.entryFor(key).entry.wired, false, key);
});

test('attendance-loss-tiers: mặc định (all) 20 ngày đi làm + 1 hoặc 2 ngày nghỉ không lương giữ NGUYÊN phụ cấp chuyên cần 20 × 57.692,31 = 1.153.846,15 (mất chỉ khi nghỉ đủ ngưỡng): hành vi hôm nay', async () => {
  for (const unpaid of [0, 1, 2])
    assert.ok(
      closeTo((await attendanceOf({}, monthDays(20, unpaid))).attendance, (20 * (6000000 * 0.25)) / 26, 0.5),
      `${unpaid} ngày nghỉ`
    );
});

test('attendance-loss-tiers: lossMode = tiers với bảng (nghỉ từ 1 ngày giữ 75 %, từ 2 ngày giữ 50 %): 0 ngày nghỉ giữ 100 %, 1 ngày giữ 75 % = 865.384,62, 2 ngày giữ 50 % = 576.923,08; từ ngưỡng maxAbsent (3 ngày) vẫn mất toàn bộ', async () => {
  const over = { 'attendance.lossMode': 'tiers', 'attendance.tiers': TIERS };
  const full = (20 * (6000000 * 0.25)) / 26;
  assert.ok(closeTo((await attendanceOf(over, monthDays(20, 0))).attendance, full, 0.5));
  assert.ok(closeTo((await attendanceOf(over, monthDays(20, 1))).attendance, 865384.62, 0.5));
  assert.ok(closeTo((await attendanceOf(over, monthDays(20, 2))).attendance, 576923.08, 0.5));
  assert.equal((await attendanceOf(over, monthDays(20, 3))).attendance, 0, 'đủ ngưỡng nghỉ 3 ngày là mất toàn bộ');
});

test('attendance-loss-tiers: giảm theo bậc KHÔNG cứu được vượt ngưỡng giờ: ca 24,25 giờ vẫn mất chuyên cần (0) dù lossMode = tiers', async () => {
  const over = { 'attendance.lossMode': 'tiers', 'attendance.tiers': TIERS };
  assert.equal((await runGolden(T65_ABOVE, over)).m.attendance, 0);
});

test('attendance-loss-tiers: overLimitTolerance 0,5 giờ nâng ngưỡng 24 → 24,5: ca 24,25 giờ giữ chuyên cần 115.384,62 (mặc định mất, ca 23,75 giờ vẫn giữ)', async () => {
  assert.equal((await runGolden(T65_ABOVE)).m.attendance, 0, 'mặc định (biên 0): mất');
  assert.ok(
    closeTo((await runGolden(T65_ABOVE, { 'attendance.overLimitTolerance': 0.5 })).m.attendance, 115384.62, 0.5)
  );
  assert.ok(
    closeTo((await runGolden(T65_BELOW, { 'attendance.overLimitTolerance': 0.5 })).m.attendance, 115384.62, 0.5)
  );
  // 24,5 giờ đúng ngưỡng mới là mất (so sánh ≥ như attendance.overLimitCompare): ngưỡng hiệu lực = overLimitHours + biên độ
  assert.equal(24 + 0.5, 24.5);
});

test('attendance-loss-tiers: shortHoursRounding làm tròn XUỐNG giờ thiếu: ca 24,25 giờ → 24 (xuống 0,5 và xuống 1 giờ), ca 23,75 giờ → 23,5 và 23; không làm tròn giữ 24,25 và 23,75', async () => {
  const hours = async (id?, mode?) => (await runGolden(id, { 'attendance.shortHoursRounding': mode })).m.overHours;
  assert.equal(await hours(T65_ABOVE, 'none'), 24.25);
  assert.equal(await hours(T65_BELOW, 'none'), 23.75);
  assert.equal(await hours(T65_ABOVE, 'halfHour'), 24);
  assert.equal(await hours(T65_ABOVE, 'hour'), 24);
  assert.equal(await hours(T65_BELOW, 'halfHour'), 23.5);
  assert.equal(await hours(T65_BELOW, 'hour'), 23);
});

/* ---------- entitlement-override ---------- */
const asType = (type?) => input => {
  input.staff.type = type;
};
const OT_CASE = NV3; // NV bậc 3, 2,5 giờ OT, tạm ứng 80 %
// ctv bậc 3 cùng đầu vào: so với chính nó khi không ghi đè (ghi đè của nv không được rò sang ctv)
test('entitlement-override: type.nv.ot.rate = 2,5 chỉ đổi OT của NV (210.336,54), CTV cùng đầu vào giữ hệ số toàn cục 2 (kế thừa)', async () => {
  const over = { 'type.nv.ot.rate': 2.5 };
  assert.ok(closeTo((await runGolden(OT_CASE, over)).m.otPay, 210336.54));
  const ctvDefault = (await runGolden(OT_CASE, {}, asType('ctv'))).m;
  const ctvOver = (await runGolden(OT_CASE, over, asType('ctv'))).m;
  assert.equal(ctvOver.otPay, ctvDefault.otPay);
  assert.equal(ctvOver.net.net, ctvDefault.net.net);
});

test('entitlement-override: type.nv.advanceRate = 0,5 chỉ đổi tạm ứng của NV (1.938.462 → 1.211.538, thực lĩnh 1.735.193); CTV giữ 80 % toàn cục; null là kế thừa', async () => {
  // Tạm ứng chỉ trừ vào lương khi Admin đã duyệt yêu cầu của tháng (input.advanceApproved, spec/payroll-engine.md mục tạm ứng)
  const approved =
    (...edits) =>
    async input => {
      input.advanceApproved = true;
      for (const edit of edits) await edit(input);
    };
  const over = { 'type.nv.advanceRate': 0.5 };
  const nvDefault = (await runGolden(OT_CASE, {}, await approved())).m;
  assert.equal(nvDefault.net.advance, 1938462);
  const nv = (await runGolden(OT_CASE, over, await approved())).m;
  assert.equal(nv.net.advance, 1211538);
  // Phần đuôi luật không đổi nên thực lĩnh chỉ lệch đúng phần tạm ứng giảm
  assert.equal(nv.net.net, nvDefault.net.net + nvDefault.net.advance - nv.net.advance);
  const ctvDefault = (await runGolden(OT_CASE, {}, await approved(asType('ctv')))).m;
  assert.equal((await runGolden(OT_CASE, over, await approved(asType('ctv')))).m.net.advance, ctvDefault.net.advance);
  assert.equal(
    (await runGolden(OT_CASE, { 'type.nv.advanceRate': null }, await approved())).m.net.advance,
    1938462,
    'null = kế thừa toàn cục'
  );
});

test('entitlement-override: type.nv.overLimitHours = 30 nâng ngưỡng mất chuyên cần riêng NV: ca 24,25 giờ giữ 115.384,62; cùng ca với CTV (ngưỡng toàn cục 24) vẫn 0', async () => {
  const over = { 'type.nv.overLimitHours': 30 };
  assert.ok(closeTo((await runGolden(T65_ABOVE, over)).m.attendance, 115384.62, 0.5));
  assert.equal((await runGolden(T65_ABOVE, over, asType('ctv'))).m.attendance, 0);
});
