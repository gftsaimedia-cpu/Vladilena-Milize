'use strict';
// Giờ nghỉ giữa ca đêm rơi vào ngày lễ chỉ được trả MỘT lần:
//   - giờ nghỉ nằm trong ngày lễ là giờ làm ngày lễ (×ot.holidayRate, tính trong holidayH); không còn tiền Off Paid (breakPay) cho giờ đó;
//   - giờ nghỉ nằm ngoài ngày lễ vẫn trả Off Paid = giờ nghỉ × lương giờ × (1 + night.breakPremium);
//   - PayrollCalendar.splitMainWork trả holidayBreakNightH = số giờ nghỉ đêm nằm trong ngày lễ; calcDay trừ số này khỏi breakH.
// Số tính tay (NV L1, lương cơ bản 6.000.000 ₫, đêm 40 %: lương giờ h = 28.846,15 ₫, ca g2 22:00–07:00 ngày 07/10, lễ 08/10):
//   22:00–24:00 ngày thường 2 giờ + phụ cấp đêm 40 % × 8 giờ (3,2h) + 7 giờ ngày lễ × 3 (21h) + 6 giờ đêm lễ × 0,6 (3,6h) = 29,8h = 859.615 ₫.
//   Trước đây còn cộng Off Paid 1 giờ × 1,3 (1,3h) cho giờ nghỉ 02:00–03:00 đã nằm trong 7 giờ ngày lễ: 31,1h = 897.115 ₫.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const Calendar = require('../../src/engine/payroll-calendar');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');

const k = Engine.create(DEFAULTS);
const PC = Calendar.create(DEFAULTS);
const nv = { type: 'nv', level: 1, nightPct: 40 };
const ctv = { type: 'ctv', level: 1 };
const HOURLY = 6000000 / 26 / 8;
const BREAK_PAY = HOURLY * (1 + DEFAULTS['night.breakPremium']);
const near = (actual?, expected?, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1.5, `${label} ${actual} != ${expected}`); // tổng là cộng các dòng nguyên đồng
const work = (tin = '22:00', tout = '07:00', extra: any = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });
const day = (staff?, d?, date?, holidays: any[] = []) =>
  k.calcDay(staff, d, holidays.includes(date), 0, { date, holidays });

test('splitMainWork: giờ nghỉ đêm 02:00–03:00 rơi vào ngày lễ sau thì holidayBreakNightH = 1; không lễ hoặc nghỉ ngoài ngày lễ thì 0', () => {
  const into = PC.splitMainWork(work(), '2026-10-07', ['2026-10-08']);
  assert.deepEqual([into.holidayH, into.holidayNightH, into.holidayBreakH, into.holidayBreakNightH], [7, 6, 1, 1]);
  const none = PC.splitMainWork(work(), '2026-10-07', []);
  assert.deepEqual([none.holidayH, none.holidayBreakNightH], [0, 0]);
  const start = PC.splitMainWork(work(), '2026-10-01', ['2026-10-01']);
  assert.deepEqual([start.holidayH, start.holidayBreakNightH], [2, 0], 'lễ chỉ phủ 22:00–24:00, giờ nghỉ nằm ngày sau');
});

test('ca đêm 07/10 sang lễ 08/10: giờ nghỉ trả một lần trong 7 giờ ngày lễ, không có Off Paid, ngày = 29,8h = 859.615 ₫', async () => {
  const d = await day(nv, work(), '2026-10-07', ['2026-10-08']);
  assert.equal(d.breakH, 0);
  assert.equal(d.breakPay, 0);
  near(d.holWorkPay, (7 * 3 + 6 * 0.6) * HOURLY, '7 giờ ×3 và 6 giờ đêm lễ ×0,6');
  near(d.total, 29.8 * HOURLY);
  assert.equal(Math.round(d.total), 859615);
  near(31.1 * HOURLY - d.total, BREAK_PAY, 'chênh với cách trả hai lần đúng một Off Paid');
});

test('cùng ca đêm không có ngày lễ: Off Paid 1 giờ × 1,3 = 37.500 ₫ vẫn trả', async () => {
  const d = await day(nv, work(), '2026-10-07');
  assert.equal(d.breakH, 1);
  near(d.breakPay, BREAK_PAY);
  assert.equal(Math.round(d.breakPay), 37500);
});

test('ca đêm bắt đầu đúng ngày lễ 01/10: giờ nghỉ 02:00 nằm ngày thường nên giữ Off Paid 37.500, dòng ngày 741.346 ₫', async () => {
  const d = await day(nv, work(), '2026-10-01', ['2026-10-01']);
  assert.equal(d.breakH, 1);
  near(d.breakPay, BREAK_PAY);
  assert.equal(Math.round(d.total), 741346);
});

test('chủ dự án: ca đêm 19/10 sang lễ 20/10 và đi làm lễ 20/10: dòng 19/10 859.615, dòng 20/10 741.346, ngày công đếm cả hai', async () => {
  const days = { '2026-10-19': work(), '2026-10-20': work() };
  const m = k.calcMonth(nv, days, null, ['2026-10-20'], '2026-10', null);
  const row = (date?) => m.rows.find(r => r.date === date);
  assert.equal(Math.round((await row('2026-10-19')).total), 859615);
  assert.equal(Math.round((await row('2026-10-20')).total), 741346);
  assert.equal((await row('2026-10-20')).kind, 'holiday');
  assert.equal(m.count, 2);
  assert.equal(m.holiday, 1);
});

test('ca nằm trọn trong ngày lễ (00:00–09:00, giờ nghỉ 04:00–05:00): không Off Paid, cả 9 giờ ×3, CTV ngày = 1.182.692 ₫', async () => {
  const d = await day(ctv, work('00:00', '09:00'), '2026-10-07', ['2026-10-07']);
  assert.equal(d.holWorkH, 9);
  assert.equal(d.holNightH, 6);
  near(d.holNightPay, 3.6 * HOURLY);
  near(d.bonus, 69230.76923076923);
  assert.equal(d.breakPay, 0);
  near(d.total, 1182692.3076923077);
});

test('hai ngày lễ liền nhau: phụ cấp ca và quyền lợi chỉ tính một lần, giờ nghỉ không trả thêm, tháng = 1.448.077 ₫', () => {
  const m = k.calcMonth(ctv, { '2026-10-06': work() }, null, ['2026-10-06', '2026-10-07'], '2026-10', null);
  near(m.holWorkHours, 9);
  near(m.bonus, 69230.76923076923);
  near(m.total, 1448076.9230769232);
});

test('ca đã xác nhận dùng giờ ca gán (22:00–07:00), bỏ qua quãng nghỉ khi chia ngày lễ: 7 giờ lễ, 6 giờ đêm, 836.538 ₫', async () => {
  const d = await day(
    ctv,
    work('10:00', '11:00', { attendanceConfirmed: true, plannedShift: { in: '22:00', out: '07:00' }, breakMin: 120 }),
    '2026-10-06',
    ['2026-10-07']
  );
  near(d.holWorkH, 7);
  near(d.holNightH, 6);
  assert.equal(d.breakPay, 0);
  near(d.total, 836538.4615384615);
});

test('ngày lễ qua ranh giới tháng: ca 31/10 sang lễ 01/11 thuộc tháng 10, 7 giờ lễ, 836.538 ₫', () => {
  const days = { '2026-10-31': work(), '2026-11-02': work('08:00', '17:00') };
  const m = k.calcMonth(ctv, days, null, ['2026-11-01'], '2026-10', null);
  near(m.holWorkHours, 7);
  near(m.total, 836538.4615384615);
  assert.deepEqual(
    m.rows.map(r => r.date),
    ['2026-10-31']
  );
});

test('thường sang lễ: 7 giờ lễ (gồm giờ nghỉ) trả một lần, quyền lợi tính một lần, tháng = 1.067.308 ₫', () => {
  const m = k.calcMonth(ctv, { '2026-10-06': work() }, null, ['2026-10-07'], '2026-10', null);
  near(m.holWorkHours, 7);
  near(m.holWorkPay, 709615.3846153846);
  near(m.basePay, 288461.5384615384);
  near(m.bonus, 69230.76923076923);
  near(m.total, 1067307.6923076923);
  assert.equal(m.count, 1);
  near(m.debt, 0);
});

test('CTV ca đêm sang lễ nghỉ giữa ca 60 phút nhập tay: thiếu 1 giờ trừ một lần, ngày 752.244 ₫, còn nợ 1 giờ', () => {
  const m = k.calcMonth(
    ctv,
    { '2026-10-06': work('22:00', '07:00', { breakMin: 60 }) },
    null,
    ['2026-10-07'],
    '2026-10',
    null
  );
  const row = m.rows.find(r => r.date === '2026-10-06');
  assert.equal(row.short, 1);
  assert.equal(Math.round(row.total), 752244);
  assert.equal(m.debt, 1);
  assert.equal(Math.round(row.cut), 28846, 'giờ thiếu bị cắt một lần');
});

// OT liền sau ca đêm rơi vào ngày lễ: giờ OT là giờ làm ngày lễ (×ot.holidayRate); giờ nghỉ của ca chính nằm trong ngày lễ trả một lần
const g2Ot = work('22:00', '07:00', { extraKind: 'ot', extraOut: '11:00' });
const g1Ot = work('21:00', '06:00', { extraKind: 'ot', extraOut: '10:00' });
const H = (hours?) => hours * HOURLY;

test('ca g2 + OT 07:00–11:00, lễ 08/10: 7 giờ ca chính + 4 giờ OT đều là giờ lễ, không Off Paid, tổng ngày 41,8h = 1.205.769 ₫', async () => {
  const d = await day(nv, g2Ot, '2026-10-07', ['2026-10-08']);
  assert.deepEqual([d.otH, d.otPay, d.breakPay], [0, 0, 0]);
  near(d.holWorkH, 11);
  near(d.holWorkPay, H(11 * DEFAULTS['ot.holidayRate'] + 6 * DEFAULTS['night.otAddRate'] * DEFAULTS['ot.holidayRate']));
  near(d.total, H(41.8));
  assert.equal(Math.round(d.total), 1205769);
});

test('ca g1 + OT 06:00–10:00, lễ 08/10: giờ nghỉ 01:00 nằm trong ngày lễ, 6 giờ ca chính + 4 giờ OT lễ, tổng ngày 39,8h = 1.148.077 ₫', async () => {
  const d = await day(nv, g1Ot, '2026-10-07', ['2026-10-08']);
  assert.equal(d.otH, 0);
  assert.equal(d.breakPay, 0);
  near(d.holWorkH, 10);
  assert.equal(Math.round(d.total), 1148077);
});

test('tháng có ca g2 + OT sang lễ: tổng 53h = ngày 07/10 (41,8h) + lương nghỉ lễ 8h + đi lại 1,2h + chuyên cần 2h; basePay 10h', () => {
  const m = k.calcMonth(nv, { '2026-10-07': g2Ot }, null, ['2026-10-08'], '2026-10', null);
  near(m.holWorkHours, 11);
  near(m.holWorkPay, H(36.6));
  near(m.total, H(53));
  assert.equal(m.total, 1528845); // tổng các dòng nguyên đồng
  near(m.basePay, H(10));
  assert.deepEqual([m.otHours, m.otPay], [0, 0]);
});

test('calcNet: tiền OT miễn thuế là phần làm lễ trả cao hơn lương giờ thường (738.462 ₫); OT ngày thường chỉ phần 0,5 (57.692 ₫)', async () => {
  const m = k.calcMonth(nv, { '2026-10-07': g2Ot }, null, ['2026-10-08'], '2026-10', null);
  assert.equal(m.net.exemptOt, 738462);
  assert.equal(k.calcNet(nv, m).exemptOt, 738462);
  const plain = k.calcMonth(nv, { '2026-10-07': g2Ot }, null, [], '2026-10', null);
  assert.equal(plain.net.exemptOt, 57692);
  near(plain.otPay, H(4 * DEFAULTS['ot.rate']));
  near(
    (await day(nv, g2Ot, '2026-10-07')).total,
    H(18.5),
    'ca g2 không lễ: 8h + đêm 3,2h + nghỉ đêm 1,3h + OT 4 × 1,5'
  );
});
