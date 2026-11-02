'use strict';
// Miễn thuế giờ làm đêm và OT chỉ tính phần trả cao hơn lương giờ thường của cùng số giờ.
//   - Giờ đêm ngoài ngày lễ: miễn lương giờ × tax.exempt.nightPremium × giờ, mỗi ngày không quá phụ cấp ca đã trả của ngày đó;
//   - OT ngày thường, OT cuối tuần ngoài lịch, OT / làm lễ: mỗi nhóm miễn max(0, min(tiền trả, mức luật của nhóm) − lương giờ × giờ của nhóm);
//   - tổng thu nhập, ngày công, bảo hiểm không đổi; chỉ miễn thuế, thu nhập chịu thuế và thuế đổi.
// Mọi số là NV L1 (lương cơ bản 6.000.000 ₫): lương ngày 230.769,23 ₫, lương giờ 28.846,15 ₫.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');

const k = Engine.create(DEFAULTS);
const nv = { type: 'nv', level: 1, nightPct: 40 };
const HOURLY = 6000000 / 26 / 8;
const work = (tin?, tout?, extra: any = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });
const month = (days?, holidays: any[] = [], staff = nv, kernel = k) =>
  kernel.calcMonth(staff, days, null, holidays, '2026-10', null);

test('7 giờ làm đêm của ca 22:00–07:00: miễn phụ trội 30% = 60.577 ₫ (trước đây cả 130% = 262.500 ₫)', async () => {
  const m = await month({ '2026-10-06': work('22:00', '07:00') });
  assert.equal(m.nightHours, 7);
  assert.equal(m.net.exemptNight, 60577);
  assert.equal(m.net.exemptNight, Math.round(7 * HOURLY * DEFAULTS['tax.exempt.nightPremium']));
  assert.equal(m.net.exemptOt, 0);
  assert.equal(m.net.exempt, 60577);
  assert.equal(m.net.taxable, m.net.gross - 60577);
});

test('OT ngày thường 4 giờ ×1,5 (trả 173.077 ₫): miễn 0,5 lương giờ × 4 = 57.692 ₫, phần 1 lương giờ chịu thuế', async () => {
  const m = await month({ '2026-10-05': work('08:00', '17:00', { extraKind: 'ot', extraOut: '21:00' }) });
  assert.equal(Math.round(m.otPay), 173077);
  assert.equal(m.net.exemptOt, 57692);
  assert.equal(m.net.exemptNight, 0);
  assert.equal(m.net.taxable, m.net.gross - 57692);
});

test('OT Chủ nhật 4 giờ ngoài lịch ×2 (trả 230.769 ₫): miễn 1 lương giờ × 4 = 115.385 ₫', async () => {
  const m = await month({
    '2026-10-04': work('08:00', '17:00', { extraKind: 'ot', extraOut: '21:00', extraOnly: true })
  });
  assert.equal(Math.round(m.otWeekendPay), 230769);
  assert.equal(m.net.exemptOt, 115385);
  assert.equal(m.net.taxable, m.net.gross - 115385);
});

test('làm lễ 2 giờ ×3 có 2 giờ đêm lễ (trả 207.692 ₫): miễn 207.692 − 2 lương giờ = 150.000 ₫', async () => {
  const m = await month({ '2026-10-01': work('22:00', '07:00') }, ['2026-10-01']);
  assert.deepEqual([m.holWorkHours, m.holNightHours], [2, 2]);
  assert.equal(Math.round(m.holWorkPay), 207692);
  assert.equal(m.net.exemptOt, 150000);
});

test('ca đêm 22:00 ngày 01/10 đến 07:00 ngày 02/10 (lễ 01/10): miễn 5 giờ đêm ngoài lễ 43.269 ₫ + làm lễ 150.000 ₫ = 193.269 ₫ (trước đây 395.192 ₫)', async () => {
  const m = await month({ '2026-10-01': work('22:00', '07:00') }, ['2026-10-01']);
  assert.equal(m.nightHours, 5);
  assert.equal(m.net.exemptNight, 43269);
  assert.equal(m.net.exemptOt, 150000);
  assert.equal(m.net.exempt, 193269);
  assert.equal(m.net.taxable, m.net.gross - 193269);
  const before = Math.round(5 * HOURLY * 1.3 + Math.round(m.holWorkPay));
  assert.equal(before, 395192, 'số cũ: cả 130% giờ đêm và cả tiền làm lễ');
  assert.equal(m.net.tax, 0, 'thu nhập nhỏ: thuế vẫn 0');
});

test('giờ đêm của ngày có giờ làm bù được miễn theo phụ trội, tối đa bằng phụ cấp ca đã trả', async () => {
  const m = await month({ '2026-10-06': work('22:00', '07:00', { extraKind: 'makeup', extraOut: '09:00' }) });
  assert.equal(m.nightHours, 7);
  assert.equal(Math.round(m.rows[0].bonus), 92308);
  assert.equal(m.net.exemptNight, 60577, 'min(7 night hours × hourly × 30%, paid shift allowance)');
});

test('bản chụp không có dòng ngày: miễn giờ đêm theo tổng giờ đêm × phụ trội', async () => {
  const m = await month({ '2026-10-06': work('22:00', '07:00') });
  const snapshot = { ...m, rows: undefined };
  assert.equal(Engine.kernelFor(DEFAULTS).mienThueOf(nv, snapshot, m.net.gross).exemptNight, 60577);
});

test('tổng thu nhập, bảo hiểm và các ô lương không đổi: gross = tổng ngày, thực lĩnh = gross − BH − thuế', async () => {
  const m = await month({ '2026-10-06': work('22:00', '07:00', { extraKind: 'ot', extraOut: '11:00' }) });
  const n = m.net;
  assert.equal(n.gross, Math.round(m.total));
  assert.equal(n.taxable, n.gross - n.exempt);
  assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance);
});

// Biểu lũy tiến 5 bậc: 10 triệu 5%, 30 triệu 10%, 60 triệu 20%, 100 triệu 30%, trên đó 35%
const BRACKETS = [
  [10e6, 0.05],
  [30e6, 0.1],
  [60e6, 0.2],
  [100e6, 0.3],
  [Infinity, 0.35]
];
const progressive = (income?) => {
  let tax = 0,
    lower = 0;
  for (const [upper, rate] of BRACKETS) {
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
};

test('lương cao, nhiều giờ đêm và OT: phần chịu thuế tăng làm thuế phát sinh (trước đây miễn cả lương giờ nên thuế 0)', async () => {
  const base = 20e6;
  const kHigh = Engine.create({ ...DEFAULTS, 'level.nv.4.base': base });
  const staff = { type: 'nv', level: 4, nightPct: 40, contract: 'long', insured: true, dependants: 0 };
  const days: Record<string, any> = {};
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(2026, 9, d));
    const weekday = date.getUTCDay() >= 1 && date.getUTCDay() <= 5;
    if (weekday) days[date.toISOString().slice(0, 10)] = work('22:00', '07:00', { extraKind: 'ot', extraOut: '09:00' });
  }
  const m = await month(days, [], staff, kHigh);
  const n = m.net;
  const hourly = base / 26 / 8;
  assert.equal(m.nightHours, 154);
  assert.equal(m.otHours, 44);
  assert.equal(n.exemptNight, Math.round(154 * hourly * 0.3));
  assert.equal(n.exemptOt, Math.round(44 * hourly * 0.5));
  assert.equal(n.taxable, n.gross - n.exempt);
  const deduction = DEFAULTS['tax.deduction.personal'];
  const assessable = n.taxable - n.insurance - deduction;
  assert.ok(assessable > 0);
  assert.equal(n.assessable, assessable);
  assert.equal(n.tax, progressive(assessable));
  assert.equal(n.tax, 1040000);
  assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance);
  const oldExempt = Math.round(hourly * 154 * 1.3 + Math.min(m.otPay, 1.5 * hourly * 44));
  assert.ok(
    n.taxable - n.insurance - deduction > 0 && n.gross - oldExempt - n.insurance - deduction < 0,
    'số cũ thì thuế 0'
  );
});

test('mô tả khoá miễn thuế nói phần cao hơn lương giờ thường', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/params/registry.data.json'), 'utf8'));
  const list = Array.isArray(entries) ? entries : entries.entries || entries.params || [];
  for (const id of [
    'tax.exempt.nightPremium',
    'tax.exempt.otRate',
    'tax.exempt.weekendRate',
    'tax.exempt.holidayRate'
  ]) {
    const entry = list.find(e => e.id === id);
    assert.ok(entry, id);
    assert.match(entry.help, /lương giờ thường/, id);
  }
});
