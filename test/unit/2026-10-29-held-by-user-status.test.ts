'use strict';
// ExplanationRepository.heldByUser(tháng): Map người → [{ date, status }] theo ngày tăng, chỉ giải trình chưa được duyệt; một ngày có nhiều
// giải trình lấy trạng thái từ chối trước, rồi đã trả lời, rồi chờ trả lời. forDays: giải trình gắn ngày (không có session_id) của các người.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { container } = require('../../src/domain/container');
const { Explanation } = require('../../src/domain/explanation/explanation');

const repo = () => container.explanationRepository;
const add = async (username?, date?, status?, extra: any = {}) =>
  await repo().insert(
    new Explanation({
      username,
      date,
      kind: 'admin',
      prompt: 'Hỏi',
      requestedBy: 'admin',
      requestedAt: '2026-10-29T01:00:00.000Z',
      status,
      ...extra
    })
  );

test('heldByUser trả [{ date, status }] theo ngày tăng và bỏ giải trình đã duyệt, tháng khác', async () => {
  await add('an', '2026-10-21', 'answered');
  await add('an', '2026-10-05', 'requested');
  await add('an', '2026-10-12', 'approved');
  await add('an', '2026-11-02', 'rejected');
  await add('binh', '2026-10-09', 'rejected');
  const held = await repo().heldByUser('2026-10');
  assert.deepEqual(held.get('an'), [
    { date: '2026-10-05', status: 'requested' },
    { date: '2026-10-21', status: 'answered' }
  ]);
  assert.deepEqual(held.get('binh'), [{ date: '2026-10-09', status: 'rejected' }]);
  assert.equal(held.has('chi'), false);
});

test('Một ngày có nhiều giải trình: từ chối thắng đã trả lời thắng chờ trả lời', async () => {
  await add('cuong', '2026-10-14', 'requested');
  await add('cuong', '2026-10-14', 'answered');
  await add('cuong', '2026-10-15', 'answered');
  await add('cuong', '2026-10-15', 'rejected');
  await add('cuong', '2026-10-15', 'requested');
  assert.deepEqual((await repo().heldByUser('2026-10')).get('cuong'), [
    { date: '2026-10-14', status: 'answered' },
    { date: '2026-10-15', status: 'rejected' }
  ]);
});

test('forDays chỉ lấy giải trình không gắn lượt của các người và khoảng ngày được hỏi', async () => {
  await add('dung', '2026-10-10', 'approved');
  await add('dung', '2026-10-30', 'rejected');
  await add('dung', '2026-10-12', 'approved', { kind: 'late-checkout', sessionId: 7 });
  await add('em', '2026-10-11', 'approved');
  const found = await repo().forDays(['dung'], '2026-10-01', '2026-10-31');
  assert.deepEqual(
    found.map(x => [x.username, x.date, x.status]),
    [
      ['dung', '2026-10-10', 'approved'],
      ['dung', '2026-10-30', 'rejected']
    ]
  );
  assert.deepEqual(await repo().forDays(['dung'], '2026-10-11', '2026-10-29'), []);
  assert.deepEqual(await repo().forDays([], '2026-10-01', '2026-10-31'), []);
});
