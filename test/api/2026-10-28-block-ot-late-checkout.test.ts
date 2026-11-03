// Chặn cứng Check-out muộn quá 30 phút phải giải trình (giờ ra đó chỉ được tính khi Admin duyệt giải trình).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');

const MONTH = '2026-10';

before(async () => {
  await F.start();
  await F.at('2026-10-14T12:00:00');
  await F.person('an');
  await F.person('binh');
  await F.person('admin', 'admin');
});
after(() => F.stop());

// Check-out muộn chỉ có hiệu lực khi Admin duyệt giải trình: lượt thành "Quên Check-out", giờ bấm chỉ được ghi nhận
// (entry.requestedOut + dòng punches), Admin duyệt thì giờ đó mới là giờ ra.
test('Check-out muộn quá 30 phút: cần giải trình; lượt thành Quên Check-out chờ Admin duyệt; muộn trong 30 phút thì Check-out bình thường', async () => {
  await F.at('2026-10-14T08:00:00');
  const inRes = await F.call('POST', '/punch', { who: 'binh', body: { type: 'in', requestId: 'late-in-1' } });
  assert.equal(inRes.status, 200, JSON.stringify(inRes.data));
  const sessionId = inRes.data.open.id;
  await F.at('2026-10-14T17:50:00'); // ca n1 kết thúc 17:00: muộn 50 phút
  const blocked = await F.call('POST', '/punch', {
    who: 'binh',
    body: { type: 'out', sessionId, requestId: 'late-out-1' }
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  assert.equal(blocked.data.lateMin, 50);
  assert.equal((await F.call('POST', '/explanations', { who: 'binh', body: { sessionId, text: '  ' } })).status, 400);
  // Gửi giải trình riêng rồi bấm lại vẫn được nhận, nhưng giờ ra KHÔNG được áp: lượt là Quên Check-out chờ duyệt
  const sent = await F.call('POST', '/explanations', { who: 'binh', body: { sessionId, text: 'Họp khách đến muộn' } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.item.status, 'answered');
  const done = await F.call('POST', '/punch', {
    who: 'binh',
    body: { type: 'out', sessionId, requestId: 'late-out-1' }
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.lastSession.entry.reason, 'forgot-out');
  assert.equal(done.data.lastSession.entry.presOut, undefined);
  assert.equal(done.data.pending, 'forgot-out');
  // Admin thấy giải trình; chưa duyệt thì ngày đó bị giữ lương, duyệt xong thì hết giữ; không duyệt thì vẫn giữ; nhân sự không tự duyệt được
  const explanations = require('../../src/domain/explanation/explanations');
  const heldDates = async (month?) =>
    new Map<any, any>(
      [...(await explanations.heldByUser(month))].map(([username, days]: any) => [username, days.map(d => d.date)])
    );
  const seen = await F.call('GET', '/explanations?status=answered', { who: 'admin' });
  assert.equal(seen.data.items.length, 1);
  assert.equal(seen.data.toRead, 1);
  assert.equal(seen.data.items[0].requestedOut, (await F.store.getSession(sessionId)).entry.requestedOut);
  const id = seen.data.items[0].id;
  assert.deepEqual((await heldDates(MONTH)).get('binh'), ['2026-10-14']);
  assert.equal(
    (await F.call('POST', `/explanations/${id}/decide`, { who: 'binh', body: { approve: true } })).status,
    403
  );
  const rejected = await F.call('POST', `/explanations/${id}/decide`, {
    who: 'admin',
    body: { approve: false, note: 'Không có lệnh làm thêm' }
  });
  assert.equal(rejected.data.item.status, 'rejected');
  assert.equal((await F.store.getSession(sessionId)).entry.reason, 'forgot-out'); // không duyệt: lượt giữ Quên Check-out
  // bộ tính lương nhận ngày bị giữ: người này có explanationHold, người khác thì không
  const held = await require('../../src/domain/payroll/payroll-service').loadInputs(MONTH, {
    usernames: ['binh', 'an']
  });
  assert.deepEqual(held.people.get('binh').explanationHold, ['2026-10-14']);
  assert.equal(held.people.get('an').explanationHold, undefined);
  assert.deepEqual((await heldDates(MONTH)).get('binh'), ['2026-10-14']); // không duyệt: ngày đó vẫn không tính lương
  const approved = await F.call('POST', `/explanations/${id}/decide`, { who: 'admin', body: { approve: true } });
  assert.equal(approved.data.item.status, 'approved');
  assert.equal((await F.store.getSession(sessionId)).entry.presOut, new Date('2026-10-14T10:50:00Z').toISOString()); // duyệt: giờ bấm thành giờ ra
  assert.equal((await heldDates(MONTH)).has('binh'), false);
  // muộn 20 phút: không bị chặn
  await F.at('2026-10-15T08:00:00');
  const in2 = await F.call('POST', '/punch', { who: 'binh', body: { type: 'in', requestId: 'late-in-2' } });
  await F.at('2026-10-15T17:20:00');
  const out2 = await F.call('POST', '/punch', {
    who: 'binh',
    body: { type: 'out', sessionId: in2.data.open.id, requestId: 'late-out-2' }
  });
  assert.equal(out2.status, 200, JSON.stringify(out2.data));
  assert.equal(out2.data.lastSession.entry.presOut, new Date('2026-10-15T10:20:00Z').toISOString());
});

test('Admin yêu cầu giải trình; chỉ đúng người đó trả lời được; nhân sự không yêu cầu được người khác', async () => {
  const asked = await F.call('POST', '/explanations', {
    who: 'admin',
    body: {
      username: 'an',
      date: '2026-10-09',
      prompt: 'Vì sao OT ngày 09/10 không có Check-in?',
      source: 'ai',
      ruleId: 'ot-checkin-mismatch'
    }
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  assert.equal(asked.data.item.kind, 'ai');
  const id = asked.data.item.id;
  assert.equal(
    (
      await F.call('POST', '/explanations', {
        who: 'binh',
        body: { username: 'an', date: '2026-10-09', prompt: 'xin chào bạn' }
      })
    ).status,
    403
  );
  assert.equal(
    (await F.call('POST', `/explanations/${id}/answer`, { who: 'binh', body: { text: 'tôi trả lời hộ' } })).status,
    403
  );
  const mine = await F.call('GET', '/explanations', { who: 'an' });
  assert.equal(mine.data.waitingForYou, 1);
  const replied = await F.call('POST', `/explanations/${id}/answer`, {
    who: 'an',
    body: { text: 'Quên Check-in, có đồng nghiệp xác nhận' }
  });
  assert.equal(replied.status, 200, JSON.stringify(replied.data));
  assert.equal(replied.data.item.status, 'answered');
  assert.equal(
    (await F.call('POST', `/explanations/${id}/answer`, { who: 'an', body: { text: 'lần hai' } })).status,
    409
  );
});
