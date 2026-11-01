const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPayroll } = require('../helpers/payroll-vm');
const {
  api: { calcDay, calcMonth, extraNightMsg }
} = loadPayroll({ exports: ['calcDay', 'calcMonth', 'extraNightMsg'], exportAs: 'api' });
const staff = { type: 'ctv', level: 1, startDate: '2026-10-15' };
const close = (actual?, expected?) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test('automatic holiday pay excludes dates before employment begins', () => {
  const m = calcMonth(staff, {}, null, ['2026-10-01'], '2026-10', null);
  close(m.total, 0);
  assert.equal(m.holiday, 0);
  assert.equal(m.rows.length, 0);
});

test('employment start is inclusive for holiday pay and prior months stay empty', () => {
  const m = calcMonth(staff, {}, null, ['2026-09-02', '2026-10-15'], '2026-10', null);
  close(m.total, 230769.23076923078);
  assert.deepEqual(
    Array.from(m.rows as any[], r => r.date),
    ['2026-10-15']
  );
  close(calcMonth(staff, {}, null, ['2026-09-02'], '2026-09', null).total, 0);
});

test('explicit holiday row before employment cannot grant automatic holiday base', () => {
  const d = calcDay(staff, {}, true, 0, { date: '2026-10-01', holidays: ['2026-10-01'] });
  close(d.total, 0);
  assert.equal(d.paidOff, false);
});

test('shift crossing employment start grants the eligible next-day holiday base only once', () => {
  const days = { '2026-10-14': { kind: 'work', in: '22:00', out: '07:00' } };
  const m = calcMonth(staff, days, null, ['2026-10-14', '2026-10-15'], '2026-10', null);
  close(m.rows.find(r => r.date === '2026-10-14').holBase, 0);
  close(m.rows.find(r => r.date === '2026-10-15').holBase, 230769.23076923078);
});

test('unknown start date preserves estimates without inventing employment information', () => {
  close(calcMonth({ type: 'ctv', level: 1 }, {}, null, ['2026-10-01'], '2026-10', null).total, 230769.23076923078);
});

test('zero-work holiday night reconciles components while retaining existing daily entitlement', () => {
  const m = calcMonth(
    { type: 'ctv', level: 1 },
    { '2026-10-06': { kind: 'work', in: '22:00', out: '07:00', breakMin: 480 } },
    null,
    ['2026-10-06'],
    '2026-10',
    null
  );
  close(m.total, 337500);
  close(m.basePay + m.bonus + m.breakPay + m.makeupPay + m.otPay + m.holWorkPay + m.allow + m.kpiPay, m.total);
  close(m.bonus, 69230.76923076923);
  close(m.off, 230769.23076923078);
  close(m.holWorkHours, 0);
  assert.equal(m.holWorkDays, 0);
});

test('normal night shifts are not flagged by the extra-hours night validation', () => {
  assert.equal(extraNightMsg({ kind: 'work', in: '22:00', out: '07:00' }), '');
});
