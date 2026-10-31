'use strict';
// ExplanationRepository.heldByUser(tháng): Map người → [{ date, status }] theo ngày tăng, chỉ giải trình chưa được duyệt; một ngày có nhiều
// giải trình lấy trạng thái từ chối trước, rồi đã trả lời, rồi chờ trả lời. forDays: giải trình gắn ngày (không có session_id) của các người.
process.env.DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { container } = require('../../lib/domain/container');
const { Explanation } = require('../../lib/domain/explanation/explanation');

const repo = () => container.explanationRepository;
const add = (username, date, status, extra = {}) =>
  repo().insert(
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

test('heldByUser trả [{ date, status }] theo ngày tăng và bỏ giải trình đã duyệt, tháng khác', () => {
  add('an', '2026-10-21', 'answered');
  add('an', '2026-10-05', 'requested');
  add('an', '2026-10-12', 'approved');
  add('an', '2026-11-02', 'rejected');
  add('binh', '2026-10-09', 'rejected');
  const held = repo().heldByUser('2026-10');
  assert.deepEqual(held.get('an'), [
    { date: '2026-10-05', status: 'requested' },
    { date: '2026-10-21', status: 'answered' }
  ]);
  assert.deepEqual(held.get('binh'), [{ date: '2026-10-09', status: 'rejected' }]);
  assert.equal(held.has('chi'), false);
});

test('Một ngày có nhiều giải trình: từ chối thắng đã trả lời thắng chờ trả lời', () => {
  add('cuong', '2026-10-14', 'requested');
  add('cuong', '2026-10-14', 'answered');
  add('cuong', '2026-10-15', 'answered');
  add('cuong', '2026-10-15', 'rejected');
  add('cuong', '2026-10-15', 'requested');
  assert.deepEqual(repo().heldByUser('2026-10').get('cuong'), [
    { date: '2026-10-14', status: 'answered' },
    { date: '2026-10-15', status: 'rejected' }
  ]);
});

test('forDays chỉ lấy giải trình không gắn lượt của các người và khoảng ngày được hỏi', () => {
  add('dung', '2026-10-10', 'approved');
  add('dung', '2026-10-30', 'rejected');
  add('dung', '2026-10-12', 'approved', { kind: 'late-checkout', sessionId: 7 });
  add('em', '2026-10-11', 'approved');
  const found = repo().forDays(['dung'], '2026-10-01', '2026-10-31');
  assert.deepEqual(
    found.map(x => [x.username, x.date, x.status]),
    [
      ['dung', '2026-10-10', 'approved'],
      ['dung', '2026-10-30', 'rejected']
    ]
  );
  assert.deepEqual(repo().forDays(['dung'], '2026-10-11', '2026-10-29'), []);
  assert.deepEqual(repo().forDays([], '2026-10-01', '2026-10-31'), []);
});
