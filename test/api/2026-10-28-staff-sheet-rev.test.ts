'use strict';
// Nhân sự tự lưu lịch (PUT /api/sheet, trang nhân viên → NV.putSheet) gửi kèm expectedRev của lịch đã đọc như hộp khai thay của Admin,
// nên Admin vừa khai thay xen giữa thì nhân sự nhận 409 SHEET_STALE thay vì đè mất; thiếu expectedRev thì ghi không kiểm rev.
// Nhật ký sheet.onBehalf đếm cả ngày chỉ đổi lịch làm bù dự kiến (makeupPlans) của "Nghỉ, sẽ làm bù".
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

async function setup() {
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2026-11-02T09:00:00');
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_nv1', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
}
const W = { kind: 'work', in: '08:00', out: '17:00' };
const put = async (who?, body?) => await F.call('PUT', '/sheet', { who, body });
const readOwn = async (who?, month?) => await F.call('GET', `/sheet?month=${month}`, { who });
const onBehalfRows = async (month?) =>
  await store.db
    .prepare("SELECT * FROM audit_log WHERE action = 'sheet.onBehalf' AND month = ? ORDER BY id")
    .all(month);

test('Nhân sự tự lưu với expectedRev cũ (Admin vừa khai thay) → 409 SHEET_STALE, không ghi gì; rev mới → 200', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1] = P.dowDates(M, 1);
  const seen = await readOwn('qa_nv1', M);
  assert.equal(seen.status, 200, JSON.stringify(seen.data));
  assert.ok(Number.isInteger(seen.data.rev), 'GET /sheet của chính mình có rev');

  // Admin khai thay ngày d1 trong lúc trang nhân sự còn mở lịch cũ
  const admin = await put('admin', { month: M, user: 'qa_nv1', expectedRev: seen.data.rev, days: { [d1]: W } });
  assert.equal(admin.status, 200, JSON.stringify(admin.data));
  const afterAdmin = JSON.stringify(await store.getSheet('qa_nv1', M));

  const stale = await put('qa_nv1', {
    month: M,
    days: { [d0]: W },
    kpiPct: null,
    kpiAmt: null,
    expectedRev: seen.data.rev
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'SHEET_STALE');
  assert.equal(stale.data.rev, admin.data.rev, 'phản hồi 409 kèm rev hiện tại');
  assert.equal(JSON.stringify(await store.getSheet('qa_nv1', M)), afterAdmin, 'lịch giữ nguyên bản Admin vừa lưu');

  const fresh = await readOwn('qa_nv1', M);
  assert.equal(fresh.data.rev, admin.data.rev);
  const ok = await put('qa_nv1', {
    month: M,
    days: { ...fresh.data.days, [d0]: W },
    kpiPct: null,
    kpiAmt: null,
    expectedRev: fresh.data.rev
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.rev > fresh.data.rev, 'phản hồi trả rev mới để lần lưu sau gửi lại');
  assert.deepEqual(Object.keys((await store.getSheet('qa_nv1', M)).days).sort(), [d0, d1].sort());
});

test('Nhân sự tự lưu không gửi expectedRev vẫn ghi như cũ (nơi gọi chưa gửi không bị chặn)', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1] = P.dowDates(M, 1);
  assert.equal((await put('admin', { month: M, user: 'qa_nv1', days: { [d1]: W } })).status, 200);
  const res = await put('qa_nv1', { month: M, days: { [d0]: W }, kpiPct: null, kpiAmt: null });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(Object.keys((await store.getSheet('qa_nv1', M)).days), [d0]);
});

test('Khai thay chỉ đổi lịch làm bù dự kiến của ngày "Nghỉ, sẽ làm bù" → nhật ký sheet.onBehalf ghi changedDays 1', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1, d2] = P.dowDates(M, 1);
  const first = await put('admin', {
    month: M,
    user: 'qa_nv1',
    days: { [d0]: { kind: 'willmakeup', makeupPlans: [{ date: d1, from: '08:00', to: '12:00' }] } }
  });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const again = await put('admin', {
    month: M,
    user: 'qa_nv1',
    expectedRev: first.data.rev,
    days: { [d0]: { kind: 'willmakeup', makeupPlans: [{ date: d2, from: '13:00', to: '17:00' }] } }
  });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(again.data.autoApproved, 1);
  const rows = await onBehalfRows(M);
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(rows[1].after_json), { changedDays: 1, autoApproved: 1 });

  // Lưu lại y nguyên (cùng lịch làm bù) thì không có ngày nào đổi
  const same = await put('admin', {
    month: M,
    user: 'qa_nv1',
    expectedRev: again.data.rev,
    days: { [d0]: { kind: 'willmakeup', makeupPlans: [{ date: d2, from: '13:00', to: '17:00' }] } }
  });
  assert.equal(same.status, 200, JSON.stringify(same.data));
  assert.equal(JSON.parse((await onBehalfRows(M))[2].after_json).changedDays, 0);
});
