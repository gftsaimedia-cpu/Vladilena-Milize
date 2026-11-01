'use strict';
// Lý do, khoá lạc quan và nhật ký của số Admin sửa trên phiếu lương (route PUT /api/slip-override):
//   - lý do không bắt buộc (thiếu, rỗng, ngắn đều lưu; lý do trống lưu thành null); quá 300 ký tự là 400 REASON_REQUIRED;
//   - expectedRev lệch là 409 SLIP_STALE và không lưu gì;
//   - từ kỳ `approved` vẫn lưu, kèm cảnh báo PERIOD_LOCKED (scope slip); số đã đóng băng trong phiếu không đổi;
//   - nhật ký một dòng cho MỖI ô đổi (mức nhạy cảm 'pay'); nhân sự vẫn thấy số tự tính.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const put = async (month?, body?, who = 'admin', user = 'qa_nv1') =>
  await F.call('PUT', '/slip-override', { who, body: { user, month, ...body } });
const get = async (month?, user = 'qa_nv1', who = 'admin') =>
  await F.call('GET', `/slip-override?user=${user}&month=${month}`, { who });
const overrideRows = async (month?) =>
  await store.db
    .prepare('SELECT username, values_json, reason, rev FROM slip_overrides WHERE month = ? ORDER BY username')
    .all(month);
const overrideAudit = async (month?) =>
  (
    await store.db
      .prepare("SELECT * FROM audit_log WHERE action = 'slip.override' AND month = ? ORDER BY id")
      .all(month)
  ).map(r => ({ ...r, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));

/* ================= độ dài lý do ================= */
test('Lý do quá 300 ký tự là 400 REASON_REQUIRED và không lưu gì, không ghi nhật ký; lý do rỗng, toàn dấu cách, ngắn, không phải chuỗi vẫn lưu (lý do trống thành null)', async () => {
  const M = monthOf();
  await P.seed(M);
  const before = await F.snapshot();
  const tooLong = await put(M, { values: { otPay: 1000 }, reason: P.text(301) });
  assert.equal(tooLong.status, 400, JSON.stringify(tooLong.data));
  assert.equal(tooLong.data.code, 'REASON_REQUIRED');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal((await get(M)).data.rev, 0);
  for (const [i, reason] of ['', '   ', 'ngắn', 123456789012, {}, [], true].entries()) {
    const res = await put(M, { values: { otPay: 1000 + i }, reason });
    assert.equal(res.status, 200, `reason=${JSON.stringify(reason)}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.reason, reason === 'ngắn' ? 'ngắn' : null, `reason=${JSON.stringify(reason)}`);
  }
});

test('Lý do đúng 10 và đúng 300 ký tự (sau khi cắt dấu cách hai đầu) được nhận và lưu cùng số sửa', async () => {
  const M = monthOf();
  await P.seed(M);
  const ten = await put(M, { values: { otPay: 1000 }, reason: `  ${P.text(10)}  ` });
  assert.equal(ten.status, 200, JSON.stringify(ten.data));
  assert.equal(ten.data.reason, P.text(10));
  const full = await put(M, { values: { otPay: 2000 }, reason: P.text(300) });
  assert.equal(full.status, 200);
  assert.equal(full.data.reason, P.text(300));
  assert.equal(full.data.rev, 2);
});

/* ================= lý do tuỳ chọn ================= */
test('Lý do tuỳ chọn: thiếu lý do (không gửi, null) vẫn lưu kể cả values rỗng; có lý do thì lưu và nhật ký ghi lý do', async () => {
  const M = monthOf();
  await P.seed(M);
  for (const body of [{ values: { otPay: 1000 } }, { values: { otPay: 1000 }, reason: null }, { values: {} }]) {
    const res = await put(M, body);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(res.data.reason, null);
  }
  const saved = await put(M, { values: { otPay: 2000 }, reason: 'Điều chỉnh theo biên bản' });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.reason, 'Điều chỉnh theo biên bản');
  const clear = await put(M, { values: {}, reason: 'Bỏ hết số đã sửa' });
  assert.equal(clear.status, 200, 'values rỗng = bỏ hết số đã sửa');
  assert.deepEqual(clear.data.values, {});
  assert.ok((await overrideAudit(M)).some(r => r.reason === 'Điều chỉnh theo biên bản'));
  assert.equal((await overrideRows(M))[0].rev, 5, 'dòng được giữ với values {} nên rev không quay về 1');
});

/* ================= expectedRev ================= */
test('expectedRev lệch là 409 SLIP_STALE (kèm rev hiện tại) và KHÔNG lưu gì, kể cả nhật ký; đúng rev thì lưu và rev tăng', async () => {
  const M = monthOf();
  await P.seed(M);
  const first = await put(M, { values: { otPay: 1000 }, reason: P.text(10), expectedRev: 0 });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.rev, 1);
  const before = await F.snapshot();
  const stale = await put(M, { values: { otPay: 9999 }, reason: P.text(10), expectedRev: 0 });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'SLIP_STALE');
  assert.equal(stale.data.rev, 1);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.deepEqual((await get(M)).data.values, { otPay: 1000 });
  const ahead = await put(M, { values: { otPay: 9999 }, reason: P.text(10), expectedRev: 5 });
  assert.equal(ahead.data.code, 'SLIP_STALE');
  const next = await put(M, { values: { otPay: 2000 }, reason: P.text(10), expectedRev: 1 });
  assert.equal(next.status, 200);
  assert.equal(next.data.rev, 2);
  // không gửi expectedRev thì không kiểm
  assert.equal((await put(M, { values: { otPay: 3000 }, reason: P.text(10) })).data.rev, 3);
  for (const bad of [-1, 1.5, '1', null]) {
    const res = await put(M, { values: { otPay: 1 }, reason: P.text(10), expectedRev: bad });
    assert.equal(res.status, 400, `expectedRev=${JSON.stringify(bad)}`);
  }
});

test('expectedRev cũng kiểm khi bỏ hết số đã sửa (values rỗng)', async () => {
  const M = monthOf();
  await P.seed(M);
  await put(M, { values: { otPay: 1000 }, reason: P.text(10) });
  const stale = await put(M, { values: {}, reason: P.text(10), expectedRev: 0 });
  assert.equal(stale.data.code, 'SLIP_STALE');
  assert.deepEqual((await get(M)).data.values, { otPay: 1000 });
  assert.equal((await put(M, { values: {}, reason: P.text(10), expectedRev: 1 })).status, 200);
});

/* ================= khoá theo kỳ ================= */
test('Số sửa phiếu từ kỳ approved vẫn lưu, kèm cảnh báo PERIOD_LOCKED { month, status, scope: slip }; từ approved số trong phiếu đã đóng băng không đổi', async () => {
  const M = monthOf();
  await P.seed(M);
  // qa_tts1 và ô số lượng workDays: không lệch tiền nên AI không gắn cờ phiếu
  const body = (n?) => ({ values: { workDays: n }, reason: P.text(10) });
  const putTts = async (b?) => await put(M, b, 'admin', 'qa_tts1');
  const lockedOf = (res?) => (res.data.warnings || []).find(w => w.code === 'PERIOD_LOCKED');
  const open = await putTts(body(1));
  assert.equal(open.status, 200, 'open');
  assert.equal(lockedOf(open), undefined, 'kỳ mở thì không cảnh báo');
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  assert.equal((await putTts(body(2))).status, 200, 'attendance_locked');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.equal((await putTts(body(3))).status, 200, 'calculated');
  const rev = await putTts(body(4));
  assert.equal(rev.status, 200, 'reviewed');
  assert.equal(rev.data.rev, 4);
  assert.equal(lockedOf(rev), undefined);
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  const frozen = (await P.flow.payslipsOf(M)).slips.qa_tts1.override_json;
  for (const [i, state] of ['approved', 'paid'].entries()) {
    if (state === 'paid') P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
    const res = await putTts(body(90 + i));
    assert.equal(res.status, 200, `${state}: ${JSON.stringify(res.data)}`);
    const warning = lockedOf(res);
    assert.ok(warning, JSON.stringify(res.data.warnings));
    assert.deepEqual([warning.details.month, warning.details.status, warning.details.scope], [M, state, 'slip']);
    assert.equal(
      (await P.flow.payslipsOf(M)).slips.qa_tts1.override_json,
      frozen,
      `${state}: số đã đóng băng giữ nguyên`
    );
  }
  assert.deepEqual((await get(M, 'qa_tts1')).data.values, { workDays: 91 });
});

/* ================= nhật ký từng ô ================= */
test('Nhật ký: một dòng slip.override cho MỖI ô đổi (cũ, mới), mức nhạy cảm pay, kèm lý do; ô không đổi không có dòng; bỏ ô hay bỏ hết cũng ghi', async () => {
  const M = monthOf();
  await P.seed(M);
  const before0 = (await overrideAudit(M)).length;
  assert.equal(before0, 0);
  const one = await put(M, { values: { otPay: 1000, workDays: 20 }, reason: 'Điều chỉnh lần một' });
  assert.equal(one.status, 200, JSON.stringify(one.data));
  let rows = await overrideAudit(M);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.entity_id).sort(), [`qa_nv1:${M}:otPay`, `qa_nv1:${M}:workDays`]);
  for (const r of rows) {
    assert.equal(r.actor, 'admin');
    assert.equal(r.sensitivity, 'pay');
    assert.equal(r.subject, 'qa_nv1');
    assert.equal(r.reason, 'Điều chỉnh lần một');
    assert.equal(r.entity_kind, 'slip_override');
  }
  const ot = rows.find(r => r.entity_id.endsWith(':otPay'));
  assert.deepEqual([ot.before, ot.after], [{ otPay: null }, { otPay: 1000 }]);

  // lần hai: đổi otPay, giữ workDays, thêm attendance: đúng 2 dòng mới
  const two = await put(M, { values: { otPay: 1500, workDays: 20, attendance: 300 }, reason: 'Điều chỉnh lần hai' });
  assert.equal(two.status, 200);
  rows = (await overrideAudit(M)).slice(2);
  assert.deepEqual(rows.map(r => r.entity_id).sort(), [`qa_nv1:${M}:attendance`, `qa_nv1:${M}:otPay`]);
  assert.deepEqual(rows.find(r => r.entity_id.endsWith(':otPay')).before, { otPay: 1000 });
  assert.deepEqual(rows.find(r => r.entity_id.endsWith(':otPay')).after, { otPay: 1500 });

  // lưu lại y nguyên: không dòng nào
  const same = await put(M, { values: { otPay: 1500, workDays: 20, attendance: 300 }, reason: 'Không đổi gì cả' });
  assert.equal(same.status, 200);
  assert.equal((await overrideAudit(M)).length, 4);

  // bỏ hết: mỗi ô bị bỏ một dòng, giá trị mới null
  const clear = await put(M, { values: {}, reason: 'Bỏ hết số đã sửa' });
  assert.equal(clear.status, 200);
  rows = (await overrideAudit(M)).slice(4);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.deepEqual(Object.values<any>(r.after), [null]);
  // dòng nhật ký không chứa số tiền thừa ngoài ô đổi
  assert.ok((await overrideAudit(M)).every(r => Object.keys(r.after).length === 1));
  assert.equal((await F.call('GET', '/audit/verify')).data.ok, true);
});

test('Số tiền sửa được làm tròn đồng, số lượng làm tròn hai chữ số; ô lạ, âm, vượt trần hoặc không phải số là 400 và không lưu', async () => {
  const M = monthOf();
  await P.seed(M);
  const ok = await put(M, { values: { otPay: 1000.6, workDays: 20.126 }, reason: P.text(10) });
  assert.deepEqual(ok.data.values, { otPay: 1001, workDays: 20.13 });
  const before = await F.snapshot();
  for (const values of [
    { khongCo: 1 },
    { otPay: -1 },
    { otPay: 1e12 },
    { otPay: '100' },
    { otPay: NaN },
    { workDays: 1e5 }
  ]) {
    const res = await put(M, { values, reason: P.text(10) });
    assert.equal(res.status, 400, JSON.stringify(values));
  }
  for (const values of [null, [], 'x'])
    assert.equal((await put(M, { values, reason: P.text(10) })).status, 400, JSON.stringify(values));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

/* ================= nhân sự vẫn thấy số tự tính ================= */
test('Nhân sự không đọc hay sửa được số sửa (403); số ước tính của họ KHÔNG đổi khi Admin sửa phiếu', async () => {
  const M = monthOf();
  await P.seed(M);
  const estimate = async () => (await F.call('GET', `/me/estimate?month=${M}`, { who: 'qa_nv1' })).data;
  const before = await estimate();
  assert.equal(before.source, 'estimate');
  P.must(
    await put(M, { values: { otPay: 5000000, insurance: 1, tax: 1, advance: 1 }, reason: P.text(10) }),
    'Admin sửa phiếu'
  );
  const after = await estimate();
  assert.deepEqual(after.net, before.net);
  assert.equal(after.m.total, before.m.total);
  assert.equal((await get(M, 'qa_nv1', 'qa_nv1')).status, 403, 'nhân sự không đọc số sửa của chính mình');
  assert.equal((await put(M, { values: { otPay: 1 }, reason: P.text(10) }, 'qa_nv1')).status, 403);
  assert.equal((await get(M, 'qa_nv1', null)).status, 401);
  assert.deepEqual((await get(M)).data.values, { otPay: 5000000, insurance: 1, tax: 1, advance: 1 });
});

test('Phiếu chính thức sau khi chi trả: nhân sự thấy SỐ CHI TRẢ (đã gồm số Admin sửa) và không thấy computed, overridden, override; Admin thấy cả số sửa đã đóng băng và số tự tính', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  P.must(await put(M, { values: { otPay: 777000 }, reason: 'Điều chỉnh có biên bản' }), 'sửa phiếu');
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  const admin = (await F.call('GET', `/periods/${M}/payslips/qa_nv1`)).data.payslip;
  const self = await F.call('GET', `/periods/${M}/payslips/qa_nv1`, { who: 'qa_nv1' });
  assert.equal(self.status, 200, JSON.stringify(self.data));
  assert.equal(self.data.source, 'snapshot');
  for (const hidden of ['override', 'computed', 'overridden'])
    assert.equal(Object.hasOwn(self.data.payslip, hidden), false, `nhân sự không thấy ${hidden}`);
  assert.deepEqual(admin.override.values, { otPay: 777000 });
  assert.equal(admin.override.reason, 'Điều chỉnh có biên bản');
  const stored = (await P.flow.payslipsOf(M)).slips.qa_nv1;
  assert.equal(admin.overridden, true);
  assert.equal(self.data.payslip.net, admin.net, 'nhân sự thấy đúng số chi trả mà Admin thấy');
  assert.equal(self.data.payslip.gross, admin.gross);
  assert.notEqual(self.data.payslip.net, stored.net, 'số chi trả khác số tự tính đã lưu vì có số sửa');
  assert.equal(admin.computed.net, stored.net, 'số tự tính đã lưu vẫn giữ nguyên cho Admin');
  assert.notEqual(admin.net - admin.computed.net, 0, 'số sửa làm đổi thực lĩnh');
});

/* ================= quyền ================= */
test('Quyền sửa số phiếu: Admin và C&B được; kế toán, nhân sự, quản lý không (403 FORBIDDEN_CAP); tự sửa phiếu của chính mình vẫn lưu, kèm cảnh báo SELF_DECISION_FORBIDDEN', async () => {
  const M = monthOf();
  await P.seed(M);
  await P.grant('qa_ctv1', 'cb');
  await P.grant('qa_tts1', 'accounting');
  await P.grant('qa_nv2', 'hr');
  const body = { values: { otPay: 1000 }, reason: P.text(10) };
  assert.equal((await put(M, body, 'qa_ctv1')).status, 200, 'C&B sửa phiếu người khác');
  for (const who of ['qa_tts1', 'qa_nv2']) {
    const res = await put(M, body, who);
    assert.equal(res.status, 403, who);
    assert.equal(res.data.code, 'FORBIDDEN_CAP', who);
    assert.equal((await get(M, 'qa_nv1', who)).status, 403, `${who} đọc`);
  }
  const self = await put(M, body, 'qa_ctv1', 'qa_ctv1');
  assert.equal(self.status, 200, JSON.stringify(self.data));
  assert.ok(
    self.data.warnings.some(w => w.code === 'SELF_DECISION_FORBIDDEN'),
    JSON.stringify(self.data.warnings)
  );
  assert.equal((await put(M, body, 'qa_ctv1', 'qa_khong_co')).status, 404);
  assert.equal((await put('2026-13', body)).status, 400);
  assert.equal((await put(M, body, null)).status, 401);
});
