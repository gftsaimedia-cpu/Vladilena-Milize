'use strict';
// pay-entry-zero-drift: không có khoản ĐÃ DUYỆT nào thì phiếu và bản chụp không đổi. File riêng (DB riêng trong bộ nhớ) vì cần bảng pay_entries
// rỗng lúc bắt đầu; hai test sau đó thêm khoản chờ, bị từ chối, bị huỷ rồi vẫn phải không đổi một đồng nào.
const E = require('../helpers/pay-entry-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, flow, store } = E;

before(F.start);
after(F.stop);

const count = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM pay_entries').get()).n;
function expectUnchanged(slips?, legacy?) {
  for (const u of flow.PEOPLE.map(p => p.username)) {
    assert.equal(slips[u].net, legacy[u].net.net, u);
    assert.equal(slips[u].gross, legacy[u].net.gross, u);
    assert.equal(slips[u].tax, legacy[u].net.tax, u);
    assert.equal(slips[u].insurance, legacy[u].net.insurance, u);
    for (const name of ['entries', 'entriesAdd', 'entriesDeduct'])
      assert.equal(E.findKey(slips[u].snapshot, name), undefined, `${u}: không có ${name}`);
  }
}

test('pay-entry-zero-drift: bảng pay_entries có mặt và rỗng; không có khoản nào thì phiếu bằng khối cũ từng đồng và bản chụp KHÔNG có m.entries, m.net.entriesAdd, m.net.entriesDeduct', async () => {
  assert.ok(
    await store.db
      .prepare(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pay_entries'"
      )
      .get(),
    'bảng pay_entries'
  );
  assert.equal(await count(), 0, 'bảng rỗng lúc bắt đầu');
  const M = await E.setup();
  const legacy = await flow.expectedFor(M);
  expectUnchanged(await E.slipsOf(M), legacy);
  assert.equal(await count(), 0);
});

test('pay-entry-zero-drift: khoản chờ duyệt, bị từ chối và đã huỷ (không khoản nào có hiệu lực) cũng không làm đổi phiếu hay bản chụp', async () => {
  const M = await E.setup();
  const legacy = await flow.expectedFor(M);
  await E.mustCreate(M, { username: 'qa_nv2', amount: 111000 });
  const rejected = await E.mustCreate(M, { username: 'qa_nv1', amount: 222000 });
  await E.decide(rejected.id, 'rejected', { rev: 1, note: 'Chưa đủ căn cứ' });
  const voided = await E.mustApprove(await E.mustCreate(M, { username: 'qa_ctv1', amount: 333000 }));
  await F.call('POST', `/pay-entries/${voided.id}/void`, { body: { rev: voided.rev, reason: 'Nhập nhầm người nhận' } });
  assert.equal(await count(), 3);
  expectUnchanged(await E.slipsOf(M), legacy);
});
