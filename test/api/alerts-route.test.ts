'use strict';
// GET /api/alerts nhận month=YYYY-MM (màn Admin luôn gửi). Thiếu month hoặc sai dạng là 400 với thông báo nói rõ tham số cần gửi;
// Admin và C&B gọi đúng thì 200 (missingPunches, absentNoExplanation, pendingApprovals). Chỉ người bịa (qa_*), DB trong bộ nhớ, đồng hồ giả.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;

before(async () => {
  await F.start();
  await F.at('2026-10-12T09:00:00');
  await F.person('qa_admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_cb', 'staff', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await store.roles.grant('qa_cb', 'cb', 'qa_admin'); // C&B: vai trò thêm cho tài khoản nhân sự
  await F.person('qa_nv', 'staff');
});
after(() => F.stop());

for (const who of ['qa_admin', 'qa_cb']) {
  test(`${who} gọi có month: 200 với danh sách quên chấm và số khoản chờ`, async () => {
    const r = await F.call('GET', '/alerts?month=2026-10', { who });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const { absentNoExplanation, ...rest } = r.data; // ngày trong lịch không ai chấm, chưa giải trình: test/api/staff-self-explanation.test.ts
    assert.deepEqual(rest, { missingPunches: [], pendingApprovals: 0 });
    assert.ok(Array.isArray(absentNoExplanation));
  });

  test(`${who} gọi thiếu month: 400 nói rõ cần month=YYYY-MM`, async () => {
    const r = await F.call('GET', '/alerts', { who });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'MONTH_REQUIRED');
    assert.match(r.data.error, /month=YYYY-MM/);
  });
}

test('month sai dạng: 400 BAD_MONTH, thông báo nêu giá trị đã gửi', async () => {
  for (const month of ['2026-13', '26-10', 'abc', '']) {
    const r = await F.call('GET', `/alerts?month=${month}`, { who: 'qa_admin' });
    assert.equal(r.status, 400, month);
    assert.equal(r.data.code, 'BAD_MONTH', month);
    assert.match(r.data.error, /YYYY-MM/);
  }
});

test('nhân sự thường 403, chưa đăng nhập 401', async () => {
  assert.equal((await F.call('GET', '/alerts?month=2026-10', { who: 'qa_nv' })).status, 403);
  assert.equal((await F.call('GET', '/alerts?month=2026-10', { who: null })).status, 401);
});
