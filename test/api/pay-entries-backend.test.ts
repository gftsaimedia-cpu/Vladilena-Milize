'use strict';
// Khoản điền thêm theo người theo tháng.
// Lưu trữ src/domain/payroll/pay-entries.ts, route src/domain/pay-entries.ts, nạp vào bộ máy ở src/domain/payroll/payroll-service.ts → loadInputs.
// Người bịa (qa_*), đồng hồ giả 02/11/2026. pay_entries chỉ thêm dòng (không DELETE) nên mỗi test dùng THÁNG RIÊNG, không dùng lại tháng của test trước.
const F = require('../helpers/api-fixture'); // xác nhận database test tạm trước khi require src/platform/db
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { assertPlain } = require('../helpers/plain-text');
const paramsStore = require('../../src/params/store');
const service = require('../../src/domain/payroll/payroll-service');

const { store } = F;
before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('worker');
  await F.person('worker2');
  await F.person('cbuser');
  await F.person('ketoan');
  await F.person('plain');
  await store.roles.grant('cbuser', 'cb', 'admin');
  await store.roles.grant('ketoan', 'accounting', 'admin');
});
after(F.stop);

// Dãy tháng riêng từ 2027-01 (tháng quản lý đầu tiên là 2026-10): mỗi lần gọi cách nhau 5 tháng để test dùng được cả các tháng kế tiếp (monthAfter)
const MONTH_GAP = 5;
let nextMonth = 0;
const freshMonth = () => {
  const index = nextMonth;
  nextMonth += MONTH_GAP;
  return `${2027 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};
const monthAfter = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const body = (month?, extra: any = {}) => ({
  username: 'worker',
  month,
  direction: 'add',
  amount: 500000,
  label: 'Thưởng đột xuất',
  reason: 'Thưởng hoàn thành dự án quý ba',
  ...extra
});
const make = async (month?, extra: any = {}, who = 'admin') => {
  const res = await F.call('POST', '/pay-entries', { who, body: body(month, extra) });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.entry;
};
const decideOf = async (entry?, decision = 'approved', who = 'cbuser', note?) =>
  await F.call('PUT', `/pay-entries/${entry.id}/decide`, {
    who,
    body: { decision, rev: entry.rev, ...(note ? { note } : {}) }
  });
const approve = async (month?, extra: any = {}) => {
  const entry = await make(month, extra);
  const res = await decideOf(entry);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.entry;
};
const rowsIn = async (month?) =>
  await store.db.prepare('SELECT * FROM pay_entries WHERE month = ? ORDER BY id').all(month);
const lockPeriod = async (month?, status = 'approved') =>
  await store.db.prepare('INSERT INTO payroll_periods (month, status, rev) VALUES (?, ?, 1)').run(month, status);
const auditRows = async (action?, month?) =>
  await store.db.prepare('SELECT * FROM audit_log WHERE action = ? AND month = ? ORDER BY id').all(action, month);
const estimateNet = async (who?, month?) => (await F.call('GET', `/me/estimate?month=${month}`, { who })).data.net;

test('1c: lập khoản cộng chờ duyệt; liệt kê theo tháng và người; nhật ký entry.create mức pay có người lập, số tiền, nhãn', async () => {
  const month = freshMonth();
  const entry = await make(month);
  assert.equal(entry.status, 'pending');
  assert.equal(entry.rev, 1);
  assert.equal(entry.createdBy, 'admin');
  assert.equal(entry.flagsConfirmedBy, null);
  assert.equal(entry.decidedBy, null);
  await make(month, { username: 'worker2', amount: 200000 });
  const all = await F.call('GET', `/pay-entries?month=${month}`);
  assert.equal(all.status, 200);
  assert.equal(all.data.entries.length, 2);
  assert.equal(all.data.periodStatus, 'open');
  assert.equal(all.data.requireApproval, true);
  const mine = await F.call('GET', `/pay-entries?month=${month}&username=worker2`);
  assert.deepEqual(
    mine.data.entries.map(e => [e.username, e.amount]),
    [['worker2', 200000]]
  );
  const logged = await auditRows('entry.create', month);
  assert.equal(logged.length, 2);
  assert.equal(logged[0].sensitivity, 'pay');
  assert.equal(logged[0].actor, 'admin');
  assert.equal(logged[0].subject, 'worker');
  assert.match(logged[0].after_json, /"amount":500000/);
  assert.equal((await F.call('GET', '/pay-entries')).status, 400); // thiếu month
  assert.equal((await F.call('GET', '/pay-entries?month=2027-13')).status, 400);
});

test('1c: người duyệt = người lập vẫn duyệt được, kèm cảnh báo SELF_DECISION_FORBIDDEN, nhật ký ghi mã cảnh báo', async () => {
  const month = freshMonth();
  const entry = await make(month);
  const res = await decideOf(entry, 'approved', 'admin');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(
    res.data.warnings.some(w => w.code === 'SELF_DECISION_FORBIDDEN'),
    JSON.stringify(res.data.warnings)
  );
  assert.equal((await rowsIn(month))[0].status, 'approved');
  const logged = await auditRows('entry.decide', month);
  assert.equal(logged.length, 1);
  assert.ok(JSON.parse(logged[0].after_json).warnings.includes('SELF_DECISION_FORBIDDEN'));
});

test('1c: người khác duyệt: khoản vào ước tính của nhân viên (cộng 500.000 ₫ vào tổng thu nhập và thực lĩnh), nhật ký entry.decide', async () => {
  const month = freshMonth();
  const before = await estimateNet('worker', month);
  const entry = await make(month);
  // chờ duyệt: chưa vào tính lương
  assert.equal((await estimateNet('worker', month)).net, before.net);
  const res = await decideOf(entry, 'approved', 'cbuser', 'Đã đối chiếu quyết định thưởng');
  assert.equal(res.status, 200);
  assert.equal(res.data.entry.status, 'approved');
  assert.equal(res.data.entry.decidedBy, 'cbuser');
  assert.equal(res.data.entry.rev, 2);
  const now = await estimateNet('worker', month);
  assert.equal(now.net, before.net + 500000);
  assert.equal(now.gross, before.gross + 500000);
  assert.equal(now.entriesAdd, 500000);
  assert.equal(now.entriesDeduct, 0);
  // nhân viên khác không bị ảnh hưởng
  assert.equal(Object.hasOwn(await estimateNet('worker2', month), 'entriesAdd'), false);
  const logged = await auditRows('entry.decide', month);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].actor, 'cbuser');
  assert.equal(logged[0].reason, 'Đã đối chiếu quyết định thưởng');
  // ước tính của nhân viên chỉ có nhãn và số, không có lý do hay người lập
  const m = (await F.call('GET', `/me/estimate?month=${month}`, { who: 'worker' })).data.m;
  assert.deepEqual(Object.keys(m.entries[0]).sort(), [
    'amount',
    'direction',
    'flagsConfirmedBy',
    'id',
    'insuranceBase',
    'label',
    'slipLine',
    'taxCap',
    'taxMode'
  ]);
});

test('1c: khoản trừ 300.000 ₫ đã duyệt: thực lĩnh giảm đúng 300.000 ₫, tổng thu nhập không đổi', async () => {
  const month = freshMonth();
  const before = await estimateNet('worker', month);
  await approve(month, { direction: 'deduct', amount: 300000, label: 'Hoàn tạm ứng tháng trước' });
  const now = await estimateNet('worker', month);
  assert.equal(now.net, before.net - 300000);
  assert.equal(now.gross, before.gross);
  assert.equal(now.tax, before.tax);
  assert.equal(now.entriesDeduct, 300000);
});

test('1c: từ chối không bắt buộc ghi chú; khoản bị từ chối và khoản huỷ không vào tính lương; quyết định xong không quyết định lại được (409)', async () => {
  const month = freshMonth();
  const before = await estimateNet('worker', month);
  const entry = await make(month);
  assert.equal((await decideOf(entry, 'maybe')).status, 400);
  const quiet = await make(month, { username: 'worker2' });
  assert.equal((await decideOf(quiet, 'rejected')).status, 200); // không ghi chú
  const rejected = await decideOf(entry, 'rejected', 'cbuser', 'Khoản chưa có quyết định của giám đốc');
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.entry.status, 'rejected');
  assert.deepEqual(await estimateNet('worker', month), before);
  const again = await decideOf(rejected.data.entry, 'approved');
  assert.equal(again.status, 409);
  assert.equal(again.data.code, 'ENTRY_NOT_PENDING');
  // khoản huỷ khi đang chờ duyệt: không bắt buộc lý do
  const other = await make(month);
  const voided = await F.call('POST', `/pay-entries/${other.id}/void`, { body: { rev: other.rev } });
  assert.equal(voided.status, 200);
  assert.equal(voided.data.entry.status, 'void');
  assert.deepEqual(await estimateNet('worker', month), before);
});

test('1c: khoá lạc quan: rev lệch thì 409 REV_STALE khi sửa, duyệt, xác nhận cờ; không ghi gì', async () => {
  const month = freshMonth();
  const entry = await make(month, { taxMode: 'full' });
  const stale = entry.rev + 5;
  const before = await rowsIn(month);
  const edit = await F.call('PUT', `/pay-entries/${entry.id}`, { body: { rev: stale, amount: 1 } });
  assert.equal(edit.status, 409);
  assert.equal(edit.data.code, 'REV_STALE');
  assert.equal(edit.data.rev, entry.rev);
  assert.equal((await decideOf({ ...entry, rev: stale })).data.code, 'REV_STALE');
  const flag = await F.call('POST', `/pay-entries/${entry.id}/confirm-flags`, { who: 'ketoan', body: { rev: stale } });
  assert.equal(flag.data.code, 'REV_STALE');
  assert.deepEqual(await rowsIn(month), before);
  assert.equal((await F.call('PUT', `/pay-entries/${entry.id}`, { body: { amount: 1 } })).status, 400); // thiếu rev
});

test('1c: sửa khi chờ duyệt đổi rev và ghi nhật ký; khoản đã duyệt không sửa được (409 ENTRY_NOT_PENDING); sửa cờ thuế làm mất xác nhận', async () => {
  const month = freshMonth();
  const entry = await make(month, { taxMode: 'full' });
  const confirmed = await F.call('POST', `/pay-entries/${entry.id}/confirm-flags`, {
    who: 'ketoan',
    body: { rev: entry.rev, basis: 'Thông tư 111/2013/TT-BTC, Điều 2' } // căn cứ bắt buộc khi xác nhận cờ
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.entry.flagsConfirmedBy, 'ketoan');
  // sửa lý do (cờ giữ nguyên): xác nhận còn
  const reworded = await F.call('PUT', `/pay-entries/${entry.id}`, {
    body: { rev: confirmed.data.entry.rev, reason: 'Thưởng dự án quý ba, bổ sung biên bản' }
  });
  assert.equal(reworded.status, 200);
  assert.equal(reworded.data.entry.flagsConfirmedBy, 'ketoan');
  // sửa số tiền: xác nhận mất
  const edited = await F.call('PUT', `/pay-entries/${entry.id}`, {
    body: { rev: reworded.data.entry.rev, amount: 600000 }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.entry.amount, 600000);
  assert.equal(edited.data.entry.flagsConfirmedBy, null);
  assert.equal(edited.data.entry.rev, reworded.data.entry.rev + 1);
  assert.equal((await auditRows('entry.update', month)).length, 2);
  const approved = await decideOf(edited.data.entry);
  assert.equal(approved.status, 200);
  const late = await F.call('PUT', `/pay-entries/${entry.id}`, { body: { rev: approved.data.entry.rev, amount: 1 } });
  assert.equal(late.status, 409);
  assert.equal(late.data.code, 'ENTRY_NOT_PENDING');
  assert.equal((await rowsIn(month))[0].amount, 600000);
});

test('1c: kiểu dữ liệu do máy chủ kiểm: chuỗi số, số thập phân, 0, âm, null, quá trần, nhãn hay lý do sai độ dài, hướng lạ đều bị 400 và không lưu gì', async () => {
  const month = freshMonth();
  const bad = [
    { amount: '500000' },
    { amount: 500000.5 },
    { amount: 0 },
    { amount: -5 },
    { amount: null },
    { amount: 1e400 }, // JSON không có Infinity: thành null
    { amount: 1e17 },
    { amount: Number.MAX_SAFE_INTEGER + 2 },
    { direction: 'bonus' },
    { direction: undefined },
    { label: '' },
    { label: 'x'.repeat(81) },
    { label: 123 },
    { reason: 'x'.repeat(301) },
    { month: '2026-13' },
    { month: 202701 },
    { username: 'khong_co_ai' },
    { username: 'Worker!' },
    { taxMode: 'half' },
    { taxMode: 'cap' }, // thiếu hạn mức
    { taxMode: 'cap', taxCap: -1 },
    { taxMode: 'cap', taxCap: '100' },
    { taxCap: 1000 }, // hạn mức không có taxMode cap
    { insuranceBase: 600000 }, // lớn hơn khoản
    { insuranceBase: -1 },
    { insuranceBase: '100' }
  ];
  for (const extra of bad) {
    const res = await F.call('POST', '/pay-entries', { body: body(month, extra) });
    assert.ok([400, 404].includes(res.status), `${JSON.stringify(extra)} → ${res.status}`);
  }
  assert.equal((await rowsIn(month)).length, 0);
  // chuỗi không phải JSON object
  assert.equal((await F.call('POST', '/pay-entries', { body: [] })).status, 400);
  // trần số tiền theo tham số: 100.000.000.000 ₫ vẫn được, vượt thì không
  assert.equal((await F.call('POST', '/pay-entries', { body: body(month, { amount: 100000000000 }) })).status, 200);
  assert.equal((await F.call('POST', '/pay-entries', { body: body(month, { amount: 100000000001 }) })).status, 400);
});

test('1c: trường status, createdBy, decidedBy, flagsConfirmedBy, rev gửi lên khi lập bị bỏ qua: khoản luôn chờ duyệt, người lập là người gọi, chưa xác nhận cờ', async () => {
  const month = freshMonth();
  const res = await F.call('POST', '/pay-entries', {
    body: body(month, {
      status: 'approved',
      createdBy: 'ai_khac',
      decidedBy: 'ai_khac',
      flagsConfirmedBy: 'ketoan',
      rev: 9,
      taxMode: 'full'
    })
  });
  assert.equal(res.status, 200);
  const row = (await rowsIn(month))[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.created_by, 'admin');
  assert.equal(row.decided_by, null);
  assert.equal(row.flags_confirmed_by, null);
  assert.equal(row.rev, 1);
});

test('1c: nhãn khoản trừ là "phạt", "fine", "penalty" (BLLĐ 45/2019/QH14 Điều 127) vẫn lưu, kèm cảnh báo LABEL_FORBIDDEN; khoản cộng và chữ chứa "phát" không cảnh báo', async () => {
  const month = freshMonth();
  const labelWarned = (res?) => (res.data.warnings || []).some(w => w.code === 'LABEL_FORBIDDEN');
  for (const label of ['Tiền phạt đi muộn', 'PHẠT', 'Fine for lateness', 'late penalty', 'Phạt.']) {
    const res = await F.call('POST', '/pay-entries', { body: body(month, { direction: 'deduct', label }) });
    assert.equal(res.status, 200, label);
    assert.ok(labelWarned(res), label);
  }
  const viaSlipLine = await F.call('POST', '/pay-entries', {
    body: body(month, { direction: 'deduct', label: 'Hoàn ứng', slipLine: 'Tiền phạt' })
  });
  assert.equal(viaSlipLine.status, 200);
  assert.ok(labelWarned(viaSlipLine));
  assert.equal((await rowsIn(month)).length, 6);
  // chữ "phát" (không phải "phạt") và "refine" (chứa "fine" nhưng không phải từ "fine") không cảnh báo
  for (const label of ['Hoàn tạm ứng', 'Phát triển kỹ năng', 'Refine the process']) {
    const res = await F.call('POST', '/pay-entries', { body: body(month, { direction: 'deduct', label }) });
    assert.equal(res.status, 200, label);
    assert.equal(labelWarned(res), false, label);
  }
  const bonus = await F.call('POST', '/pay-entries', {
    body: body(month, { direction: 'add', label: 'Thưởng không phạt' })
  });
  assert.equal(bonus.status, 200);
  assert.equal(labelWarned(bonus), false); // nhãn khoản cộng không bị luật nhãn phạt
});

test('1c: khoản trừ không mang cờ thuế hay nền bảo hiểm (luôn sau thuế): 400 FLAGS_ON_DEDUCT', async () => {
  const month = freshMonth();
  for (const extra of [{ taxMode: 'full' }, { taxMode: 'none' }, { insuranceBase: 1000 }]) {
    const res = await F.call('POST', '/pay-entries', { body: body(month, { direction: 'deduct', ...extra }) });
    assert.equal(res.data.code, 'FLAGS_ON_DEDUCT', JSON.stringify(extra));
  }
  assert.equal((await rowsIn(month)).length, 0);
});

test('1c: kỳ đã duyệt hoặc chi trả: lập, sửa, duyệt, huỷ vẫn lưu, kèm cảnh báo PERIOD_LOCKED có suggestMonth là kỳ mở kế tiếp', async () => {
  const locked = freshMonth();
  const afterLocked = monthAfter(locked);
  const entry = await make(locked); // lập khi kỳ còn mở
  await lockPeriod(locked, 'approved');
  await lockPeriod(afterLocked, 'paid'); // kỳ kế tiếp cũng đã chi trả: gợi ý phải nhảy qua
  const open = monthAfter(afterLocked);
  const lockedWarning = (res?) => (res.data.warnings || []).find(w => w.code === 'PERIOD_LOCKED');
  const created = await F.call('POST', '/pay-entries', { body: body(locked) });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.deepEqual(lockedWarning(created).details, { month: locked, suggestMonth: open });
  const edited = await F.call('PUT', `/pay-entries/${entry.id}`, { body: { rev: entry.rev, amount: 7 } });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.ok(lockedWarning(edited));
  const decided = await decideOf(edited.data.entry);
  assert.equal(decided.status, 200, JSON.stringify(decided.data));
  assert.equal(lockedWarning(decided).details.suggestMonth, open);
  const voided = await F.call('POST', `/pay-entries/${entry.id}/void`, { body: { rev: decided.data.entry.rev } });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  assert.ok(lockedWarning(voided));
  // nhập hàng loạt có một khoản vào kỳ khoá: cả lô lưu, cảnh báo nêu kỳ khoá
  const bulk = await F.call('POST', '/pay-entries/bulk', {
    body: { entries: [body(open), body(locked, { username: 'worker2' })] }
  });
  assert.equal(bulk.status, 200, JSON.stringify(bulk.data));
  assert.ok(lockedWarning(bulk));
  assert.equal((await rowsIn(open)).length, 1);
  // kỳ mở kế tiếp lập được; kỳ đã tính (calculated) vẫn nhận khoản
  assert.equal((await F.call('POST', '/pay-entries', { body: body(open) })).status, 200);
  const calculated = freshMonth();
  await lockPeriod(calculated, 'calculated');
  assert.equal((await F.call('POST', '/pay-entries', { body: body(calculated) })).status, 200);
});

test('1c: nhập hàng loạt tất cả hoặc không: một dòng sai thì không lưu dòng nào và báo số dòng; hai cách gửi (entries, usernames) cho cùng kết quả', async () => {
  const month = freshMonth();
  const bad = await F.call('POST', '/pay-entries/bulk', {
    body: { entries: [body(month), body(month, { username: 'worker2', amount: 'một triệu' })] }
  });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /^Dòng 2:/);
  assert.equal((await rowsIn(month)).length, 0);
  const ok = await F.call('POST', '/pay-entries/bulk', {
    body: { entries: [body(month), body(month, { username: 'worker2', amount: 250000 })] }
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.count, 2);
  assert.deepEqual(
    (await rowsIn(month)).map(r => [r.username, r.amount, r.status]),
    [
      ['worker', 500000, 'pending'],
      ['worker2', 250000, 'pending']
    ]
  );
  const second = freshMonth();
  const shared = await F.call('POST', '/pay-entries/bulk', {
    body: {
      month: second,
      usernames: ['worker', 'worker2'],
      direction: 'add',
      amount: 100000,
      label: 'Hỗ trợ',
      reason: 'Hỗ trợ chung theo thông báo nội bộ'
    }
  });
  assert.equal(shared.data.count, 2);
  assert.equal((await F.call('POST', '/pay-entries/bulk', { body: { entries: [] } })).status, 400);
  assert.equal(
    (await F.call('POST', '/pay-entries/bulk', { body: { entries: [body(second)], usernames: ['worker'] } })).status,
    400
  );
});

test('1c: trần mỗi lần nhập hàng loạt theo system.entries.maxPerBatch: quá trần thì 400 TOO_MANY và không lưu gì', async () => {
  const month = freshMonth();
  const limit = (await paramsStore.resolve(month)).params['system.entries.maxPerBatch'];
  assert.equal(limit, 200);
  const over = await F.call('POST', '/pay-entries/bulk', {
    body: {
      month,
      usernames: Array.from({ length: limit + 1 }, () => 'worker'),
      direction: 'add',
      amount: 1000,
      label: 'Thử',
      reason: 'Thử trần mỗi lần nhập hàng loạt'
    }
  });
  assert.equal(over.status, 400);
  assert.equal(over.data.code, 'TOO_MANY');
  assert.equal((await rowsIn(month)).length, 0);
});

test('1c: quyền: nhân viên và chưa đăng nhập bị chặn; C&B lập và duyệt; Kế toán chỉ xem và xác nhận cờ; admin làm mọi việc', async () => {
  const month = freshMonth();
  const entry = await make(month, { taxMode: 'full' });
  // chưa đăng nhập
  assert.equal((await F.call('GET', `/pay-entries?month=${month}`, { who: null })).status, 401);
  assert.equal((await F.call('POST', '/pay-entries', { who: null, body: body(month) })).status, 401);
  // nhân viên thường
  assert.equal((await F.call('GET', `/pay-entries?month=${month}`, { who: 'plain' })).status, 403);
  assert.equal((await F.call('POST', '/pay-entries', { who: 'plain', body: body(month) })).status, 403);
  assert.equal((await decideOf(entry, 'approved', 'plain')).status, 403);
  assert.equal((await F.call('POST', `/pay-entries/${entry.id}/void`, { who: 'plain', body: {} })).status, 403);
  // Kế toán: xem được, không lập, không duyệt; xác nhận cờ được
  assert.equal((await F.call('GET', `/pay-entries?month=${month}`, { who: 'ketoan' })).status, 200);
  assert.equal((await F.call('POST', '/pay-entries', { who: 'ketoan', body: body(month) })).status, 403);
  assert.equal((await decideOf(entry, 'approved', 'ketoan')).status, 403);
  // C&B: lập được, xác nhận cờ không (config.legal)
  assert.equal(
    (await F.call('POST', '/pay-entries', { who: 'cbuser', body: body(month, { username: 'worker2' }) })).status,
    200
  );
  assert.equal(
    (await F.call('POST', `/pay-entries/${entry.id}/confirm-flags`, { who: 'cbuser', body: { rev: entry.rev } }))
      .status,
    403
  );
  assert.equal(
    (
      await F.call('POST', `/pay-entries/${entry.id}/confirm-flags`, {
        who: 'ketoan',
        body: { rev: entry.rev, basis: 'Thông tư 111/2013/TT-BTC, Điều 2' }
      })
    ).status,
    200
  );
  // đường dẫn lạ bị từ chối mặc định
  assert.equal((await F.call('DELETE', `/pay-entries/${entry.id}`)).status, 403);
  assert.equal((await F.call('GET', `/pay-entries/${entry.id}`)).status, 403);
  assert.equal((await F.call('PUT', '/pay-entries/abc', { body: {} })).status, 400);
});

test('1c: lập, duyệt khoản về chính mình vẫn lưu, kèm cảnh báo SELF_DECISION_FORBIDDEN; người không có tài khoản hoặc không được trả lương bị từ chối', async () => {
  const month = freshMonth();
  const selfWarned = (res?) => (res.data.warnings || []).some(w => w.code === 'SELF_DECISION_FORBIDDEN');
  const own = await F.call('POST', '/pay-entries', { who: 'cbuser', body: body(month, { username: 'cbuser' }) });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.ok(selfWarned(own));
  // khoản về cbuser do admin lập; cbuser duyệt khoản về mình: cảnh báo
  const aboutCb = await make(month, { username: 'cbuser' });
  const res = await decideOf(aboutCb, 'approved', 'cbuser');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(selfWarned(res));
  assert.equal(
    (await F.call('POST', '/pay-entries', { body: body(month, { username: 'khong_ton_tai' }) })).status,
    404
  );
  assert.equal((await F.call('POST', '/pay-entries', { body: body(month, { username: 'admin' }) })).status, 400); // admin không được trả lương
});

test('1c: huỷ khoản đã duyệt thành trạng thái cuối, ra khỏi tính lương, lý do ghi vào nhật ký; huỷ rồi không huỷ hay duyệt lại; không xoá dòng', async () => {
  const month = freshMonth();
  const before = await estimateNet('worker', month);
  const entry = await approve(month);
  assert.equal((await estimateNet('worker', month)).net, before.net + 500000);
  const voided = await F.call('POST', `/pay-entries/${entry.id}/void`, {
    body: { rev: entry.rev, reason: 'Nhập nhầm người nhận, lập lại cho đúng người' }
  });
  assert.equal(voided.status, 200);
  assert.equal(voided.data.entry.status, 'void');
  assert.deepEqual(await estimateNet('worker', month), before);
  assert.equal((await F.call('POST', `/pay-entries/${entry.id}/void`, { body: {} })).data.code, 'ENTRY_NOT_VOIDABLE');
  assert.equal((await rowsIn(month)).length, 1);
  const logged = await auditRows('entry.void', month);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].reason, 'Nhập nhầm người nhận, lập lại cho đúng người');
  await assert.rejects(
    async () => await store.db.prepare('DELETE FROM pay_entries WHERE id = ?').run(entry.id),
    /không được xoá/
  );
});

test('1c: cờ thuế và bảo hiểm: Kế toán xác nhận một lần (409 lần hai); khoản không có cờ thì 400 NO_FLAGS; bộ máy chỉ nhận cờ đã xác nhận', async () => {
  const month = freshMonth();
  const flagged = await make(month, { taxMode: 'cap', taxCap: 200000, insuranceBase: 100000 });
  const noFlags = await make(month, { username: 'worker2' });
  assert.equal(
    (await F.call('POST', `/pay-entries/${noFlags.id}/confirm-flags`, { who: 'ketoan', body: { rev: noFlags.rev } }))
      .data.code,
    'NO_FLAGS'
  );
  const inputsOf = async () =>
    (await service.loadInputs(month, { usernames: ['worker'] })).people.get('worker').entries;
  const approved = (await decideOf(flagged)).data.entry;
  assert.equal((await inputsOf())[0].flagsConfirmedBy, null); // đã duyệt nhưng cờ chưa xác nhận: bộ máy thấy flagsConfirmedBy null (chịu thuế)
  const confirmed = await F.call('POST', `/pay-entries/${flagged.id}/confirm-flags`, {
    who: 'ketoan',
    body: { rev: approved.rev, basis: 'Thông tư 111/2013/TT-BTC, Điều 2' }
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.entry.flagsConfirmedBy, 'ketoan');
  assert.equal(confirmed.data.entry.status, 'approved');
  assert.equal((await inputsOf())[0].flagsConfirmedBy, 'ketoan');
  const again = await F.call('POST', `/pay-entries/${flagged.id}/confirm-flags`, {
    who: 'ketoan',
    body: { rev: confirmed.data.entry.rev }
  });
  assert.equal(again.data.code, 'FLAGS_ALREADY_CONFIRMED');
  assert.equal((await auditRows('entry.confirmFlags', month)).length, 1);
});

test('1c: loadInputs chỉ nạp khoản ĐÃ DUYỆT, đúng hình bộ máy (không lý do, không người lập); người không có khoản không có trường entries và inputs_digest chỉ đổi khi có khoản duyệt', async () => {
  const month = freshMonth();
  const digestBefore = await service.digestOf(await service.loadInputs(month));
  await make(month); // chờ duyệt
  await make(month, { username: 'worker2', direction: 'deduct', amount: 100000, label: 'Hoàn ứng' });
  assert.equal(await service.digestOf(await service.loadInputs(month)), digestBefore);
  const entry = (await F.call('GET', `/pay-entries?month=${month}&username=worker`)).data.entries[0];
  await decideOf(entry);
  const inputs = await service.loadInputs(month);
  assert.equal(Object.hasOwn(inputs.people.get('worker2'), 'entries'), false);
  assert.deepEqual(Object.keys(inputs.people.get('worker').entries[0]).sort(), [
    'amount',
    'direction',
    'flagsConfirmedBy',
    'id',
    'insuranceBase',
    'label',
    'slipLine',
    'taxCap',
    'taxMode'
  ]);
  assert.notEqual(await service.digestOf(inputs), digestBefore);
  // tháng khác không bị ảnh hưởng
  assert.equal(Object.hasOwn((await service.loadInputs(freshMonth())).people.get('worker'), 'entries'), false);
});

test('1c: tắt system.entries.requireApproval: khoản có hiệu lực ngay khi lập (người lập tự duyệt, ghi chú nói rõ), khoản đang chờ có thể tự duyệt', async () => {
  const month = freshMonth();
  const pendingFirst = await make(month, { username: 'worker2' }); // lập khi còn bắt buộc duyệt
  const original = paramsStore.resolve;
  paramsStore.resolve = async (m?) => {
    const resolved = await original(m);
    return { ...resolved, params: { ...resolved.params, 'system.entries.requireApproval': false } };
  };
  try {
    const entry = await make(month);
    assert.equal(entry.status, 'approved');
    assert.equal(entry.decidedBy, 'admin');
    // câu ghi chú viết bằng tiếng Việt thường, không chứa tên khoá cài đặt
    assert.match(entry.decisionNote, /đang tắt bước duyệt khoản điền thêm/);
    assertPlain(entry.decisionNote, 'ghi chú tự duyệt');
    assert.equal((await F.call('GET', `/pay-entries?month=${month}`)).data.requireApproval, false);
    const self = await decideOf(pendingFirst, 'approved', 'admin');
    assert.equal(self.status, 200);
  } finally {
    paramsStore.resolve = original;
  }
  // bật lại: người lập tự duyệt thì có cảnh báo
  const strict = await make(month, { username: 'worker2' });
  const selfApproved = await decideOf(strict, 'approved', 'admin');
  assert.ok(selfApproved.data.warnings.some(w => w.code === 'SELF_DECISION_FORBIDDEN'));
});

test('1c: trigger của bảng giữ nguyên: khoản đã duyệt không đổi tiền, hướng, người, tháng bằng SQL trực tiếp', async () => {
  const month = freshMonth();
  const entry = await approve(month);
  for (const sql of [
    'UPDATE pay_entries SET amount = amount + 1 WHERE id = ?',
    "UPDATE pay_entries SET direction = 'deduct' WHERE id = ?",
    "UPDATE pay_entries SET month = '2030-01' WHERE id = ?",
    "UPDATE pay_entries SET status = 'pending' WHERE id = ?"
  ])
    await assert.rejects(async () => await store.db.prepare(sql).run(entry.id), /pay_entries|khoản điền thêm/, sql);
  assert.equal((await rowsIn(month))[0].amount, 500000);
});

test('1c: nhập hàng loạt đúng hình giao diện { month, entries: [không có month] }: khoản nhận tháng chung, khoản ghi month riêng giữ tháng riêng; void nhận thêm note thừa mà không lỗi', async () => {
  const month = freshMonth();
  const other = monthAfter(month);
  const item = (username?, extra: any = {}) => {
    const { month: _month, ...rest } = body(month, { username, ...extra });
    return rest;
  };
  const res = await F.call('POST', '/pay-entries/bulk', {
    body: { month, entries: [item('worker'), item('worker2', { amount: 250000 }), { ...item('worker'), month: other }] }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(
    res.data.entries.map(e => [e.username, e.month, e.amount]),
    [
      ['worker', month, 500000],
      ['worker2', month, 250000],
      ['worker', other, 500000]
    ]
  );
  const first = res.data.entries[0];
  const voided = await F.call('POST', `/pay-entries/${first.id}/void`, {
    body: { reason: 'Nhập nhầm, lập lại cho đúng', note: 'ghi chú thừa của giao diện', rev: first.rev }
  });
  assert.equal(voided.status, 200);
  assert.equal(voided.data.entry.status, 'void');
});
