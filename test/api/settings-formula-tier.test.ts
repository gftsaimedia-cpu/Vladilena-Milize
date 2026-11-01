'use strict';
// Không nhập công thức: mọi khoá formula.* là `locked`, nên lưu công thức (kể cả bảng bậc có cạnh là tham số)
// là 400 PARAM_LOCKED và không ghi gì, dù ngưỡng ở cùng lô hay đã lưu trước. Ngưỡng (tham số) vẫn lưu được.
// POST /api/settings/params/revert với khoá toString, constructor, __proto__ không bao giờ 500 (kiểm own-property trước khi đọc giá trị).
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Formula = require('../../src/engine/formula');
const FormulaVocab = require('../../src/engine/formula-vocab');

const { F } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

const vocabulary = FormulaVocab;
const TIER =
  'phụ cấp đi lại = bảng bậc theo giờ vượt ngưỡng: dưới ngưỡng giờ vượt KPI → 1000000 đồng; từ ngưỡng giờ vượt chuyên cần trở lên → 0 đồng';
function tierValue() {
  const parsed = Formula.parse(TIER, { vocabulary });
  assert.ok(parsed.ok, JSON.stringify(parsed.errors));
  return { text: Formula.describe(parsed.tree, vocabulary), tree: Formula.serialize(parsed.tree) };
}
const THRESHOLD = { key: 'attendance.overLimitHours', value: 30 };
const ACK = { acknowledge: ['PARAM_FLOOR_ACK_REQUIRED'] };
const codesOf = (res?) => [res.data.code, ...(res.data.errors || []).map(e => e.code)];

test('V1A-S6-4: lưu bảng bậc có cạnh là tham số vào formula.phuCapDiLai bị từ chối 400 PARAM_LOCKED và không ghi gì (khoá công thức đã khoá)', async () => {
  const M = monthOf();
  await S.seed(M);
  const rows = await S.rowCount();
  const config = await S.configRev();
  const res = await S.saveChanges([{ key: 'formula.phuCapDiLai', value: tierValue() }], { month: M });
  assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 400));
  assert.ok(codesOf(res).includes('PARAM_LOCKED'), JSON.stringify(res.data).slice(0, 400));
  assert.equal(await S.rowCount(), rows, 'không dòng nào được ghi');
  assert.equal(await S.configRev(), config);
});

test('V1A-S6-4: công thức cùng lô với ngưỡng đổi sang 30 vẫn là 400 PARAM_LOCKED và KHÔNG lưu cả ngưỡng (lô bị từ chối trọn vẹn)', async () => {
  const M = monthOf();
  await S.seed(M);
  const rows = await S.rowCount();
  const res = await S.saveChanges([THRESHOLD, { key: 'formula.phuCapDiLai', value: tierValue() }], {
    month: M,
    extra: ACK
  });
  assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 400));
  assert.ok(codesOf(res).includes('PARAM_LOCKED'), JSON.stringify(res.data).slice(0, 400));
  assert.equal(await S.rowCount(), rows, 'không dòng nào được ghi, kể cả ngưỡng');
});

test('V1A-S6-4: ngưỡng chuyên cần (tham số) vẫn lưu được 200; công thức lưu sau vẫn 400 PARAM_LOCKED', async () => {
  const M = monthOf();
  await S.seed(M);
  const first = await S.saveChanges([THRESHOLD], { month: M, extra: ACK });
  assert.equal(first.status, 200, JSON.stringify(first.data).slice(0, 400));
  const second = await S.saveChanges([{ key: 'formula.phuCapDiLai', value: tierValue() }], { month: M });
  assert.equal(second.status, 400, JSON.stringify(second.data).slice(0, 400));
  assert.ok(codesOf(second).includes('PARAM_LOCKED'), JSON.stringify(second.data).slice(0, 400));
});

test('Review #17: revert với khoá toString, constructor, __proto__ (toVersion 0 và 1) không bao giờ 500: 404 PARAM_UNKNOWN_KEY', async () => {
  const M = monthOf();
  await S.seed(M);
  const rev = await S.paramsRevOf(M);
  for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
    for (const toVersion of [0, 1]) {
      const res = await F.call('POST', '/settings/params/revert', {
        who: 'admin',
        body: { key, toVersion, effectiveMonth: M, reason: 'Thử hoàn tác khoá lạ', expectedRev: rev }
      });
      assert.notEqual(res.status, 500, `${key}/${toVersion}: ${JSON.stringify(res.data).slice(0, 200)}`);
      assert.equal(res.status, 404, `${key}/${toVersion}: ${JSON.stringify(res.data).slice(0, 200)}`);
      assert.equal(res.data.code, 'PARAM_UNKNOWN_KEY');
    }
});
