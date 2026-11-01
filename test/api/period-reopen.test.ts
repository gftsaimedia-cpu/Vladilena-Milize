'use strict';
// Mở lại kỳ lương (src/domain/period/periods.ts → reopen, src/platform/db.ts → periods.reopen, server.js):
//   - C&B (period.reopen) chỉ mở về `calculated`; về `open` hoặc `attendance_locked` cần period.reopen.inputs (Admin), nếu không 403 FORBIDDEN_CAP;
//   - lý do không bắt buộc (thiếu, rỗng hay ngắn đều được, quá 300 ký tự là 400 REASON_REQUIRED); kỳ `paid` mở lại được kèm cảnh báo PERIOD_STATE;
//   - mở lại không xoá gì: lần chạy thành `superseded`, phiếu giữ nguyên byte; lần tính kế tiếp là run_no mới;
//   - lịch ước tính của kỳ đã chốt vẫn lưu được và chỉ cảnh báo PERIOD_LOCKED; mở về `open` thì hết cảnh báo.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool): không dòng nào rò sang test khác.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store, flow } = P;
const monthOf = P.monthPool();
const reason = 'Mở lại để sửa dữ liệu';

before(F.start);
after(F.stop);

const reopen = (month?, to?, body: any = {}, who = 'admin') => P.step(month, 'reopen', { to, reason, ...body }, who);
const getPeriod = async (month?) => (await F.call('GET', `/periods/${month}`)).data;
// Dấu vân tay của mọi phiếu và lần chạy của tháng (để khẳng định "không xoá, không sửa")
const fingerprint = async (month?) =>
  (
    await store.db
      .prepare(
        `SELECT r.run_no AS run_no, p.username AS username, p.gross AS gross, p.net AS net, p.status AS status, upper(encode(p.snapshot_gz, 'hex')) AS snap, p.staff_terms_json AS terms
       FROM payroll_runs r JOIN payslips p ON p.run_id = r.id WHERE r.month = ? ORDER BY r.run_no, p.username`
      )
      .all(month)
  ).map(row => ({ ...row }));

/* ================= quyền ================= */
test('C&B chỉ mở lại về calculated; về open hoặc attendance_locked cần period.reopen.inputs nên 403 FORBIDDEN_CAP và không đổi gì', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  await P.grant('qa_nv1', 'cb');
  const before = await F.snapshot();
  for (const to of ['open', 'attendance_locked']) {
    const res = await reopen(M, to, {}, 'qa_nv1');
    assert.equal(res.status, 403, to);
    assert.equal(res.data.code, 'FORBIDDEN_CAP');
    assert.equal(res.data.cap, 'period.reopen.inputs');
  }
  // thiếu hoặc lạ `to` cũng thuộc nhóm cần quyền đầu vào
  for (const to of [undefined, 'paid', 'xyz'])
    assert.equal((await reopen(M, to, {}, 'qa_nv1')).data.code, 'FORBIDDEN_CAP', String(to));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  const ok = P.must(await reopen(M, 'calculated', {}, 'qa_nv1'), 'C&B mở về calculated');
  assert.equal(ok.data.status, 'calculated');
  const row = (await P.auditOf(M)).find(r => r.action === 'period.reopen');
  assert.equal(row.actor, 'qa_nv1');
});

test('Người không có period.reopen (kế toán, nhân sự) bị 403 FORBIDDEN_CAP ở cổng route, kể cả khi về calculated', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  await P.grant('qa_nv1', 'accounting');
  await P.grant('qa_ctv1', 'hr');
  const before = await F.snapshot();
  for (const who of ['qa_nv1', 'qa_ctv1', 'qa_tts1']) {
    const res = await reopen(M, 'calculated', {}, who);
    assert.equal(res.status, 403, who);
    assert.equal(res.data.code, 'FORBIDDEN_CAP', who);
  }
  assert.equal((await reopen(M, 'calculated', {}, null)).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('Admin (có period.reopen.inputs) mở về open và về attendance_locked được', async () => {
  const A = monthOf();
  await P.setupMonth(A, 'approved');
  assert.equal(P.must(await reopen(A, 'attendance_locked'), 'về attendance_locked').data.status, 'attendance_locked');
  const B = monthOf();
  await P.setupMonth(B, 'reviewed');
  assert.equal(P.must(await reopen(B, 'open'), 'về open').data.status, 'open');
});

/* ================= lý do ================= */
const warningsOf = (res?) => res.data.warnings || [];
test('Lý do không bắt buộc: thiếu, null, rỗng, toàn dấu cách, 9 ký tự, không phải chuỗi đều mở lại được; quá 300 ký tự là 400 REASON_REQUIRED và không đổi gì', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const before = await F.snapshot();
  for (const bad of [P.text(301), `${P.text(150)}${' '.repeat(5)}${P.text(150)}`]) {
    const res = await P.step(M, 'reopen', { to: 'calculated', reason: bad });
    assert.equal(res.status, 400, `reason dài ${bad.length}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'REASON_REQUIRED');
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'lý do quá dài không đổi gì');
  assert.equal((await getPeriod(M)).status, 'approved');
  // ba lần mở liên tiếp approved → calculated → attendance_locked → open, mỗi lần một kiểu lý do; lý do rỗng được ghi nhật ký là không có lý do
  const chain = [
    ['calculated', undefined, null],
    ['attendance_locked', '   ', null],
    ['open', P.text(9), P.text(9)]
  ];
  for (const [to, bad, saved] of chain) {
    const res = P.must(await P.step(M, 'reopen', { to, reason: bad }), `to=${to} reason=${JSON.stringify(bad)}`);
    assert.equal(res.data.status, to);
    assert.deepEqual(
      warningsOf(res).filter(w => w.code === 'PERIOD_STATE'),
      [],
      'kỳ chưa chi trả thì không có cảnh báo trạng thái'
    );
    const row = await (await P.auditOf(M)).filter(r => r.action === 'period.reopen').at(-1);
    assert.equal(row.reason, saved, `to=${to}`);
  }
  for (const bad of [null, '', 123456789012, {}, P.text(10)]) {
    const N = monthOf();
    await P.setupMonth(N, 'approved');
    const res = P.must(await P.step(N, 'reopen', { to: 'calculated', reason: bad }), `reason=${JSON.stringify(bad)}`);
    assert.equal(res.data.status, 'calculated');
    const row = (await P.auditOf(N)).find(r => r.action === 'period.reopen');
    assert.equal(row.reason, bad === P.text(10) ? P.text(10) : null, JSON.stringify(bad));
  }
  const L = monthOf();
  await P.setupMonth(L, 'approved');
  P.must(await reopen(L, 'calculated', { reason: P.text(300) }), 'đúng 300 ký tự');
});

test('`to` lạ là 400 BAD_TARGET (Admin); rev lệch là 409 PERIOD_STALE', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  for (const to of ['paid', 'approved', 'xyz', undefined]) {
    const res = await reopen(M, to);
    assert.equal(res.status, 400, String(to));
    assert.equal(res.data.code, 'BAD_TARGET');
  }
  const stale = await F.call('POST', `/periods/${M}/reopen`, { body: { rev: 1, to: 'calculated', reason } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'PERIOD_STALE');
});

/* ================= trạng thái ================= */
test('Kỳ đã chi trả (paid) vẫn mở lại được về open, attendance_locked, calculated kèm cảnh báo PERIOD_STATE; lần chạy thành superseded, phiếu giữ nguyên, bước chi trả bị xoá khỏi dòng kỳ', async () => {
  for (const to of ['open', 'attendance_locked', 'calculated']) {
    const M = monthOf();
    await P.setupMonth(M, 'paid');
    const before = await fingerprint(M);
    assert.equal((await getPeriod(M)).stages.paid.by, 'admin', to);
    const res = P.must(await reopen(M, to, { reason: 'Chi trả nhầm kỳ, cần tính lại' }), `paid → ${to}`);
    assert.equal(res.data.status, to);
    const warned = warningsOf(res).filter(w => w.code === 'PERIOD_STATE');
    assert.equal(warned.length, 1, `${to}: ${JSON.stringify(warningsOf(res))}`);
    assert.match(warned[0].message, /đã chi trả/);
    assert.equal(warned[0].details.status, 'paid');
    assert.equal(warned[0].details.to, to);
    const view = await getPeriod(M);
    assert.equal(view.status, to);
    assert.equal(view.reopenCount, 1);
    assert.equal(view.stages.paid.by, null, 'bước chi trả bị xoá khỏi dòng kỳ');
    assert.deepEqual(
      (await P.runsOf(M)).map(r => r.status),
      ['superseded']
    );
    assert.deepEqual(await fingerprint(M), before, 'phiếu và bản chụp giữ nguyên từng byte');
    const row = (await P.auditOf(M)).find(r => r.action === 'period.reopen');
    assert.equal(row.before.status, 'paid');
    assert.equal(row.after.status, to);
  }
});

test('Chỉ mở về một bước TRƯỚC trạng thái hiện tại: open → bất kỳ, và về đúng trạng thái đang ở, đều 409 PERIOD_STATE', async () => {
  const M = monthOf();
  await P.seed(M);
  assert.equal((await reopen(M, 'calculated')).data.code, 'PERIOD_STATE', 'open không mở lại được');
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  assert.equal((await reopen(M, 'calculated')).data.code, 'PERIOD_STATE', 'attendance_locked → calculated là đi tới');
  assert.equal((await reopen(M, 'attendance_locked')).data.code, 'PERIOD_STATE', 'về đúng trạng thái đang ở');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.equal((await reopen(M, 'calculated')).data.code, 'PERIOD_STATE', 'calculated → calculated');
  assert.equal(
    P.must(await reopen(M, 'attendance_locked'), 'calculated → attendance_locked').data.status,
    'attendance_locked'
  );
});

/* ================= không xoá gì ================= */
test('Mở lại từ approved về calculated: lần chạy final thành superseded, mọi phiếu giữ nguyên, kỳ mất lần chạy hiện hành, reopen_count + 1, nhật ký ghi lý do', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const before = await fingerprint(M);
  assert.equal(before.length, 4);
  const approvedAt = (await getPeriod(M)).stages.approved;
  assert.equal(approvedAt.by, 'admin');

  const res = P.must(await reopen(M, 'calculated', { reason: 'Phát hiện sai giờ OT của một người' }), 'mở lại');
  assert.equal(res.data.status, 'calculated');
  assert.deepEqual(await fingerprint(M), before, 'phiếu và bản chụp giữ nguyên từng byte');
  assert.deepEqual(
    (await P.runsOf(M)).map(r => [r.run_no, r.status]),
    [[1, 'superseded']]
  );
  const view = await getPeriod(M);
  assert.equal(view.reopenCount, 1);
  assert.equal(view.run, null, 'chưa có lần chạy hiện hành cho tới khi tính lại');
  assert.equal(view.stages.approved.by, null, 'các bước sau điểm quay về bị xoá khỏi dòng kỳ');
  assert.equal(view.stages.calculated.by, 'admin', 'bước tại điểm quay về giữ lại');
  assert.equal((await P.periodRow(M)).current_run_id, null);

  const row = (await P.auditOf(M)).find(r => r.action === 'period.reopen');
  assert.equal(row.reason, 'Phát hiện sai giờ OT của một người');
  assert.equal(row.before.status, 'approved');
  assert.deepEqual([row.after.status, row.after.to, row.after.reopenCount], ['calculated', 'calculated', 1]);
  assert.equal(row.sensitivity, 'pay');

  // tính lại: run_no mới, lần chạy cũ còn nguyên
  const calc = P.must(await P.step(M, 'calculate'), 'tính lại sau khi mở');
  assert.equal(calc.data.run.runNo, 2);
  assert.deepEqual(
    (await P.runsOf(M)).map(r => [r.run_no, r.status]),
    [
      [1, 'superseded'],
      [2, 'draft']
    ]
  );
  assert.deepEqual(
    (await fingerprint(M)).filter(r => r.run_no === 1),
    before,
    'lần chạy 1 vẫn y nguyên'
  );
  assert.equal((await P.slipRows(M)).length, 4, 'danh sách phiếu hiện là của lần chạy 2');
  assert.deepEqual(
    (await P.slipRows(M)).map(r => r.status),
    ['draft', 'draft', 'draft', 'draft']
  );
  // duyệt lại hết rồi mở lần hai: reopen_count 2
  P.must(await P.approveAllPending(M), 'duyệt');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  P.must(await reopen(M, 'calculated'), 'mở lần hai');
  assert.equal((await getPeriod(M)).reopenCount, 2);
  assert.deepEqual(
    (await P.runsOf(M)).map(r => r.status),
    ['superseded', 'superseded']
  );
});

test('Mở về attendance_locked rồi calculate: tạo lần chạy mới, lần cũ giữ nguyên; verify của lần mới không lệch', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const before = await fingerprint(M);
  P.must(await reopen(M, 'attendance_locked'), 'mở về attendance_locked');
  assert.equal((await getPeriod(M)).status, 'attendance_locked');
  P.must(await P.step(M, 'calculate'), 'tính lại');
  assert.deepEqual(
    (await fingerprint(M)).filter(r => r.run_no === 1),
    before
  );
  const verify = await F.call('GET', `/periods/${M}/verify`);
  assert.equal(verify.data.runNo, 2);
  assert.deepEqual(verify.data.mismatched, []);
});

/* ================= lịch ước tính của kỳ đã chốt ================= */
test('Kỳ đã tính lương vẫn lưu được lịch ước tính nhưng cảnh báo PERIOD_LOCKED; mở về open thì hết cảnh báo; tính lại thấy thay đổi và lần chạy cũ còn nguyên', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const sheet = await store.getSheet('qa_nv1', M);
  const days = JSON.parse(JSON.stringify(sheet.days));
  const date = Object.keys(days).find(d => days[d].kind === 'work' && days[d].extraKind === 'ot');
  assert.ok(date, 'điều kiện của bài: qa_nv1 có một ngày xin OT');
  // bỏ yêu cầu OT của ngày đó: ngày công vẫn tính theo lượt Check-in/out, chỉ mất tiền OT đã duyệt
  days[date] = { kind: 'work', in: days[date].in, out: days[date].out, preset: days[date].preset };
  const before = await fingerprint(M);
  const slipBefore = (await P.slipRows(M)).find(r => r.username === 'qa_nv1');
  const locked = await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: M, days } });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  const warned = warningsOf(locked).filter(w => w.code === 'PERIOD_LOCKED');
  assert.equal(warned.length, 1, JSON.stringify(warningsOf(locked)));
  assert.equal(warned[0].details.month, M);
  assert.equal(warned[0].details.status, 'calculated');
  assert.ok(!(await store.getSheet('qa_nv1', M)).days[date].extraKind, 'cảnh báo thì vẫn lưu');
  assert.equal((await getPeriod(M)).status, 'calculated');

  P.must(await reopen(M, 'open'), 'mở về open');
  assert.equal((await getPeriod(M)).status, 'open');
  const saved = await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: M, days } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(
    warningsOf(saved).filter(w => w.code === 'PERIOD_LOCKED'),
    [],
    'kỳ mở thì không còn cảnh báo khoá'
  );
  // khoản chờ duyệt mới (nếu có) và các bước kế tiếp
  const pending = (await store.approvals.list({ status: 'pending' })).filter(r => r.date.startsWith(M));
  if (pending.length)
    await store.approvals.decide(
      pending.map(r => ({ username: r.username, date: r.date, rev: r.rev, fingerprint: r.fingerprint })),
      'approved',
      'admin',
      'Duyệt để dựng dữ liệu thử'
    );
  P.must(await P.step(M, 'lock-attendance'), 'chốt công lại');
  P.must(await P.step(M, 'calculate'), 'tính lại');
  const slipAfter = (await P.slipRows(M)).find(r => r.username === 'qa_nv1');
  assert.ok(slipAfter.gross < slipBefore.gross, 'bỏ một yêu cầu OT đã duyệt làm giảm tiền');
  assert.deepEqual(
    (await fingerprint(M)).filter(r => r.run_no === 1),
    before,
    'lần chạy 1 giữ nguyên bản chụp cũ'
  );
  assert.equal((await P.runsOf(M)).length, 2);
});

test('Số sửa phiếu lưu được cả khi kỳ đã duyệt (cảnh báo PERIOD_LOCKED) và sau khi mở lại về calculated thì hết cảnh báo khoá', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const locked = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv1', month: M, values: { otPay: 5000 }, reason: 'Sửa sau khi đã duyệt' }
  });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.equal(
    warningsOf(locked).filter(w => w.code === 'PERIOD_LOCKED').length,
    1,
    JSON.stringify(warningsOf(locked))
  );
  P.must(await reopen(M, 'calculated'), 'mở lại');
  const ok = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv1', month: M, values: { otPay: 7000 }, reason: 'Sửa sau khi đã mở lại' }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(
    warningsOf(ok).filter(w => w.code === 'PERIOD_LOCKED'),
    [],
    'kỳ calculated chưa khoá phiếu'
  );
});
