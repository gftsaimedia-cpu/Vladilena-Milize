'use strict';
// Trạng thái hợp đồng trên phiếu lấy từ staffTerms đã chụp của kỳ, tách khỏi trạng thái phiếu và loại · bậc.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDrawer } = require('../../web/src/builders/payslip/drawer');
const { buildSheet } = require('../../web/src/builders/payslip/sheet');

const sourceOf = contractStatus => ({
  period: { status: 'open' },
  data: {
    source: 'payslip',
    run: { runNo: 1 },
    engineVersion: 'test',
    paramsHash: 'abcdef0123456789',
    payslip: {
      name: 'Nguyễn An',
      type: 'nv',
      level: 2,
      status: 'draft',
      gross: 0,
      insurance: 0,
      tax: 0,
      advance: 0,
      net: 0,
      workdaysStd: 26,
      staffTerms: contractStatus === undefined ? { type: 'nv', level: 2 } : { type: 'nv', level: 2, contractStatus },
      snapshot: { rows: [], net: {} }
    }
  }
});

for (const [contractStatus, expected] of [
  ['probation', 'Thử việc'],
  ['official', 'Chính thức']
]) {
  test(`phiếu ghi trạng thái nhân sự ${expected} từ staffTerms đã chụp, không đổi trạng thái phiếu hoặc loại · bậc`, () => {
    const { period, data } = sourceOf(contractStatus);
    const drawer = buildDrawer('2026-10', 'an', period, data);
    const sheet = buildSheet(drawer, data);

    assert.equal(drawer.employeeStatus, expected);
    assert.equal(drawer.role, 'NV · Bậc 2');
    assert.equal(drawer.kind, 'draft');
    assert.equal(sheet.employeeStatus, expected);
    assert.equal(sheet.role, 'NV · Bậc 2');
    assert.equal(sheet.status, 'Bản nháp');
  });
}

test('phiếu lịch sử thiếu trạng thái hợp đồng không suy đoán từ hồ sơ hiện tại', () => {
  const { period, data } = sourceOf(undefined);
  const drawer = buildDrawer('2026-10', 'an', period, data);
  const sheet = buildSheet(drawer, data);

  assert.equal(drawer.employeeStatus, null);
  assert.equal(sheet.employeeStatus, null);
});

test('giá trị trạng thái hợp đồng không nhận biết không thành nhãn hiển thị', () => {
  const { period, data } = sourceOf('toString');
  const drawer = buildDrawer('2026-10', 'an', period, data);

  assert.equal(drawer.employeeStatus, null);
});
