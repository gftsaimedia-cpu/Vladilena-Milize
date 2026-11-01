'use strict';
// Loại ngày 'makeup' cũ (Làm bù cả ngày) trong bộ máy: không tiền, không ngày công, không giờ làm bù, không bù giờ thiếu.
// Giờ làm bù khai ở ngày đi làm (kind 'work' + extraKind 'makeup') vẫn được trả như trước.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const E = Engine.create(DEFAULTS);
const NV = { username: 'qa_nv', type: 'nv', level: 1, shiftCode: 'n1', startDate: '2025-01-06' };
const MONTH = '2026-10';
const SAT = '2026-10-10'; // trong lịch NV (T2–T7)
const SHORT = '2026-10-05'; // thứ Hai, thiếu 4 giờ
const work = (more: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', ...more });
const month = (days?) => E.calcMonth(NV, days, null, [], MONTH, null, undefined, '2026-11-02T12:00:00+07:00');

test('engine version is payroll-engine-14', () => {
  assert.equal(Engine.ENGINE_VERSION, 'payroll-engine-14');
});

test('calcDay: a legacy make-up day pays nothing and carries no make-up hours', () => {
  const c = E.calcDay(NV, { kind: 'makeup', in: '08:00', out: '17:00' }, false, 8, { date: SAT, holidays: [] });
  assert.equal(c.kind, 'makeup');
  assert.equal(c.total, 0);
  assert.equal(c.paidOff, false);
  assert.equal(c.makeupH || 0, 0);
  assert.equal(c.makeupPay || 0, 0);
});

test('calcMonth: a legacy make-up day adds no workday, no pay and does not repay owed hours', async () => {
  const base = { [SHORT]: work({ out: '13:00' }) };
  const without = await month(base);
  const withLegacy = await month({ ...base, [SAT]: { kind: 'makeup', in: '08:00', out: '17:00' } });
  assert.equal(withLegacy.count, without.count);
  assert.equal(withLegacy.work, without.work);
  assert.equal(withLegacy.makeup, 0);
  assert.equal(withLegacy.makeupHours, 0);
  assert.equal(withLegacy.makeupPay, 0);
  assert.equal(withLegacy.debt, without.debt);
  assert.equal(withLegacy.debt, 4);
  const row = withLegacy.rows.find(r => r.date === SAT);
  assert.equal(row.total, 0);
});

test('calcMonth: make-up hours declared on a work day still repay owed hours', async () => {
  const days = { [SHORT]: work({ out: '13:00' }), [SAT]: work({ extraKind: 'makeup', extraOut: '21:00' }) };
  const m = await month(days);
  assert.equal(m.makeupHours, 4);
  assert.equal(m.debt, 0);
  assert.ok(m.makeupPay > 0);
  assert.equal(m.rows.find(r => r.date === SAT).kind, 'work');
});
