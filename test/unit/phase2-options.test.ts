'use strict';
// Các khoá phương án đã nối vào bộ máy. Mặc định không đổi tiền (các cổng
// 5.000 ca, 300 ca vàng, prove-default-graph ở nơi khác); test này kiểm từng phương án đã nối khi bộ tham số đặt nó, bằng cách đổi tham số trong bộ nhớ.
// Phương án `available: false` ở registry: lưu qua API bị từ chối, nhưng bộ máy thực hiện đúng định nghĩa khi có bộ tham số đặt nó.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, closeTo, DEFAULTS } = require('../helpers/pay-oracle');
const ActualHours = require('../../src/engine/actual-hours');
const registry = require('../../src/params/registry');
const { approved } = require('../helpers/schedule-fixtures'); // hàng duyệt đã duyệt như máy chủ lưu
const { checkSheetLimits } = require('../../src/domain/overtime/hour-limits').HourLimits;
const warnings = require('../../src/platform/warnings');

const NV1 = 'known-kpi-five-100-90-80-85-100';
const day = (n?, over: any = {}) => ({
  [`2026-10-${String(n).padStart(2, '0')}`]: { kind: 'work', in: '08:00', out: '17:00', ...over }
});

/* ---------- ⑤ làm tròn phút bị trừ ---------- */
test('GĐ2 ⑤: attendance.cutRounding: mặc định nửa lên theo bậc (15→0, 16→30, 44→30, 45→60); ceilStep 16 đến 30 → 30, 31 → 60; exact trừ đúng số phút (quá mức miễn)', () => {
  const cut = (mode?) => ActualHours.create({ ...DEFAULTS, 'attendance.cutRounding': mode }).cutMin;
  assert.equal(DEFAULTS['attendance.cutRounding'], 'halfUpStep');
  for (const [m, expected] of [
    [15, 0],
    [16, 30],
    [44, 30],
    [45, 60]
  ])
    assert.equal(cut('halfUpStep')(m), expected, `halfUpStep ${m}`);
  for (const [m, expected] of [
    [15, 0],
    [16, 30],
    [30, 30],
    [31, 60],
    [60, 60],
    [61, 90]
  ])
    assert.equal(cut('ceilStep')(m), expected, `ceilStep ${m}`);
  for (const [m, expected] of [
    [15, 0],
    [16, 16],
    [20, 20],
    [47, 47]
  ])
    assert.equal(cut('exact')(m), expected, `exact ${m}`);
});

/* ---------- ② làm thêm ---------- */
// NV bậc 1, thiếu 4 giờ ngày 05/10 (08:00–13:00) và OT 1 giờ ngày 06/10 (17:00–18:00)
const shortThenOt = async (input?) => {
  input.days = { ...(await day(5, { out: '13:00' })), ...(await day(6, { extraKind: 'ot', extraOut: '18:00' })) };
  input.approvals = await approved(input.days, [], 'nv', ['2026-10-06']);
};
test('GĐ2 ②: ot.afterMakeup: mặc định block chặn OT khi còn nợ giờ bù; independent tính OT ngay, giờ thiếu vẫn bị trừ riêng', async () => {
  const blocked = (await runGolden(NV1, {}, shortThenOt)).m;
  assert.equal(blocked.otHours, 0);
  assert.ok(blocked.otHoldHours > 0, 'giờ OT đang chờ cân giờ bù');
  const free = (await runGolden(NV1, { 'ot.afterMakeup': 'independent' }, shortThenOt)).m;
  assert.equal(free.otHours, 1);
  assert.ok(free.otPay > 0);
  assert.equal(free.debt, blocked.debt, 'giờ thiếu vẫn còn nợ');
});
test('GĐ2 ②: giờ làm bù khi không còn giờ thiếu vẫn trả đủ (2 giờ × 6.000.000 ÷ 26 ÷ 8 = 57.692,31)', async () => {
  const surplus = async (input?) => {
    input.days = await day(5, { extraKind: 'makeup', extraOut: '19:00' });
    input.approvals = await approved(input.days, [], 'nv', ['2026-10-05']);
  };
  const base = (await runGolden(NV1, {}, surplus)).m;
  assert.equal(base.makeupCredit, 2);
  assert.equal(base.makeupHours, 2);
  assert.ok(closeTo(base.makeupPay, (2 * 6000000) / 26 / 8), `makeupPay ${base.makeupPay}`);
});

/* ---------- ③ chuyên cần giảm theo bậc: tổng thu nhập khớp các dòng ---------- */
test('GĐ2 ③: lossMode = tiers: tổng thu nhập bằng tổng các dòng (ngày công + đi lại + chuyên cần + KPI), không chỉ dòng chuyên cần đổi', async () => {
  const days: Record<string, any> = {};
  let n = 0;
  for (let d = 1; d <= 31 && n < 21; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;
    days[date] = n < 20 ? { kind: 'work', in: '08:00', out: '17:00' } : { kind: 'unpaid' };
    n++;
  }
  const edit = (input?) => {
    input.days = days;
  };
  const tiers = [
    { fromDays: 1, keepRatio: 0.75 },
    { fromDays: 2, keepRatio: 0.5 }
  ];
  const plain = (await runGolden(NV1, {}, edit)).m;
  const cut = (await runGolden(NV1, { 'attendance.lossMode': 'tiers', 'attendance.tiers': tiers }, edit)).m;
  assert.ok(closeTo(cut.attendance, plain.attendance * 0.75, 0.5));
  assert.ok(closeTo(cut.total, cut.work + cut.travel + cut.attendance + cut.kpiPay, 1e-6), 'tổng khớp các dòng');
  assert.ok(closeTo(plain.total - cut.total, plain.attendance * 0.25, 1), 'tổng giảm đúng phần chuyên cần mất');
});

/* ---------- ① giới hạn khai ---------- */
const params = (over?) => ({ ...DEFAULTS, ...over });
const isatDays = (n?) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`2026-10-${String(3 + 7 * i).padStart(2, '0')}`, { kind: 'isat' }])
  );
test('GĐ2 ①: isat.monthlyLimit: mặc định không giới hạn; đặt 1 thì khai thêm ngày iSAT thứ hai có cảnh báo SHEET_ISAT_LIMIT, ngày đã lưu vượt giới hạn không cảnh báo khi không tăng', async () => {
  const run = (limit?, clean?, prevDays?) =>
    warnings.run(async () => {
      await checkSheetLimits({
        params: params({ 'isat.monthlyLimit': limit }),
        month: '2026-10',
        clean,
        prevDays
      });
      return warnings.codes();
    });
  assert.equal(DEFAULTS['isat.monthlyLimit'], null);
  assert.deepEqual(await run(null, isatDays(3), {}), []);
  assert.deepEqual(await run(1, isatDays(1), {}), []);
  assert.deepEqual(await run(1, isatDays(2), isatDays(1)), ['SHEET_ISAT_LIMIT']);
  assert.deepEqual(await run(1, isatDays(2), isatDays(2)), []); // dữ liệu cũ đã vượt: không tăng thì không cảnh báo
});

/* ---------- registry: cờ wired và phương án còn available: false ---------- */
test('GĐ2: các khoá đã nối hết `wired: false`; phương án mới của chúng vẫn available: false (chủ dự án chưa chọn)', () => {
  for (const key of [
    'advance.basis',
    'advance.eligibleTypes.nv',
    'attendance.cutRounding',
    'ot.afterMakeup',
    'isat.monthlyLimit'
  ])
    assert.notEqual(registry.entryFor(key).entry.wired, false, key);
  for (const key of ['advance.basis', 'attendance.cutRounding', 'ot.afterMakeup'])
    for (const option of registry.entryFor(key).entry.options)
      assert.equal(option.available, !!option.isDefault, `${key}: ${option.value}`);
});
