'use strict';
// Lịch sử yêu cầu ứng lương: chỉ còn GET /api/advance-requests (đọc). Gửi, duyệt số và huỷ yêu cầu không còn route:
// cổng quyền từ chối (403 NO_ROUTE_POLICY) với cả Admin và nhân sự, không lưu gì.
// Đọc: nhân sự thấy yêu cầu của mình kèm mức theo quy tắc; Admin thấy mọi người; nhân sự không đọc được của người khác.
// Người bịa qa_*, đồng hồ giả, DB trong bộ nhớ.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const pad = (n?) => String(n).padStart(2, '0');
const nextMonth02 = (month?) => {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  return m === 12 ? `${y + 1}-01-02T12:00:00` : `${y}-${pad(m + 1)}-02T12:00:00`;
};

async function setup(month?) {
  await F.reset();
  await P.revokeAllRoles();
  await F.at(nextMonth02(month));
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const user of ['qa_nv1', 'qa_nv2'])
    await F.person(user, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05', leaveAdjust: 30 });
}
// Yêu cầu dựng thẳng trong bảng (không còn route gửi số)
async function insertRequest(username, month, { amount, status = 'pending', granted = null }: any) {
  const at = new Date(Date.now()).toISOString();
  return Number(
    (
      await store.db
        .prepare(
          `INSERT INTO advance_requests (username, month, amount, cap, status, granted, rev, created_at, decided_by, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(username, month, amount, amount, status, granted, at, granted ? 'admin' : null, granted ? at : null)
    ).lastInsertRowid
  );
}
const requestCount = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM advance_requests').get()).n;

test('gửi, duyệt số và huỷ yêu cầu ứng lương không còn route: 403 NO_ROUTE_POLICY cho Admin lẫn nhân sự, không lưu gì', async () => {
  const M = monthOf();
  await setup(M);
  const id = await insertRequest('qa_nv1', M, { amount: 500000 });
  const before = await requestCount();
  const calls = [
    ['POST', '/advance-requests', { month: M, amount: 1000000 }],
    ['PUT', `/advance-requests/${id}/decide`, { decision: 'approved' }],
    ['POST', `/advance-requests/${id}/cancel`, {}]
  ];
  for (const [method, url, body] of calls)
    for (const who of ['admin', 'qa_nv1']) {
      const res = await F.call(method, url, { who, body });
      assert.equal(res.status, 403, `${method} ${url} (${who}): ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'NO_ROUTE_POLICY', `${method} ${url} (${who})`);
    }
  assert.equal(await requestCount(), before);
  assert.equal((await store.db.prepare('SELECT status FROM advance_requests WHERE id = ?').get(id)).status, 'pending');
});

test('lịch sử: nhân sự đọc yêu cầu của mình kèm mức theo quy tắc; số đã duyệt cũ hiện ra nhưng không phải số tạm ứng', async () => {
  const M = monthOf();
  await setup(M);
  await insertRequest('qa_nv1', M, { amount: 1000000, status: 'approved', granted: 1000000 });
  await insertRequest('qa_nv2', M, { amount: 300000 });
  const mine = await F.call('GET', `/advance-requests?month=${M}`, { who: 'qa_nv1' });
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.equal(mine.data.scope, 'self');
  assert.equal(mine.data.items.length, 1);
  assert.equal(mine.data.items[0].username, 'qa_nv1');
  assert.equal(mine.data.items[0].granted, 1000000);
  assert.equal(mine.data.granted, 1000000);
  assert.equal(typeof mine.data.cap, 'number');
  assert.equal(mine.data.remaining, Math.max(0, mine.data.cap - 1000000));
});

test('lịch sử: Admin thấy yêu cầu của mọi người kèm số đang chờ; nhân sự đọc của người khác bị 403', async () => {
  const M = monthOf();
  await setup(M);
  await insertRequest('qa_nv1', M, { amount: 1000000, status: 'approved', granted: 1000000 });
  await insertRequest('qa_nv2', M, { amount: 300000 });
  const all = await F.call('GET', `/advance-requests?month=${M}`);
  assert.equal(all.status, 200, JSON.stringify(all.data));
  assert.equal(all.data.scope, 'all');
  assert.equal(all.data.items.length, 2);
  assert.equal(all.data.pending, 1);
  const foreign = await F.call('GET', `/advance-requests?month=${M}&username=qa_nv2`, { who: 'qa_nv1' });
  assert.equal(foreign.status, 403, JSON.stringify(foreign.data));
  assert.equal(foreign.data.code, 'FORBIDDEN_CAP');
  assert.equal((await F.call('GET', '/advance-requests?month=2026-13')).status, 400);
});
