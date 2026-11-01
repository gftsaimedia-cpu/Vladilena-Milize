'use strict';
// Admin khai thay "Nghỉ, sẽ làm bù" kèm lịch làm bù dự kiến như màn nhân viên, và bỏ qua bước duyệt
// (máy chủ duyệt luôn qua src/domain/sheet-on-behalf.ts → approveOnBehalf). Nhân sự tự khai thì chờ duyệt.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

async function setup() {
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2026-11-02T09:00:00');
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const username of ['qa_nv1', 'qa_nv3'])
    await F.person(username, 'staff', {
      type: 'nv',
      level: 1,
      shiftCode: 'n1',
      startDate: '2026-01-05',
      leaveAdjust: 30
    });
}
const put = async (who?, body?) => await F.call('PUT', '/sheet', { who, body });
const rowOf = async (username?, date?) => await store.approvals.get(username, date);

test('Admin khai thay "Nghỉ, sẽ làm bù" kèm lịch làm bù dự kiến: lưu đúng lịch, khoản được Admin duyệt luôn', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1, d2] = P.dowDates(M, 1);
  const makeupPlans = [
    { date: d1, from: '08:00', to: '12:00' },
    { date: '', from: '', to: '' } // dòng trống: máy chủ bỏ đi
  ];
  const read = await F.call('GET', `/sheet?month=${M}&user=qa_nv1`, { who: 'admin' });
  assert.equal(read.status, 200, JSON.stringify(read.data));
  const res = await put('admin', {
    month: M,
    user: 'qa_nv1',
    expectedRev: read.data.rev,
    days: { [d0]: { kind: 'willmakeup', makeupPlans } }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.onBehalf, true);
  assert.deepEqual((await store.getSheet('qa_nv1', M)).days[d0].makeupPlans, [
    { date: d1, from: '08:00', to: '12:00' }
  ]);
  const row = await rowOf('qa_nv1', d0);
  assert.equal(row.item, 'willmakeup');
  assert.equal(row.status, 'approved');
  assert.equal(row.decidedBy, 'admin');
  assert.match(row.note, /Admin khai thay/);
  assert.equal(res.data.approvals[d0].status, 'approved');
  assert.equal((await store.approvals.list({ status: 'pending', username: 'qa_nv1' })).length, 0);

  // Đổi riêng lịch làm bù dự kiến (dấu vân tay đổi) thì khoản vẫn được duyệt luôn, không về chờ
  const again = await put('admin', {
    month: M,
    user: 'qa_nv1',
    expectedRev: res.data.rev,
    days: { [d0]: { kind: 'willmakeup', makeupPlans: [{ date: d2, from: '13:00', to: '17:00' }] } }
  });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.deepEqual((await store.getSheet('qa_nv1', M)).days[d0].makeupPlans, [
    { date: d2, from: '13:00', to: '17:00' }
  ]);
  const after = await rowOf('qa_nv1', d0);
  assert.equal(after.status, 'approved');
  assert.equal(after.decidedBy, 'admin');
  assert.ok(after.rev > row.rev, 'dòng duyệt đã được khai lại rồi duyệt lại');
  assert.ok(after.fingerprint !== row.fingerprint);

  // expectedRev cũ (lịch vừa có người lưu) → 409, không ghi gì
  const stale = await put('admin', {
    month: M,
    user: 'qa_nv1',
    expectedRev: read.data.rev,
    days: { [d0]: { kind: 'willmakeup', makeupPlans } }
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.deepEqual((await store.getSheet('qa_nv1', M)).days[d0].makeupPlans, [
    { date: d2, from: '13:00', to: '17:00' }
  ]);
});

test('Đối chứng: nhân sự tự khai "Nghỉ, sẽ làm bù" kèm lịch làm bù thì vẫn chờ Admin duyệt', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1] = P.dowDates(M, 1);
  const res = await put('qa_nv3', {
    month: M,
    days: { [d0]: { kind: 'willmakeup', makeupPlans: [{ date: d1, from: '08:00', to: '12:00' }] } }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(!res.data.onBehalf);
  assert.deepEqual((await store.getSheet('qa_nv3', M)).days[d0].makeupPlans, [
    { date: d1, from: '08:00', to: '12:00' }
  ]);
  const row = await rowOf('qa_nv3', d0);
  assert.equal(row.item, 'willmakeup');
  assert.equal(row.status, 'pending');
  assert.equal(row.decidedBy, null);
});
