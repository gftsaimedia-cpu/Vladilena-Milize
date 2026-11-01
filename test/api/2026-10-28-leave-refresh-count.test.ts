'use strict';
// "Cập nhật số phép" (Admin › Chấm công › Phép còn lại): thông báo đếm người có tài khoản phép (accounts),
// không đếm mọi hồ sơ đã xét. checked giữ nguyên để tương thích.
process.env.REORG_FROM_MONTH = '2026-11'; // cách tính theo REORG_FROM_MONTH áp từ tháng của đồng hồ giả
const F = require('../helpers/api-fixture');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.person('admin', 'admin', { payrollSubject: false });
  await F.person('qa_nv', 'staff');
  await F.person('qa_nv2', 'staff');
  await F.person('qa_moi', 'staff', { startDate: null }); // chưa có ngày vào làm: không có tài khoản phép
});

test('POST /leave/refresh: accounts chỉ đếm người có tài khoản phép, checked vẫn đếm mọi hồ sơ', async () => {
  const people = await F.store.listStaff();
  const withAccount: any[] = [];
  for (const s of people) {
    const ledger = await F.call('GET', `/leave/ledger?user=${s.username}`);
    assert.equal(ledger.status, 200, JSON.stringify(ledger.data));
    if (ledger.data.hasAccount) withAccount.push(s.username);
  }
  assert.ok(withAccount.includes('qa_nv') && withAccount.includes('qa_nv2'));
  assert.ok(!withAccount.includes('admin') && !withAccount.includes('qa_moi'));

  const all = await F.call('POST', '/leave/refresh', { body: {} });
  assert.equal(all.status, 200, JSON.stringify(all.data));
  assert.equal(all.data.failed, 0);
  assert.equal(all.data.checked, people.length);
  assert.equal(all.data.accounts, withAccount.length);
  assert.ok(all.data.accounts < all.data.checked);
});

test('POST /leave/refresh { user }: accounts là 1 khi người đó có tài khoản phép, 0 khi không', async () => {
  const yes = await F.call('POST', '/leave/refresh', { body: { user: 'qa_nv' } });
  assert.equal(yes.status, 200, JSON.stringify(yes.data));
  assert.deepEqual([yes.data.checked, yes.data.accounts], [1, 1]);
  const no = await F.call('POST', '/leave/refresh', { body: { user: 'qa_moi' } });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.deepEqual([no.data.checked, no.data.accounts, no.data.balance], [1, 0, null]);
});
