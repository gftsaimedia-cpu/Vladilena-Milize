'use strict';
// Hệ số OT theo ngày dân sự của từng phút: ngày lễ ot.holidayRate; Thứ Bảy / Chủ nhật không nằm trong lịch của người ot.weekendRate;
// còn lại (ngày thường, Thứ Bảy có trong lịch) ot.rate.
//   - calcDay: ngữ cảnh isRest(ngày) cho biết ngày nghỉ cuối tuần của người; không truyền thì mọi OT ngày thường ×ot.rate;
//   - calcMonth: otWeekendHours / otWeekendPay là phần của otHours / otPay trả theo ot.weekendRate; otWeekdayPay là phần còn lại;
//   - calcNet: tiền OT miễn thuế mỗi nhóm = max(0, min(tiền trả, hệ số miễn thuế của nhóm × lương giờ × giờ) − lương giờ × giờ);
//   - khoá chức vụ type.<mã>.ot.weekendRate thay giá trị toàn cục; sàn luật của ot.weekendRate là law.floor.weekendOtRate.
// Mọi số là NV L1 (lương cơ bản 6.000.000 ₫): lương ngày 230.769,23 ₫, lương giờ 28.846,15 ₫.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { validateValue } = require('../../src/params/validate');

const k = Engine.create(DEFAULTS);
const nv = { type: 'nv', level: 1, nightPct: 40 };
const HOURLY = 6000000 / 26 / 8;
const DAILY = HOURLY * 8;
const R = DEFAULTS['ot.rate'];
const RW = DEFAULTS['ot.weekendRate'];
const RH = DEFAULTS['ot.holidayRate'];
const near = (actual?, expected?, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-4, `${label} ${actual} != ${expected}`);
const work = (tin?, tout?, extra: any = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });
const otAfter = (extraOut?, extra: any = {}) => work('08:00', '17:00', { extraKind: 'ot', extraOut, ...extra });
// 2026-10-02 Thứ Sáu, 03 Thứ Bảy, 04 Chủ nhật, 05 Thứ Hai
const FRI = '2026-10-02';
const SAT = '2026-10-03';
const SUN = '2026-10-04';
const MON = '2026-10-05';
const day = (d?, date?, { holidays = [], rest = [] }: any = {}, staff = nv, kernel = k) =>
  kernel.calcDay(staff, d, holidays.includes(date), 0, { date, holidays, isRest: (x?) => rest.includes(x) });

test('mặc định: ot.rate 1,5, ot.weekendRate 2, ot.holidayRate 3', () => {
  assert.deepEqual([R, RW, RH], [1.5, 2, 3]);
});

test('OT ngày thường 4 giờ: ×ot.rate = 6 giờ lương, cả ngày 14 giờ lương = 403.846 ₫', async () => {
  const d = await day(otAfter('21:00'), MON);
  assert.equal(d.otH, 4);
  assert.equal(d.otWeekendH, 0);
  near(d.otPay, 4 * HOURLY * R);
  near(d.otWeekdayPay, d.otPay);
  assert.equal(Math.round(d.otPay), 173077);
  assert.equal(Math.round(d.total), 403846);
  near(d.total, DAILY + 4 * HOURLY * 1.5, 'tính tay');
});

test('Thứ Bảy nằm trong lịch của người: OT ×ot.rate như ngày thường', async () => {
  const d = await day(otAfter('21:00'), SAT, { rest: [] });
  assert.equal(d.otWeekendH, 0);
  near(d.otPay, 4 * HOURLY * R);
});

test('Thứ Bảy không nằm trong lịch: OT 4 giờ ×ot.weekendRate = 8 giờ lương = 230.769 ₫', async () => {
  const d = await day(otAfter('21:00'), SAT, { rest: [SAT] });
  assert.deepEqual([d.otH, d.otWeekendH], [4, 4]);
  near(d.otWeekendPay, 4 * HOURLY * RW);
  near(d.otWeekdayPay, 0);
  assert.equal(Math.round(d.otPay), 230769);
});

test('Chủ nhật: OT 4 giờ ×ot.weekendRate', async () => {
  const d = await day(otAfter('21:00'), SUN, { rest: [SUN] });
  assert.deepEqual([d.otH, d.otWeekendH], [4, 4]);
  near(d.otPay, 4 * HOURLY * RW);
});

test('ngày thường không nằm trong lịch (Thứ Hai của người làm Thứ Ba đến Thứ Sáu) vẫn ×ot.rate', async () => {
  const d = await day(otAfter('21:00'), MON, { rest: [SAT, SUN] });
  assert.equal(d.otWeekendH, 0);
  near(d.otPay, 4 * HOURLY * R);
});

test('OT Thứ Sáu kéo qua nửa đêm sang Thứ Bảy nghỉ: 17:00–24:00 7 giờ ×1,5 và 00:00–01:00 1 giờ ×2, tách theo từng phút', async () => {
  const d = await day(otAfter('01:00'), FRI, { rest: [SAT] });
  assert.deepEqual([d.otH, d.otWeekendH], [8, 1]);
  near(d.otWeekendPay, 1 * HOURLY * RW);
  near(d.otWeekdayPay, 7 * HOURLY * R);
  near(d.otPay, 7 * HOURLY * R + 1 * HOURLY * RW);
});

test('Thứ Bảy trong lịch: OT qua nửa đêm sang Chủ nhật tách giờ Chủ nhật ×ot.weekendRate', async () => {
  const d = await day(otAfter('01:00'), SAT, { rest: [SUN] });
  assert.deepEqual([d.otH, d.otWeekendH], [8, 1]);
  near(d.otPay, 7 * HOURLY * R + 1 * HOURLY * RW);
});

test('cuối tuần trùng ngày lễ: giờ OT là giờ làm ngày lễ ×ot.holidayRate, không ×ot.weekendRate', async () => {
  const d = await day(otAfter('21:00'), SUN, { holidays: [SUN], rest: [SUN] });
  assert.equal(d.otWeekendH, 0);
  assert.equal(d.holWorkH, 13);
  near(d.holWorkPay, 13 * HOURLY * RH);
});

test('ca đêm 01/10 có OT 20:00–22:00 và 07:00–09:00: lương ngày 230.769 + đêm 92.308 + nghỉ đêm 37.500 + OT 4 giờ ×1,5 = 533.654', async () => {
  const night = work('22:00', '07:00', { extraKind: 'ot', extraIn: '20:00', extraOut: '09:00' });
  const d = await day(night, '2026-10-01');
  assert.equal(d.otH, 4);
  near(d.bonus, (DAILY * 40) / 100);
  near(d.breakPay, HOURLY * (1 + DEFAULTS['night.breakPremium']));
  near(d.otPay, 4 * HOURLY * R);
  assert.equal(Math.round(d.total), 533654);
});

test('ca đêm 40 % có 2 giờ OT: giữ phụ cấp ca và giờ nghỉ đêm, OT 2 giờ ×1,5, tổng ngày 06/10 = 447.115 ₫', async () => {
  const plain = await day(work('22:00', '07:00'), '2026-10-06');
  const d = await day(work('22:00', '07:00', { extraKind: 'ot', extraOut: '09:00' }), '2026-10-06');
  assert.equal(d.otH, 2);
  near(d.bonus, plain.bonus);
  near(d.breakPay, plain.breakPay);
  near(d.otPay, 2 * HOURLY * R);
  near(d.total, d.daily + d.bonus + d.breakPay + d.otPay);
  assert.equal(Math.round(d.total), 447115);
});

test('OT đã khai bị giữ khi còn 1 giờ thiếu chưa bù; bù đủ thì OT 2 giờ ×1,5 = 86.538 ₫ được tính', () => {
  const ot = otAfter('19:00');
  const held = k.calcMonth(nv, { '2026-10-06': work('08:00', '16:00'), '2026-10-07': ot }, null, [], '2026-10', null);
  const row = held.rows.find(r => r.date === '2026-10-07');
  assert.equal(row.otHold, 2);
  assert.equal(row.otPay, 0);
  assert.equal(held.otHours, 0);
  const done = k.calcMonth(nv, { '2026-10-06': work('08:00', '17:00'), '2026-10-07': ot }, null, [], '2026-10', null);
  assert.equal(done.otHours, 2);
  near(done.otPay, 2 * HOURLY * R);
  assert.equal(Math.round(done.otPay), 86538);
});

test('OT không bị giữ khi giờ làm bù đã nhiều hơn giờ thiếu: OT 2 giờ ngày 07/10 ×1,5', () => {
  const days = {
    '2026-10-05': work('08:00', '17:00', { extraKind: 'makeup', extraIn: '', extraOut: '20:00' }),
    '2026-10-07': otAfter('19:00')
  };
  const m = k.calcMonth(nv, days, null, [], '2026-10', null);
  const row = m.rows.find(r => r.date === '2026-10-07');
  assert.equal(row.otHold, 0);
  near(row.otPay, 2 * HOURLY * R);
  assert.equal(m.makeupHours, 3);
});

test('calcMonth: Thứ Hai 4 giờ + Chủ nhật 4 giờ (ngày ngoài lịch, extraOnly) → otWeekdayPay 6 giờ lương, otWeekendPay 8 giờ lương', () => {
  const days = { [MON]: otAfter('21:00'), [SUN]: otAfter('21:00', { extraOnly: true }) };
  const m = k.calcMonth(nv, days, null, [], '2026-10', null);
  assert.deepEqual([m.otHours, m.otWeekendHours], [8, 4]);
  near(m.otWeekdayPay, 4 * HOURLY * R);
  near(m.otWeekendPay, 4 * HOURLY * RW);
  near(m.otPay, m.otWeekdayPay + m.otWeekendPay);
  assert.equal(Math.round(m.rows.find(r => r.date === SUN).total), 230769, 'ngày ngoài lịch chỉ trả đoạn OT');
});

test('OT 5 giờ ×1,5 ở ngày thường và 1 giờ ×3 ở ngày lễ trên cùng dòng ngày (ca 10:00–19:00 ngày 07/10, OT đến 01:00 ngày lễ 08/10)', async () => {
  const d = await day(work('10:00', '19:00', { extraKind: 'ot', extraOut: '01:00' }), '2026-10-07', {
    holidays: ['2026-10-08']
  });
  assert.equal(d.otH, 5);
  assert.deepEqual([d.holWorkH, d.holNightH], [1, 1]);
  near(d.otPay, 5 * HOURLY * R, 'OT ngày thường');
  near(d.holWorkPay, HOURLY * RH + HOURLY * 0.6, 'OT ngày lễ 00:00–01:00 cả phần đêm lễ');
});

test('tiền OT miễn thuế là phần cao hơn lương giờ thường của từng nhóm: ngày thường 0,5, cuối tuần 1, ngày lễ 2', () => {
  const days = {
    [MON]: otAfter('21:00'),
    [SUN]: otAfter('21:00', { extraOnly: true }),
    '2026-10-08': otAfter('21:00')
  };
  const m = k.calcMonth(nv, days, null, ['2026-10-08'], '2026-10', null);
  const expected = 4 * HOURLY * 0.5 + 4 * HOURLY * 1 + 13 * HOURLY * 2;
  assert.equal(m.net.exemptOt, Math.round(expected));
  assert.equal(m.net.exemptOt, 923077);
});

test('tiền OT trả vượt hệ số miễn thuế thì phần vượt chịu thuế: ot.rate 1,8 → miễn thuế vẫn trần 1,5 (phần cao hơn lương giờ thường: 0,5)', () => {
  const k18 = Engine.create({ ...DEFAULTS, 'ot.rate': 1.8 });
  const m = k18.calcMonth(nv, { [MON]: otAfter('21:00') }, null, [], '2026-10', null);
  near(m.otPay, 4 * HOURLY * 1.8);
  assert.equal(m.net.exemptOt, Math.round(4 * HOURLY * 0.5));
});

test('khoá chức vụ type.nv.ot.weekendRate thay giá trị toàn cục; type.nv.ot.rate đổi hệ số ngày thường', async () => {
  const k25 = Engine.create({ ...DEFAULTS, 'type.nv.ot.weekendRate': 2.5 });
  const d = await day(otAfter('21:00'), SUN, { rest: [SUN] }, nv, k25);
  near(d.otPay, 4 * HOURLY * 2.5);
  const weekday = await day(otAfter('21:00'), MON, {}, nv, k25);
  near(weekday.otPay, 4 * HOURLY * R, 'ngày thường không đổi');
  const kOther = Engine.create({ ...DEFAULTS, 'type.nv.ot.rate': 1.8 });
  near((await day(otAfter('21:00'), MON, {}, nv, kOther)).otPay, 4 * HOURLY * 1.8);
});

test('chức vụ không khai khoá riêng (kế thừa) dùng ot.weekendRate toàn cục', async () => {
  const kg = Engine.create({ ...DEFAULTS, 'ot.weekendRate': 2.2 });
  near((await day(otAfter('21:00'), SUN, { rest: [SUN] }, nv, kg)).otPay, 4 * HOURLY * 2.2);
});

test('sàn luật: ot.weekendRate dưới law.floor.weekendOtRate (2) có cảnh báo dưới sàn, bằng sàn thì không', () => {
  assert.equal(DEFAULTS['law.floor.weekendOtRate'], 2);
  const low = validateValue('ot.weekendRate', 1.9, { params: DEFAULTS });
  assert.deepEqual(
    low.warnings.map(w => w.code),
    ['PARAM_BELOW_LEGAL_FLOOR']
  );
  assert.deepEqual(validateValue('ot.weekendRate', 2, { params: DEFAULTS }).warnings, []);
});

test('bản chụp cũ thiếu ot.weekendRate đọc bằng mặc định (không ném PARAM_MISSING)', async () => {
  const old = { ...DEFAULTS };
  delete old['ot.weekendRate'];
  const d = await day(otAfter('21:00'), SUN, { rest: [SUN] }, nv, Engine.create(old));
  near(d.otPay, 4 * HOURLY * RW);
});
