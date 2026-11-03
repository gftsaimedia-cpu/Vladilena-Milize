'use strict';
// Trần giờ làm thêm (src/domain/limits.js):
//   - một ngày: giờ ca + OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca, tối đa DAY_HOURS_CAP (12) giờ;
//   - một tháng: OT cộng giờ ca chính làm ngày lễ (kể cả giờ OT của ngày lễ), tối đa MONTH_OT_CAP (40) giờ.
require('../helpers/require-isolated-database');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const {
  DAY_HOURS_CAP,
  MONTH_OT_CAP,
  dayNetHours,
  monthOtHours,
  assertDayHours,
  assertMonthOt,
  checkDayHours,
  checkMonthOt,
  checkSheetLimits
} = require('../../src/domain/overtime/hour-limits').HourLimits;
const { estimateHolidayOtHours } = require('../../src/domain/overtime/worked-hours').WorkedHours;

after(() => store.db.close());

const engine = Engine.create(DEFAULTS);
const BREAK = { breakHours: DEFAULTS['time.breakHours'], breakAfterHours: DEFAULTS['time.breakAfterWorkHours'] };
const PARAMS = { 'time.breakHours': BREAK.breakHours, 'time.breakAfterWorkHours': BREAK.breakAfterHours };
const night = (extra: any = {}) => ({ kind: 'work', in: '22:00', out: '07:00', ...extra });
const nightOt = (extraIn?, extraOut?) => night({ extraKind: 'ot', extraIn, extraOut });
const shift = (extra: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', ...extra });
const ot = (extraOut?, extraIn = '') => shift({ extraKind: 'ot', extraOut, extraIn });
const code = (c?) => err => err.status === 400 && err.details?.code === c;

test('hằng số: trần ngày 12 giờ, trần OT tháng 40 giờ', () => {
  assert.equal(DAY_HOURS_CAP, 12);
  assert.equal(MONTH_OT_CAP, 40);
});

test('giờ ròng một ngày: ca 08:00–17:00 là 8 giờ (đã bỏ 1 giờ nghỉ), cộng đoạn OT thô trước và sau ca', () => {
  assert.equal(dayNetHours(shift(), BREAK), 8);
  assert.equal(dayNetHours(ot('21:00'), BREAK), 12);
  assert.equal(dayNetHours(ot('21:00', '07:00'), BREAK), 13);
  assert.equal(dayNetHours(ot('21:15'), BREAK), 12.25);
});

test('giờ ròng: làm bù cũng cộng vào giờ ngày; chỉ trừ giờ nghỉ giữa ca một lần', () => {
  assert.equal(dayNetHours(shift({ extraKind: 'makeup', extraOut: '21:00' }), BREAK), 12);
});

test('giờ ròng: đoạn làm thêm không có loại thì không tính; ngày lễ khung vào – ra là OT nên không trừ giờ nghỉ', () => {
  assert.equal(dayNetHours(shift({ extraKind: '', extraOut: '21:00' }), BREAK), 8);
  assert.equal(dayNetHours(shift(), { ...BREAK, holiday: true }), 9);
});

test('giờ ròng: ca ngắn hơn một vòng làm + nghỉ thì không có giờ nghỉ để trừ; đủ một vòng thì trừ', () => {
  assert.equal(dayNetHours({ kind: 'work', in: '08:00', out: '12:00' }, BREAK), 4);
  assert.equal(dayNetHours({ kind: 'work', in: '08:00', out: '13:00' }, BREAK), 4);
  assert.equal(dayNetHours({ kind: 'work', in: '08:00', out: '12:30' }, BREAK), 4.5);
});

test('giờ ròng: đoạn làm bù trừ giờ nghỉ của chính đoạn (một lần mỗi đoạn, giống bộ máy lương); đoạn OT không có giờ nghỉ', () => {
  const makeup = (extraOut?, extraIn = '') =>
    shift({ in: '06:00', out: '15:00', extraKind: 'makeup', extraOut, extraIn });
  assert.equal(dayNetHours(makeup('19:00'), BREAK), 12); // đoạn 4 giờ chưa tới giờ nghỉ
  assert.equal(dayNetHours(makeup('20:00'), BREAK), 12); // đoạn 5 giờ trừ 1 giờ nghỉ: 8 + 4
  assert.equal(dayNetHours(makeup('20:30'), BREAK), 12.5);
  assert.equal(dayNetHours(makeup('21:00'), BREAK), 13); // đoạn 6 giờ: 8 + 5
  assert.equal(dayNetHours(makeup('20:00', '01:00'), BREAK), 16); // đoạn trước ca 5 giờ và sau ca 5 giờ: 8 + 4 + 4
  assert.equal(dayNetHours(makeup('15:00', '01:00'), BREAK), 12); // chỉ đoạn trước ca 5 giờ: 8 + 4
  const otSeg = (extraOut?) => shift({ in: '06:00', out: '15:00', extraKind: 'ot', extraOut });
  assert.equal(dayNetHours(otSeg('20:00'), BREAK), 13); // OT liền 5 giờ không trừ nghỉ
});

test('giờ ròng: giờ làm thêm trùng giờ vào hoặc giờ ra của ca coi như không có', () => {
  assert.equal(dayNetHours(shift({ extraKind: 'ot', extraOut: '17:00', extraIn: '08:00' }), BREAK), 8);
});

test('trần ngày: đúng 12 giờ nhận, 12,25 giờ bị chặn DAY_HOURS_CAP', () => {
  assert.doesNotThrow(() => assertDayHours('2026-10-05', 12));
  assert.throws(() => assertDayHours('2026-10-05', 12.25), code('DAY_HOURS_CAP'));
});

test('trần ngày: ca 8 giờ + OT 4 giờ vừa đủ; OT 4,25 giờ bị chặn; có mặt 13 giờ trừ 1 giờ nghỉ là 12 giờ nhận', async () => {
  const run = (days?, holidays: any[] = []) => checkDayHours({ params: PARAMS, clean: days, prevDays: {}, holidays });
  await assert.doesNotReject(async () => run({ '2026-10-05': ot('21:00') })); // có mặt 08:00–21:00 = 13 giờ, trừ 1 giờ nghỉ = 12
  await assert.rejects(async () => run({ '2026-10-05': ot('21:15') }), code('DAY_HOURS_CAP'));
  assert.doesNotThrow(() =>
    run({ '2026-10-05': shift({ in: '06:00', out: '15:00', extraKind: 'ot', extraOut: '19:00' }) })
  );
});

test('trần ngày: làm bù và OT cùng ngày đều tính; ngày lễ tính thô không trừ giờ nghỉ', async () => {
  const run = (days?, holidays: any[] = []) => checkDayHours({ params: PARAMS, clean: days, prevDays: {}, holidays });
  await assert.doesNotReject(async () => run({ '2026-10-05': shift({ extraKind: 'makeup', extraOut: '21:00' }) }));
  await assert.rejects(
    async () => run({ '2026-10-05': shift({ extraKind: 'makeup', extraOut: '21:15' }) }),
    code('DAY_HOURS_CAP')
  );
  const early = (extraOut?) => ({ '2026-10-05': shift({ in: '06:00', out: '15:00', extraKind: 'makeup', extraOut }) });
  await assert.doesNotReject(async () => run(early('20:00'))); // đoạn làm bù 5 giờ, bộ máy trả 4: tổng 12 giờ ròng
  await assert.rejects(async () => run(early('20:15')), code('DAY_HOURS_CAP'));
  await assert.doesNotReject(async () =>
    run({ '2026-10-05': { kind: 'work', in: '08:00', out: '20:00' } }, ['2026-10-05'])
  );
  await assert.rejects(
    async () => run({ '2026-10-05': { kind: 'work', in: '08:00', out: '20:15' } }, ['2026-10-05']),
    code('DAY_HOURS_CAP')
  );
});

test('trần ngày: ngày không đổi so với lịch đang lưu thì giữ nguyên; ngày đổi giờ làm thêm thì kiểm lại', async () => {
  const over = ot('23:00');
  const run = (prevDays?) => checkDayHours({ params: PARAMS, clean: { '2026-10-05': over }, prevDays, holidays: [] });
  await assert.doesNotReject(async () => run({ '2026-10-05': { ...over } }));
  await assert.rejects(async () => run({ '2026-10-05': ot('21:00') }), code('DAY_HOURS_CAP'));
});

test('trần ngày: ngày nghỉ hay ngày đi làm không có giờ làm thêm không bị kiểm', async () => {
  const days = { '2026-10-05': { kind: 'leave' }, '2026-10-06': { kind: 'work', in: '08:00', out: '23:00' } };
  await assert.doesNotReject(async () => checkDayHours({ params: PARAMS, clean: days, prevDays: {}, holidays: [] }));
});

test('OT tháng: 40 giờ vừa đủ nhận, 40,25 giờ bị chặn OT_MONTH_CAP', () => {
  assert.doesNotThrow(() => assertMonthOt('2026-10', 40, 0));
  assert.throws(() => assertMonthOt('2026-10', 40.25, 0), code('OT_MONTH_CAP'));
  assert.throws(
    () => assertMonthOt('2026-10', 40.25, 0),
    err => /40,25 giờ|40.25 giờ/.test(err.message)
  );
});

test('OT tháng: dữ liệu đã vượt thì chỉ chặn khi tổng tăng', () => {
  assert.doesNotThrow(() => assertMonthOt('2026-10', 45, 45));
  assert.doesNotThrow(() => assertMonthOt('2026-10', 44, 45));
  assert.throws(() => assertMonthOt('2026-10', 46, 45), code('OT_MONTH_CAP'));
});

test('giờ OT tháng: cộng giờ OT thô mọi ngày, không cộng làm bù', async () => {
  const days = {
    '2026-10-05': ot('21:00'),
    '2026-10-06': ot('21:00', '07:00'),
    '2026-10-07': shift({ extraKind: 'makeup', extraOut: '21:00' })
  };
  assert.equal(await monthOtHours(days, [], '2026-10'), 9);
});

test('giờ OT tháng: ngày lễ cộng cả giờ ca chính (không trừ giờ nghỉ) và giờ OT của ngày đó', async () => {
  const holiday = '2026-10-20';
  const days = {
    [holiday]: ot('21:00'),
    '2026-10-05': ot('21:00')
  };
  assert.equal(await monthOtHours(days, [holiday], '2026-10'), 17); // ngày lễ 9 giờ ca + 4 giờ OT, ngày thường 4 giờ OT
  assert.equal(await monthOtHours(days, new Set<any>([holiday]), '2026-10'), 17);
  assert.equal(await monthOtHours(days, [], '2026-10'), 8);
  assert.equal(await monthOtHours({ [holiday]: shift() }, [holiday], '2026-10'), 9);
  assert.equal(await monthOtHours({ [holiday]: { kind: 'leave' } }, [holiday], '2026-10'), 0);
});

test('giờ OT tháng: giờ ca đêm đếm theo phút rơi vào ngày lễ', async () => {
  const days = { '2026-10-20': night() }; // 22:00 ngày 20 → 07:00 ngày 21
  assert.equal(await monthOtHours(days, ['2026-10-20'], '2026-10'), 2);
  assert.equal(await monthOtHours(days, ['2026-10-21'], '2026-10'), 7);
});

test('trần OT tháng trên lịch: 10 ngày × 4 giờ vừa đủ 40, thêm ngày thứ 11 (44 giờ) bị chặn; bớt OT thì lưu được', async () => {
  const dates = (n?) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, ot('21:00')]));
  const check = (clean?, prevDays: any = {}, holidays: any[] = []) =>
    checkMonthOt({ month: '2026-10', clean, prevDays, holidays });
  await assert.doesNotReject(async () => check(dates(10)));
  await assert.rejects(async () => check(dates(11)), code('OT_MONTH_CAP'));
  await assert.doesNotReject(async () => check(dates(11), dates(11)), 'dữ liệu cũ đã vượt, không đổi thì không chặn');
  await assert.doesNotReject(async () => check(dates(10), dates(11)));
});

test('trần OT tháng trên lịch: giờ OT và giờ ca chính của ngày lễ tính vào 40 giờ; chỉ chặn khi tổng tăng', async () => {
  const holiday = '2026-10-20';
  const days = {
    [holiday]: ot('21:00'),
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`2026-10-${String(i + 5).padStart(2, '0')}`, ot('21:00')])
    )
  }; // 40 giờ OT ngày thường + ngày lễ 9 giờ ca và 4 giờ OT = 53 giờ
  const check = (prevDays: any = {}) => checkMonthOt({ month: '2026-10', clean: days, prevDays, holidays: [holiday] });
  await assert.rejects(
    async () => check(),
    err => code('OT_MONTH_CAP')(err) && /53 giờ/.test(err.message)
  );
  await assert.doesNotReject(async () => check({ ...days }), 'dữ liệu cũ đã vượt, không đổi thì không chặn');
});

test('trần OT tháng đếm giờ thô: 8 ngày OT 17:00–22:00 = 40 giờ vừa đủ, thêm ngày thứ 9 (45 giờ) bị chặn', async () => {
  const dates = (n?) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, ot('22:00')]));
  const check = (n?) => checkSheetLimits({ params: {}, month: '2026-10', clean: dates(n), prevDays: {} });
  await assert.doesNotReject(async () => check(8));
  await assert.rejects(
    async () => check(9),
    err => code('OT_MONTH_CAP')(err) && /45 giờ/.test(err.message)
  );
});

test('trần OT tháng đếm cả giờ ca chính rơi vào ngày lễ và giờ OT, đều là giờ thô', async () => {
  const holiday = '2026-10-20';
  const weekdays = ['05', '06', '07', '08', '09', '12', '13'].map(d => `2026-10-${d}`); // 7 ngày × 5 giờ OT = 35
  const days = {
    [holiday]: shift(), // 9 giờ làm ngày lễ
    ...Object.fromEntries(weekdays.map(d => [d, ot('22:00')]))
  };
  const run = (holidays: any[] = []) =>
    checkSheetLimits({ params: {}, month: '2026-10', clean: days, prevDays: {}, holidays });
  assert.equal(await estimateHolidayOtHours(days, new Set<any>([holiday]), '2026-10'), 44);
  assert.equal(await monthOtHours(days, [holiday], '2026-10'), 44);
  await assert.rejects(
    async () => run([holiday]),
    err => code('OT_MONTH_CAP')(err) && /44 giờ/.test(err.message) && /kể cả giờ làm ngày lễ/.test(err.message)
  );
  assert.equal(await run(), undefined, 'không có ngày lễ thì chỉ còn 35 giờ OT');
});

test('ca đêm 22:00–07:00 (9 giờ có mặt, 8 giờ ròng) cộng OT 20:00–22:00 và 07:00–09:00: 13 giờ có mặt, 12 giờ ròng, nhận', () => {
  assert.equal(dayNetHours(night(), BREAK), 8);
  assert.equal(dayNetHours(nightOt('20:00', '09:00'), BREAK), 12);
  assert.doesNotThrow(() =>
    checkDayHours({ params: PARAMS, clean: { '2026-10-05': nightOt('20:00', '09:00') }, prevDays: {}, holidays: [] })
  );
});

test('ca đêm cộng OT 20:00–09:15 hoặc 19:45–09:00 (12,25 giờ ròng) bị chặn DAY_HOURS_CAP', async () => {
  for (const [extraIn, extraOut] of [
    ['20:00', '09:15'],
    ['19:45', '09:00']
  ]) {
    const clean = { '2026-10-05': nightOt(extraIn, extraOut) };
    assert.equal(dayNetHours(clean['2026-10-05'], BREAK), 12.25);
    await assert.rejects(
      async () => checkDayHours({ params: PARAMS, clean, prevDays: {}, holidays: [] }),
      err => code('DAY_HOURS_CAP')(err) && /12,25|12\.25/.test(err.message)
    );
  }
});

test('ca ngày 08:00–17:00 cộng OT 4 giờ (12 giờ ròng) nhận; OT 4,25 giờ (12,25 giờ ròng) bị chặn', async () => {
  const run = (extraOut?) =>
    checkDayHours({ params: PARAMS, clean: { '2026-10-05': ot(extraOut) }, prevDays: {}, holidays: [] });
  await assert.doesNotReject(async () => run('21:00'));
  await assert.rejects(async () => run('21:15'), code('DAY_HOURS_CAP'));
});

test('giờ ròng của trần ngày bằng giờ làm của bộ máy lương (calcDay: hours + extra) ở ca ngày, ca đêm và đoạn làm bù từ 5 giờ', () => {
  const makeup = (extra: any = {}) => shift({ in: '06:00', out: '15:00', extraKind: 'makeup', ...extra });
  const days = [
    shift(),
    ot('21:00'),
    ot('21:00', '07:00'),
    night(),
    nightOt('20:00', '09:00'),
    nightOt('20:00', '09:15'),
    makeup({ extraOut: '20:00' }),
    makeup({ extraOut: '20:00', extraIn: '01:00' })
  ];
  for (const day of days) {
    const paid = engine.calcDay({ type: 'nv', level: 1, nightPct: 40 }, day, false, 0, {
      date: '2026-10-05',
      holidays: []
    });
    assert.equal(dayNetHours(day, BREAK), paid.hours + paid.extra, JSON.stringify(day));
  }
});
