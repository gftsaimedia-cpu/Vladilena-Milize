'use strict';
// pay-entry-lifecycle, pay-entry-engine, pay-entry-locked-month, pay-entry-self-decision, payslip-snapshot (ca có m.entries)
// Khoản điền thêm = ĐẦU VÀO của phép tính theo người theo tháng (cộng hoặc trừ), có lý do, người duyệt khác người lập, cờ thuế và bảo hiểm do Kế toán
// xác nhận (chưa xác nhận: chịu thuế, không vào nền bảo hiểm). Khác "số sửa trên phiếu" (sửa kết quả). Chỉ khoản ĐÃ DUYỆT vào bộ máy.
// Hợp đồng API THẬT: xem đầu test/helpers/pay-entry-api.ts. `pay-entry-zero-drift` nằm ở file riêng (cần bảng rỗng).
// Số tiền kiểm bằng khối cũ trên cùng dữ liệu (flow.expectedFor) cộng phần đuôi luật tái tính độc lập (helpers/pay-oracle.js → oracle.netAfter).
const E = require('../helpers/pay-entry-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, flow, MAKER, CHECKER } = E;

// Đi tiếp từ kỳ đã tính tới `target` (E.advance chạy từ đầu nên chỉ gọi được một lần cho mỗi kỳ)
async function moveOn(month?, target?) {
  const status = (await F.call('GET', `/periods/${month}`)).data.status;
  if (status === 'calculated') {
    E.must(await E.approveAllPending(month), 'duyệt phiếu');
    E.must(await E.step(month, 'approve'), 'duyệt kỳ');
  }
  if (target === 'paid') E.must(await E.step(month, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
}

before(F.start);
after(F.stop);

test('pay-entry-lifecycle: lập khoản (pending, rev 1) → sửa khi pending (rev tăng, rev cũ là 409 REV_STALE) → duyệt bởi người khác (approved) → không sửa được nữa → huỷ (void); không có đường xoá; nhật ký entry.create, entry.update, entry.decide, entry.void mức pay', async () => {
  const M = await E.setup();
  const e = await E.mustCreate(M);
  assert.equal(e.status, 'pending');
  assert.equal(e.rev, 1);
  assert.equal(e.createdBy, MAKER);
  const edit = await F.call('PUT', `/pay-entries/${e.id}`, { who: MAKER, body: { rev: 1, amount: 600000 } });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.entry.rev, 2);
  assert.equal(edit.data.entry.amount, 600000);
  const stale = await F.call('PUT', `/pay-entries/${e.id}`, { who: MAKER, body: { rev: 1, amount: 700000 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'REV_STALE');
  const approved = await E.mustApprove(edit.data.entry);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.decidedBy, CHECKER);
  const frozen = await F.call('PUT', `/pay-entries/${e.id}`, {
    who: MAKER,
    body: { rev: approved.rev, amount: 900000 }
  });
  assert.equal(frozen.status, 409);
  assert.equal(frozen.data.code, 'ENTRY_NOT_PENDING');
  const voided = await F.call('POST', `/pay-entries/${e.id}/void`, {
    who: MAKER,
    body: { rev: approved.rev, reason: 'Nhập nhầm người nhận' }
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  assert.equal(voided.data.entry.status, 'void');
  assert.equal(await E.statusOf(e.id, M), 'void');
  const del = await F.call('DELETE', `/pay-entries/${e.id}`);
  assert.ok([403, 404, 405].includes(del.status), `không có đường xoá khoản (nhận ${del.status})`);
  const rows = await E.auditRows('entry.%');
  for (const action of ['entry.create', 'entry.update', 'entry.decide', 'entry.void'])
    assert.ok(
      rows.some(r => r.action === action),
      action
    );
  assert.ok(
    rows.every(r => r.sensitivity === 'pay'),
    'mức pay'
  );
});

test('pay-entry-lifecycle: GET trả { month, periodStatus, requireApproval, entries } và lọc theo người, trạng thái; khoản đã từ chối không duyệt lại được', async () => {
  const M = await E.setup();
  const a = await E.mustCreate(M);
  await E.mustCreate(M, { username: 'qa_nv1', amount: 300000 });
  const all = await E.list(M);
  assert.equal(all.status, 200);
  assert.equal(all.data.month, M);
  assert.equal(all.data.periodStatus, 'open');
  assert.equal(all.data.requireApproval, true);
  assert.equal(all.data.entries.length, 2);
  assert.deepEqual(
    (await E.list(M, '&username=qa_nv1')).data.entries.map(r => r.username),
    ['qa_nv1']
  );
  const rejected = await E.decide(a.id, 'rejected', { rev: 1, note: 'Chưa đủ căn cứ để chi' });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.data));
  assert.equal(rejected.data.entry.status, 'rejected');
  assert.equal(rejected.data.entry.decisionNote, 'Chưa đủ căn cứ để chi');
  const again = await E.decide(a.id, 'approved', { rev: rejected.data.entry.rev });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, 'ENTRY_NOT_PENDING');
  assert.deepEqual(
    (await E.list(M, '&status=pending')).data.entries.map(r => r.username),
    ['qa_nv1']
  );
  assert.equal((await E.decide(a.id, 'maybe', { rev: 1 })).status, 400, 'quyết định lạ');
});

test('pay-entry-lifecycle: đầu vào sai là 400 (người lạ là 404) và không ghi gì: số tiền 0, âm, lẻ, chuỗi số, hướng lạ, nhãn dài, lý do quá dài, tháng sai, cờ thuế trên khoản trừ, người không được trả lương', async () => {
  const M = await E.setup();
  const before = await F.snapshot();
  const bad = [
    [{ amount: 0 }, 'số tiền 0'],
    [{ amount: -5 }, 'số tiền âm'],
    [{ amount: 1500.5 }, 'số tiền lẻ'],
    [{ amount: '500000' }, 'số tiền là chuỗi'],
    [{ direction: 'plus' }, 'hướng lạ'],
    [{ label: 'x'.repeat(81) }, 'nhãn dài'],
    [{ label: '' }, 'thiếu nhãn'],
    [{ reason: 'x'.repeat(301) }, 'lý do dài'],
    [{ month: '2026-13' }, 'tháng sai'],
    [{ direction: 'deduct', taxMode: 'full' }, 'cờ thuế trên khoản trừ'],
    [{ taxMode: 'cap' }, 'cap thiếu hạn mức'],
    [{ taxMode: 'half' }, 'taxMode lạ'],
    [{ insuranceBase: 600000 }, 'nền bảo hiểm lớn hơn số tiền'],
    [{ username: 'admin' }, 'Admin không thuộc diện trả lương']
  ];
  for (const [over, what] of bad) {
    const res = await E.create(M, over);
    assert.equal(res.status, 400, `${what}: ${res.status} ${JSON.stringify(res.data)}`);
    assert.ok(res.data.code, `${what}: có mã lỗi`);
  }
  assert.equal((await E.create(M, { username: 'khongcoai' })).status, 404, 'người lạ');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], '400 và 404 không ghi gì');
});

test('pay-entry-lifecycle: POST /api/pay-entries/bulk nhận { month, entries } và { usernames, month, … }, trả { count, entries }; một khoản sai làm cả lô bị từ chối (400) và không lưu khoản nào', async () => {
  const M = await E.setup();
  const ok = await F.call('POST', '/pay-entries/bulk', {
    body: { month: M, entries: [E.entry(M), E.entry(M, { username: 'qa_nv1', amount: 300000 })] }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.count, 2);
  assert.equal(ok.data.entries.length, 2);
  const shared = await F.call('POST', '/pay-entries/bulk', {
    body: {
      month: M,
      usernames: ['qa_ctv1', 'qa_tts1'],
      direction: 'add',
      amount: 100000,
      label: 'Hỗ trợ chung',
      reason: 'Hỗ trợ chung cho nhóm thử'
    }
  });
  assert.equal(shared.status, 200, JSON.stringify(shared.data));
  assert.equal(shared.data.count, 2);
  assert.equal((await E.list(M)).data.entries.length, 4);
  const before = await F.snapshot();
  const mixed = await F.call('POST', '/pay-entries/bulk', {
    body: { month: M, entries: [E.entry(M, { username: 'qa_ctv1' }), E.entry(M, { amount: -1 })] }
  });
  assert.equal(mixed.status, 400, JSON.stringify(mixed.data));
  assert.match(mixed.data.error, /Dòng 2/, 'nêu dòng sai');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'cả lô không lưu');
  const both = await F.call('POST', '/pay-entries/bulk', {
    body: { month: M, entries: [E.entry(M)], usernames: ['qa_nv1'] }
  });
  assert.equal(both.status, 400, 'không gửi cả entries và usernames');
});

test('pay-entry-engine: khoản cộng 500.000 chịu thuế (qa_nv2) và khoản trừ 300.000 sau thuế (qa_nv1) đã duyệt vào phiếu đúng đuôi luật: cộng đổi tổng thu nhập, thuế, thực lĩnh; trừ chỉ đổi thực lĩnh; người khác không đổi một đồng; bản chụp có m.entries', async () => {
  const M = await E.setup();
  const legacy = await flow.expectedFor(M);
  const add = await E.mustCreate(M, { username: 'qa_nv2', direction: 'add', amount: 500000 });
  const minus = await E.mustCreate(M, {
    username: 'qa_nv1',
    direction: 'deduct',
    amount: 300000,
    label: 'Hoàn tạm ứng văn phòng phẩm'
  });
  await E.mustApprove(add);
  await E.mustApprove(minus);
  const slips = await E.slipsOf(M);
  E.expectSlip(slips.qa_nv2, legacy.qa_nv2.m, { addTaxable: 500000 }, 'qa_nv2');
  E.expectSlip(slips.qa_nv1, legacy.qa_nv1.m, { deductAfterTax: 300000 }, 'qa_nv1');
  assert.equal(slips.qa_nv1.gross, legacy.qa_nv1.net.gross, 'khoản trừ không đổi tổng thu nhập');
  assert.equal(slips.qa_nv1.tax, legacy.qa_nv1.net.tax, 'khoản trừ không đổi thuế');
  for (const u of ['qa_tts1', 'qa_ctv1']) assert.equal(slips[u].net, legacy[u].net.net, u);
  const nv2 = slips.qa_nv2.snapshot;
  assert.equal(E.findKey(nv2, 'entriesAdd'), 500000);
  assert.equal(JSON.stringify(E.findKey(nv2, 'entries')).includes('Thưởng một lần'), true, 'm.entries liệt kê khoản');
  assert.equal(E.findKey(slips.qa_nv1.snapshot, 'entriesDeduct'), 300000);
  // m.entries không lộ lý do hay người lập (dữ liệu nội bộ của quy trình)
  assert.ok(
    !JSON.stringify(E.findKey(nv2, 'entries')).includes('Thưởng hoàn thành dự án'),
    'không có lý do trong bản chụp'
  );
});

test('pay-entry-engine: cờ miễn thuế CHƯA Kế toán xác nhận không có hiệu lực (khoản 20.000.000 đề nghị "miễn toàn bộ" vẫn chịu thuế); Kế toán xác nhận (confirm-flags) từ tháng đó thì được miễn; C&B không xác nhận được (403)', async () => {
  const M1 = await E.setup();
  const legacy1 = await flow.expectedFor(M1);
  const e1 = await E.mustCreate(M1, { amount: 20000000, taxMode: 'full' });
  await E.mustApprove(e1);
  const s1 = await E.slipsOf(M1);
  E.expectSlip(s1.qa_nv2, legacy1.qa_nv2.m, { addTaxable: 20000000 }, 'chưa xác nhận');
  // tháng khác: cùng khoản, có xác nhận của Kế toán
  const M2 = await E.setup();
  const legacy2 = await flow.expectedFor(M2);
  await E.grant('qa_ctv1', 'accounting');
  await E.grant('qa_nv1', 'cb');
  const e2 = await E.mustCreate(M2, { amount: 20000000, taxMode: 'full' });
  const denied = await F.call('POST', `/pay-entries/${e2.id}/confirm-flags`, { who: 'qa_nv1', body: { rev: e2.rev } });
  assert.equal(denied.status, 403, 'C&B không có config.legal');
  const confirmed = await F.call('POST', `/pay-entries/${e2.id}/confirm-flags`, {
    who: 'qa_ctv1',
    body: { rev: e2.rev, basis: 'Thông tư 111/2013/TT-BTC, Điều 2' } // căn cứ bắt buộc khi xác nhận cờ
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.entry.flagsConfirmedBy, 'qa_ctv1');
  assert.equal(confirmed.data.entry.rev, e2.rev + 1);
  await E.mustApprove(confirmed.data.entry);
  const s2 = await E.slipsOf(M2);
  E.expectSlip(s2.qa_nv2, legacy2.qa_nv2.m, { addExempt: 20000000 }, 'đã xác nhận');
  assert.ok(s2.qa_nv2.tax < s1.qa_nv2.tax, 'miễn thuế làm thuế giảm so với chưa xác nhận');
});

test('pay-entry-engine: khoản chờ duyệt, bị từ chối, đã huỷ và khoản của THÁNG KHÁC không đổi một đồng nào của tháng này', async () => {
  const M = await E.setup();
  const legacy = await flow.expectedFor(M);
  await E.mustCreate(M, { username: 'qa_nv2', amount: 111000 }); // pending
  const rejected = await E.mustCreate(M, { username: 'qa_nv1', amount: 222000 });
  await E.decide(rejected.id, 'rejected', { rev: 1, note: 'Chưa đủ căn cứ' });
  const voided = await E.mustCreate(M, { username: 'qa_ctv1', amount: 333000 });
  const approved = await E.mustApprove(voided);
  await F.call('POST', `/pay-entries/${voided.id}/void`, {
    body: { rev: approved.rev, reason: 'Nhập nhầm người nhận' }
  });
  const other = await E.setupMonth.pool(); // một tháng khác (nhỏ hơn M): khoản duyệt ở đó không được chạm tháng M
  const elsewhere = await E.mustCreate(other, { username: 'qa_nv2', amount: 999000 });
  await E.mustApprove(elsewhere);
  const slips = await E.slipsOf(M);
  for (const u of flow.PEOPLE.map(p => p.username)) {
    assert.equal(slips[u].net, legacy[u].net.net, `${u}: thực lĩnh giữ nguyên`);
    assert.equal(slips[u].gross, legacy[u].net.gross, `${u}: tổng thu nhập giữ nguyên`);
  }
});

test('pay-entry-locked-month: lập khoản cho kỳ ĐÃ DUYỆT hoặc đã chi trả vẫn lưu, kèm cảnh báo PERIOD_LOCKED có suggestMonth (kỳ mở kế tiếp); kỳ đã tính vẫn nhận khoản và bị đánh dấu cần tính lại', async () => {
  const M = await E.setup();
  const draft = await E.mustCreate(M, { amount: 100000 });
  await E.mustApprove(draft);
  await E.advance(M, 'calculated');
  const late = await E.create(M, { amount: 250000 });
  assert.equal(late.status, 200, 'kỳ đã tính vẫn nhận khoản mới: ' + JSON.stringify(late.data));
  assert.equal((await F.call('GET', `/periods/${M}`)).data.stale, false, 'khoản chờ duyệt chưa đổi đầu vào của bộ máy');
  await E.mustApprove(late.data.entry);
  assert.equal(
    (await F.call('GET', `/periods/${M}`)).data.stale,
    true,
    'khoản đã duyệt sau khi tính làm kỳ cần tính lại'
  );
  await moveOn(M, 'approved');
  const locked = await E.create(M, { amount: 400000 });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  const warning = locked.data.warnings.find(w => w.code === 'PERIOD_LOCKED');
  assert.ok(warning, JSON.stringify(locked.data.warnings));
  assert.match(String(warning.details.suggestMonth), /^\d{4}-(0[1-9]|1[0-2])$/);
  assert.ok(warning.details.suggestMonth > M, 'gợi ý tháng sau');
  await moveOn(M, 'paid');
  const paid = await E.create(M, { amount: 400000 });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.ok(paid.data.warnings.some(w => w.code === 'PERIOD_LOCKED'));
});

test('pay-entry-locked-month: khoản đã lập duyệt, sửa, huỷ khi kỳ đã duyệt vẫn lưu, kèm cảnh báo PERIOD_LOCKED', async () => {
  const M = await E.setup();
  const pending = await E.mustCreate(M, { amount: 100000 });
  const approved = await E.mustApprove(await E.mustCreate(M, { username: 'qa_nv1', amount: 200000 }));
  await E.advance(M, 'calculated');
  await moveOn(M, 'approved');
  const lockedWarned = (res?) => (res.data.warnings || []).some(w => w.code === 'PERIOD_LOCKED');
  const edit = await F.call('PUT', `/pay-entries/${pending.id}`, { body: { rev: pending.rev, amount: 150000 } });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.ok(lockedWarned(edit));
  const decided = await E.decide(pending.id, 'approved', { rev: edit.data.entry.rev });
  assert.equal(decided.status, 200, JSON.stringify(decided.data));
  assert.ok(lockedWarned(decided));
  const voided = await F.call('POST', `/pay-entries/${approved.id}/void`, {
    body: { rev: approved.rev, reason: 'Nhập nhầm người nhận' }
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  assert.ok(lockedWarned(voided));
  assert.equal(await E.statusOf(approved.id, M), 'void');
});

test('pay-entry-self-decision: người lập tự duyệt khoản do mình lập vẫn được, kèm cảnh báo SELF_DECISION_FORBIDDEN; Kế toán (không có payroll.approve) và nhân sự không duyệt được (403); người khác có payroll.approve duyệt được', async () => {
  const M = await E.setup();
  await E.grant('qa_ctv1', 'accounting');
  const e = await E.mustCreate(M);
  assert.equal(
    (await E.decide(e.id, 'approved', { who: 'qa_ctv1', rev: e.rev })).status,
    403,
    'Kế toán không có payroll.approve'
  );
  assert.equal((await E.decide(e.id, 'approved', { who: 'qa_nv1', rev: e.rev })).status, 403, 'nhân sự');
  assert.equal(await E.statusOf(e.id, M), 'pending');
  await E.mustApprove(e);
  assert.equal(await E.statusOf(e.id, M), 'approved');
  const own = await E.mustCreate(M, { username: 'qa_nv1', amount: 120000 });
  const self = await E.decide(own.id, 'approved', { who: MAKER, rev: own.rev });
  assert.equal(self.status, 200, JSON.stringify(self.data));
  assert.ok(self.data.warnings.some(w => w.code === 'SELF_DECISION_FORBIDDEN'));
  assert.equal(await E.statusOf(own.id, M), 'approved');
});

test('pay-entry-self-decision: lập, sửa, huỷ khoản về CHÍNH MÌNH vẫn lưu, kèm cảnh báo SELF_DECISION_FORBIDDEN, kể cả C&B có salary.write', async () => {
  const M = await E.setup();
  await E.grant('qa_nv2', 'cb'); // C&B cũng là một nhân sự được trả lương
  const selfWarned = (res?) => (res.data.warnings || []).some(w => w.code === 'SELF_DECISION_FORBIDDEN');
  const own = await E.create(M, { username: 'qa_nv2' }, 'qa_nv2');
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.ok(selfWarned(own));
  const other = await E.create(M, { username: 'qa_nv1' }, 'qa_nv2');
  assert.equal(other.status, 200, 'lập cho người khác được: ' + JSON.stringify(other.data));
  assert.equal(selfWarned(other), false, 'khoản của người khác không cảnh báo');
  // khoản do Admin lập cho chính C&B: C&B sửa và huỷ khoản về mình thì có cảnh báo
  const aboutCb = await E.mustCreate(M, { username: 'qa_nv2' });
  const edit = await F.call('PUT', `/pay-entries/${aboutCb.id}`, {
    who: 'qa_nv2',
    body: { rev: aboutCb.rev, amount: 900000 }
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.ok(selfWarned(edit));
  const voided = await F.call('POST', `/pay-entries/${aboutCb.id}/void`, {
    who: 'qa_nv2',
    body: { rev: edit.data.entry.rev }
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  assert.ok(selfWarned(voided));
});

test('pay-entry-self-decision: chỉ người có salary.write lập khoản (nhân sự, HR 403, chưa đăng nhập 401); nhân sự không đọc khoản của người khác (403) và không lộ khoản qua danh sách', async () => {
  const M = await E.setup();
  await E.grant('qa_nv2', 'hr');
  const before = await F.snapshot();
  assert.equal((await E.create(M, {}, 'qa_nv1')).status, 403, 'nhân sự');
  assert.equal((await E.create(M, {}, 'qa_nv2')).status, 403, 'HR không có salary.write');
  assert.equal((await E.create(M, {}, null)).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  await E.mustCreate(M);
  assert.equal((await E.list(M, '&username=qa_nv2', 'qa_nv1')).status, 403, 'nhân sự không đọc khoản của người khác');
  assert.equal((await E.list(M, '', null)).status, 401);
});

test('payslip-snapshot: bản chụp phiếu có m.entries bất biến: huỷ khoản sau khi tính không đổi phiếu đã chụp (kỳ báo cần tính lại), tính lại mới bỏ khoản; verify không báo lệch khi đầu vào chưa đổi', async () => {
  const M = await E.setup();
  const legacy = await flow.expectedFor(M);
  const e = await E.mustApprove(await E.mustCreate(M, { amount: 500000 }));
  const slips = await E.slipsOf(M);
  E.expectSlip(slips.qa_nv2, legacy.qa_nv2.m, { addTaxable: 500000 }, 'qa_nv2');
  const snapshotBefore = JSON.stringify(slips.qa_nv2.snapshot);
  const verified = await flow.api('GET', `/periods/${M}/verify`);
  assert.deepEqual(verified.data.mismatched, [], 'trước khi huỷ: verify không báo lệch');
  const voided = await F.call('POST', `/pay-entries/${e.id}/void`, {
    body: { rev: e.rev, reason: 'Nhập nhầm người nhận' }
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  const again = (await flow.payslipsOf(M)).slips;
  assert.equal(JSON.stringify(again.qa_nv2.snapshot), snapshotBefore, 'bản chụp không đổi');
  assert.equal(again.qa_nv2.net, slips.qa_nv2.net);
  // huỷ khoản đã duyệt khi kỳ còn mở (đã tính, chưa duyệt kỳ) đổi đầu vào: kỳ báo cần tính lại; tính lại thì phiếu mới không còn khoản
  const period = (await F.call('GET', `/periods/${M}`)).data;
  assert.equal(period.stale, true);
  assert.deepEqual(period.staleReasons, ['inputs']);
  E.must(await E.step(M, 'calculate'), 'tính lại');
  const recalculated = (await flow.payslipsOf(M)).slips;
  assert.equal(recalculated.qa_nv2.net, legacy.qa_nv2.net.net, 'tính lại không còn khoản');
  assert.equal(E.findKey(recalculated.qa_nv2.snapshot, 'entries'), undefined);
});

/* ===== ca biên: tự xác nhận, khoá kỳ và quyền ===== */

test('pay-entry-self-decision: người nhận khoản tự xác nhận cờ thuế của khoản về mình vẫn được, kèm cảnh báo SELF_DECISION_FORBIDDEN', async () => {
  const M = await E.setup();
  await E.grant('qa_ctv1', 'accounting'); // Kế toán cũng là nhân sự được trả lương
  const e = await E.mustCreate(M, { username: 'qa_ctv1', amount: 2000000, taxMode: 'full' });
  const res = await F.call('POST', `/pay-entries/${e.id}/confirm-flags`, {
    who: 'qa_ctv1',
    body: { rev: e.rev, basis: 'Thông tư 111/2013/TT-BTC, Điều 2' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(res.data.warnings.some(w => w.code === 'SELF_DECISION_FORBIDDEN'));
  assert.equal(res.data.entry.flagsConfirmedBy, 'qa_ctv1');
});

test('pay-entry-lifecycle: sửa khoản cộng (giao diện lưu taxMode "none", insuranceBase 0) thành khoản trừ chỉ bằng { rev, direction } là được (200)', async () => {
  const M = await E.setup();
  const e = await E.mustCreate(M, { taxMode: 'none', insuranceBase: 0 });
  const res = await F.call('PUT', `/pay-entries/${e.id}`, {
    who: E.MAKER,
    body: { rev: e.rev, direction: 'deduct' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.entry.direction, 'deduct');
});

test('pay-entry-lifecycle: nhập hàng loạt với cùng một tên hai lần vẫn lưu, kèm cảnh báo DUPLICATE_ENTRY (tránh trả hai lần)', async () => {
  const M = await E.setup();
  const res = await F.call('POST', '/pay-entries/bulk', {
    body: {
      month: M,
      usernames: ['qa_nv1', 'qa_nv1'],
      direction: 'add',
      amount: 100000,
      label: 'Hỗ trợ chung',
      reason: 'Hỗ trợ chung cho nhóm thử'
    }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(
    res.data.warnings.some(w => w.code === 'DUPLICATE_ENTRY'),
    JSON.stringify(res.data.warnings)
  );
  assert.equal(res.data.count, 2);
});
