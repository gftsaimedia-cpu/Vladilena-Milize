// Ngày làm bù của "Nghỉ, sẽ làm bù", giải trình Check-in/out.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');

const MONTH = '2026-10';
const putDays = async (days?) => await F.call('PUT', '/sheet', { who: 'an', body: { month: MONTH, days } });
const getDays = async () => (await F.call('GET', `/sheet?month=${MONTH}`, { who: 'an' })).data.days;

before(async () => {
  await F.start();
  await F.at('2026-10-14T12:00:00');
  await F.person('an');
  await F.person('admin', 'admin');
});
after(async () => {
  await F.stop();
});

test('willmakeup nhận nhiều ngày/khung giờ làm bù và tạo yêu cầu chờ Admin duyệt', async () => {
  const res = await putDays({
    '2026-10-06': {
      kind: 'willmakeup',
      makeupPlans: [
        { date: '2026-10-11', from: '08:00', to: '10:00' },
        { date: '2026-10-12', from: '17:00', to: '19:00' }
      ],
      punchNote: '  Việc gia đình  '
    },
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', punchNote: 'Quên Check-in' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const days = await getDays();
  assert.deepEqual(days['2026-10-06'].makeupPlans, [
    { date: '2026-10-11', from: '08:00', to: '10:00' },
    { date: '2026-10-12', from: '17:00', to: '19:00' }
  ]);
  assert.equal(days['2026-10-06'].punchNote, 'Việc gia đình');
  assert.equal(days['2026-10-07'].punchNote, 'Quên Check-in');
  const pending = (await F.call('GET', `/approvals?status=pending&month=${MONTH}`)).data.items.find(
    i => i.date === '2026-10-06'
  );
  assert.equal(pending.item, 'willmakeup');
  assert.deepEqual(pending.declared.makeupPlans, days['2026-10-06'].makeupPlans);
});

test('sửa lịch làm bù sau khi Admin duyệt thì yêu cầu được gửi duyệt lại', async () => {
  const pending = (await F.call('GET', `/approvals?status=pending&month=${MONTH}`)).data.items.find(
    i => i.date === '2026-10-06'
  );
  assert.ok(pending);
  const approved = await F.call('PUT', '/approvals/decide', {
    body: {
      action: 'approve',
      items: [{ username: 'an', date: pending.date, rev: pending.rev, fingerprint: pending.fingerprint }]
    }
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  const res = await putDays({
    '2026-10-06': {
      kind: 'willmakeup',
      makeupPlans: [{ date: '2026-10-11', from: '08:00', to: '11:00' }]
    }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const again = (await F.call('GET', `/approvals?status=pending&month=${MONTH}`)).data.items.find(
    i => i.date === '2026-10-06'
  );
  assert.equal(again.status, 'pending');
  assert.equal(again.rev, pending.rev + 2); // quyết định duyệt và sửa lịch mỗi việc tăng rev một lần
});

test('lịch làm bù không bị chặn: ngoài tháng, trùng ngày, qua đêm, để trống đều nhận (Admin quyết định khi duyệt)', async () => {
  const cases = [
    [{ date: '2026-11-02', from: '08:00', to: '10:00' }],
    [{ date: '2026-10-06', from: '08:00', to: '10:00' }],
    [{ date: '2026-10-11', from: '22:00', to: '07:00' }],
    [{ date: '2026-10-11', from: '10:00', to: '10:00' }],
    [
      { date: '2026-10-11', from: '08:00', to: '10:00' },
      { date: '2026-10-11', from: '11:00', to: '12:00' }
    ]
  ];
  for (const makeupPlans of cases)
    assert.equal((await putDays({ '2026-10-06': { kind: 'willmakeup', makeupPlans } })).status, 200);
  assert.equal((await putDays({ '2026-10-06': { kind: 'willmakeup' } })).status, 200);
  const long = 'x'.repeat(301);
  assert.equal((await putDays({ '2026-10-06': { kind: 'unpaid', punchNote: long } })).status, 400);
});
