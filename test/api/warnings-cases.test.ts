'use strict';
// Kiểm tra chỉ cảnh báo của từng nhóm. Mỗi ca của test/helpers/warning-cases.ts chạy trên MỘT thế giới:
// yêu cầu vi phạm trả 200, `warnings[]` mang mã hoặc câu của vi phạm, và dữ liệu thật sự được lưu.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const K = require('../helpers/warning-cases');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { S } = K;
const { F, store } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

for (const c of K.CASES) {
  const skip = c.ready && !c.ready() ? { skip: `registry chưa có khoá cho ${c.id}` } : {};
  test(`${c.id}: ${c.title} — lưu kèm cảnh báo`, skip, async () => {
    const ctx = await K.prepare(c, monthOf);
    await K.checkWarn(c, ctx);
  });
}

/* ---------- K5: Check-in khi đang có lượt mở bị từ chối vì trạng thái ---------- */
test('K5: Check-in khi đang có lượt mở là 409; Check-out xong thì Check-in lại được', async () => {
  await S.seed(K.FREE_MONTH, { punches: false });
  await F.at('2029-04-03T07:50:00');
  const punch = async (who?, body?) =>
    await F.call('POST', '/punch', { who, body: { requestId: `k5-${Math.random()}-open`, ...body } });
  const first = await punch('qa_tts1', { type: 'in' });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const again = await punch('qa_tts1', { type: 'in' });
  assert.equal(again.status, 409, JSON.stringify(again.data));
  assert.match(again.data.error, /đang có lượt mở/);
  assert.equal(again.data.warnings, undefined, 'bị từ chối nên không mang cảnh báo');
  assert.equal((await store.listSessions({ username: 'qa_tts1' })).length, 1, 'không tạo lượt thứ hai');
  const out = await punch('qa_tts1', { type: 'out', sessionId: (await store.openSession('qa_tts1')).id });
  assert.equal(out.status, 200, JSON.stringify(out.data));
});

/* ---------- K1, K2, K3 không bao giờ thành cảnh báo ---------- */
test('K1/K2/K3: quyền, định dạng và chống ghi đè bị từ chối (không có cảnh báo thay thế)', async () => {
  const M = monthOf();
  await S.seed(M);
  const before = await F.snapshot();
  // K1: nhân sự không sửa được kỳ, không duyệt được khoản, không xem được lịch người khác
  assert.equal(
    (await F.call('POST', `/periods/${M}/lock-attendance`, { who: 'qa_nv1', body: { rev: 0 } })).status,
    403
  );
  assert.equal(
    (await F.call('PUT', '/approvals/decide', { who: 'qa_nv1', body: { action: 'approve', items: [] } })).status,
    403
  );
  assert.equal((await F.call('GET', `/sheet?month=${M}&user=qa_ctv1`, { who: 'qa_nv1' })).status, 403);
  assert.equal(
    (await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: M, user: 'qa_ctv1', days: {} } })).status,
    403
  );
  // K2: tháng sai định dạng, ngày không thuộc tháng, loại ngày lạ, JSON không phải đối tượng
  assert.equal((await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: '2026-13', days: {} } })).status, 400);
  assert.equal(
    (await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: M, days: { '1999-01-04': { kind: 'work' } } } }))
      .status,
    400
  );
  assert.equal(
    (await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: M, days: { [`${M}-05`]: { kind: 'khong_co' } } } }))
      .status,
    400
  );
  // K3: rev lệch khi bước kỳ
  const stale = await F.call('POST', `/periods/${M}/lock-attendance`, { who: 'admin', body: { rev: 99 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'PERIOD_STALE');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'không bảng nào đổi');
});
