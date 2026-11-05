// Phần nền của DB demo (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md): ngày theo giờ Việt Nam,
// quy ước tên người theo mảng và định dạng file tài khoản. Không cần PostgreSQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, datesOf, demoMonths, todayVN, weekday } from '../../scripts/demo/dates';
import { checkPeople, PEOPLE } from '../../scripts/demo/people';
import { formatAccounts, parseAccounts } from '../../scripts/demo/accounts-format';

test('todayVN rolls over to the next day at 17:00 UTC', () => {
  assert.equal(todayVN(new Date('2026-11-05T16:59:00Z')), '2026-11-05');
  assert.equal(todayVN(new Date('2026-11-05T17:00:00Z')), '2026-11-06');
});

test('demoMonths gives this month and the two before it, across a year boundary', () => {
  assert.deepEqual(demoMonths('2027-01-15'), { today: '2027-01-15', m0: '2027-01', m1: '2026-12', m2: '2026-11' });
  assert.equal(addMonths('2026-11', 2), '2027-01');
});

test('datesOf lists a whole month, or stops at a given day', () => {
  assert.equal(datesOf('2026-02').length, 28);
  assert.deepEqual(datesOf('2026-11', '2026-11-03'), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.equal(weekday('2026-11-01'), 0); // Chủ nhật
});

test('every demo person has a unique username with the prefix of their area', () => {
  assert.doesNotThrow(() => checkPeople(PEOPLE));
  const smoke = PEOPLE.find(p => p.area === 'smoke');
  assert.ok(smoke, 'phần nền có ít nhất một người để thử đăng nhập');
  assert.throws(() => checkPeople([{ ...smoke, username: 'cc-x' }]), /tiền tố/);
  assert.throws(() => checkPeople([smoke, smoke]), /trùng/);
});

test('the accounts file round-trips and rejects a file with a missing key', () => {
  const accounts = { adminUser: 'admin', adminPassword: 'A1', staffPassword: 'S1', sessionSecret: 'K1' };
  assert.deepEqual(parseAccounts(formatAccounts(accounts)), accounts);
  assert.throws(() => parseAccounts('DEMO_ADMIN_USER=admin\n'), /DEMO_ADMIN_PASSWORD/);
});
