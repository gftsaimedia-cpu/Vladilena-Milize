'use strict';
// Quyền duyệt khoản chờ (GET/PUT /api/approvals*, GET /api/alerts, src/platform/authz.ts) kiểm TỪNG KHOẢN theo nhóm,
// không chỉ "có ít nhất một request.decide.<nhóm>".
// `request.decide.*` của HR là `leave`; của Quản lý là
// "nhóm mình, bước 1" (phạm vi `team`; src/platform/authz.ts ROLE_SCOPE.manager = 'team', chưa có bảng staff_assignments nên chỉ gồm chính mình);
// C&B có mọi nhóm. Quản lý và HR không thấy số tiền (kpiAdmAmt, kpiAdmPct là tiền/điểm Admin duyệt cho lương KPI).
// APPROVAL_FORBIDDEN_TYPE ("vai trò không được duyệt loại này"); một lô có khoản không được phép thì cả lô bị từ chối, không lưu gì.
// Tháng 2026-10, đồng hồ 14/10/2026; người bịa qa_*. Vai trò gán bằng store.roles.grant (staff_roles).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;
const MONTH = '2026-10';
const ISAT = '2026-10-03';
const LEAVE = '2026-10-12';
const OT = '2026-10-07';
const MAKEUP_HOURS = '2026-10-08';
const WORKER = 'qa_worker';

before(async () => {
  await F.start();
  await F.at('2026-10-14T12:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person(WORKER, 'staff', { type: 'nv', level: 1, startDate: '2026-01-05', leaveAdjust: 30 });
  for (const [user, role] of [
    ['qa_hr', 'hr'],
    ['qa_manager', 'manager'],
    ['qa_cb', 'cb']
  ]) {
    await F.person(user, 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
    await store.roles.grant(user, role, 'admin');
  }
  const work = (more: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', ...more });
  const res = await F.call('PUT', '/sheet', {
    who: WORKER,
    body: {
      month: MONTH,
      days: {
        [ISAT]: { kind: 'isat' },
        [LEAVE]: { kind: 'leave' },
        [OT]: work({ extraKind: 'ot', extraOut: '19:00' }),
        [MAKEUP_HOURS]: work({ extraKind: 'makeup', extraOut: '19:00' })
      }
    }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  // Admin duyệt KPI của người này để kpiAdmAmt, kpiAdmPct có giá trị thật (nếu không, "không lộ" chỉ vì rỗng)
  // không có route ghi số Admin duyệt KPI: dựng thẳng bằng store
  await store.setKpiApproval(WORKER, MONTH, 88, 4321000);
});
after(F.stop);

const queue = async (who?) => await F.call('GET', '/approvals?status=all', { who });
const refs = (items?) =>
  items.map(x => ({ username: x.username, date: x.date, rev: x.rev, fingerprint: x.fingerprint }));
const decide = async (who?, items?, action = 'approve', note?) =>
  await F.call('PUT', '/approvals/decide', { who, body: { action, items, ...(note ? { note } : {}) } });
const statusOf = async (date?) =>
  (await store.db.prepare('SELECT status FROM sheet_approvals WHERE username = ? AND date = ?').get(WORKER, date))
    .status;
const adminItems = async () => (await queue('admin')).data.items;
const visible = (res?) => (res.status === 200 ? res.data.items : []);

test('V1A-S6-4 (đối chứng): Admin thấy đủ bốn khoản chờ và C&B (mọi nhóm) cũng thấy đủ', async () => {
  const dates = (list?) => list.map(x => x.date).sort();
  const all = [ISAT, LEAVE, OT, MAKEUP_HOURS].sort();
  assert.deepEqual(dates(await adminItems()), all);
  assert.deepEqual(dates(visible(await queue('qa_cb'))), all);
});

/* ---------- HR: chỉ nhóm leave ---------- */

test('V1A-S6-4: HR (chỉ request.decide.leave) không thấy khoản iSAT, OT, làm bù trong GET /api/approvals; thấy khoản nghỉ phép', async () => {
  const res = await queue('qa_hr');
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.deepEqual(res.data.items.map(x => x.item).sort(), ['leave'], 'HR chỉ thấy khoản nhóm leave');
});

test('V1A-S6-4: HR không duyệt được khoản iSAT, OT, làm bù (403, khoản vẫn chờ); lô có lẫn khoản nghỉ phép bị từ chối cả lô, không lưu gì', async () => {
  const items = await adminItems();
  const of = (date?) => items.filter(x => x.date === date);
  const before = await F.snapshot();
  for (const date of [ISAT, OT, MAKEUP_HOURS]) {
    const res = await decide('qa_hr', refs(of(date)));
    assert.equal(res.status, 403, `${date}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
    assert.equal(await statusOf(date), 'pending');
  }
  const mixed = await decide('qa_hr', refs([...of(LEAVE), ...of(ISAT)]));
  assert.equal(mixed.status, 403, JSON.stringify(mixed.data).slice(0, 200));
  assert.equal(await statusOf(LEAVE), 'pending', 'cả lô bị từ chối: khoản nghỉ phép cũng chưa duyệt');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'không bảng nào đổi');
});

test('V1A-S6-4: số khoản chờ (GET /api/approvals/count) của HR chỉ đếm nhóm HR duyệt được: 1 (nghỉ phép), không phải 4', async () => {
  const res = await F.call('GET', '/approvals/count', { who: 'qa_hr' });
  assert.equal(res.status, 200);
  assert.equal(res.data.pending, 1);
  assert.equal((await F.call('GET', '/approvals/count', { who: 'admin' })).data.pending, 4);
});

test('V1A-S6-4: phản hồi GET /api/approvals cho HR không có kpiAdmAmt, kpiAdmPct (số tiền/điểm Admin duyệt; HR không có salary.read)', async () => {
  const adminText = JSON.stringify((await queue('admin')).data);
  assert.ok(adminText.includes('"kpiAdmAmt":4321000'), 'đối chứng: Admin thấy số thật');
  const text = JSON.stringify((await queue('qa_hr')).data);
  assert.ok(!text.includes('kpiAdmAmt') && !text.includes('kpiAdmPct'), 'HR không được nhận số tiền KPI Admin duyệt');
  assert.ok(!text.includes('4321000'));
});

test('V1A-S6-4 (đối chứng): HR duyệt được khoản nghỉ phép năm (nhóm leave), khoản chuyển sang approved', async () => {
  const items = (await adminItems()).filter(x => x.date === LEAVE);
  assert.equal(items.length, 1);
  const res = await decide('qa_hr', refs(items));
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(await statusOf(LEAVE), 'approved');
  // trả về chờ duyệt để các test sau không phụ thuộc thứ tự: Admin đổi quyết định cần lý do
  const back = await decide(
    'admin',
    refs((await adminItems()).filter(x => x.date === LEAVE)),
    'reject',
    'Hoàn tác để dựng lại dữ liệu thử'
  );
  assert.equal(back.status, 200, JSON.stringify(back.data).slice(0, 300));
});

/* ---------- Quản lý: phạm vi team (chỉ gồm chính mình) ---------- */

test('V1A-S6-4: Quản lý (phạm vi nhóm mình, chưa có ai trong nhóm) không thấy khoản của qa_worker và không duyệt được (403, khoản vẫn chờ)', async () => {
  assert.deepEqual(visible(await queue('qa_manager')), [], 'Quản lý không thấy khoản của người ngoài nhóm');
  const count = await F.call('GET', '/approvals/count', { who: 'qa_manager' });
  assert.ok(count.status === 403 || count.data.pending === 0, JSON.stringify(count.data));
  const before = await F.snapshot();
  const items = (await adminItems()).filter(x => x.date === OT);
  const res = await decide('qa_manager', refs(items));
  assert.equal(res.status, 403, JSON.stringify(res.data).slice(0, 200));
  assert.equal(await statusOf(OT), 'pending');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('V1A-S6-4: phản hồi GET /api/approvals cho Quản lý không có kpiAdmAmt, kpiAdmPct (Quản lý không thấy số tiền, TK 8.3 và 10.2)', async () => {
  const text = JSON.stringify((await queue('qa_manager')).data);
  assert.ok(!text.includes('kpiAdmAmt') && !text.includes('kpiAdmPct') && !text.includes('4321000'));
});

/* ---------- vai trò không có quyền duyệt nào ---------- */

test('V1A-S6-4 (đối chứng): nhân sự thường 403 ở GET /approvals, /approvals/count và PUT /approvals/decide', async () => {
  const items = await adminItems();
  assert.equal((await queue(WORKER)).status, 403);
  assert.equal((await F.call('GET', '/approvals/count', { who: WORKER })).status, 403);
  assert.equal((await decide(WORKER, refs(items.slice(0, 1)))).status, 403);
  assert.equal((await queue(null)).status, 401);
});

test('V1A-S6-4: GET /api/alerts đếm khoản chờ theo nhóm được duyệt: Admin mọi khoản, HR chỉ nghỉ phép, Quản lý 0', async () => {
  const pending = await store.db.prepare("SELECT item FROM sheet_approvals WHERE status = 'pending'").all();
  assert.ok(pending.length >= 3 && pending.some(r => r.item !== 'leave'), 'cần còn khoản chờ ngoài nhóm leave');
  const count = async (who?) => (await F.call('GET', `/alerts?month=${MONTH}`, { who })).data.pendingApprovals;
  assert.equal(await count('admin'), pending.length);
  assert.equal(await count('qa_hr'), pending.filter(r => r.item === 'leave').length);
  assert.equal(await count('qa_manager'), 0);
});
