'use strict';
// Sổ phép năm theo từng năm dương lịch:
//   - số cộng tay của Admin nằm trong quỹ phép của năm vào làm (hoặc năm leave.expiry.fromYear nếu muộn hơn) và hết hạn cuối tháng 1 năm sau;
//   - người vào làm 05/01/2026 ở tháng 09/2027 chỉ còn phép cộng theo tháng của quỹ 2027: 20 tháng tròn − 11 tháng của 2026 = 9 ngày;
//   - người vào làm 01/01/2027 có số cộng tay trong quỹ 2027 nên cùng tháng đó còn 30 ngày cộng tay cộng phép theo tháng.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Leave = require('../../src/engine/leave');

const { F, store } = P;
const MONTH = '2027-09';
const END = '2027-09-30';

before(F.start);
after(F.stop);

const remaining = async (username?) => {
  const led = Leave.ledger(await store.getStaff(username), [], END);
  return { ...led, left: led.total - led.expired };
};

test('Vào làm 05/01/2026: số cộng tay thuộc quỹ 2026 và hết hạn 31/01/2027, quỹ 2027 chỉ có phép cộng theo tháng', async () => {
  await P.seed(MONTH);
  const led = await remaining('qa_ctv1');
  assert.deepEqual(
    led.settled.map(x => [x.year, x.on]),
    [[2026, '2027-01-31']]
  );
  assert.equal(led.left, 9);
});

test('Vào làm 01/01/2027: số cộng tay thuộc quỹ 2027, không có phép hết hạn', async () => {
  await P.seed(MONTH, { startDate: '2027-01-01' });
  const led = await remaining('qa_ctv1');
  assert.equal(led.expired, 0);
  assert.equal(led.settled.length, 0);
  assert.equal(led.left, 30 + 8);
});
