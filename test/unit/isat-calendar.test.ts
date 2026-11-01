const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPayroll } = require('../helpers/payroll-vm');

const {
  api: { calcDay, calcMonth }
} = loadPayroll({ exports: ['calcDay', 'calcMonth'], exportAs: 'api' });
const staff = { type: 'nv', level: 1 };
const close = (actual?, expected?) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
const month = (who?, days?, holidays: any[] = []) => calcMonth(who, days, null, holidays, '2026-10', null);

// Removing either the Saturday guard or the role guard must expose an unearned payment.
test('legacy iSAT on any non-Saturday pays nothing', () => {
  for (const date of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
    const day = calcDay(staff, { kind: 'isat' }, false, 0, { date, holidays: [] });
    assert.equal(day.total, 0, date);
    assert.equal(day.paidOff, false, date);
    assert.equal(day.hours, 0, date);
  }
});

test('legacy weekday iSAT does not count as paid leave or earn monthly allowances', async () => {
  const result = await month(staff, { '2026-10-05': { kind: 'isat', in: '08:00', out: '17:00' } });
  for (const key of [
    'total',
    'work',
    'basePay',
    'off',
    'isat',
    'count',
    'bonus',
    'allow',
    'travel',
    'attendance',
    'debt'
  ]) {
    assert.equal(result[key], 0, key);
  }
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].paidOff, false);
});

test('eligible NV Saturday iSAT pays only the base daily salary for each level', async () => {
  for (const [level, expected] of [
    [1, 230769.23076923078],
    [2, 250000],
    [3, 269230.76923076925],
    [4, 288461.53846153844]
  ]) {
    const result = await month({ type: 'nv', level }, { '2026-10-03': { kind: 'isat' } });
    close(result.total, expected);
    close(result.basePay, expected);
    assert.equal(result.isat, 1);
    assert.equal(result.rows[0].paidOff, true);
    assert.equal(result.count, 0);
    assert.equal(result.allow, 0);
    assert.equal(result.bonus, 0);
  }
});

test('legacy Saturday iSAT for TTS or CTV is not paid or counted as paid leave', async () => {
  for (const type of ['tts', 'ctv']) {
    const result = await month({ type, level: 1 }, { '2026-10-03': { kind: 'isat' } });
    assert.equal(result.total, 0, type);
    assert.equal(result.isat, 0, type);
    assert.equal(result.rows[0].paidOff, false, type);
  }
});

test('iSAT without a valid calendar date cannot earn a payment', () => {
  for (const date of [undefined, '', '2026-02-30']) {
    const result = calcDay(staff, { kind: 'isat' }, false, 0, date === undefined ? undefined : { date, holidays: [] });
    assert.equal(result.total, 0);
    assert.equal(result.paidOff, false);
  }
});

test('invalid legacy iSAT does not change earnings from valid work and Saturday iSAT', async () => {
  const result = await month(staff, {
    '2026-10-03': { kind: 'isat' },
    '2026-10-05': { kind: 'isat' },
    '2026-10-06': { kind: 'work', in: '08:00', out: '17:00' }
  });
  // One workday + one paid Saturday = 2 * 6m / 26; workday allowances = 40% * 6m / 26.
  close(result.total, 553846.1538461539);
  close(result.basePay, 461538.46153846156);
  close(result.allow, 92307.69230769231);
  assert.equal(result.count, 1);
  assert.equal(result.isat, 1);
});

test('holiday entitlement remains payable once even if the saved kind is iSAT', async () => {
  const result = await month(staff, { '2026-10-05': { kind: 'isat' } }, ['2026-10-05']);
  close(result.total, 230769.23076923078);
  assert.equal(result.holiday, 1);
  assert.equal(result.isat, 0);
  assert.equal(result.rows[0].kind, 'holiday');
});
