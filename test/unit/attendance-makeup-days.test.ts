'use strict';
// Ngày nghỉ xét chuyên cần: mỗi ngày iSAT đã nghỉ tính một ngày; ngày "Nghỉ, sẽ làm bù" chỉ tính theo giờ bù còn thiếu cuối kỳ (làm tròn lên theo giờ mỗi công).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const E = Engine.create(DEFAULTS);
const NV = { username: 'qa_nv', type: 'nv', level: 1, shiftCode: 'n1', startDate: '2025-01-06' };
const month = (days?) => E.calcMonth(NV, days, null, [], '2026-10', null, undefined, '2026-11-02T12:00:00+07:00');
const will = { kind: 'willmakeup' };
const makeup4 = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '21:00' };
const FULL = 230769.23076923078; // phụ cấp chuyên cần nguyên (chưa bị cắt theo giờ vượt)

const OWNER = {
  '2026-10-03': { kind: 'isat' },
  '2026-10-05': will,
  '2026-10-14': { kind: 'unpaid' },
  '2026-10-20': will
};
const madeUp = (dates?) => Object.fromEntries(dates.map(date => [date, makeup4]));

test('owner month: iSAT + unpaid + 2 willmakeup days fully made up counts iSAT and unpaid days and keeps chuyên cần', async () => {
  const m = await month({ ...OWNER, ...madeUp(['2026-10-06', '2026-10-07', '2026-10-30', '2026-10-31']) });
  assert.equal(m.makeupNeed, 16);
  assert.equal(m.makeupDeclared, 16);
  assert.equal(m.debt, 0);
  assert.equal(m.willmakeup, 2);
  assert.equal(m.absent, 2);
  assert.equal(m.attendOk, true);
  assert.equal(m.overHours, 8);
  assert.equal(m.attendance, Math.round(FULL));
});

test('make-up 12 h of 16 leaves 4 h owed: one willmakeup day still counts, chuyên cần lost', async () => {
  const m = await month({ ...OWNER, ...madeUp(['2026-10-06', '2026-10-07', '2026-10-30']) });
  assert.equal(m.debt, 4);
  assert.equal(m.absent, 3);
  assert.equal(m.attendOk, false);
  assert.equal(m.attendance, 0);
});

test('three willmakeup days with no make-up all count and chuyên cần is lost', async () => {
  const m = await month({ '2026-10-05': will, '2026-10-20': will, '2026-10-21': will });
  assert.equal(m.debt, 24);
  assert.equal(m.absent, 3);
  assert.equal(m.attendOk, false);
  assert.equal(m.attendance, 0);
});

test('one unpaid + two willmakeup with 8 h made: the unpaid day and one willmakeup day count, chuyên cần kept', async () => {
  const m = await month({
    '2026-10-05': will,
    '2026-10-14': { kind: 'unpaid' },
    '2026-10-20': will,
    ...madeUp(['2026-10-06', '2026-10-07'])
  });
  assert.equal(m.debt, 8);
  assert.equal(m.absent, 2);
  assert.equal(m.attendOk, true);
});

test('iSAT + one unpaid + two willmakeup with 8 h made: iSAT, unpaid and one willmakeup day count, chuyên cần lost', async () => {
  const m = await month({
    '2026-10-03': { kind: 'isat' },
    '2026-10-05': will,
    '2026-10-14': { kind: 'unpaid' },
    '2026-10-20': will,
    ...madeUp(['2026-10-06', '2026-10-07'])
  });
  assert.equal(m.absent, 3);
  assert.equal(m.attendOk, false);
});

test('no iSAT, one unpaid + two willmakeup fully made up: one day counts, chuyên cần kept', async () => {
  const m = await month({
    '2026-10-05': will,
    '2026-10-14': { kind: 'unpaid' },
    '2026-10-20': will,
    ...madeUp(['2026-10-06', '2026-10-07', '2026-10-30', '2026-10-31'])
  });
  assert.equal(m.debt, 0);
  assert.equal(m.absent, 1);
  assert.equal(m.attendOk, true);
});

test('iSAT plus two unpaid days: three days count and chuyên cần is lost', async () => {
  const m = await month({
    '2026-10-03': { kind: 'isat' },
    '2026-10-14': { kind: 'unpaid' },
    '2026-10-15': { kind: 'unpaid' }
  });
  assert.equal(m.absent, 3);
  assert.equal(m.attendOk, false);
});

test('each iSAT day counts once and adds no overHours', async () => {
  const one = await month({ '2026-10-03': { kind: 'isat' } });
  const two = await month({ '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' } });
  assert.equal(one.absent, 1);
  assert.equal(two.absent, 2);
  assert.equal(two.overHours, 0);
});

test('owed hours never count more willmakeup days than the month has', async () => {
  const m = await month({ '2026-10-05': will, '2026-10-20': { kind: 'unpaid' } });
  assert.equal(m.debt, 8);
  assert.equal(m.absent, 2);
});

test('made-up days count as worked days and leave make-up pay and overHours unchanged', async () => {
  const withMakeup = await month({ ...OWNER, ...madeUp(['2026-10-06', '2026-10-07', '2026-10-30', '2026-10-31']) });
  const noMakeup = await month(OWNER);
  assert.equal(withMakeup.count, noMakeup.count + 4);
  assert.ok(withMakeup.makeupPay > 0);
  assert.equal(withMakeup.overHours, 8);
  assert.equal(noMakeup.overHours, 24);
});
