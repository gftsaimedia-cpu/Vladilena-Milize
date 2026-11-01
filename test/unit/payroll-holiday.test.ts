const { test } = require('node:test');
const assert = require('node:assert/strict');
// Giờ làm ngày lễ là OT nên không có giờ nghỉ: mọi phút có mặt trong ngày lễ (kể cả phút nằm trong giờ nghỉ của ca) là phút làm ngày lễ.
const Engine = require('../../src/engine/payroll-engine');
const Calendar = require('../../src/engine/payroll-calendar');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const engine = Engine.create(DEFAULTS);
const PayrollCalendar = Calendar.create(DEFAULTS);
const calcDay = (...args) => engine.calcDay(...args);
const calcMonth = (...args) => engine.calcMonth(...args);
const staff = { type: 'ctv', level: 1 };
const close = (actual?, expected?) => assert.ok(Math.abs(actual - expected) < 1.5, `${actual} != ${expected}`); // tổng là cộng các dòng nguyên đồng
const work = (tin = '22:00', tout = '07:00', extra: any = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });

test('holiday to normal pays the two holiday hours before midnight, without duplicate bonus', () => {
  const m = calcMonth(staff, { '2026-10-06': work() }, null, ['2026-10-06'], '2026-10', null);
  close(m.holWorkHours, 2);
  close(m.basePay, 403846.1538461539);
  close(m.total, 718269.2307692309);
  assert.equal(m.count, 1);
});
test('manual unlocated breaks are proportionally allocated without manufacturing holiday hours', () => {
  const d = calcDay(staff, work('22:00', '07:00', { breakMin: 60 }), false, 0, {
    date: '2026-10-06',
    holidays: ['2026-10-07']
  });
  close(d.hours, 7);
  close(d.holWorkH, 6.2222222222);
  close(d.holNightH, 5.3333333333);
  close(d.short, 1);
});
test('invalid calendar dates and foreign months cannot contribute to a monthly estimate', () => {
  const m = calcMonth(
    staff,
    { '2026-02-30': work('08:00', '17:00'), '2026-03-02': work('08:00', '17:00') },
    null,
    ['2026-02-31'],
    '2026-02',
    null
  );
  assert.equal(m.rows.length, 0);
  close(m.total, 0);
  assert.equal(calcMonth(staff, { '2026-10-06': work() }, null, [], '2026-13', null).rows.length, 0);
});
test('shared splitter counts every holiday minute (no one-workday cap, break included) and rejects impossible dates', () => {
  assert.ok(PayrollCalendar, 'shared calendar helper exists');
  const split = PayrollCalendar.splitMainWork(work('00:00', '15:00'), '2026-10-07', ['2026-10-07']);
  close(split.holidayH, 15);
  close(split.holidayNightH, 6);
  close(split.holidayBreakH, 1);
  close(PayrollCalendar.splitMainWork(work(), '2026-02-30', []).normalH, 0);
});
