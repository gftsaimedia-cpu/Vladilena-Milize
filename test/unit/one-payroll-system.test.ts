'use strict';
// Một hệ thống lương cho mọi tháng: ba chính sách mới nằm trong DEFAULTS, bộ máy luôn tính lương theo Check-in/out,
// tháng thay đổi không làm đổi cách tính; bản chụp tham số cũ thiếu ba khoá vẫn tính theo cách đoán cũ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { OLD_BASIS } = require('../helpers/defaults-old-basis.js');
const registry = require('../../src/params/registry');
const { attendDeclaredDays } = require('../helpers/payroll-cases');

const NV = { username: 'qa_one_nv', type: 'nv', level: 1, nightPct: 40, startDate: '2026-01-05' };
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
// Một ngày đi làm đúng ca của người chỉ có lịch ngày đó, chấm đủ
const oneDay = (month?, date?) =>
  attendDeclaredDays({
    staff: { ...NV },
    days: { [date]: WORK },
    approvals: {},
    kpi: null,
    holidays: [],
    month,
    upTo: null
  });
const compute = (params?, input?) => Engine.create(params).computeMonth(JSON.parse(JSON.stringify(input)));

test('ba chính sách nằm trong DEFAULTS và registry: phụ cấp ca theo ca được xếp, hợp đồng theo thâm niên, 3 tháng tròn là hợp đồng dài', () => {
  assert.equal(DEFAULTS['shift.allowance.basis'], 'assigned');
  assert.equal(DEFAULTS['tax.contract.basis'], 'tenure');
  assert.equal(DEFAULTS['tax.longTermMonths'], 3);
  for (const key of ['shift.allowance.basis', 'tax.contract.basis', 'tax.longTermMonths']) {
    const found = registry.entryFor(key);
    assert.ok(found && found.entry, `${key} có trong registry`);
  }
});

test('mỗi tháng cùng một cách tính: một ngày đi làm đúng ca trả đúng một ngày lương ở tháng 09, 10, 11 và 12', async () => {
  const dates = [
    ['2026-09', '2026-09-01'],
    ['2026-10', '2026-10-06'],
    ['2026-11', '2026-11-03'],
    ['2026-12', '2026-12-01']
  ];
  for (const [month, date] of dates) {
    const { m, actualReport } = await compute(DEFAULTS, oneDay(month, date));
    assert.equal(m.count, 1, month);
    assert.ok(Math.abs(m.work - 6000000 / 26) < 1, `${month}: ${m.work}`);
    assert.ok(actualReport && actualReport.report[date], `${month}: bộ máy luôn xét Check-in/out`);
  }
});

test('mọi tháng đều xét Check-in/out: ngày đã khai mà không có lượt bấm là vắng, kể cả tháng 09', async () => {
  for (const [month, date] of [
    ['2026-09', '2026-09-01'],
    ['2026-11', '2026-11-03']
  ]) {
    const input = oneDay(month, date);
    input.sessions = [];
    const { m } = await compute(DEFAULTS, input);
    assert.equal(m.count, 0, `${month}: không bấm thì không có ngày công`);
    assert.equal(m.work, 0, month);
  }
});

test('bản chụp tham số cũ thiếu ba khoá vẫn tính được và ra đúng như cách đoán cũ (ca theo giờ có mặt, hợp đồng theo hồ sơ)', async () => {
  const old = { ...DEFAULTS };
  for (const key of Object.keys(OLD_BASIS)) delete old[key];
  delete old['tax.longTermMonths'];
  const input = oneDay('2026-10', '2026-10-06');
  const fromSnapshot = await compute(old, input);
  const asOldBasis = await compute({ ...DEFAULTS, ...OLD_BASIS }, input);
  assert.deepEqual(fromSnapshot.m, asOldBasis.m);
});

test('hợp đồng theo thâm niên với bộ tham số mặc định, mọi tháng như nhau: vào làm 01/08/2026 là hợp đồng ngắn ở tháng 10 và dài từ tháng 11', () => {
  const { PayrollPolicy } = require('../../src/domain/payroll/policy');
  assert.equal(PayrollPolicy.contractFor(DEFAULTS, '2026-08-01', '2026-10', 'long'), 'short');
  assert.equal(PayrollPolicy.contractFor(DEFAULTS, '2026-08-01', '2026-11', 'long'), 'long');
  assert.equal(PayrollPolicy.contractFor(DEFAULTS, '2026-08-01', '2026-09', 'long'), 'short');
});
