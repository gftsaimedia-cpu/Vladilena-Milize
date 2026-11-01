'use strict';
// (src/engine/formula.ts → FormulaRef.validate, src/params/validate.ts → checkFormula): "tổng theo ngày" đi qua một công thức có tên
// mà chính công thức đó có "tổng theo ngày" phải bị từ chối LÚC LƯU, không để tới lúc tính mới ném lỗi cho từng nhân sự.
// Trình tự: (1) lưu `lương KPI = tổng theo ngày (tiền OT trong ngày)` (hợp lệ); (2) lưu `tạm ứng = … tổng theo ngày (tiền công cả ngày + lương KPI) …`
// phải bị 400 (FORMULA_DOMAIN_MIXED hoặc FORMULA_NESTED_SUMDAYS: hai mã đều diễn đạt "tổng theo ngày lồng nhau"),
// không ghi gì; và ước tính vẫn tính được cho mọi người. File riêng vì nếu lần lưu (2) lọt qua, công thức hỏng trong param_versions
// (bảng chỉ-thêm-dòng) làm hỏng test khác trong cùng tiến trình.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Formula = require('../../src/engine/formula');
const FormulaVocab = require('../../src/engine/formula-vocab');

const { F } = S;
const M = '2026-10';

before(async () => {
  await F.start();
  await S.seed(M);
});
after(F.stop);

function formulaChange(name?, text?) {
  const vocabulary = FormulaVocab;
  const res = Formula.parse(text, { vocabulary });
  assert.ok(res.ok, `${text} -> ${JSON.stringify(res.errors)}`);
  return [{ key: `formula.${name}`, value: { text, tree: Formula.serialize(res.tree) } }];
}
const KPI_SUM = 'lương KPI = tổng theo ngày (tiền OT trong ngày)';
const NESTED =
  'tạm ứng = nếu bật tạm ứng thì làm tròn đồng (tổng theo ngày (tiền công cả ngày + lương KPI)) ngược lại 0';

test('V1A-S6-5 (đối chứng): ngay cả công thức hợp lệ `lương KPI = tổng theo ngày (tiền OT trong ngày)` cũng bị 400 PARAM_LOCKED và không ghi gì', async () => {
  const rowsBefore = await S.rowCount();
  const res = await S.saveChanges(formulaChange('luongKpi', KPI_SUM), { month: M });
  assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 300));
  assert.ok(JSON.stringify(res.data).includes('PARAM_LOCKED'), JSON.stringify(res.data).slice(0, 300));
  assert.equal(await S.rowCount(), rowsBefore);
});

test('V1A-S6-5: lưu công thức đặt "tổng theo ngày" vào trong "tổng theo ngày" bị từ chối 400 PARAM_LOCKED, không ghi gì', async () => {
  const rowsBefore = await S.rowCount();
  const configBefore = await S.configRev();
  const res = await S.saveChanges(formulaChange('tamUng', NESTED), { month: M });
  assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 300));
  const text = JSON.stringify(res.data);
  assert.ok(text.includes('PARAM_LOCKED'), text.slice(0, 300));
  assert.equal(await S.rowCount(), rowsBefore, 'không dòng param_versions nào được thêm');
  assert.equal(await S.configRev(), configBefore);
});

test('V1A-S6-5: dù lần lưu trên có bị từ chối hay không, ước tính không có hàng lỗi (không "ném cho từng nhân sự")', async () => {
  const res = await F.call('GET', `/periods/${M}/estimates`);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.ok(res.data.rows.length > 0);
  assert.deepEqual(
    res.data.rows.filter(r => r.status === 'error').map(r => r.errorCode),
    []
  );
});
