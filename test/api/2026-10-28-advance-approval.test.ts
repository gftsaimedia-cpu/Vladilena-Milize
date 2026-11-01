'use strict';
// Yêu cầu tạm ứng theo tháng: tạm ứng luôn là số theo quy tắc — advance.rate × lương cơ bản thực nhận của các
// ngày đi làm từ ngày 1 đến ngày advance.untilDay (cơ sở advance.basis = byWorkedDays). CHỈ người cần mới bấm "Xin tạm ứng" (không nhập số); Admin duyệt
// hoặc từ chối; chỉ trừ vào phiếu khi đã duyệt. Không xin, đang chờ, bị từ chối: 0.
//   GET  /api/advance-approvals?month=                  Admin: CHỈ người đã xin (mọi trạng thái); nhân sự: của mình (status null = chưa xin)
//   POST /api/advance-approvals/request | withdraw      { month, expectedRev? } — nhân sự, của chính mình
//   POST /api/advance-approvals/approve | reject | cancel   { month, username, expectedRev?, reason? }
//   POST /api/advance-approvals/approve-all             { month, expectedRev? } (rev của tháng; chỉ yêu cầu đang chờ)
// Kỳ đã duyệt hoặc đã chi trả: 409 PERIOD_LOCKED. Không đủ điều kiện (hồ sơ advanceOn tắt): 403 ADVANCE_NOT_ELIGIBLE.
// Số kiểm tay: NV bậc 1 (lương cơ bản level.nv.1.base, ngày công chuẩn type.nv.workdays), Admin khai thay mọi ngày Thứ Hai–Thứ Bảy của tháng đúng giờ ca
// (không trễ, không về sớm) nên mỗi ngày ≤ advance.untilDay góp đủ một ngày lương. Người bịa qa_*, DB trong bộ nhớ, đồng hồ giả.
const P = require('../helpers/period-api');
const { requestInWindow } = require('../helpers/advance-window');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const pad = (n?) => String(n).padStart(2, '0');
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();
const datesOf = (month?) =>
  Array.from(
    { length: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate() },
    (_, i) => `${month}-${pad(i + 1)}`
  );
const nextMonth02 = (month?) => {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  return m === 12 ? `${y + 1}-01-02T12:00:00` : `${y}-${pad(m + 1)}-02T12:00:00`;
};
const workDates = (month?) => datesOf(month).filter(d => dowOf(d) !== 0);
// Số theo quy tắc, tính tay từ tham số mặc định: rate × số ngày đi làm ≤ untilDay × lương ngày
const ruleFigure = (month?) => {
  const n = workDates(month).filter(d => Number(d.slice(8)) <= DEFAULTS['advance.untilDay']).length;
  return Math.round((DEFAULTS['advance.rate'] * n * DEFAULTS['level.nv.1.base']) / DEFAULTS['type.nv.workdays']);
};

const PEOPLE = ['qa_nv1', 'qa_nv2', 'qa_nv3', 'qa_off'];
// Bốn NV bậc 1 ca n1 (qa_off tắt tạm ứng trong hồ sơ); Admin khai thay mọi ngày làm của tháng; đồng hồ: ngày 2 tháng sau
async function setup(month?) {
  await F.reset();
  await P.revokeAllRoles();
  await F.at(nextMonth02(month));
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const username of PEOPLE)
    await F.person(username, 'staff', {
      type: 'nv',
      level: 1,
      shiftCode: 'n1',
      startDate: '2026-01-05',
      leaveAdjust: 30,
      ...(username === 'qa_off' ? { advanceOn: false } : {})
    });
  const days = Object.fromEntries(workDates(month).map(d => [d, { kind: 'work', in: '08:00', out: '17:00' }]));
  for (const user of PEOPLE) {
    const res = await F.call('PUT', '/sheet', { who: 'admin', body: { month, user, days } });
    assert.equal(res.status, 200, `khai thay ${user}: ${JSON.stringify(res.data)}`);
  }
}
const list = async (month?, who = 'admin') => await F.call('GET', `/advance-approvals?month=${month}`, { who });
const ask = async (month?, who?, extra: any = {}) => await requestInWindow(F, month, who, extra);
const withdraw = async (month?, who?, extra: any = {}) =>
  await F.call('POST', '/advance-approvals/withdraw', { who, body: { month, ...extra } });
const decide = async (step?, month?, username?, extra: any = {}, who = 'admin') =>
  await F.call('POST', `/advance-approvals/${step}`, { who, body: { month, username, ...extra } });
const approve = async (month?, username?, extra?, who?) => await decide('approve', month, username, extra, who);
const reject = async (month?, username?, extra?, who?) => await decide('reject', month, username, extra, who);
const cancel = async (month?, username?, extra?, who?) => await decide('cancel', month, username, extra, who);
const approveAll = async (month?, extra: any = {}, who = 'admin') =>
  await F.call('POST', '/advance-approvals/approve-all', { who, body: { month, ...extra } });
const estimate = async (month?, username?) =>
  (await F.call('GET', `/periods/${month}/estimates/${username}`)).data.payslip;
const itemOf = (data?, username?) => data.items.find(r => r.username === username);
const auditRows = async (month?) =>
  await store.db
    .prepare(
      "SELECT action, subject, before_json, after_json, reason FROM audit_log WHERE action LIKE 'advance.%' AND month = ? ORDER BY id"
    )
    .all(month);
const ok = (res?, what?) => assert.equal(res.status, 200, `${what}: ${JSON.stringify(res.data)}`);

test('không ai tự có yêu cầu: danh sách Admin rỗng, tạm ứng 0 ₫; nhân sự thấy số theo quy tắc và status null', async () => {
  const M = monthOf();
  await setup(M);
  const res = await list(M);
  ok(res, 'danh sách');
  assert.deepEqual(res.data.items, []);
  assert.equal(res.data.pending, 0);
  for (const user of PEOPLE) assert.equal((await estimate(M, user)).advance, 0, `${user}: chưa xin`);
  const mine = await list(M, 'qa_nv1');
  ok(mine, 'của mình');
  assert.equal(mine.data.scope, 'self');
  assert.equal(mine.data.provisional, false, 'đã qua ngày 15: số chốt');
  assert.equal(mine.data.item.status, null);
  assert.equal(mine.data.item.amount, ruleFigure(M));
  // số là đúng công thức tamUng của bộ máy (vết của phiếu ước tính)
  assert.equal((await estimate(M, 'qa_nv1')).snapshot.trace.tamUngToiDa, mine.data.item.amount);
});

test('xin → chờ duyệt (0 ₫, Admin chỉ thấy người đã xin) → duyệt: trừ đúng số theo quy tắc; nhật ký advance.request, advance.approve; xin lại là 409', async () => {
  const M = monthOf();
  await setup(M);
  const before = await estimate(M, 'qa_nv1');
  const sent = await ask(M, 'qa_nv1', { expectedRev: 0 });
  ok(sent, 'xin');
  assert.equal(sent.data.item.status, 'pending');
  assert.equal(sent.data.item.rev, 1);
  assert.equal(sent.data.item.amount, ruleFigure(M));
  assert.equal((await estimate(M, 'qa_nv1')).advance, 0, 'đang chờ: 0');
  const twice = await ask(M, 'qa_nv1');
  assert.equal(twice.status, 409);
  assert.equal(twice.data.code, 'ADVANCE_ALREADY_REQUESTED');
  const admin = await list(M);
  assert.deepEqual(
    admin.data.items.map(r => r.username),
    ['qa_nv1']
  );
  assert.equal(admin.data.pending, 1);
  assert.equal(itemOf(admin.data, 'qa_nv1').status, 'pending');
  assert.equal(itemOf(admin.data, 'qa_nv1').amount, ruleFigure(M));
  const res = await approve(M, 'qa_nv1', { expectedRev: 1 });
  ok(res, 'duyệt');
  assert.equal(res.data.item.status, 'approved');
  assert.equal(res.data.item.decidedBy, 'admin');
  const after = await estimate(M, 'qa_nv1');
  assert.equal(after.advance, ruleFigure(M));
  assert.equal(before.net - after.net, ruleFigure(M));
  assert.equal(after.gross, before.gross);
  assert.equal((await estimate(M, 'qa_nv2')).advance, 0);
  const rows = await auditRows(M);
  assert.deepEqual(
    rows.map(r => [r.action, r.subject]),
    [
      ['advance.request', 'qa_nv1'],
      ['advance.approve', 'qa_nv1']
    ]
  );
  assert.deepEqual(JSON.parse(rows[1].after_json), { status: 'approved', rev: 2 });
  const again = await approve(M, 'qa_nv1');
  assert.equal(again.status, 409);
  assert.equal(again.data.code, 'ADVANCE_NOT_PENDING');
  assert.equal((await list(M, 'qa_nv1')).data.item.status, 'approved');
});

test('từ chối: tạm ứng 0 ₫, lý do lưu và nhân sự đọc được; không xin lại được trong tháng; duyệt người chưa xin là 409', async () => {
  const M = monthOf();
  await setup(M);
  ok(await ask(M, 'qa_nv1'), 'xin');
  const res = await reject(M, 'qa_nv1', { expectedRev: 1, reason: 'Đã ứng ngoài hệ thống' });
  ok(res, 'từ chối');
  assert.equal(res.data.item.status, 'rejected');
  assert.equal((await estimate(M, 'qa_nv1')).advance, 0);
  const mine = (await list(M, 'qa_nv1')).data.item;
  assert.equal(mine.status, 'rejected');
  assert.equal(mine.note, 'Đã ứng ngoài hệ thống');
  assert.equal((await ask(M, 'qa_nv1')).data.code, 'ADVANCE_ALREADY_REQUESTED');
  assert.equal(itemOf((await list(M)).data, 'qa_nv1').status, 'rejected', 'Admin vẫn thấy yêu cầu bị từ chối');
  const none = await approve(M, 'qa_nv2');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'ADVANCE_NOT_PENDING');
  assert.deepEqual(
    (await auditRows(M)).map(r => r.action),
    ['advance.request', 'advance.reject']
  );
  assert.equal((await auditRows(M))[1].reason, 'Đã ứng ngoài hệ thống');
});

test('rút yêu cầu đang chờ: biến khỏi danh sách Admin, xin lại được; rút khi đã duyệt là 409; expectedRev lệch là 409 ADVANCE_REQUEST_STALE', async () => {
  const M = monthOf();
  await setup(M);
  ok(await ask(M, 'qa_nv1'), 'xin');
  const stale = await withdraw(M, 'qa_nv1', { expectedRev: 0 });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'ADVANCE_REQUEST_STALE');
  const res = await withdraw(M, 'qa_nv1', { expectedRev: 1 });
  ok(res, 'rút');
  assert.equal(res.data.item.status, null);
  assert.deepEqual((await list(M)).data.items, []);
  ok(await ask(M, 'qa_nv1'), 'xin lại');
  ok(await approve(M, 'qa_nv1'), 'duyệt');
  const late = await withdraw(M, 'qa_nv1');
  assert.equal(late.status, 409);
  assert.equal(late.data.code, 'ADVANCE_NOT_PENDING');
  assert.deepEqual(
    (await auditRows(M)).map(r => r.action),
    ['advance.request', 'advance.withdraw', 'advance.request', 'advance.approve']
  );
});

test('huỷ duyệt: yêu cầu về chờ duyệt, tạm ứng về 0 ₫; huỷ người chưa duyệt là 409', async () => {
  const M = monthOf();
  await setup(M);
  ok(await ask(M, 'qa_nv1'), 'xin');
  ok(await approve(M, 'qa_nv1'), 'duyệt');
  const res = await cancel(M, 'qa_nv1', { expectedRev: 2, reason: 'Duyệt nhầm' });
  ok(res, 'huỷ duyệt');
  assert.equal(res.data.item.status, 'pending');
  assert.equal((await estimate(M, 'qa_nv1')).advance, 0);
  const none = await cancel(M, 'qa_nv1');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'ADVANCE_NOT_APPROVED');
});

test('duyệt tất cả: chỉ duyệt yêu cầu đang chờ (bỏ người đã bị từ chối, người chưa xin, người có số đã chốt 0 ₫); rev của tháng lệch là 409', async () => {
  const M = monthOf();
  await setup(M);
  // qa_zero: được ứng nhưng không có ngày đi làm; số đã chốt 0 ₫ nên chính nhân sự cũng không xin được (ADVANCE_ZERO)
  await F.person('qa_zero', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
  const zero = await ask(M, 'qa_zero');
  assert.equal(zero.status, 409);
  assert.equal(zero.data.code, 'ADVANCE_ZERO');
  ok(await ask(M, 'qa_nv1'), 'xin 1');
  ok(await ask(M, 'qa_nv2'), 'xin 2');
  ok(await reject(M, 'qa_nv2'), 'từ chối 2');
  ok(await ask(M, 'qa_nv3'), 'xin 3');
  const rev = (await list(M)).data.rev;
  const stale = await approveAll(M, { expectedRev: rev + 5 });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'ADVANCE_REQUESTS_STALE');
  const res = await approveAll(M, { expectedRev: rev });
  ok(res, 'duyệt tất cả');
  assert.deepEqual(res.data.approved.sort(), ['qa_nv1', 'qa_nv3']);
  assert.deepEqual(res.data.skipped, []);
  assert.equal((await estimate(M, 'qa_nv1')).advance, ruleFigure(M));
  assert.equal((await estimate(M, 'qa_nv3')).advance, ruleFigure(M));
  assert.equal((await estimate(M, 'qa_nv2')).advance, 0, 'đã bị từ chối');
  assert.equal(itemOf((await list(M)).data, 'qa_nv2').status, 'rejected');
  const twice = await approveAll(M);
  ok(twice, 'lần hai');
  assert.deepEqual(twice.data.approved, []);
});

test('không đủ điều kiện: hồ sơ tắt tạm ứng thì xin là 403 ADVANCE_NOT_ELIGIBLE, không lưu gì; tài khoản không được trả lương cũng vậy', async () => {
  const M = monthOf();
  await setup(M);
  const res = await ask(M, 'qa_off');
  assert.equal(res.status, 403);
  assert.equal(res.data.code, 'ADVANCE_NOT_ELIGIBLE');
  assert.equal((await ask(M, 'admin')).status, 403);
  assert.equal((await auditRows(M)).length, 0);
  assert.deepEqual((await list(M)).data.items, []);
  const mine = await list(M, 'qa_off');
  assert.equal(mine.data.item.eligible, false);
  assert.equal(mine.data.item.amount, 0);
});

test('kỳ đã duyệt: xin, rút, duyệt, từ chối, huỷ duyệt và duyệt tất cả là 409 PERIOD_LOCKED; phiếu giữ tạm ứng đã duyệt', async () => {
  const M = monthOf();
  await setup(M);
  ok(await ask(M, 'qa_nv1'), 'xin 1');
  ok(await approve(M, 'qa_nv1'), 'duyệt 1');
  ok(await ask(M, 'qa_nv2'), 'xin 2');
  await P.advance(M, 'approved');
  const slips = (await F.call('GET', `/periods/${M}/payslips?pageSize=200`)).data.rows;
  assert.equal(slips.find(r => r.username === 'qa_nv1').advance, ruleFigure(M), 'phiếu lấy tạm ứng đã duyệt');
  assert.equal(slips.find(r => r.username === 'qa_nv2').advance, 0, 'đang chờ: 0');
  const n = (await auditRows(M)).length;
  for (const res of [
    await ask(M, 'qa_nv3'),
    await withdraw(M, 'qa_nv2'),
    await approve(M, 'qa_nv2'),
    await reject(M, 'qa_nv2'),
    await cancel(M, 'qa_nv1'),
    await approveAll(M)
  ]) {
    assert.equal(res.status, 409, JSON.stringify(res.data));
    assert.equal(res.data.code, 'PERIOD_LOCKED');
  }
  assert.equal((await auditRows(M)).length, n);
});

test('chưa chốt: trước ngày advance.untilDay số còn chưa chốt (provisional true) và chỉ gồm ngày đã qua', async () => {
  const M = monthOf();
  await setup(M);
  await F.at(`${M}-10T12:00:00`);
  const res = await list(M, 'qa_nv1');
  ok(res, 'của mình');
  assert.equal(res.data.provisional, true);
  assert.ok(res.data.item.amount < ruleFigure(M), 'chưa đủ ngày tới 15');
});

test('quyền: chưa đăng nhập 401; nhân sự không duyệt, không từ chối, không huỷ, không duyệt tất cả (403), không xem của người khác; chỉ xin cho chính mình', async () => {
  const M = monthOf();
  await setup(M);
  assert.equal((await ask(M, null)).status, 401);
  // username trong thân bị bỏ qua: luôn là tài khoản đang đăng nhập
  ok(await ask(M, 'qa_nv2', { username: 'qa_nv1' }), 'xin');
  assert.equal((await list(M, 'qa_nv2')).data.item.status, 'pending');
  assert.equal((await list(M, 'qa_nv1')).data.item.status, null);
  assert.equal((await approve(M, 'qa_nv2', {}, null)).status, 401);
  assert.equal((await approve(M, 'qa_nv2', {}, 'qa_nv1')).status, 403);
  assert.equal((await approve(M, 'qa_nv2', {}, 'qa_nv2')).status, 403);
  assert.equal((await reject(M, 'qa_nv2', {}, 'qa_nv1')).status, 403);
  assert.equal((await approveAll(M, {}, 'qa_nv1')).status, 403);
  ok(await approve(M, 'qa_nv2'), 'Admin duyệt');
  assert.equal((await cancel(M, 'qa_nv2', {}, 'qa_nv2')).status, 403);
  const other = await F.call('GET', `/advance-approvals?month=${M}&username=qa_nv2`, { who: 'qa_nv1' });
  assert.equal(other.status, 403);
  assert.equal((await auditRows(M)).length, 2);
  assert.equal((await ask('2026-13', 'qa_nv1')).status, 400);
});
