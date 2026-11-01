'use strict';
// Lưu công thức tạo VÒNG qua cây mặc định phải bị từ chối ngay lúc lưu (src/params/validate.ts → checkFormula).
// Ví dụ `lương KPI = tổng thu nhập × 10%` (tổng thu nhập mặc định cộng lương KPI): nếu lưu được thì lúc tính kernelFor ném PAYROLL_BAD_FORMULA
// và ước tính, tính lương của cả tháng trả 500.
// Mong đợi: PUT /api/settings/params trả 400 với mã FORMULA_CYCLE, không lưu gì; và dù thế nào GET estimates, chốt công, tính lương không bao giờ 500.
// File riêng vì công thức hỏng lọt vào param_versions (bảng chỉ-thêm-dòng) sẽ làm hỏng test khác trong cùng tiến trình.
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

// Giá trị của khoá formula.<tên> như giao diện gửi: { text, tree }
function formulaChanges(name?, text?) {
  const vocabulary = FormulaVocab;
  const res = Formula.parse(text, { vocabulary });
  assert.ok(res.ok, `${text} -> ${JSON.stringify(res.errors)}`);
  // số gõ trong chữ nằm trong cây (nút param có value), không gửi thành khoá riêng
  return [{ key: `formula.${name}`, value: { text, tree: Formula.serialize(res.tree) } }];
}
const CYCLE = 'lương KPI = tổng thu nhập × 10%';

test('V1A-S6-1: lưu "lương KPI = tổng thu nhập × 10%" bị từ chối 400 PARAM_LOCKED (khoá công thức đã khoá) và không ghi gì', async () => {
  const rowsBefore = await S.rowCount();
  const configBefore = await S.configRev();
  const res = await S.saveChanges(formulaChanges('luongKpi', CYCLE), { month: M });
  assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 300));
  assert.ok(JSON.stringify(res.data).includes('PARAM_LOCKED'), JSON.stringify(res.data).slice(0, 300));
  assert.equal(await S.rowCount(), rowsBefore, 'không dòng param_versions nào được thêm');
  assert.equal(await S.configRev(), configBefore, 'config_rev không đổi');
});

test('V1A-S6-1: dù lần lưu trên có bị từ chối hay không, ước tính của Admin (GET estimates) không có hàng lỗi và không 5xx', async () => {
  const res = await F.call('GET', `/periods/${M}/estimates`);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.ok(res.data.rows.length > 0);
  assert.deepEqual(
    res.data.rows.filter(r => r.status === 'error').map(r => r.errorCode),
    [],
    'không phiếu ước tính nào được lỗi vì công thức đã lưu'
  );
});

test('V1A-S6-1: dù lần lưu có bị từ chối hay không, chốt công rồi tính lương cho đủ phiếu không lỗi và không 5xx', async () => {
  S.must(await S.step(M, 'lock-attendance'), 'chốt công');
  S.must(await S.step(M, 'calculate'), 'tính lương');
  const slips = await S.slipRows(M);
  assert.ok(slips.length > 0);
  assert.deepEqual(
    slips.filter(r => r.status === 'error').map(r => r.errorCode),
    []
  );
});
