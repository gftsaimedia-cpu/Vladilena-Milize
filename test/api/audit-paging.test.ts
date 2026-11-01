'use strict';
// GET /api/audit: phân trang bằng con trỏ id và biên ngày giờ Việt Nam (server.js → GET /audit, src/platform/db.ts → store.audit.list):
//   - mới → cũ; nextBeforeId của trang này truyền vào beforeId của trang sau; trang cuối nextBeforeId null; không trùng, không sót dòng;
//   - afterId cho thứ tự cũ → mới và không có nextBeforeId; beforeId/afterId phải là số nguyên không âm (regex /^\d+$/);
//   - from, to dạng YYYY-MM-DD nghĩa là đầu và cuối NGÀY GIỜ VIỆT NAM (UTC+7), không phải ngày UTC.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../../src/platform/audit');

const { F, store } = P;

before(F.start);
after(F.stop);

const write = async (action?, at?) => {
  await F.at(at);
  return await audit.write(
    { actor: 'admin', actorRoles: ['admin'], requestId: 'req-' + action },
    { action, entityKind: 'test', entityId: 'x', reason: 'Dòng thử phân trang nhật ký' }
  );
};
const get = async (query?, who = 'admin') => await F.call('GET', '/audit?' + query, { who });
const ids = (res?) => res.data.rows.map(r => r.id);

test('Phân trang beforeId: các trang nối nhau (nextBeforeId → beforeId), mới → cũ, không trùng không sót, trang cuối nextBeforeId null, total không đổi', async () => {
  await P.seed('2026-10');
  const all: any[] = [];
  for (let i = 0; i < 12; i++)
    all.push((await write('test.paging', `2026-11-02T09:${String(i).padStart(2, '0')}:00`)).id);
  const page1 = await get('action=test.paging&limit=5');
  assert.equal(page1.status, 200, JSON.stringify(page1.data).slice(0, 200));
  assert.deepEqual(ids(page1), [...all].reverse().slice(0, 5), 'mới → cũ');
  assert.equal(page1.data.total, 12);
  assert.equal(page1.data.limit, 5);
  assert.equal(page1.data.nextBeforeId, await ids(page1).at(-1));
  const page2 = await get(`action=test.paging&limit=5&beforeId=${page1.data.nextBeforeId}`);
  assert.deepEqual(ids(page2), [...all].reverse().slice(5, 10));
  assert.equal(page2.data.total, 12, 'total không theo con trỏ');
  const page3 = await get(`action=test.paging&limit=5&beforeId=${page2.data.nextBeforeId}`);
  assert.deepEqual(ids(page3), [...all].reverse().slice(10));
  assert.equal(page3.data.nextBeforeId, null, 'trang cuối');
  assert.deepEqual([...ids(page1), ...ids(page2), ...ids(page3)], [...all].reverse());
  // trang vừa đủ: 12 dòng, limit 12 thì nextBeforeId trỏ tiếp nhưng trang sau rỗng
  const exact = await get('action=test.paging&limit=12');
  assert.equal(exact.data.rows.length, 12);
  const after = await get(`action=test.paging&limit=12&beforeId=${exact.data.nextBeforeId}`);
  assert.deepEqual(ids(after), []);
  assert.equal(after.data.nextBeforeId, null);
});

test('beforeId = 0 hợp lệ (không có dòng nào có id nhỏ hơn); beforeId và afterId sai dạng (abc, -1, 1.5, rỗng giữa dấu, mũ) là 400', async () => {
  await P.seed('2026-10');
  await write('test.cursor', '2026-11-02T10:00:00');
  const zero = await get('action=test.cursor&beforeId=0');
  assert.equal(zero.status, 200);
  assert.deepEqual(ids(zero), []);
  for (const key of ['beforeId', 'afterId'])
    for (const bad of ['abc', '-1', '1.5', '1e3', '12x', '%201', '0x10']) {
      const res = await get(`${key}=${bad}`);
      assert.equal(res.status, 400, `${key}=${bad}: ${res.status}`);
    }
  for (const bad of ['0', '-5', 'abc', '2.5']) assert.equal((await get(`limit=${bad}`)).status, 400, `limit=${bad}`);
});

test('afterId cho thứ tự cũ → mới (id > N), không có nextBeforeId; limit lớn hơn mức tối đa (200) bị cắt về 200', async () => {
  await P.seed('2026-10');
  const all: any[] = [];
  for (let i = 0; i < 6; i++) all.push((await write('test.after', `2026-11-02T11:0${i}:00`)).id);
  const res = await get(`action=test.after&afterId=${all[2]}`);
  assert.deepEqual(ids(res), all.slice(3), 'cũ → mới, chỉ id lớn hơn');
  assert.equal(res.data.nextBeforeId, null);
  assert.equal(res.data.total, 6);
  const big = await get('limit=100000');
  assert.equal(big.status, 200);
  assert.ok(big.data.limit <= 200 && big.data.rows.length <= 200, `limit ${big.data.limit}`);
});

test('from và to dạng YYYY-MM-DD là biên ngày giờ Việt Nam: từ 00:00 đến 23:59:59 UTC+7 của ngày đó, không phải ngày UTC', async () => {
  await P.seed('2026-10');
  // giờ Việt Nam: 01/11 23:59:59 (ngoài), 02/11 00:00:00 (trong), 02/11 23:59:59 (trong), 03/11 00:00:00 (ngoài)
  const edges = {
    outBefore: (await write('test.vnday', '2026-11-01T23:59:59')).id,
    inStart: (await write('test.vnday', '2026-11-02T00:00:00')).id,
    inEnd: (await write('test.vnday', '2026-11-02T23:59:59')).id,
    outAfter: (await write('test.vnday', '2026-11-03T00:00:00')).id
  };
  const day = await get('action=test.vnday&from=2026-11-02&to=2026-11-02');
  assert.equal(day.status, 200, JSON.stringify(day.data).slice(0, 200));
  assert.deepEqual(
    ids(day).sort((a: any, b: any) => a - b),
    [edges.inStart, edges.inEnd],
    'đúng ngày 02/11 giờ Việt Nam'
  );
  assert.equal(day.data.total, 2);
  assert.deepEqual(
    ids(await get('action=test.vnday&from=2026-11-02')).sort((a: any, b: any) => a - b),
    [edges.inStart, edges.inEnd, edges.outAfter]
  );
  assert.deepEqual(
    ids(await get('action=test.vnday&to=2026-11-02')).sort((a: any, b: any) => a - b),
    [edges.outBefore, edges.inStart, edges.inEnd]
  );
  // from sau to: rỗng; ngày không có thật hoặc sai dạng: 400
  assert.deepEqual(ids(await get('action=test.vnday&from=2026-11-03&to=2026-11-02')), []);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-11-2', '02/11/2026', 'abc'])
    assert.equal((await get(`from=${bad}`)).status, 400, `from=${bad}`);
  assert.equal((await get('to=2026-11-31')).status, 400);
  // nếu đổi sang biên UTC thì kết quả sẽ khác: 01/11 17:00 UTC đến 02/11 16:59:59 UTC là ngày 02/11 giờ Việt Nam
  assert.equal(
    day.data.rows.every(r => r.at >= '2026-11-01T17:00:00' && r.at <= '2026-11-02T16:59:59.999Z'),
    true
  );
});

test('Nhật ký chỉ trả mức nhạy cảm người xem được đọc; chuỗi băm vẫn nguyên sau các dòng thử; nhân sự không có audit.read bị 403', async () => {
  await P.seed('2026-10');
  await write('test.sens', '2026-11-02T12:00:00');
  assert.equal((await get('action=test.sens', 'qa_nv1')).status, 403);
  assert.equal((await get('action=test.sens', null)).status, 401);
  assert.equal((await F.call('GET', '/audit/verify')).data.ok, true);
  assert.equal(await store.audit.count({ action: 'test.sens' }), 1);
});
