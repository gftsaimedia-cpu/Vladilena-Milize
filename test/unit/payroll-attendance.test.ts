// Payroll regression tests: inspect the browser's pure formula block in a VM.
// Do not load server.js, src/platform/db.ts, browser boot code, or real personnel data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadPayroll } = require('../helpers/payroll-vm');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const {
  context: sandbox,
  api: { calcDay, calcMonth, calcNet, progressiveTax, TAX_RULES }
} = loadPayroll({
  exports: ['calcDay', 'calcMonth', 'calcNet', 'progressiveTax', 'TAX_RULES'],
  timeout: 1000
});

const date = '2026-10-06';
const normalStaff = { type: 'nv', level: 1, nightPct: 40 };
const daily = 6000000 / 26;
const hourly = daily / 8;
const shifts = {
  n1: ['08:00', '17:00'],
  n2: ['10:00', '19:00'],
  f1: ['06:00', '15:00'],
  f2: ['13:00', '22:00'],
  g1: ['21:00', '06:00'],
  g2: ['22:00', '07:00']
};
const closeTo = (actual?, expected?, label?) =>
  assert.ok(Math.abs(actual - expected) < 1.5, `${label}: expected ${expected}, got ${actual}`); // tổng là cộng các dòng nguyên đồng

function confirmed(code = 'n1', overrides: any = {}) {
  const [tin, tout] = shifts[code];
  const following = tout < tin ? '2026-10-07' : date;
  return {
    kind: 'work',
    src: 'punch',
    attendanceConfirmed: true,
    plannedShift: {
      code,
      date,
      in: tin,
      out: tout,
      kind: 'work',
      startIso: `${date}T${tin}:00+07:00`,
      endIso: `${following}T${tout}:00+07:00`
    },
    in: tin,
    out: tout,
    presIn: `${date}T${tin}:00+07:00`,
    presOut: `${following}T${tout}:00+07:00`,
    breakMin: 0,
    extraKind: '',
    extraIn: '',
    extraOut: '',
    ...overrides
  };
}

test('confirmed normal day uses the planned shift, not early/late presence or office-break deductions', () => {
  const scenarios = [
    { in: '07:55', out: '18:00', presIn: `${date}T07:55:00+07:00`, presOut: `${date}T18:00:00+07:00` },
    { in: '09:30', out: '16:00', presIn: `${date}T09:30:00+07:00`, presOut: `${date}T16:00:00+07:00`, breakMin: 120 }
  ];
  for (const actual of scenarios) {
    const entry = confirmed('n1', actual);
    const before = JSON.stringify(entry);
    const day = calcDay(normalStaff, entry, false, 0);
    assert.equal(day.hours, 8);
    assert.equal(day.short, 0);
    assert.equal(day.cut, 0);
    assert.equal(day.bonus, 0);
    closeTo(day.total, daily, 'one full normal day');
    assert.equal(JSON.stringify(entry), before, 'salary calculation must not overwrite recorded presence');
  }
});

test('an incomplete pending day pays zero until approved, then counts as one full scheduled day', () => {
  const pending = confirmed('n1', {
    kind: 'pending',
    reason: 'incomplete-shift',
    attendanceConfirmed: false,
    in: '09:30',
    out: '16:00',
    presIn: `${date}T09:30:00+07:00`,
    presOut: `${date}T16:00:00+07:00`
  });
  const waiting = calcMonth(normalStaff, { [date]: pending }, null, [], '2026-10', null);
  assert.equal(waiting.count, 0);
  assert.equal(waiting.pending, 1);
  assert.equal(waiting.basePay, 0);
  assert.equal(waiting.total, 0);
  const approved = { ...pending, kind: 'work', src: 'admin', attendanceConfirmed: true, attendanceApproved: true };
  const month = calcMonth(normalStaff, { [date]: approved }, null, [], '2026-10', null);
  assert.equal(month.count, 1);
  assert.equal(month.pending, 0);
  assert.equal(month.short, 0);
  assert.equal(month.debt, 0);
  closeTo(month.basePay, daily, 'approved full daily base');
  closeTo(month.travel, (6000000 * 0.15) / 26, 'one day travel');
  closeTo(month.attendance, (6000000 * 0.25) / 26, 'one day attendance');
});

for (const group of [
  { name: 'TTS', staff: { type: 'tts', level: 6 }, base: 5000000, days: 22, flex: 0.1, night: 0.3 },
  { name: 'CTV', staff: { type: 'ctv', level: 1 }, base: 6000000, days: 26, flex: 0.1, night: 0.3 },
  { name: 'NV night40', staff: normalStaff, base: 6000000, days: 26, flex: 0.2, night: 0.4 },
  { name: 'NV night60', staff: { ...normalStaff, nightPct: 60 }, base: 6000000, days: 26, flex: 0.2, night: 0.6 }
]) {
  test(`${group.name}: all six confirmed presets retain normal/flex/night rates and paid night rest`, () => {
    for (const code of Object.keys(shifts)) {
      const expectedShift = code[0] === 'g' ? 'night' : code[0] === 'f' ? 'flex' : 'normal';
      const rate = expectedShift === 'night' ? group.night : expectedShift === 'flex' ? group.flex : 0;
      const dayBase = group.base / group.days;
      const restPay = expectedShift === 'night' ? (dayBase / 8) * 1.3 : 0;
      // Actual HH:mm fields deliberately disagree; confirmation pays the stored planned shift.
      const day = calcDay(group.staff, confirmed(code, { in: '09:00', out: '12:00', breakMin: 45 }), false, 0);
      assert.equal(day.hours, 8, code);
      assert.equal(day.short, 0, code);
      assert.equal(day.shift, expectedShift, code);
      assert.equal(day.breakH, expectedShift === 'night' ? 1 : 0, code);
      closeTo(day.bonus, dayBase * rate, `${code} shift allowance`);
      closeTo(day.breakPay, restPay, `${code} rest remains paid at +30%`);
      closeTo(day.total, dayBase * (1 + rate) + restPay, `${code} full confirmed pay`);
    }
  });
}

test('surplus physical presence does not automatically create makeup or OT', () => {
  const entry = confirmed('n1', { presIn: `${date}T04:00:00+07:00`, presOut: `${date}T21:00:00+07:00` });
  const day = calcDay(normalStaff, entry, false, 8);
  assert.equal(day.hours, 8);
  assert.equal(day.extra, 0);
  assert.equal(day.makeupH, 0);
  assert.equal(day.otH, 0);
  assert.equal(day.makeupPay, 0);
  assert.equal(day.otPay, 0);
  closeTo(day.total, daily, 'presence outside plan creates no extra pay');
});

test('explicit OT on confirmed days still needs approval and no preceding makeup debt', () => {
  const entry = confirmed('n1', { extraKind: 'ot', extraOut: '19:00', presOut: `${date}T19:00:00+07:00` });
  for (const otReview of [undefined, { ok: false }]) {
    const day = calcDay(normalStaff, { ...entry, otReview }, false, 0);
    assert.equal(day.otH, 0);
    assert.equal(day.otPay, 0);
    assert.equal(day.otWait, 2);
    closeTo(day.total, daily, 'unapproved OT is not paid');
  }
  const approved = { ...entry, otReview: { ok: true } };
  const day = calcDay(normalStaff, approved, false, 0);
  assert.equal(day.otH, 2);
  closeTo(day.otPay, hourly * 2 * 2, 'two approved overtime hours');
  closeTo(day.total, daily + hourly * 2 * 2, 'base plus approved OT');
  const owing = calcDay(normalStaff, approved, false, 1);
  assert.equal(owing.otH, 0);
  assert.equal(owing.otPay, 0);
  closeTo(owing.total, daily, 'prior debt still blocks OT');
  assert.equal(calcDay({ type: 'tts', level: 1 }, approved, false, 0).otPay, 0, 'TTS remains ineligible for OT');
  const night = calcDay(
    normalStaff,
    confirmed('g2', { extraKind: 'ot', extraOut: '08:00', otReview: { ok: true } }),
    false,
    0
  );
  assert.equal(night.otH, 1, 'night shift may work OT after 07:00');
  closeTo(night.otPay, hourly * 2, 'night-shift OT is paid at twice the hourly base');
});

test('confirmed-day makeup keeps the prior debt cap and a separate extra-segment break cycle', () => {
  const entry = confirmed('n1', { extraKind: 'makeup', extraOut: '20:00', presOut: `${date}T20:00:00+07:00` });
  const day = calcDay(normalStaff, entry, false, 1.5);
  assert.equal(day.hours, 8);
  assert.equal(day.extra, 3, '17:00–20:00 is a separate three-hour work segment');
  assert.equal(day.makeupH, 1.5);
  closeTo(day.makeupPay, hourly * 1.5, 'only outstanding debt is paid as makeup');
  closeTo(day.total, daily + hourly * 1.5, 'base plus capped makeup');
  assert.equal(calcDay(normalStaff, entry, false, 0).makeupPay, 0);
  const month = calcMonth(
    normalStaff,
    { '2026-10-05': { kind: 'willmakeup' }, [date]: entry },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(month.count, 1);
  assert.equal(month.makeupHours, 3);
  assert.equal(month.debt, 5, 'eight hours owed minus three hours made up');
});

test('legacy partial records keep hourly deductions and manual OT behavior', () => {
  const old = { kind: 'work', in: '08:00', out: '12:00' };
  const partial = calcDay(normalStaff, old, false, 0);
  assert.equal(partial.hours, 4);
  assert.equal(partial.short, 4);
  closeTo(partial.cut, daily / 2, 'legacy half-day deduction');
  closeTo(partial.total, daily / 2, 'legacy half-day salary');
  const deduction = calcDay(normalStaff, { kind: 'work', in: '08:00', out: '17:00', breakMin: 60 }, false, 0);
  assert.equal(deduction.hours, 7);
  closeTo(deduction.total, hourly * 7, 'legacy office-break deduction remains');
  const manualOt = calcDay(
    normalStaff,
    { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '18:00' },
    false,
    0
  );
  assert.equal(manualOt.otH, 1, 'legacy self-entered days do not require check-in approval');
  closeTo(manualOt.otPay, hourly * 2, 'legacy manual overtime rate');
});

test('one, two or three makeup hours after a normal day do not restart the main-shift break deduction', () => {
  for (const [out, expectedHours] of <any[]>[
    ['18:00', 1],
    ['19:00', 2],
    ['20:00', 3]
  ]) {
    const entry = confirmed('n1', { extraKind: 'makeup', extraOut: out, presOut: `${date}T${out}:00+07:00` });
    const day = calcDay(normalStaff, entry, false, 8);
    assert.equal(day.hours, 8, out);
    assert.equal(day.makeupH, expectedHours, out);
    assert.equal(day.hours + day.makeupH, 8 + expectedHours, out);
    closeTo(day.total, daily + hourly * expectedHours, `${out} salary plus declared makeup`);
  }
});

test('only the part of a break inside 22:00–06:00 receives basic hourly pay plus thirty percent', () => {
  for (const [tin, tout, paidRest] of <any[]>[
    ['17:30', '02:30', 0.5],
    ['01:30', '10:30', 0.5],
    ['02:30', '11:30', 0]
  ]) {
    const day = calcDay(normalStaff, { kind: 'work', in: tin, out: tout }, false, 0);
    assert.equal(day.hours, 8, tin);
    assert.equal(day.breakH, paidRest, tin);
    closeTo(day.breakPay, hourly * paidRest * 1.3, `${tin} night rest payment`);
    closeTo(day.total, daily * 1.4 + hourly * paidRest * 1.3, `${tin} full day plus night allowance and eligible rest`);
  }
});

test('KPI is zero before assessment and below seventy-five percent, then follows the current approved percentage formula', () => {
  const days = { [date]: confirmed() };
  for (const pct of [null, '', 0, 74, 74.99]) {
    const month = calcMonth(normalStaff, days, { pct, amt: 6000000 }, [], '2026-10', null);
    assert.equal(month.kpiPay, 0, `KPI ${String(pct)}`);
  }
  assert.equal(calcMonth(normalStaff, days, { pct: 75, amt: 6000000 }, [], '2026-10', null).kpiPay, 4500000);
  assert.equal(calcMonth(normalStaff, days, { pct: 100, amt: 6000000 }, [], '2026-10', null).kpiPay, 6000000);
});

test('KPI amounts stay within the position cap and Admin assessment takes precedence', () => {
  const days = { [date]: confirmed() };
  const ctv = calcMonth({ type: 'ctv', level: 1 }, days, { pct: 100, amt: 6000000 }, [], '2026-10', null);
  assert.equal(ctv.kpiAmt, 1500000);
  assert.equal(ctv.kpiPay, 1500000);
  const nv = calcMonth(normalStaff, days, { pct: 100, amt: 9000000 }, [], '2026-10', null);
  assert.equal(nv.kpiAmt, 6000000);
  assert.equal(nv.kpiPay, 6000000);
  const approved = calcMonth(
    normalStaff,
    days,
    { pct: 100, amt: 6000000, admPct: 80, admAmt: 4000000 },
    [],
    '2026-10',
    null
  );
  assert.equal(approved.kpiApproved, true);
  assert.equal(approved.kpiSelfPct, 100);
  assert.equal(approved.kpiPct, 80);
  assert.equal(approved.kpiPay, 3200000);
  const failed = calcMonth(
    normalStaff,
    days,
    { pct: 100, amt: 6000000, admPct: 74, admAmt: 4000000 },
    [],
    '2026-10',
    null
  );
  assert.equal(failed.kpiPay, 0);
  assert.equal(calcMonth({ type: 'tts', level: 1 }, days, { pct: 100, amt: 6000000 }, [], '2026-10', null).kpiPay, 0);
});

test('attendance allowance is lost from the third day off and iDorm removes only travel allowance', () => {
  const twoDays = {
    '2026-10-01': { kind: 'unpaid' },
    '2026-10-02': { kind: 'unpaid' },
    [date]: confirmed()
  };
  const below = calcMonth(normalStaff, twoDays, null, [], '2026-10', null);
  assert.equal(below.overHours, 16);
  assert.equal(below.attendOk, true);
  closeTo(below.attendance, 1500000 / 26, 'two absences retain the attendance allowance of the working day');
  const days = { ...twoDays, '2026-10-03': { kind: 'unpaid' } };
  const aboveLimit = calcMonth(normalStaff, days, null, [], '2026-10', null);
  assert.equal(aboveLimit.overHours, 24);
  assert.equal(aboveLimit.attendOk, false, 'three days off: attendance allowance is 0');
  assert.equal(aboveLimit.attendance, 0);
  closeTo(aboveLimit.travel, 900000 / 26, 'travel remains based on the one working day');
  const dorm = calcMonth({ ...normalStaff, idorm: true }, { [date]: confirmed() }, null, [], '2026-10', null);
  assert.equal(dorm.travel, 0);
  closeTo(dorm.attendance, 1500000 / 26, 'iDorm does not remove attendance allowance');
});

test('CTV has no travel or attendance allowance, and a stored iDorm flag changes nothing', () => {
  const ctv = { type: 'ctv', level: 1, shiftCode: 'n1' };
  const days = { '2026-10-01': { kind: 'unpaid' }, [date]: confirmed() };
  const m = calcMonth(ctv, days, null, [], '2026-10', null);
  assert.equal(m.travel, 0);
  assert.equal(m.attendance, 0);
  assert.equal(m.allow, 0);
  assert.equal(calcMonth({ ...ctv, idorm: true }, days, null, [], '2026-10', null).total, m.total);
});

test('TTS has no paid annual leave or holiday; CTV and NV retain daily basic pay for these kinds', () => {
  for (const [staff, expected] of <any[]>[
    [{ type: 'tts', level: 1 }, 0],
    [{ type: 'ctv', level: 1 }, daily],
    [normalStaff, daily]
  ]) {
    closeTo(calcDay(staff, { kind: 'leave' }, false, 0).total, expected, `${staff.type} annual leave`);
    closeTo(calcDay(staff, {}, true, 0).total, expected, `${staff.type} holiday`);
    for (const kind of ['unpaid', 'approved', 'willmakeup', 'pending', 'noshow']) {
      assert.equal(calcDay(staff, { kind }, false, 0).total, 0, `${staff.type} ${kind}`);
    }
  }
});

test('working a holiday: approved window pays every holiday hour at the holiday rate (no break), counts one workday; a position without OT gets nothing', () => {
  const engine = Engine.create(DEFAULTS);
  const entry = confirmed('n1', { extraKind: 'ot', extraOut: '19:00', otReview: { ok: true } });
  const month = engine.calcMonth(normalStaff, { [date]: entry }, null, [date], '2026-10', null);
  assert.equal(month.count, 1);
  assert.equal(month.holWorkDays, 1);
  assert.equal(month.holWorkHours, 11); // 9 hours of the shift window plus 2 hours after it, no break deducted
  assert.equal(month.otHours, 0);
  assert.equal(month.makeupHours, 0);
  closeTo(month.holWorkPay, hourly * 11 * 3, 'eleven holiday hours at triple hourly rate');
  closeTo(month.basePay, daily, 'separate holiday basic pay');
  closeTo(
    month.total,
    hourly * (8 + 33 + 1.2 + 2),
    'holiday entitlement, holiday work, travel and attendance of the counted workday'
  );
  const noOt = engine.calcDay({ type: 'tts', level: 1 }, entry, true, 0, { date, holidays: [date] });
  assert.equal(noOt.total, 0, 'TTS has no OT benefit: no holiday OT and no holiday entitlement');
  assert.equal(noOt.holWorkPay || 0, 0);
});

test('a confirmed TTS Saturday makeup shift pays only prior debt and does not become a regular day', () => {
  const staff = { type: 'tts', level: 1 };
  const entry = confirmed('n1', { kind: 'makeup' });
  const day = calcDay(staff, entry, false, 3);
  assert.equal(day.makeupH, 3);
  assert.equal(day.bonus, 0);
  closeTo(day.total, (1000000 / 22 / 8) * 3, 'three eligible makeup hours');
  assert.equal(calcDay(staff, entry, false, 0).total, 0);
  const month = calcMonth(
    staff,
    { '2026-10-09': { kind: 'willmakeup' }, '2026-10-10': entry },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(month.count, 0);
  assert.equal(month.makeupHours, 8);
  assert.equal(month.debt, 0);
  closeTo(month.total, 1000000 / 22, 'makeup pays one day of outstanding hours, separately from regular attendance');
});

test('makeup before the leave day counts for the month; the estimate cutoff only pays hours already owed', () => {
  const earlier = confirmed('n1', { extraKind: 'makeup', extraOut: '20:00' });
  const later = confirmed('n1', { extraKind: 'makeup', extraOut: '18:00' });
  // Deliberately insert dates out of order; calculation must process actual work dates.
  const days = { '2026-10-08': later, '2026-10-07': { kind: 'willmakeup' }, [date]: earlier };
  const before = JSON.stringify(days);
  const month = calcMonth(normalStaff, days, null, [], '2026-10', null);
  assert.deepEqual(
    Array.from(month.rows as any[], r => r.date),
    ['2026-10-06', '2026-10-07', '2026-10-08']
  );
  assert.equal(month.rows[0].makeupH, 3, 'makeup declared before the leave day is paid');
  assert.equal(month.makeupHours, 4);
  assert.equal(month.debt, 4, 'eight hours owed minus four hours made up');
  closeTo(month.makeupPay, hourly * 4, 'four paid makeup hours');
  const cutoff = calcMonth(normalStaff, days, null, [], '2026-10', date);
  assert.equal(cutoff.count, 1);
  assert.equal(cutoff.makeupHours, 0, 'nothing is owed yet on the cutoff date');
  assert.equal(cutoff.makeupCredit, 3, 'the three hours stay recorded as made in advance');
  assert.equal(cutoff.debt, 0);
  assert.equal(cutoff.rows.length, 1);
  assert.equal(JSON.stringify(days), before, 'monthly calculation must not rewrite attendance entries');
});

test('makeup made in advance covers a later leave day; surplus makeup stays unpaid', async () => {
  const fourHours = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '', extraOut: '21:00' };
  const advance = { '2026-10-05': fourHours, '2026-10-06': fourHours };
  const covered = calcMonth(
    normalStaff,
    { ...advance, '2026-10-09': { kind: 'willmakeup' } },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(covered.rows[0].makeupH, 4);
  assert.equal(covered.makeupHours, 8);
  closeTo(covered.makeupPay, hourly * 8, 'one day of makeup pay offsets the unpaid leave day');
  assert.equal(covered.debt, 0);
  assert.equal(covered.makeupCredit, 0);
  assert.equal(covered.overHours, 0, 'fully made-up leave does not count towards the attendance threshold');
  assert.equal((await covered.rows.at(-1)).debtAfter, 0);
  assert.equal(covered.rows[1].debtAfter, -8, 'running balance shows eight hours made in advance');
  const surplus = calcMonth(normalStaff, advance, null, [], '2026-10', null);
  assert.equal(surplus.makeupHours, 0);
  assert.equal(surplus.makeupPay, 0, 'surplus makeup is not paid');
  assert.equal(surplus.makeupCredit, 8);
  const partial = calcMonth(
    normalStaff,
    { '2026-10-05': fourHours, '2026-10-09': { kind: 'willmakeup' } },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(partial.makeupHours, 4);
  assert.equal(partial.debt, 4);
});

test('OT counts when the days before it are settled; later shortfalls are handled separately', () => {
  const ot = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraIn: '', extraOut: '19:00' };
  const fourHours = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '', extraOut: '21:00' };
  const oneShort = { kind: 'work', in: '08:00', out: '16:00' };
  const oneHour = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '', extraOut: '18:00' };
  const alone = calcMonth(normalStaff, { '2026-10-05': ot }, null, [], '2026-10', null);
  assert.equal(alone.otHours, 2);
  const laterLeave = calcMonth(
    normalStaff,
    { '2026-10-05': ot, '2026-10-09': { kind: 'willmakeup' } },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(laterLeave.otHours, 2, 'a later leave day not made up does not touch earlier OT');
  assert.equal(laterLeave.debt, 8, 'the later shortfall is deducted separately');
  const laterCredit = calcMonth(normalStaff, { '2026-10-05': ot, '2026-10-06': fourHours }, null, [], '2026-10', null);
  assert.equal(laterCredit.otHours, 2, 'advance makeup declared after the OT day does not touch it');
  const priorCredit = calcMonth(normalStaff, { '2026-10-05': fourHours, '2026-10-06': ot }, null, [], '2026-10', null);
  assert.equal(priorCredit.otHours, 0, 'unused advance makeup before the OT day blocks it');
  assert.equal(priorCredit.otHoldHours, 2);
  const priorShort = calcMonth(
    normalStaff,
    { '2026-10-05': oneShort, '2026-10-06': ot, '2026-10-07': oneHour },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(priorShort.otHours, 0, 'a shortfall still open on the OT day blocks it, even if made up later');
  assert.equal(priorShort.otHoldHours, 2);
  assert.equal(priorShort.debt, 0);
  const settledFirst = calcMonth(
    normalStaff,
    { '2026-10-05': oneShort, '2026-10-06': oneHour, '2026-10-07': ot },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(settledFirst.otHours, 2, 'OT after the shortfall is made up counts');
  const rejected = calcMonth(
    normalStaff,
    { '2026-10-05': fourHours, '2026-10-06': { ...ot, src: 'punch', otReview: { ok: false } } },
    null,
    [],
    '2026-10',
    null
  );
  assert.equal(rejected.otHoldHours, 0, 'OT rejected by Admin is not shown as held');
});

test('makeup ledger works in whole minutes so a settled month never keeps a tiny shortfall', async () => {
  const short1m = { kind: 'work', in: '08:01', out: '17:00' };
  const days = {
    '2026-10-01': { kind: 'unpaid' },
    '2026-10-02': { kind: 'unpaid' },
    '2026-10-03': { kind: 'unpaid' },
    '2026-10-05': short1m,
    '2026-10-06': short1m,
    '2026-10-07': short1m,
    '2026-10-08': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '', extraOut: '17:03' },
    '2026-10-09': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '', extraOut: '18:00' }
  };
  const month = calcMonth(normalStaff, days, null, [], '2026-10', null);
  assert.equal(month.debt, 0);
  assert.equal(month.overHours, 24);
  assert.equal(month.attendOk, false, 'three unpaid days lose the attendance allowance even with every minute made up');
  assert.equal(month.makeup, 1, 'no micro makeup row on the surplus day');
  assert.equal(month.makeupCredit, 1);
  assert.equal((await month.rows.at(-1)).makeupH, 0);
});

test('the 7/9 payroll start only labels the slip: days before it are still paid', () => {
  const work = { kind: 'work', in: '08:00', out: '17:00' };
  const m = calcMonth(normalStaff, { '2026-09-03': work, '2026-09-07': work }, null, [], '2026-09', null);
  assert.equal(m.count, 2);
});

test('enabling check-in never infers absences or changes salary estimated from the same manual schedule', () => {
  const days = { '2026-10-05': { kind: 'work', in: '08:00', out: '17:00' } };
  const staff = { ...normalStaff, startDate: '2026-10-01' };
  const previous = vm.runInContext('CHECKIN_FROM', sandbox);
  try {
    vm.runInContext('CHECKIN_FROM = null', sandbox);
    const withoutCheckin = calcMonth(staff, days, null, [], '2026-10', null);
    vm.runInContext('CHECKIN_FROM = "2026-10-01"', sandbox);
    const withCheckin = calcMonth(staff, days, null, [], '2026-10', null);
    assert.equal(withCheckin.noshow, 0, 'missing punches do not reduce an employee estimate');
    assert.equal(withCheckin.count, 1);
    closeTo(withCheckin.basePay, daily, 'the one self-entered normal day');
    assert.deepEqual(withCheckin, withoutCheckin);
    assert.deepEqual(days, { '2026-10-05': { kind: 'work', in: '08:00', out: '17:00' } });
  } finally {
    sandbox.previousCheckinFrom = previous;
    vm.runInContext('CHECKIN_FROM = previousCheckinFrom', sandbox);
    delete sandbox.previousCheckinFrom;
  }
});

// ---- Bảo hiểm bắt buộc & thuế TNCN (ước tính). Kỳ vọng tính từ TAX_RULES để test đứng vững khi thay tham số luật. ----
const month = (over?) => ({
  total: 0,
  nightHours: 0,
  otPay: 0,
  otHours: 0,
  holWorkPay: 0,
  holWorkHours: 0,
  advanceBase: 0,
  ...over
});
const bracketTax = (income?) => {
  let tax = 0,
    lower = 0;
  for (const [upper, rate] of TAX_RULES.brackets) {
    if (income > lower) tax += (Math.min(income, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
};
const insOf = (base?) => ['bhxh', 'bhyt', 'bhtn'].reduce((s, k) => s + Math.round(base * TAX_RULES.insurance[k]), 0);
const employerOf = (base?) =>
  Math.round(base * (TAX_RULES.employer.bhxh + TAX_RULES.employer.bhyt + TAX_RULES.employer.bhtn));

test('progressive tax is zero at zero, continuous at every bracket edge and matches a bracket-by-bracket sum', () => {
  assert.equal(progressiveTax(0), 0);
  assert.equal(progressiveTax(-5), 0);
  let prev = -1;
  for (const [upper] of TAX_RULES.brackets.filter(([u]: any) => Number.isFinite(u))) {
    for (const x of [upper - 1, upper, upper + 1]) {
      closeTo(progressiveTax(x), bracketTax(x), `tax at ${x}`);
      assert.ok(progressiveTax(x) > prev);
      prev = progressiveTax(x);
    }
  }
  closeTo(progressiveTax(250e6), bracketTax(250e6), 'top bracket');
});

test('long contract: insurance on base pay, family deductions, then progressive tax; every amount is whole đồng and net adds up', async () => {
  const staff = { type: 'nv', level: 1, contract: 'long', insured: true, dependants: 2 };
  const n = calcNet(staff, await month({ total: 40e6 + 0.4, advanceBase: daily * 10 }));
  assert.equal(n.gross, 40e6);
  assert.equal(n.insurance, insOf(6e6), 'employee insurance');
  assert.equal(n.bhxh, Math.round(6e6 * TAX_RULES.insurance.bhxh), 'BHXH part');
  assert.equal(n.employer, employerOf(6e6), 'employer share shown for reference');
  assert.equal(n.deduction, TAX_RULES.personal + 2 * TAX_RULES.dependant, 'family deduction');
  assert.equal(n.assessable, Math.max(0, 40e6 - n.insurance - n.deduction), 'assessable income');
  assert.equal(n.tax, Math.round(bracketTax(n.assessable)), 'progressive tax');
  assert.equal(n.advance, Math.round(TAX_RULES.advanceRate * daily * 10), 'advance for ten full working days');
  closeTo(n.advanceDays, 10, 'ten working days');
  assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance, 'net equals the displayed lines');
  for (const k of ['gross', 'exempt', 'taxable', 'bhxh', 'bhyt', 'bhtn', 'insurance', 'tax', 'advance', 'net'])
    assert.ok(Number.isInteger(n[k]), k);
  const low = calcNet(staff, await month({ total: 8e6 }));
  assert.equal(low.assessable, 0, 'income under the deductions is not taxed');
  assert.equal(low.tax, 0);
  assert.equal(calcNet({ ...staff, insured: false }, await month({ total: 8e6 })).employer, 0);
});

test('short contract: no insurance by default and a flat withholding from the threshold on rounded gross income', async () => {
  const staff = { type: 'tts', level: 6 };
  const below = calcNet(staff, await month({ total: TAX_RULES.casualThreshold - 1 }));
  assert.equal(below.contract, 'short');
  assert.equal(below.insured, false);
  assert.equal(below.insurance, 0);
  assert.equal(below.tax, 0);
  const at = calcNet(staff, await month({ total: TAX_RULES.casualThreshold - 1e-9 }));
  assert.equal(
    at.tax,
    Math.round(TAX_RULES.casualThreshold * TAX_RULES.casualRate),
    'float noise under the threshold still counts as the displayed threshold'
  );
  assert.equal(at.deduction, 0);
  const night = calcNet(staff, await month({ total: 6e6, nightHours: 20, otPay: 100000 }));
  assert.equal(
    night.tax,
    Math.round(6e6 * TAX_RULES.casualRate),
    'exempt night / OT pay does not reduce the flat withholding'
  );
  const insuredShort = calcNet({ ...staff, insured: true }, await month({ total: 3e6 }));
  assert.equal(insuredShort.insurance, insOf(5e6), 'Admin may still mark a short contract as insured');
  assert.equal(insuredShort.net, 3e6 - insuredShort.insurance - insuredShort.tax - insuredShort.advance);
});

test('contract and insurance defaults follow the staff group when the profile is not set', async () => {
  assert.equal(calcNet({ type: 'tts', level: 1 }, await month()).contract, 'short');
  for (const type of ['ctv', 'nv']) {
    const n = calcNet({ type, level: 1 }, await month());
    assert.equal(n.contract, 'long', type);
    assert.equal(n.insured, true, type);
  }
  assert.equal(calcNet({ type: 'nv', level: 1, insured: false }, await month()).insurance, 0);
});

test('night and overtime pay is exempt up to the legal minimum rates, lowers the tax and never exceeds gross income', async () => {
  const staff = { type: 'nv', level: 1, contract: 'long', insured: true, dependants: 0 };
  const m = await month({
    total: 30e6,
    nightHours: 10,
    otPay: hourly * 2 * 3,
    otHours: 3,
    holWorkPay: hourly * 3 * 4 + hourly * 0.6 * 2,
    holWorkHours: 4,
    holNightHours: 2
  });
  const n = calcNet(staff, m);
  assert.equal(
    n.exemptNight,
    Math.round(hourly * 10 * (1 + TAX_RULES.nightPremium)),
    'whole pay of night hours, up to the night premium'
  );
  const otCap = TAX_RULES.otNormalRate * hourly * 3,
    holCap = hourly * (TAX_RULES.holidayRate * 4 + TAX_RULES.holidayNightAdd * 2);
  assert.equal(
    n.exemptOt,
    Math.round(Math.min(m.otPay, otCap) + Math.min(m.holWorkPay, holCap)),
    'OT and holiday work exempt only up to the legal rates'
  );
  assert.ok(n.exemptOt < Math.round(m.otPay + m.holWorkPay), 'OT paid at 200% keeps the part above 150% taxable');
  assert.equal(n.taxable, 30e6 - n.exempt, 'taxable income');
  assert.equal(
    n.assessable,
    Math.max(0, n.taxable - n.insurance - n.deduction),
    'assessable starts from taxable, not gross'
  );
  assert.equal(n.tax, Math.round(bracketTax(n.assessable)));
  assert.ok(n.tax < calcNet(staff, await month({ total: 30e6 })).tax, 'exemptions lower the tax');
  assert.equal(
    calcNet(staff, await month({ total: 1000, otPay: 5000, otHours: 1 })).taxable,
    0,
    'exempt part is capped at gross'
  );
});

test('calcMonth feeds night hours outside holidays and the earned base of working days 1–15 into the net estimate', () => {
  const night = { kind: 'work', in: '22:00', out: '07:00' };
  const until = String(TAX_RULES.advanceUntil).padStart(2, '0'),
    after = String(TAX_RULES.advanceUntil + 1).padStart(2, '0');
  const days = {
    '2026-10-05': night,
    '2026-10-06': night,
    [`2026-10-${until}`]: { kind: 'work', in: '08:00', out: '12:00' },
    [`2026-10-${after}`]: { kind: 'work', in: '08:00', out: '17:00' }
  };
  const m = calcMonth({ ...normalStaff, contract: 'long', insured: true }, days, null, [], '2026-10', null);
  assert.equal(m.nightHours, 14, '22:00–02:00 and 03:00–06:00 worked on each night shift');
  closeTo(
    m.advanceBase,
    daily * 2 + daily / 2,
    'two full days plus half of the short day on the cutoff day; the day after is not counted'
  );
  closeTo(m.net.advanceDays, 2.5, 'advance counts earned working days');
  assert.equal(m.net.advance, Math.round(TAX_RULES.advanceRate * m.advanceBase));
  assert.equal(m.net.gross, Math.round(m.total), 'net estimate starts from the monthly total');
  const holiday = calcMonth(normalStaff, { '2026-10-06': night }, null, ['2026-10-07'], '2026-10', null);
  assert.equal(holiday.nightHours, 2, 'night hours falling on the holiday are already paid as holiday work');
});
test('Admin can switch off income tax, family deduction and advance per person', async () => {
  const staff = { type: 'nv', level: 1, contract: 'long', insured: true, dependants: 2 };
  const m = await month({ total: 40e6, advanceBase: daily * 10 });
  const on = calcNet(staff, m);
  assert.ok(on.tax > 0 && on.deduction > 0 && on.advance > 0);
  const noDeduct = calcNet({ ...staff, deductOn: false }, m);
  assert.equal(noDeduct.deduction, 0);
  assert.equal(
    noDeduct.assessable,
    40e6 - noDeduct.insurance,
    'without family deduction all income after insurance is assessable'
  );
  assert.ok(noDeduct.tax > on.tax);
  const forced = calcNet({ ...staff, taxOn: false }, m);
  assert.equal(forced.tax, on.tax, 'HĐLĐ từ 3 tháng: income tax cannot be switched off');
  assert.equal(forced.taxOn, true);
  const shortStaff = { type: 'nv', level: 1, contract: 'short', insured: false };
  assert.ok(calcNet(shortStaff, m).tax > 0);
  const noTax = calcNet({ ...shortStaff, taxOn: false }, m);
  assert.equal(noTax.tax, 0, 'HĐ dưới 3 tháng: Admin can switch the flat 10% off');
  assert.equal(noTax.net, noTax.gross - noTax.insurance - noTax.advance);
  assert.equal(
    calcNet({ type: 'tts', level: 6, taxOn: false }, await month({ total: 6e6 })).tax,
    0,
    'flat 10% can be switched off too'
  );
  const noAdvance = calcNet({ ...staff, advanceOn: false }, m);
  assert.equal(noAdvance.advance, 0);
  assert.equal(noAdvance.net, noAdvance.gross - noAdvance.insurance - noAdvance.tax);
});

test('progressive tax matches the shortcut formula of the 5-bracket schedule and the worked example', async () => {
  const shortcut = (x?) =>
    x <= 10e6
      ? x * 0.05
      : x <= 30e6
        ? x * 0.1 - 0.5e6
        : x <= 60e6
          ? x * 0.2 - 3.5e6
          : x <= 100e6
            ? x * 0.3 - 9.5e6
            : x * 0.35 - 14.5e6;
  for (const x of [0, 5e6, 10e6, 13.87e6, 30e6, 45e6, 60e6, 80e6, 100e6, 150e6])
    closeTo(progressiveTax(x), shortcut(x), String(x));
  const n = calcNet({ type: 'nv', level: 1, contract: 'long', insured: true }, await month({ total: 30e6 }));
  assert.equal(n.insurance, 630000, '6.000.000 × 10,5%');
  assert.equal(n.assessable, 13870000, '30tr − 630k − 15,5tr');
  assert.equal(n.tax, 887000, '13,87tr × 10% − 500k');
});

test('insurance is capped at 20 × the statutory base for each fund', async () => {
  const saved = { ...TAX_RULES.insuranceCap };
  try {
    Object.assign(TAX_RULES.insuranceCap, { bhxh: 1e6, bhyt: 2e6 });
    const n = calcNet({ type: 'nv', level: 1, contract: 'long', insured: true }, await month({ total: 30e6 }));
    assert.deepEqual([n.bhxh, n.bhyt, n.bhtn], [80000, 30000, 60000]);
    assert.equal(n.employer, Math.round(1e6 * 0.175 + 2e6 * 0.03 + 6e6 * 0.01));
  } finally {
    Object.assign(TAX_RULES.insuranceCap, saved);
  }
});

test('HĐLĐ từ 3 tháng: income tax arises only when taxable income minus insurance exceeds the personal deduction', async () => {
  const staff = { type: 'nv', level: 1, contract: 'long', insured: true, deductOn: false };
  const ins = calcNet(staff, await month({ total: 0 })).insurance;
  const at = calcNet(staff, await month({ total: TAX_RULES.personal + ins }));
  assert.equal(at.taxable - at.insurance, TAX_RULES.personal);
  assert.equal(at.taxDue, false);
  assert.equal(at.tax, 0, 'exactly at the threshold: no tax even with the family deduction switched off');
  const above = calcNet(staff, await month({ total: TAX_RULES.personal + ins + 1e6 }));
  assert.equal(above.taxDue, true);
  assert.equal(
    above.tax,
    Math.round(progressiveTax(above.assessable)),
    'above the threshold: progressive tax on the assessable income'
  );
  const exempt = calcNet(
    { ...staff, deductOn: true },
    await month({ total: TAX_RULES.personal + ins + 1e6, nightHours: 40 })
  );
  assert.ok(
    exempt.exempt > 1e6 && exempt.taxDue === false && exempt.tax === 0,
    'tax-exempt pay does not count towards the threshold'
  );
  const dependants = calcNet(
    { ...staff, deductOn: true, dependants: 1 },
    await month({ total: TAX_RULES.personal + ins + 1e6 })
  );
  assert.equal(dependants.taxDue, true);
  assert.equal(dependants.tax, 0, 'over the threshold but the dependant deduction leaves nothing assessable');
});
