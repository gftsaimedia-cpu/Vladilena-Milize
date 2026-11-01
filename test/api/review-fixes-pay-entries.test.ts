'use strict';
// Khoản điền thêm (src/domain/payroll/pay-entries.ts), checklist duyệt kỳ (src/domain/period/periods.ts),
// chức vụ mới trong màn Cài đặt (src/params/store.ts → view) và nhãn (src/params/positions.ts). Dùng đồ dùng của test/helpers/pay-entry-api.ts.
const E = require('../helpers/pay-entry-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, MAKER, CHECKER } = E;
const BASIS = 'Thông tư 111/2013/TT-BTC, Điều 2';

before(F.start);
after(F.stop);

const ACCOUNTANT = 'qa_ctv1'; // Kế toán (config.legal), cũng là nhân sự được trả lương nên không tự xác nhận khoản của mình
const confirm = async (id?, body?, who = ACCOUNTANT) =>
  await F.call('POST', `/pay-entries/${id}/confirm-flags`, { who, body });
const auditReasons = async (action?) =>
  (await F.store.db.prepare('SELECT reason FROM audit_log WHERE action = ?').all(action)).map(r => r.reason);

test('1c-4: xác nhận cờ thuế của khoản: căn cứ không bắt buộc (thiếu vẫn 200), có căn cứ thì vào nhật ký', async () => {
  const M = await E.setup();
  await E.grant(ACCOUNTANT, 'accounting');
  const e = await E.mustCreate(M, { taxMode: 'full' });
  const ok = await confirm(e.id, { rev: e.rev, basis: BASIS });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.entry.flagsConfirmedBy, ACCOUNTANT);
  assert.ok((await auditReasons('entry.confirmFlags')).includes(BASIS), 'căn cứ nằm trong nhật ký');
  const other = await E.mustCreate(M, { username: 'qa_nv1', label: 'Khoản không căn cứ', taxMode: 'full' });
  const res = await confirm(other.id, { rev: other.rev });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.entry.flagsConfirmedBy, ACCOUNTANT);
});

test('1c-4: căn cứ dài quá 300 ký tự là 400, không ghi gì', async () => {
  const M = await E.setup();
  await E.grant(ACCOUNTANT, 'accounting');
  const e = await E.mustCreate(M, { taxMode: 'full' });
  const res = await confirm(e.id, { rev: e.rev, basis: 'a'.repeat(301) });
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal((await E.list(M)).data.entries.find(r => r.id === e.id).flagsConfirmedBy, null);
});

test('1c-4: sửa khoản cộng có cờ cũ thành khoản trừ bỏ cờ thừa kế; cờ GỬI RÕ trên khoản trừ vẫn bị 400 FLAGS_ON_DEDUCT', async () => {
  const M = await E.setup();
  const e = await E.mustCreate(M, { taxMode: 'cap', taxCap: 500000, insuranceBase: 100000 });
  const res = await F.call('PUT', `/pay-entries/${e.id}`, { who: MAKER, body: { rev: e.rev, direction: 'deduct' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.entry.direction, 'deduct');
  assert.equal(res.data.entry.taxMode, null);
  assert.equal(res.data.entry.taxCap, null);
  assert.equal(res.data.entry.insuranceBase, null);
  const e2 = await E.mustCreate(M, { username: 'qa_nv1' });
  const bad = await F.call('PUT', `/pay-entries/${e2.id}`, {
    who: MAKER,
    body: { rev: e2.rev, direction: 'deduct', taxMode: 'full' }
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'FLAGS_ON_DEDUCT');
});

test('1c-4: đổi taxMode khỏi "cap" bỏ taxCap cũ; gửi rõ taxCap với taxMode khác "cap" vẫn là 400 BAD_TAX_CAP', async () => {
  const M = await E.setup();
  const e = await E.mustCreate(M, { taxMode: 'cap', taxCap: 500000 });
  const res = await F.call('PUT', `/pay-entries/${e.id}`, { who: MAKER, body: { rev: e.rev, taxMode: 'full' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.entry.taxMode, 'full');
  assert.equal(res.data.entry.taxCap, null);
  const bad = await F.call('PUT', `/pay-entries/${e.id}`, {
    who: MAKER,
    body: { rev: res.data.entry.rev, taxMode: 'full', taxCap: 100000 }
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'BAD_TAX_CAP');
});

test('1c-4: slipLine: null (hoặc chuỗi rỗng) xoá dòng riêng trên phiếu khi sửa', async () => {
  const M = await E.setup();
  const e = await E.mustCreate(M, { slipLine: 'Thưởng dự án' });
  assert.equal(e.slipLine, 'Thưởng dự án');
  const cleared = await F.call('PUT', `/pay-entries/${e.id}`, { who: MAKER, body: { rev: e.rev, slipLine: null } });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
  assert.equal(cleared.data.entry.slipLine, null);
  const again = await F.call('PUT', `/pay-entries/${e.id}`, {
    who: MAKER,
    body: { rev: cleared.data.entry.rev, slipLine: 'Dòng mới' }
  });
  assert.equal(again.data.entry.slipLine, 'Dòng mới');
  const blank = await F.call('PUT', `/pay-entries/${e.id}`, {
    who: MAKER,
    body: { rev: again.data.entry.rev, slipLine: '' }
  });
  assert.equal(blank.data.entry.slipLine, null);
});

test('1c-4: nhập hàng loạt dạng entries: dòng trùng hẳn (cùng người, tháng, hướng, nhãn) vẫn lưu, kèm cảnh báo DUPLICATE_ENTRY; cùng người khác nhãn thì không cảnh báo', async () => {
  const M = await E.setup();
  const line = {
    username: 'qa_nv1',
    direction: 'add',
    amount: 100000,
    label: 'Hỗ trợ',
    reason: 'Hỗ trợ chung cho nhóm thử'
  };
  const dup = await F.call('POST', '/pay-entries/bulk', { body: { month: M, entries: [line, { ...line }] } });
  assert.equal(dup.status, 200, JSON.stringify(dup.data));
  assert.ok(
    dup.data.warnings.some(w => w.code === 'DUPLICATE_ENTRY'),
    JSON.stringify(dup.data.warnings)
  );
  assert.equal(dup.data.count, 2);
  const N = await E.setup();
  const mixed = await F.call('POST', '/pay-entries/bulk', {
    body: { month: N, entries: [line, { ...line, label: 'Thưởng thêm' }] }
  });
  assert.equal(mixed.status, 200, JSON.stringify(mixed.data));
  assert.equal(mixed.data.count, 2);
  assert.ok(!(mixed.data.warnings || []).some(w => w.code === 'DUPLICATE_ENTRY'));
});

test('1c-4: nhập hàng loạt dạng usernames: tên trùng (kể cả khác hoa thường) vẫn lưu, kèm cảnh báo DUPLICATE_ENTRY', async () => {
  const M = await E.setup();
  const res = await F.call('POST', '/pay-entries/bulk', {
    body: {
      month: M,
      usernames: ['qa_nv1', 'QA_NV1'],
      direction: 'add',
      amount: 100000,
      label: 'Hỗ trợ',
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

test('1c-4: người khác sửa khoản đang chờ duyệt vẫn lưu, kèm cảnh báo EDIT_CREATOR_ONLY; người khác vẫn duyệt hoặc từ chối được', async () => {
  const M = await E.setup();
  const e = await E.mustCreate(M);
  const res = await F.call('PUT', `/pay-entries/${e.id}`, { who: CHECKER, body: { rev: e.rev, amount: 999000 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(
    res.data.warnings.some(w => w.code === 'EDIT_CREATOR_ONLY'),
    JSON.stringify(res.data.warnings)
  );
  assert.equal(res.data.entry.amount, 999000);
  const own = await F.call('PUT', `/pay-entries/${e.id}`, {
    who: MAKER,
    body: { rev: res.data.entry.rev, amount: 600000 }
  });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.ok(!(own.data.warnings || []).some(w => w.code === 'EDIT_CREATOR_ONLY'), 'người lập sửa thì không cảnh báo');
  const approved = await E.mustApprove(own.data.entry);
  assert.equal(approved.status, 'approved');
});

test('1c-4: nhãn và dòng phiếu của khoản có "<" hoặc ">" bị 400; nhãn đủ 80 ký tự thật (emoji) được, 81 thì 400 (không 500)', async () => {
  const M = await E.setup();
  for (const over of [{ label: 'Thưởng <b>' }, { label: 'Thưởng', slipLine: 'a>b' }]) {
    const res = await E.create(M, over);
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.equal(res.data.code, 'BAD_FIELD');
  }
  const ok = await E.create(M, { label: '🎁'.repeat(80) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const tooLong = await E.create(M, { label: '🎁'.repeat(81) });
  assert.equal(tooLong.status, 400, JSON.stringify(tooLong.data));
});

test('1c-4: checklist duyệt kỳ có cảnh báo (không chặn) khi còn khoản điền thêm chờ duyệt và khi lần tính hiện hành đã cũ', async () => {
  const M = await E.setup();
  const pending = await E.mustCreate(M, { username: 'qa_nv2' });
  const approved = await E.mustApprove(await E.mustCreate(M, { username: 'qa_nv1', label: 'Thưởng B' }));
  await E.slipsOf(M); // kỳ đã tính (khoản đã duyệt vào lần tính, khoản chờ thì không)
  const codes = async () => (await F.call('GET', `/periods/${M}`)).data;
  let period = await codes();
  assert.equal(period.status, 'calculated');
  const warn = period.checklist.find(i => i.code === 'PENDING_PAY_ENTRIES');
  assert.ok(warn, JSON.stringify(period.checklist));
  assert.equal(warn.severity, 'warn');
  assert.equal(warn.count, 1);
  assert.equal(warn.acknowledgeable, false);
  assert.equal(
    period.checklist.some(i => i.code === 'RUN_STALE'),
    false,
    'lần tính còn mới'
  );
  // huỷ khoản đã duyệt sau khi tính: đầu vào đổi, lần tính cũ
  const voided = await F.call('POST', `/pay-entries/${approved.id}/void`, {
    who: MAKER,
    body: { rev: approved.rev, reason: 'Nhập nhầm người nhận' }
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  period = await codes();
  assert.equal(period.stale, true);
  const stale = period.checklist.find(i => i.code === 'RUN_STALE');
  assert.ok(stale, JSON.stringify(period.checklist));
  assert.equal(stale.severity, 'warn');
  // duyệt nốt khoản chờ: cảnh báo khoản chờ biến mất
  await E.mustApprove(pending);
  period = await codes();
  assert.equal(
    period.checklist.some(i => i.code === 'PENDING_PAY_ENTRIES'),
    false
  );
});
