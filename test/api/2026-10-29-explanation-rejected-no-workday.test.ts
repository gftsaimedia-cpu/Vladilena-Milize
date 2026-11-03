'use strict';
// Giải trình bị từ chối thì ngày đó không tính công (0 đồng, không vào ngày công, vào nghỉ không lương), kể cả khi ngày đã chấm đủ giờ hoặc
// Admin đã khai thay giờ; giải trình chưa quyết định chỉ giữ ngày chưa có lượt Admin. Nhãn của lượt trong ngày bị từ chối là "Bị từ chối".
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');

const { MONTH } = X;
const dayRows = async (username?, date?) =>
  (await F.call('GET', `/attendance?month=${MONTH}`, { who: 'admin' })).data.rows.filter(
    s => s.username === username && s.date === date
  );

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['an', 'binh', 'cuong', 'dung']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Ngày chấm đủ giờ mà giải trình bị từ chối: 0 đồng, không vào ngày công, vào nghỉ không lương; đổi ý duyệt thì tính lại', async () => {
  await X.fullDay('an', '2026-10-19', '08:00', '17:00', 'rj-an');
  assert.equal((await X.payOf('an')).m.count, 1);
  const item = await X.askAndAnswer('an', '2026-10-19');
  assert.equal((await X.payOf('an')).payDays['2026-10-19'].kind, 'unpaid'); // chờ duyệt: giữ

  const no = await X.decide(item.id, false);
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.equal(no.data.item.status, 'rejected');
  const rejected = await X.payOf('an');
  assert.equal(rejected.payDays['2026-10-19'].kind, 'unpaid');
  assert.equal(rejected.m.count, 0);
  assert.equal(rejected.m.unpaid, 1);
  assert.equal(rejected.m.trace.tienNgayCong, 0);

  assert.equal((await X.decide(item.id, true)).status, 200); // đổi ý
  const approved = await X.payOf('an');
  assert.equal(approved.payDays['2026-10-19'].kind, 'work');
  assert.equal(approved.m.count, 1);
});

test('Từ chối thắng lượt Admin khai thay tay; chưa quyết định thì lượt Admin khai thay vẫn được trả', async () => {
  await X.declareOnBehalf('binh', ['2026-10-20', '2026-10-21']);
  const waiting = await X.askAndAnswer('binh', '2026-10-20');
  assert.equal((await X.payOf('binh')).payDays['2026-10-20'].kind, 'work'); // chờ: giờ Admin khai thắng
  assert.equal((await X.payOf('binh')).m.count, 2);

  assert.equal((await X.decide(waiting.id, false)).status, 200);
  const rejected = await X.payOf('binh');
  assert.equal(rejected.payDays['2026-10-20'].kind, 'unpaid'); // từ chối: ngày không tính công dù có lượt Admin
  assert.equal(rejected.payDays['2026-10-21'].kind, 'work'); // ngày khác không đổi
  assert.equal(rejected.m.count, 1);

  // nhãn của lượt Admin trong ngày bị từ chối là "Bị từ chối", ngày khác vẫn là "Đã chấm công"
  const rows = await dayRows('binh', '2026-10-20');
  assert.deepEqual(
    rows.map(s => [s.status, s.statusNote]),
    [['rejected', 'Giải trình']]
  );
  assert.equal((await dayRows('binh', '2026-10-21'))[0].status, 'admin');
});

test('Từ chối giải trình Check-out muộn: cả ngày không tính công, lượt là Bị từ chối', async () => {
  await F.at('2026-10-22T08:00:00');
  const opened = await X.punch('cuong', { type: 'in', requestId: 'rj-cuong-in' });
  await F.at('2026-10-22T18:10:00'); // ca n1 hết 17:00: muộn 70 phút
  const out = await X.punch('cuong', {
    type: 'out',
    sessionId: opened.data.open.id,
    requestId: 'rj-cuong-out',
    explanation: 'Chờ khách ký'
  });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  const item = (await F.call('GET', '/explanations?status=answered&user=cuong', { who: 'admin' })).data.items[0];
  assert.equal((await X.payOf('cuong')).payDays['2026-10-22'].kind, 'unpaid'); // chờ duyệt: giữ

  assert.equal((await X.decide(item.id, false)).status, 200);
  const paid = await X.payOf('cuong');
  assert.equal(paid.payDays['2026-10-22'].kind, 'unpaid');
  assert.equal(paid.m.count, 0);
  const rows = await dayRows('cuong', '2026-10-22');
  assert.deepEqual(
    rows.map(s => s.status),
    ['rejected']
  );
});

test('Ngày không chấm gì mà giải trình bị từ chối: vẫn không tính công; giải trình ngày cũ hơn không ảnh hưởng ngày khác', async () => {
  const item = await X.askAndAnswer('dung', '2026-10-21');
  assert.equal((await X.decide(item.id, false)).status, 200);
  const paid = await X.payOf('dung');
  assert.equal(paid.payDays['2026-10-21'].kind, 'unpaid');
  assert.equal(paid.payDays['2026-10-20'].kind, 'noshow'); // ngày không có giải trình: nghỉ không phép như trước
  assert.equal(paid.m.count, 0);
});
