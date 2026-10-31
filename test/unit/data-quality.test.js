const test = require('node:test');
const assert = require('node:assert/strict');
const quality = require('../../lib/data-quality.js');
const person = (username, extra = {}) => ({
  username,
  name: username,
  role: 'staff',
  type: 'nv',
  startDate: '2026-10-01',
  leaveAdjust: 0,
  ...extra
});
const check = (staff, sheets = [], holidays = [], approvals) =>
  quality.evaluate({ staff, sheets, holidays, today: '2026-10-07', ...(approvals ? { approvals } : {}) });

test('missing employment dates are flagged only for staff eligible for annual leave', () => {
  const result = check([
    person('ctv', { type: 'ctv', startDate: null }),
    person('nv', { startDate: '' }),
    person('tts', { type: 'tts', startDate: null }),
    person('admin', { role: 'admin', startDate: null })
  ]);
  assert.deepEqual(
    result.issues.map(i => [i.code, i.username]),
    [
      ['missing-start-date', 'ctv'],
      ['missing-start-date', 'nv']
    ]
  );
  assert.equal(result.asOf, '2026-10-07');
});

test('invalid historical start dates are reported without entering the accrual loop', () => {
  const result = check([person('a', { startDate: 'bad-date' })]);
  assert.equal(result.issues[0].code, 'missing-start-date');
});
