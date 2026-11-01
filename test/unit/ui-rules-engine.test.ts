'use strict';
// Quy tắc lương kiểm thẳng ở bộ máy dùng chung src/engine/payroll-engine.ts với các số tính sẵn.
// Mọi số là NV L1 (lương cơ bản 6.000.000 ₫): lương ngày 230.769,23 ₫, lương giờ 28.846,15 ₫.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { legacyParams } = require('../helpers/legacy-params');

const engine = PayrollEngine.create(DEFAULTS);
const { calcDay, calcMonth } = engine;
const nv = { type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' };
const ctv = { type: 'ctv', level: 1, shiftCode: 'n1' };
const HOURLY = 6000000 / 26 / 8;
const DAILY = 6000000 / 26;
const month = (staff?, days?, holidays: any[] = [], mk = '2026-10', kpi: any = null, upTo: any = null) =>
  calcMonth(staff, days, kpi, holidays, mk, upTo);
const work = (tin?, tout?, extra: any = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });
const near = (actual?, expected?, label = '') =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${label} ${actual} != ${expected}`);

/* ================= tiền một ngày (xem trước ngày) ================= */
test('Ca chính 20:00–05:00 (chín tiếng): một giờ nghỉ trong khung 22h–6h được trả, ngày này 360.577 ₫ (6 triệu/26 × 1,4 + một giờ nghỉ đêm × 1,3)', () => {
  const day = calcDay(nv, work('20:00', '05:00'), false, 0, { date: '2026-10-06', holidays: [] });
  assert.equal(day.breakH, 1);
  assert.equal(Math.round(day.total), 360577);
  near(day.total, DAILY * 1.4 + HOURLY * 1.3, 'tính tay');
});

test('Ca đêm 22:00–07:00 qua ngày lễ 07/10: 7 giờ làm ngày lễ không trừ nghỉ (6 giờ đêm), tiền ×3 cộng phần đêm 709.615 ₫; 2 giờ thường trước 0 giờ 57.692 ₫', async () => {
  const m = await month(nv, { '2026-10-06': work('22:00', '07:00') }, ['2026-10-07']);
  const row = m.rows.find(r => r.date === '2026-10-06');
  assert.equal(row.holWorkH, 7);
  assert.equal(row.holNightH, 6);
  assert.equal(row.normalWorkH, 2);
  assert.equal(Math.round(row.holWorkPay), 709615); // (7 giờ × 3 + 6 giờ đêm × 0,6) × lương giờ
  near(row.holWorkPay, (7 * 3 + 6 * 0.6) * HOURLY, 'tính tay');
  assert.equal(Math.round(row.normalWorkH * HOURLY), 57692);
  assert.equal(m.holWorkHours, 7);
  assert.equal(Math.round(m.holWorkPay), 709615);
});

/* ================= OT bị giữ khi còn giờ thiếu chưa bù ================= */
test('Hợp đồng và bảo hiểm mặc định theo nhóm khi hồ sơ chưa ghi: TTS hợp đồng ngắn không đóng bảo hiểm; CTV và NV hợp đồng dài đóng bảo hiểm; thuế, giảm trừ, tạm ứng mặc định bật', async () => {
  const day = { '2026-09-07': work('08:00', '17:00') };
  const expected = { tts: ['short', false], ctv: ['long', true], nv: ['long', true] };
  for (const [type, [contract, insured]] of Object.entries<any>(expected)) {
    const net = (await month({ type, level: 1, nightPct: 40 }, day, [], '2026-09')).net;
    assert.equal(net.contract, contract, type);
    assert.equal(net.insured, insured, type);
    assert.deepEqual([net.taxOn, net.deductOn, net.advanceOn], [true, true, true], type);
  }
  // hồ sơ ghi riêng thì thắng mặc định của nhóm (Admin tuỳ chỉnh được giữ)
  const custom = (
    await month({ type: 'nv', level: 1, nightPct: 40, contract: 'short', insured: false }, day, [], '2026-09')
  ).net;
  assert.equal(custom.contract, 'short');
  assert.equal(custom.insured, false);
});

/* ================= OT 2.0 / 3.0 và làm bù ngày lễ ================= */
const T13_DAYS = { '2026-10-07': work('22:00', '07:00', { extraKind: 'ot', extraOut: '11:00', preset: 'g2' }) };
const T13_HOL = ['2026-10-08'];

test('T1-3: ca g2 + OT 07:00–11:00 vào ngày lễ 08/10: OT 2.0 = 0 giờ, OT 3.0 = 11 giờ (7 giờ ca chính + 4 giờ OT lễ), tiền OT gộp 1.055.769 ₫', async () => {
  const m = await month(nv, T13_DAYS, T13_HOL);
  assert.equal(m.otHours, 0, 'OT 2.0: OT rơi vào ngày lễ không phải OT ngày thường');
  assert.equal(m.holWorkHours, 11, 'OT 3.0 = 7 giờ ca chính + 4 giờ OT trong ngày lễ');
  assert.equal(m.otPay, 0);
  assert.equal(Math.round(m.holWorkPay), 1055769); // (11 giờ × 3 + 6 giờ đêm × 0,6) × lương giờ
});

test('T1-3: cùng lịch nhưng 08/10 không phải ngày lễ: OT 2.0 = 4 giờ, OT 3.0 = 0', async () => {
  const m = await month(nv, T13_DAYS, []);
  assert.equal(m.otHours - (m.otHolHours || 0), 4);
  assert.equal((m.holWorkHours || 0) + (m.otHolHours || 0), 0);
});

/* ================= thực lĩnh: bảo hiểm, thuế, tạm ứng ================= */
const DAYS_SEP = { '2026-09-07': work('08:00', '17:00'), '2026-09-08': work('22:00', '07:00') };
const insuredNv = { ...nv, contract: 'long', insured: true, dependants: 1 };
// Hai test bảo hiểm dưới chỉ khai vài ngày trong tháng: ít hơn 13 ngày có lương thì quy tắc 14 ngày không đóng làm bảo hiểm về 0.
// Ở đây kiểm tỷ lệ và thuế nên đặt ngưỡng không đóng rất lớn; quy tắc ngày có lương có test riêng ở test/unit/insurance-paid-days.test.ts.
const noBlankEngine = PayrollEngine.create(legacyParams());
const monthNoBlank = (staff?, days?, holidays?, mk?) => noBlankEngine.calcMonth(staff, days, null, holidays, mk, null);

test('Thực lĩnh NV hợp đồng dài đóng bảo hiểm: BHXH 8 %, BHYT 1,5 %, BHTN 1 % của 6.000.000 = 630.000 ₫; công ty đóng thêm 21,5 % = 1.290.000 ₫; khoản miễn thuế là phần đêm', () => {
  const m = monthNoBlank(insuredNv, DAYS_SEP, [], '2026-09');
  const n = m.net;
  assert.equal(n.bhxh, 6000000 * DEFAULTS['tax.insurance.employee.bhxh']);
  assert.equal(n.bhyt, 6000000 * DEFAULTS['tax.insurance.employee.bhyt']);
  assert.equal(n.bhtn, 6000000 * DEFAULTS['tax.insurance.employee.bhtn']);
  assert.equal(n.insurance, 630000);
  assert.equal(n.employer, 1290000);
  assert.equal(n.gross, Math.round(m.total));
  assert.equal(n.nightHours, 7);
  assert.equal(n.exempt, n.exemptNight + n.exemptOt);
  assert.equal(n.taxable, n.gross - n.exempt);
  assert.equal(n.dependants, 1);
  assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance);
  // tạm ứng chỉ có số khi Admin duyệt; chưa duyệt thì 0 (xem test/unit/advance-approved-month.test.ts)
  assert.equal(n.advanceDays, 2);
  assert.equal(n.advance, 0);
});

test('Thực lĩnh: TTS hợp đồng ngắn không đóng bảo hiểm (0); tắt giảm trừ gia cảnh và tạm ứng thì hai khoản này về 0, thuế TNCN của hợp đồng dài vẫn tính', () => {
  const intern = monthNoBlank({ type: 'tts', level: 1 }, DAYS_SEP, [], '2026-09').net;
  assert.equal(intern.contract, 'short');
  assert.equal(intern.insured, false);
  assert.equal(intern.insurance, 0);
  assert.equal(intern.deduction, 0, 'HĐ dưới 3 tháng: không giảm trừ gia cảnh');
  const off = monthNoBlank(
    { ...insuredNv, taxOn: false, deductOn: false, advanceOn: false },
    DAYS_SEP,
    [],
    '2026-09'
  ).net;
  assert.equal(off.deduction, 0);
  assert.equal(off.advance, 0);
  assert.equal(off.taxOn, true, 'HĐLĐ từ 3 tháng: thuế TNCN không tắt được');
  assert.equal(off.insurance, 630000);
  const offIntern = monthNoBlank({ type: 'tts', level: 1, taxOn: false }, DAYS_SEP, [], '2026-09').net;
  assert.equal(offIntern.taxOn, false);
  assert.equal(offIntern.tax, 0);
});

test('Thu nhập cả tháng khác thu nhập đến hôm nay: calcMonth có upTo cho tổng nhỏ hơn bản cả tháng, và thực lĩnh cả tháng tính trên thu nhập cả tháng', async () => {
  const days = { '2026-10-05': work('08:00', '17:00'), '2026-10-20': work('08:00', '17:00') };
  const full = await month(insuredNv, days);
  const toDate = calcMonth(insuredNv, days, null, [], '2026-10', '2026-10-07');
  assert.ok(full.total > toDate.total, `${full.total} > ${toDate.total}`);
  assert.equal(full.net.gross, Math.round(full.total));
  assert.equal(full.net.net, full.net.gross - full.net.insurance - full.net.tax - full.net.advance);
});

/* ================= nhãn HDO ================= */
test('HDO: NV level 4 hiển thị là HDO (Human Development Officer), lương cơ bản và KPI vẫn 7.500.000 ₫', () => {
  assert.equal(DEFAULTS['level.nv.4.name'], 'HDO (Human Development Officer)');
  assert.equal(DEFAULTS['level.nv.4.base'], 7500000);
  assert.equal(DEFAULTS['level.nv.4.kpi'], 7500000);
});
