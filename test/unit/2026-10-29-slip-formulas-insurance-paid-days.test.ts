'use strict';
// Dòng bảo hiểm ở "Chi tiết" phiếu Admin theo số ngày có lương: số ngày không lương = ngày công chuẩn − ngày có lương;
// từ 14 ngày trở lên thì không đóng và công thức ghi phép trừ so với ngưỡng, dưới 14 ngày thì công thức là nền × 10,5%.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const { plainAll } = require('../helpers/formula-eval');
const F = require('../helpers/schedule-fixtures');

const MONTH = '2026-10';
// phiếu của NV chỉ có N ngày đi làm đầu tháng (T2–T7), các ngày còn lại không có ngày công
function slipOfPaidDays(count?) {
  const staff = F.nvStaff();
  const all = F.fullDays(MONTH, F.MON_SAT);
  const days: Record<string, any> = {};
  Object.keys(all)
    .sort()
    .slice(0, count)
    .forEach(date => {
      days[date] = all[date];
    });
  const snapshot = JSON.parse(JSON.stringify(F.run(staff, days, {}).m));
  const cells = cellsOf(snapshot);
  const f = plainAll(formulasOf({ snapshot, staffTerms: staff, params: DEFAULTS, month: MONTH, cells }));
  return { n: snapshot.net, f };
}

test('1 ngày có lương: 26 − 1 = 25 ngày ≥ 14 thì không đóng bảo hiểm', () => {
  const s = slipOfPaidDays(1);
  assert.equal(s.n.noPayDays, 25);
  assert.equal(s.n.insurance, 0);
  assert.equal(s.f.insurance, '26 ngày chuẩn − 1 ngày có lương = 25 ngày không lương ≥ 14 ngày');
});

test('12 ngày có lương: 26 − 12 = 14 ngày ≥ 14 vẫn không đóng', () => {
  const s = slipOfPaidDays(12);
  assert.equal(s.n.noPayDays, 14);
  assert.equal(s.n.insurance, 0);
  assert.equal(s.f.insurance, '26 ngày chuẩn − 12 ngày có lương = 14 ngày không lương ≥ 14 ngày');
});

test('13 ngày có lương: 26 − 13 = 13 ngày < 14 thì đóng, công thức là nền × tỷ lệ', () => {
  const s = slipOfPaidDays(13);
  assert.equal(s.n.noPayDays, 13);
  assert.equal(s.n.insurance, 630000);
  assert.equal(s.f.insurance, '6.000.000 đ lương đóng bảo hiểm × 10,5%');
});

test('công thức bảo hiểm không còn nhắc trường đã bỏ', () => {
  for (const count of [1, 12, 13]) {
    const text = JSON.stringify(slipOfPaidDays(count).f);
    assert.doesNotMatch(text, /blankDays|skipDays|preStartDays|nghỉ không lương/);
  }
});
