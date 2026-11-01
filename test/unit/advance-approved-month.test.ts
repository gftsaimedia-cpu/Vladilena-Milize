'use strict';
// Tạm ứng của tháng: chỉ có số khi Admin đã duyệt (extra.advance === true); số = advance.rate × lương cơ bản thực nhận của các ngày công từ ngày 1 đến advance.untilDay.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { legacyParams } = require('../helpers/legacy-params');

const engine = PayrollEngine.create(legacyParams());
const DAILY = 6000000 / 26;
const nv = { type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1', contract: 'long', insured: true, dependants: 1 };
const DAYS = {
  '2026-09-07': { kind: 'work', in: '08:00', out: '17:00' },
  '2026-09-08': { kind: 'work', in: '22:00', out: '07:00' }
};
const calc = (extra?) => engine.calcMonth(nv, DAYS, null, [], '2026-09', null, undefined, undefined, extra);

test('Tạm ứng: chưa duyệt thì 0 dù có hai công trong 15 ngày đầu', () => {
  const n = calc({}).net;
  assert.equal(n.advanceDays, 2);
  assert.equal(n.advance, 0);
});

test('Tạm ứng: đã duyệt thì bằng advance.rate × 2 công × lương ngày, và thực nhận trừ đúng số đó', () => {
  const n = calc({ advance: true }).net;
  assert.equal(n.advance, Math.round(DEFAULTS['advance.rate'] * 2 * DAILY));
  assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance);
});
