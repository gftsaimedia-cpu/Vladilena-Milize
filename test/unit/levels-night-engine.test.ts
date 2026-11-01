'use strict';
// Phụ cấp ca đêm cấu hình được cho TTS và CTV (type.<mã>.nightOptions hoặc level.<mã>.<bậc>.nightOptions): người không có nightPct lấy phần tử đầu của bảng;
// không đặt thì dùng mức chung shift.night.bonus 30 %. Bảng [30] cho cùng kết quả với không đặt bảng.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, DEFAULTS, LEGACY_DEFAULTS, caseOf, clone, closeTo } = require('../helpers/pay-oracle');
const { payrollEngineDifferential } = require('../helpers/payroll-differential');

const CASE = 's20261015-00004'; // TTS bậc 4, ca đêm 22:00–07:00 cả tháng, chưa có nightPct
const run = async (over?, edit?) => {
  const input = clone(caseOf(CASE).input);
  if (edit) await edit(input);
  return Engine.create({ ...LEGACY_DEFAULTS, ...over }).computeMonth(input).m;
};

test('đêm TTS: đặt type.tts.nightOptions = [35] thì phụ cấp đêm đổi đúng tỉ lệ 30 → 35 (35/30), các thành phần khác không đổi', async () => {
  const before = await run({});
  const after = await run({ 'type.tts.nightOptions': [35] });
  assert.ok(before.bonus > 0);
  assert.ok(closeTo(after.bonus / before.bonus, 35 / 30, 1e-9), `${after.bonus / before.bonus}`);
  assert.ok(
    closeTo(after.total - before.total, after.bonus - before.bonus, 1.5),
    'tổng thu nhập chỉ đổi đúng phần phụ cấp đêm'
  );
  assert.equal(after.basePay, before.basePay);
});

test('đêm TTS: người không có nightPct lấy phần tử đầu, người có nightPct trong bảng lấy mức của mình', async () => {
  const table = { 'type.tts.nightOptions': [35, 50] };
  assert.equal(
    (await run(table)).total,
    (await run({ 'type.tts.nightOptions': [35] })).total,
    'bỏ trống = phần tử đầu (35)'
  );
  const fifty = await run(table, input => (input.staff.nightPct = 50));
  assert.ok(closeTo(fifty.bonus / (await run({})).bonus, 50 / 30, 1e-9));
});

test('đêm TTS và CTV theo bậc: level.<mã>.<bậc>.nightOptions chỉ đổi đúng bậc đó, bậc khác giữ mức chung', async () => {
  const over = { 'level.tts.4.nightOptions': [45] };
  assert.ok(closeTo((await run(over)).bonus / (await run({})).bonus, 45 / 30, 1e-9));
  const other = await run(over, input => (input.staff.level = 3));
  assert.deepEqual(other, await run({}, input => (input.staff.level = 3)), 'bậc 3 không đổi một đồng');
  const ctvOnly = { 'type.ctv.nightOptions': [40] };
  const asCtv = (input?) => {
    input.staff.type = 'ctv';
    input.staff.level = 2;
  };
  assert.ok((await run(ctvOnly, asCtv)).bonus > (await run({}, asCtv)).bonus, 'CTV cũng nhận bảng của chức vụ');
});

test('đêm TTS và CTV: không đặt bảng cho kết quả y nguyên bảng [30] (mức chung shift.night.bonus) trên 600 ca, mặc định không đổi một đồng', () => {
  const unset = Engine.create(LEGACY_DEFAULTS);
  const explicit = Engine.create({ ...LEGACY_DEFAULTS, 'type.tts.nightOptions': [30], 'type.ctv.nightOptions': [30] });
  payrollEngineDifferential(input => explicit.computeMonth(input), {
    cases: Number(process.env.PAYROLL_DIFF_CASES) || 600,
    seed: 20261016,
    label: 'levels-night-explicit-default',
    reference: (input?) => unset.computeMonth(input)
  });
});
