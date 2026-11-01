'use strict';
// Kỳ lương đi tiếp khi còn việc chưa xong: mỗi trường hợp vẫn thành công (200) và trả cảnh báo mang mã riêng.
//   - chốt công: MONTH_NOT_ENDED, OPEN_SESSIONS, PENDING_APPROVALS, MISSING_START_DATE (bỏ qua có acknowledge thì không cảnh báo);
//   - duyệt kỳ: PERIOD_NOT_READY (còn phiếu chưa duyệt hoặc phiếu lỗi chưa loại);
//   - duyệt phiếu: PAYSLIP_STATE (phiếu nháp, chưa qua AI), PAYSLIP_FLAGGED (còn phát hiện AI), SELF_DECISION_FORBIDDEN (phiếu của chính mình);
//   - trả lại phiếu và loại phiếu lỗi: ghi chú, lý do không bắt buộc (quá 300 ký tự vẫn là 400).
// Các lỗi thật của kỳ (sai trạng thái, rev lệch, phiếu không có thật) ở period-lifecycle.test.ts. Mỗi test dùng một tháng riêng.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/domain/payroll/payroll-service');

const { F, store, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const getPeriod = async (month?, who = 'admin') => await F.call('GET', `/periods/${month}`, { who });
const codesOf = (res?) => (res.data.warnings || []).map(w => w.code);
const reasonOk = 'Lý do đủ mười ký tự';
async function addIsat(month?) {
  const days = { ...(await store.getSheet('qa_nv1', month)).days, [await P.lastDow(month, 6)]: { kind: 'isat' } };
  const res = await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month, days } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

/* ================= chốt công ================= */
test('Chốt công: tháng chưa hết (MONTH_NOT_ENDED) vẫn chốt được, kèm cảnh báo MONTH_NOT_ENDED', async () => {
  const M = monthOf();
  await P.seed(M);
  await F.at(`${M}-20T09:00:00`);
  const view = (await getPeriod(M)).data;
  const item = view.checklist.find(i => i.code === 'MONTH_NOT_ENDED');
  assert.ok(item, JSON.stringify(view.checklist));
  assert.deepEqual([item.severity, item.acknowledgeable, item.count], ['warn', false, 1]);
  const res = await P.step(M, 'lock-attendance', {});
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.status, 'attendance_locked');
  assert.ok(codesOf(res).includes('MONTH_NOT_ENDED'), JSON.stringify(res.data.warnings));
  assert.ok(res.data.checklist.some(i => i.code === 'MONTH_NOT_ENDED'));
  assert.equal((await P.periodRow(M)).status, 'attendance_locked');
});

test('Chốt công: còn phiên Check-in mở (OPEN_SESSIONS) vẫn chốt được, kèm cảnh báo OPEN_SESSIONS; lượt mở quá 16 giờ được đóng thành quên Check-out và không đếm', async () => {
  const M = monthOf();
  await P.seed(M);
  const PunchRules = require('../../src/engine/punch');
  const staff = { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] };
  const plan = PunchRules.planShift(staff, P.firstDow(M, 1));
  const stale = PunchRules.openDay(staff, `${plan.date}T08:00:00+07:00`, plan);
  const staleSession = await store.createSession('qa_nv1', stale.date, 'open', stale.entry);
  const live = PunchRules.openDay(staff, `${plan.date}T08:00:00+07:00`, plan);
  const liveIn = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  await store.createSession('qa_tts1', live.date, 'open', { ...live.entry, presIn: liveIn });
  const view = (await getPeriod(M)).data;
  assert.equal(
    (await store.getSession(staleSession.id)).state,
    'closed',
    'lượt quá 16 giờ đã được đóng, không đếm là đang mở'
  );
  assert.equal((await store.getSession(staleSession.id)).entry.reason, 'forgot-out');
  const item = view.checklist.find(i => i.code === 'OPEN_SESSIONS');
  assert.ok(item, JSON.stringify(view.checklist));
  assert.deepEqual([item.severity, item.acknowledgeable, item.count], ['warn', false, 1]);
  const res = await P.step(M, 'lock-attendance', {});
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(codesOf(res).includes('OPEN_SESSIONS'), JSON.stringify(res.data.warnings));
  assert.equal(res.data.status, 'attendance_locked');
});

test('Chốt công: khoản chờ duyệt vẫn chốt được kèm cảnh báo PENDING_APPROVALS; bỏ qua có acknowledge thì không cảnh báo và nhật ký ghi lý do và mã đã bỏ qua; lý do quá 300 ký tự là 400 REASON_REQUIRED', async () => {
  const M = monthOf();
  await P.seed(M);
  await addIsat(M);
  const view = (await getPeriod(M)).data;
  const pendingItem = view.checklist.find(i => i.code === 'PENDING_APPROVALS');
  assert.ok(pendingItem && pendingItem.count >= 1, JSON.stringify(view.checklist));
  assert.equal(pendingItem.severity, 'warn');
  const tooLong = await P.step(M, 'lock-attendance', { acknowledge: ['PENDING_APPROVALS'], reason: P.text(301) });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.data.code, 'REASON_REQUIRED');
  assert.equal((await getPeriod(M)).data.status, 'open', 'lỗi dữ liệu thì không chốt');
  const warned = P.must(await P.step(M, 'lock-attendance'), 'chốt công không bỏ qua');
  assert.equal(warned.data.status, 'attendance_locked');
  assert.ok(codesOf(warned).includes('PENDING_APPROVALS'), JSON.stringify(warned.data.warnings));
  assert.deepEqual(
    warned.data.checklist.map(i => i.code),
    ['ABSENT_NO_EXPLANATION', 'PENDING_APPROVALS'] // tháng bịa khai ngày đi làm mà không ai chấm: ngày vắng chưa có giải trình
  );
  const N = monthOf();
  await P.seed(N);
  await addIsat(N);
  const ok = P.must(
    await P.step(N, 'lock-attendance', { acknowledge: ['PENDING_APPROVALS'], reason: P.text(10) }),
    'chốt công có bỏ qua'
  );
  assert.equal(ok.data.status, 'attendance_locked');
  assert.ok(!codesOf(ok).includes('PENDING_APPROVALS'), 'đã bỏ qua nên không cảnh báo');
  const row = (await P.auditOf(N)).find(r => r.action === 'period.lock-attendance');
  assert.equal(row.reason, P.text(10));
  assert.deepEqual(row.after.acknowledged, ['PENDING_APPROVALS']);
  assert.equal(row.after.checklist.PENDING_APPROVALS, pendingItem.count);
});

test('Chốt công: nhân sự CTV/NV thiếu ngày bắt đầu (MISSING_START_DATE) vẫn chốt được kèm cảnh báo; bỏ qua có lý do thì không cảnh báo', async () => {
  const M = monthOf();
  await P.seed(M);
  await F.person('qa_nostart', 'staff', { type: 'ctv', level: 1, startDate: null });
  const view = (await getPeriod(M)).data;
  const item = view.checklist.find(i => i.code === 'MISSING_START_DATE');
  assert.ok(item, JSON.stringify(view.checklist));
  assert.deepEqual([item.severity, item.count], ['warn', 1]);
  const warned = P.must(await P.step(M, 'lock-attendance'), 'chốt công không bỏ qua');
  assert.ok(codesOf(warned).includes('MISSING_START_DATE'), JSON.stringify(warned.data.warnings));
  const N = monthOf();
  await P.seed(N);
  const ok = P.must(
    await P.step(N, 'lock-attendance', { acknowledge: ['MISSING_START_DATE'], reason: reasonOk }),
    'bỏ qua'
  );
  assert.ok(!codesOf(ok).includes('MISSING_START_DATE'));
});

/* ================= duyệt kỳ ================= */
test('Duyệt kỳ khi còn phiếu chưa duyệt vẫn duyệt, kèm cảnh báo PERIOD_NOT_READY; phiếu chờ được duyệt cùng và lần chạy thành final', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const rows = await P.slipRows(M);
  P.must(await P.decide(M, P.itemsOf(rows.slice(0, 3))), 'duyệt 3 phiếu');
  const res = await P.step(M, 'approve');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.status, 'approved');
  assert.ok(codesOf(res).includes('PERIOD_NOT_READY'), JSON.stringify(res.data.warnings));
  assert.deepEqual(
    (await P.slipRows(M)).map(r => r.status),
    ['approved', 'approved', 'approved', 'approved']
  );
  assert.equal((await P.runsOf(M))[0].status, 'final');
  const last = (await P.slipRows(M)).find(r => r.username === rows[3].username);
  const late = await P.decide(M, [{ username: last.username, rev: last.rev }], 'return', 'Trả lại sau khi chốt kỳ');
  assert.equal(late.status, 409);
  assert.equal(late.data.code, 'PERIOD_STATE');
});

test('Duyệt kỳ khi còn phiếu lỗi chưa loại vẫn duyệt, kèm cảnh báo PERIOD_NOT_READY; phiếu lỗi không có thực lĩnh', async () => {
  const M = monthOf();
  await P.seed(M);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const original = service.computeFor;
  service.computeFor = (month, staff, ...rest) => {
    if (staff.username === 'qa_ctv1') throw Object.assign(new Error('thiếu dữ liệu thử'), { code: 'TEST_MISSING' });
    return original(month, staff, ...rest);
  };
  try {
    P.must(await P.step(M, 'calculate'), 'tính lương');
  } finally {
    service.computeFor = original;
  }
  P.must(await P.step(M, 'ai-review'), 'AI kiểm tra');
  const rows = await P.slipRows(M);
  P.must(await P.decide(M, P.itemsOf(rows.filter(r => r.status === 'pending'))), 'duyệt các phiếu tốt');
  const res = await P.step(M, 'approve');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.status, 'approved');
  assert.ok(codesOf(res).includes('PERIOD_NOT_READY'), JSON.stringify(res.data.warnings));
  assert.equal((await flow.payslipsOf(M)).slips.qa_ctv1.net, null, 'phiếu lỗi không có thực lĩnh');
});

/* ================= duyệt và trả lại phiếu ================= */
test('Duyệt phiếu còn nháp (chưa qua AI kiểm tra) vẫn được, kèm cảnh báo PAYSLIP_STATE', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const rows = await P.slipRows(M);
  assert.deepEqual(
    rows.map(r => r.status),
    ['draft', 'draft', 'draft', 'draft']
  );
  const res = await P.decide(M, P.itemsOf(rows));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(codesOf(res).includes('PAYSLIP_STATE'), JSON.stringify(res.data.warnings));
  assert.deepEqual(
    (await P.slipRows(M)).map(r => r.status),
    ['approved', 'approved', 'approved', 'approved']
  );
});

test('Duyệt phiếu còn phát hiện AI chưa xử lý vẫn được kèm cảnh báo PAYSLIP_FLAGGED, ghi chú tuỳ chọn; phát hiện đã bỏ qua kèm lý do thì không cảnh báo', async () => {
  const flagFirst = async (month?) => {
    await P.setupMonth(month, 'reviewed');
    // AI của kỳ này không có phát hiện nào; gắn cờ trực tiếp ở tầng kho dữ liệu để mô phỏng một phát hiện còn mở
    await store.payroll.applyAiReview((await store.payroll.currentRun(month)).id, { qa_nv1: ['isat-frequency'] });
    const rows = await P.slipRows(month);
    assert.deepEqual(rows.find(r => r.username === 'qa_nv1').flags, ['isat-frequency']);
    return rows;
  };
  // duyệt riêng một phiếu, không ghi chú
  const A = monthOf();
  const rowsA = await flagFirst(A);
  const flaggedA = rowsA.find(r => r.username === 'qa_nv1');
  const single = await P.decide(A, [{ username: 'qa_nv1', rev: flaggedA.rev }]);
  assert.equal(single.status, 200, JSON.stringify(single.data));
  assert.ok(codesOf(single).includes('PAYSLIP_FLAGGED'), JSON.stringify(single.data.warnings));
  assert.equal(single.data.items[0].status, 'approved');
  // duyệt cả lô có phiếu cờ
  const B = monthOf();
  const rowsB = await flagFirst(B);
  const batch = await P.decide(B, P.itemsOf(rowsB));
  assert.equal(batch.status, 200, JSON.stringify(batch.data));
  assert.ok(codesOf(batch).includes('PAYSLIP_FLAGGED'), JSON.stringify(batch.data.warnings));
  assert.deepEqual(
    (await P.slipRows(B)).map(r => r.status),
    ['approved', 'approved', 'approved', 'approved']
  );
  // phát hiện đã bỏ qua kèm lý do: duyệt riêng không còn cảnh báo, ghi chú được lưu
  const C = monthOf();
  const rowsC = await flagFirst(C);
  const flaggedC = rowsC.find(r => r.username === 'qa_nv1');
  await require('../../src/domain/findings/findings').dismiss({
    month: C,
    username: 'qa_nv1',
    rule: 'isat-frequency',
    reason: 'Đã xem, hợp lệ theo biên bản',
    by: 'admin'
  });
  const ok = P.must(
    await P.decide(C, [{ username: 'qa_nv1', rev: flaggedC.rev }], 'approve', 'Đã xem phát hiện, hợp lệ'),
    'duyệt riêng'
  );
  assert.ok(!codesOf(ok).includes('PAYSLIP_FLAGGED'), JSON.stringify(ok.data.warnings));
  const after = (await P.slipRows(C)).find(r => r.username === 'qa_nv1');
  assert.equal(after.note, 'Đã xem phát hiện, hợp lệ');
  assert.equal(after.decidedBy, 'admin');
});

test('Duyệt hay trả lại phiếu của chính mình vẫn được, kèm cảnh báo SELF_DECISION_FORBIDDEN; phiếu người khác không cảnh báo', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  await P.grant('qa_nv1', 'cb');
  const rows = await P.slipRows(M);
  const self = rows.find(r => r.username === 'qa_nv1');
  const approve = await P.decide(M, [{ username: 'qa_nv1', rev: self.rev }], 'approve', 'Ghi chú đủ dài', 'qa_nv1');
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  assert.ok(codesOf(approve).includes('SELF_DECISION_FORBIDDEN'), JSON.stringify(approve.data.warnings));
  const approved = (await P.slipRows(M)).find(r => r.username === 'qa_nv1');
  assert.equal(approved.status, 'approved');
  const back = await P.decide(M, [{ username: 'qa_nv1', rev: approved.rev }], 'return', 'Ghi chú đủ dài', 'qa_nv1');
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.ok(codesOf(back).includes('SELF_DECISION_FORBIDDEN'));
  const others = rows.filter(r => r.username !== 'qa_nv1');
  const ok = P.must(await P.decide(M, P.itemsOf(others), 'approve', undefined, 'qa_nv1'), 'cb duyệt phiếu người khác');
  assert.equal(ok.data.items.length, 3);
  assert.ok(!codesOf(ok).includes('SELF_DECISION_FORBIDDEN'), 'phiếu người khác thì không cảnh báo');
  const audit = (await P.auditOf(M)).filter(r => r.action === 'payslip.approve' || r.action === 'payslip.return');
  assert.ok(audit.every(r => r.actor === 'qa_nv1'));
});

test('Trả lại phiếu: ghi chú tuỳ chọn (thiếu, rỗng, ngắn đều được), quá 300 ký tự là 400 NOTE_TOO_LONG; phiếu về draft và rev tăng; duyệt kỳ lúc còn phiếu nháp vẫn được kèm cảnh báo', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const rows = await P.slipRows(M);
  const longNote = await P.decide(M, [{ username: rows[3].username, rev: rows[3].rev }], 'return', P.text(301));
  assert.equal(longNote.status, 400);
  assert.equal(longNote.data.code, 'NOTE_TOO_LONG');
  for (const [i, note] of [undefined, '', 'ngắn'].entries()) {
    const target = rows[i];
    const res = await P.decide(M, [{ username: target.username, rev: target.rev }], 'return', note);
    assert.equal(res.status, 200, `note=${JSON.stringify(note)}: ${JSON.stringify(res.data)}`);
    assert.deepEqual(res.data.items, [{ username: target.username, status: 'draft', rev: target.rev + 1 }]);
  }
  const ok = P.must(
    await P.decide(M, [{ username: rows[3].username, rev: rows[3].rev }], 'return', 'Sai giờ OT, tính lại'),
    'trả lại có ghi chú'
  );
  assert.equal(ok.data.items[0].status, 'draft');
  const after = (await P.slipRows(M)).find(r => r.username === rows[3].username);
  assert.deepEqual([after.status, after.note, after.decidedBy], ['draft', 'Sai giờ OT, tính lại', 'admin']);
  assert.equal((await P.auditOf(M)).filter(r => r.action === 'payslip.return').length, 4);
  const approve = await P.step(M, 'approve');
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  assert.ok(codesOf(approve).includes('PERIOD_NOT_READY'), JSON.stringify(approve.data.warnings));
});
