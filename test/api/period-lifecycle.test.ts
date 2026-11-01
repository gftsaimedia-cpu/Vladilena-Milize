'use strict';
// Vòng đời kỳ lương (src/domain/period/periods.ts, route /api/periods/* của server.js):
// open → attendance_locked → calculated → approved → paid, mỗi bước sai trạng thái là 409 PERIOD_STATE, rev lệch là PERIOD_STALE,
// danh sách kiểm, tính lương tạo lần chạy và bản chụp, duyệt phiếu cả lô hoặc không, nhật ký cho từng bước, verify.
// Các bước vẫn đi tiếp khi còn việc chưa xong (chỉ cảnh báo): period-flow-warns.test.ts.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool): không dòng nào rò từ test này sang test khác.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const Engine = require('../../src/engine/payroll-engine');
const service = require('../../src/domain/payroll/payroll-service');

const { F, store, flow } = P;
const monthOf = P.monthPool();
const NAMES = flow.PEOPLE.map(p => p.username).sort();

before(F.start);
after(F.stop);

const getPeriod = async (month?, who = 'admin') => await F.call('GET', `/periods/${month}`, { who });
const reasonOk = 'Lý do đủ mười ký tự';
// Thêm một ngày iSAT (thứ Bảy cuối tháng) vào lịch của qa_nv1: thành khoản chờ duyệt
async function addIsat(month?) {
  const days = { ...(await store.getSheet('qa_nv1', month)).days, [await P.lastDow(month, 6)]: { kind: 'isat' } };
  const res = await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month, days } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

/* ================= chuỗi trạng thái đầy đủ ================= */
test('Vòng đời: open → attendance_locked → calculated → approved → paid, rev tăng một ở mỗi bước, mỗi bước ghi nhật ký', async () => {
  const M = monthOf();
  await P.seed(M);
  let view = (await getPeriod(M)).data;
  assert.equal(view.status, 'open');
  assert.equal(view.managed, true);
  assert.equal(view.rev, 0, 'kỳ chưa có dòng: rev 0');
  assert.equal(view.run, null);

  const lock = P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  assert.equal(lock.data.status, 'attendance_locked');
  assert.equal(lock.data.rev, 1);

  const calc = P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.equal(calc.data.status, 'calculated');
  assert.equal(calc.data.rev, 2);
  assert.equal(calc.data.run.runNo, 1);
  assert.equal(calc.data.run.status, 'draft');
  assert.deepEqual(calc.data.counts, { draft: 4, pending: 0, approved: 0, error: 0, total: 4 });

  const drafts = await P.slipRows(M);
  assert.deepEqual(
    drafts.map(r => r.status),
    ['draft', 'draft', 'draft', 'draft'],
    'sau tính lương mọi phiếu là bản nháp'
  );

  const decided = P.must(await P.approveAllPending(M), 'duyệt cả lô phiếu');
  assert.equal(decided.data.items.length, 4);
  assert.ok(decided.data.items.every(i => i.status === 'approved'));

  const approved = P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  assert.equal(approved.data.status, 'approved');
  assert.equal(approved.data.rev, 3);

  const paid = P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05', reference: 'UNC-TEST-001' }), 'chi trả');
  assert.equal(paid.data.status, 'paid');
  assert.equal(paid.data.rev, 4);

  view = (await getPeriod(M)).data;
  assert.equal(view.status, 'paid');
  assert.deepEqual(Object.fromEntries(Object.entries<any>(view.stages).map(([k, v]: any) => [k, v.by])), {
    attendanceLocked: 'admin',
    calculated: 'admin',
    reviewed: null,
    approved: 'admin',
    paid: 'admin'
  });
  assert.equal(view.stages.paid.ref, 'UNC-TEST-001');
  assert.deepEqual(view.counts, { draft: 0, pending: 0, approved: 4, error: 0, total: 4 });
  assert.equal(view.run.status, 'final', 'duyệt kỳ chốt lần chạy');

  // danh sách 12 tháng của năm
  const year = (await F.call('GET', `/periods?year=${M.slice(0, 4)}`)).data;
  assert.equal(year.periods.length, 12);
  const row = year.periods.find(p => p.month === M);
  assert.equal(row.status, 'paid');
  assert.equal(row.counts.approved, 4);
  assert.match(row.paydayExpected, /^\d{4}-\d{2}-\d{2}$/);

  // nhật ký: một dòng cho mỗi bước, mức nhạy cảm 'pay', đúng người làm
  const rows = await P.auditOf(M);
  const actions = rows.map(r => r.action);
  assert.deepEqual(
    actions.filter(a => a.startsWith('period.')),
    ['period.lock-attendance', 'period.calculate', 'period.approve', 'period.mark-paid']
  );
  assert.equal(actions.filter(a => a === 'payslip.approve').length, 4);
  for (const r of rows) {
    assert.equal(r.actor, 'admin');
    assert.equal(r.sensitivity, 'pay');
  }
  const lockRow = rows.find(r => r.action === 'period.lock-attendance');
  assert.equal(lockRow.before.status, 'open');
  assert.equal(lockRow.after.status, 'attendance_locked');
  assert.equal(rows.find(r => r.action === 'period.calculate').after.runNo, 1);
  const verify = await F.call('GET', '/audit/verify');
  assert.equal(verify.status, 200);
  assert.equal(verify.data.ok, true, `chuỗi băm nhật ký phải còn nguyên: ${JSON.stringify(verify.data)}`);
});

/* ================= bước sai trạng thái ================= */
test('Mỗi bước sai trạng thái là 409 PERIOD_STATE (kèm status và expected) và KHÔNG lưu gì, ở cả sáu trạng thái', async () => {
  const M = monthOf();
  await P.seed(M);
  const body = { paidAt: '2026-11-05', to: 'calculated', reason: reasonOk };
  // bước → trạng thái cho phép; mọi bước còn lại ở trạng thái đó phải là PERIOD_STATE
  const ALLOWED = {
    'lock-attendance': ['open'],
    calculate: ['attendance_locked', 'calculated', 'reviewed'],
    approve: ['calculated', 'reviewed'],
    'mark-paid': ['approved'],
    reopen: ['reviewed', 'approved', 'paid']
  };
  // đi từng bước một tới mỗi trạng thái rồi thử mọi bước không được phép ở trạng thái đó
  const ENTER = {
    open: async () => {},
    attendance_locked: async () => P.must(await P.step(M, 'lock-attendance'), 'chốt công'),
    calculated: async () => P.must(await P.step(M, 'calculate'), 'tính lương'),
    reviewed: async () => {},
    approved: async () => {
      P.must(await P.approveAllPending(M), 'duyệt phiếu');
      P.must(await P.step(M, 'approve'), 'duyệt kỳ');
    },
    paid: async () => P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả')
  };
  for (const state of P.ORDER.filter(s => s !== 'reviewed')) {
    await ENTER[state]();
    assert.equal((await getPeriod(M)).data.status, state);
    for (const [name, states] of Object.entries<any>(ALLOWED)) {
      if (states.includes(state)) continue;
      const before = await F.snapshot();
      const res = await P.step(M, name, body);
      assert.equal(res.status, 409, `${state} → ${name}: ${res.status} ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'PERIOD_STATE', `${state} → ${name}`);
      assert.equal(res.data.status, state);
      assert.ok(
        Array.isArray(res.data.expected) && res.data.expected.length >= 1,
        `${state} → ${name}: thiếu expected`
      );
      assert.deepEqual(F.changedTables(before, await F.snapshot()), [], `${state} → ${name} không được lưu gì`);
    }
  }
});

test('Duyệt phiếu khi kỳ chưa có lần tính lương là 409 PERIOD_STATE; danh sách phiếu và verify của kỳ chưa tính rỗng, không lỗi', async () => {
  const M = monthOf();
  await P.seed(M);
  const res = await P.decide(M, [{ username: 'qa_nv1', rev: 1 }]);
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'PERIOD_STATE');
  const slips = await F.call('GET', `/periods/${M}/payslips`);
  assert.equal(slips.status, 200);
  assert.deepEqual([slips.data.run, slips.data.total, slips.data.rows], [null, 0, []]);
  const verify = await F.call('GET', `/periods/${M}/verify`);
  assert.deepEqual([verify.status, verify.data.run, verify.data.checked, verify.data.mismatched], [200, null, 0, []]);
  const slip = await F.call('GET', `/periods/${M}/payslips/qa_nv1`);
  assert.equal(slip.status, 404);
  assert.equal(slip.data.code, 'PAYSLIP_NOT_FOUND');
});

/* ================= rev, tháng không quản lý, tháng sai dạng ================= */
test('rev lệch là 409 PERIOD_STALE (kèm rev hiện tại) và không đổi gì; thiếu rev là 400 BAD_REV', async () => {
  const M = monthOf();
  await P.seed(M);
  const stale = await F.call('POST', `/periods/${M}/lock-attendance`, { body: { rev: 7 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'PERIOD_STALE');
  assert.equal(stale.data.rev, 0);
  for (const bad of [{}, { rev: '0' }, { rev: 1.5 }, { rev: null }]) {
    const res = await F.call('POST', `/periods/${M}/lock-attendance`, { body: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.data.code, 'BAD_REV');
  }
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  // người thứ hai còn cầm rev cũ (0) khi kỳ đã sang rev 1
  const before = await F.snapshot();
  const late = await F.call('POST', `/periods/${M}/calculate`, { body: { rev: 0 } });
  assert.equal(late.data.code, 'PERIOD_STALE');
  assert.equal(late.data.rev, 1);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  // rev đúng thì qua
  P.must(await P.step(M, 'calculate'), 'tính lương');
  // rev cũ cũng bị chặn ở các bước sau
  for (const name of ['approve']) {
    const res = await F.call('POST', `/periods/${M}/${name}`, { body: { rev: 1 } });
    assert.equal(res.data.code, 'PERIOD_STALE', name);
  }
});

test('Mọi tháng đều chịu khoá kỳ như nhau: tháng 2026-09 chốt công được, xem kỳ managed luôn true, không có firstManagedMonth', async () => {
  const view = await F.call('GET', '/periods/2026-09');
  assert.equal(view.status, 200);
  assert.equal(view.data.status, 'open');
  assert.equal(view.data.managed, true);
  assert.equal('firstManagedMonth' in view.data, false);
  const lock = await F.call('POST', '/periods/2026-09/lock-attendance', { body: { rev: 0 } });
  assert.equal(lock.status, 200, JSON.stringify(lock.data));
  assert.equal((await P.periodRow('2026-09')).status, 'attendance_locked');
});

test('Tháng sai dạng là 400 BAD_MONTH ở mọi route kỳ lương (xem, phiếu, verify và các bước ghi)', async () => {
  const M = monthOf();
  await P.seed(M);
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-10', 'abcd', '2026-10-01']) {
    for (const route of [`/periods/${bad}`, `/periods/${bad}/payslips`, `/periods/${bad}/verify`]) {
      const res = await F.call('GET', route);
      assert.equal(res.status, 400, `${route}: ${res.status} ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'BAD_MONTH', route);
    }
    for (const name of ['lock-attendance', 'calculate', 'approve', 'mark-paid', 'reopen']) {
      const res = await F.call('POST', `/periods/${bad}/${name}`, { body: { rev: 0 } });
      assert.equal(res.status, 400, `${bad}/${name}: ${res.status} ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'BAD_MONTH', `${bad}/${name}`);
    }
  }
  assert.equal((await F.call('GET', '/periods?year=abc')).status, 400);
});

/* ================= danh sách kiểm trước khi chốt công ================= */
const codesOfChecklist = (view?) => view.checklist.map(i => i.code);

test('Danh sách kiểm: lý do đúng 300 ký tự được nhận, không cần lý do khi không có gì để bỏ qua', async () => {
  const M = monthOf();
  await P.seed(M);
  await addIsat(M);
  P.must(await P.step(M, 'lock-attendance', { acknowledge: ['PENDING_APPROVALS'], reason: P.text(300) }), '300 ký tự');
  const N = monthOf();
  await P.seed(N);
  // acknowledge thừa (không có mã nào cần bỏ qua) không đòi lý do
  P.must(await P.step(N, 'lock-attendance', { acknowledge: ['PENDING_APPROVALS'] }), 'acknowledge thừa');
});

/* ================= tính lương ================= */
test('calculate: tạo lần chạy có engine_version, params_hash, params_rev, công tắc, băm đầu vào; một bản chụp cho mỗi người', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const { run, slips } = await flow.payslipsOf(M);
  assert.equal(run.run_no, 1);
  assert.equal(run.status, 'draft');
  assert.equal(run.engine_version, Engine.ENGINE_VERSION);
  assert.match(run.params_hash, /^[0-9a-f]{64}$/);
  assert.equal(run.params_rev, 0);
  assert.equal(run.slips_total, 4);
  assert.equal(run.slips_error, 0);
  assert.match(run.inputs_digest, /^[0-9a-f]{64}$/);
  assert.equal(run.created_by, 'admin');
  assert.deepEqual(Object.keys(slips).sort(), NAMES);
  for (const name of NAMES) {
    const s = slips[name];
    assert.equal(s.status, 'draft', name);
    assert.ok(s.snapshot && Array.isArray(s.snapshot.rows), `${name}: bản chụp có rows`);
    assert.ok(s.snapshot.trace, `${name}: bản chụp có vết trace`);
    assert.equal(s.snapshot.net.net, s.net, `${name}: net của bản chụp bằng cột net`);
    assert.ok(Number.isInteger(s.gross) && Number.isInteger(s.net), `${name}: tiền là số nguyên đồng`);
    assert.equal(s.terms.username, name);
    assert.equal(s.terms.sessionVersion, undefined, 'điều khoản đã chụp không chứa số phiên bản phiên');
    assert.equal(s.terms.passHash, undefined);
  }
  const runRow = (await getPeriod(M)).data.run;
  assert.equal(runRow.paramsHash, run.params_hash);
  assert.equal(runRow.slipsTotal, 4);
});

test('calculate: lỗi của một người thành phiếu error (mã và chi tiết), người khác vẫn tính; phiếu lỗi không duyệt được, loại ra có lý do', async () => {
  const M = monthOf();
  await P.seed(M);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const original = service.computeFor;
  service.computeFor = (month, staff, ...rest) => {
    if (staff.username === 'qa_ctv1') throw Object.assign(new Error('thiếu dữ liệu thử'), { code: 'TEST_MISSING' });
    return original(month, staff, ...rest);
  };
  try {
    const calc = P.must(await P.step(M, 'calculate'), 'tính lương');
    assert.deepEqual(calc.data.counts, { draft: 3, pending: 0, approved: 0, error: 1, total: 4 });
    assert.equal(calc.data.run.slipsError, 1);
  } finally {
    service.computeFor = original;
  }
  const { slips } = await flow.payslipsOf(M);
  assert.equal(slips.qa_ctv1.status, 'error');
  assert.equal(slips.qa_ctv1.error_code, 'TEST_MISSING');
  assert.match(slips.qa_ctv1.error_detail, /thiếu dữ liệu thử/);
  assert.equal(slips.qa_ctv1.net, null);
  assert.equal(slips.qa_nv1.status, 'draft');
  const rows = await P.slipRows(M);
  assert.equal(rows.find(r => r.username === 'qa_ctv1').status, 'error', 'AI không biến phiếu lỗi thành chờ duyệt');
  const bad = rows.find(r => r.username === 'qa_ctv1');
  const denied = await P.decide(M, [{ username: 'qa_ctv1', rev: bad.rev }]);
  assert.equal(denied.status, 409);
  assert.equal(denied.data.code, 'PAYSLIP_ERROR');
  P.must(await P.decide(M, P.itemsOf(rows.filter(r => r.status === 'draft'))), 'duyệt các phiếu tốt');
  // loại phiếu lỗi: lý do quá 300 ký tự là lỗi dữ liệu
  const tooLong = await P.step(M, 'approve', { excludeErrors: [{ username: 'qa_ctv1', reason: P.text(301) }] });
  assert.equal(tooLong.status, 400);
  const ok = P.must(
    await P.step(M, 'approve', { excludeErrors: [{ username: 'qa_ctv1', reason: 'Loại ra để xử lý riêng' }] }),
    'duyệt kỳ có loại phiếu lỗi'
  );
  assert.equal(ok.data.status, 'approved');
  assert.equal((await flow.payslipsOf(M)).slips.qa_ctv1.note, 'Loại ra để xử lý riêng');
});

test('calculate lại: lần chạy trước thành superseded (run_no + 1), phiếu cũ còn nguyên; từ reviewed quay về calculated và phải chạy AI lại', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const first = await P.runsOf(M);
  assert.deepEqual(
    first.map(r => [r.run_no, r.status]),
    [[1, 'draft']]
  );
  const firstRows = await store.db
    .prepare(
      "SELECT username, net, upper(encode(snapshot_gz, 'hex')) AS snap FROM payslips WHERE run_id = ? ORDER BY username"
    )
    .all(first[0].id);
  assert.equal(firstRows.length, 4);

  const again = P.must(await P.step(M, 'calculate'), 'tính lại từ reviewed');
  assert.equal(again.data.status, 'calculated', 'tính lại bỏ bước AI đã qua');
  assert.equal(again.data.run.runNo, 2);
  assert.deepEqual(
    (await P.runsOf(M)).map(r => [r.run_no, r.status]),
    [
      [1, 'superseded'],
      [2, 'draft']
    ]
  );
  const keep = await store.db
    .prepare(
      "SELECT username, net, upper(encode(snapshot_gz, 'hex')) AS snap FROM payslips WHERE run_id = ? ORDER BY username"
    )
    .all(first[0].id);
  assert.deepEqual(keep, firstRows, 'phiếu của lần chạy bị thay vẫn còn nguyên');
  const view = (await getPeriod(M)).data;
  assert.equal(view.run.id, (await P.runsOf(M))[1].id);
  assert.equal(view.stages.reviewed.by, null);
  assert.deepEqual(
    (await P.slipRows(M)).map(r => r.status),
    ['draft', 'draft', 'draft', 'draft']
  );
  // phiếu cũ không còn duyệt được
  const stale = await P.decide(M, [{ username: 'qa_nv1', rev: 2 }]);
  assert.equal(stale.status, 409, 'phiếu mới là draft, chưa qua AI');
  P.must(await P.step(M, 'calculate'), 'tính lại lần ba');
  assert.deepEqual(
    (await P.runsOf(M)).map(r => r.status),
    ['superseded', 'superseded', 'draft']
  );
});

test('calculate cho cùng đầu vào cho cùng băm đầu vào và cùng số tiền (xác định)', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const a = await flow.payslipsOf(M);
  P.must(await P.step(M, 'calculate'), 'tính lại');
  const b = await flow.payslipsOf(M);
  assert.equal(b.run.run_no, 2);
  assert.equal(b.run.inputs_digest.length, 64);
  for (const name of NAMES)
    assert.deepEqual(
      [b.slips[name].gross, b.slips[name].insurance, b.slips[name].tax, b.slips[name].advance, b.slips[name].net],
      [a.slips[name].gross, a.slips[name].insurance, a.slips[name].tax, a.slips[name].advance, a.slips[name].net],
      name
    );
  assert.equal(b.run.params_hash, a.run.params_hash);
});

/* ================= duyệt phiếu ================= */
test('decide: cả lô hoặc không — một phiếu sai rev hoặc không có thật thì KHÔNG phiếu nào đổi', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const rows = await P.slipRows(M);
  const before = await F.snapshot();
  const items = P.itemsOf(rows);
  const stale = await P.decide(M, [...items.slice(0, 3), { ...items[3], rev: items[3].rev + 5 }]);
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'PAYSLIP_STALE');
  assert.equal(stale.data.username, items[3].username);
  const ghost = await P.decide(M, [...items.slice(0, 3), { username: 'qa_khong_co', rev: 1 }]);
  assert.equal(ghost.status, 404);
  assert.equal(ghost.data.code, 'PAYSLIP_NOT_FOUND');
  const dup = await P.decide(M, [items[0], items[0]]);
  assert.equal(dup.status, 400);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'lô bị từ chối không được lưu gì');
  assert.deepEqual(
    (await P.slipRows(M)).map(r => r.status),
    ['draft', 'draft', 'draft', 'draft']
  );
  // lô trống, quá 200, action lạ
  assert.equal((await P.decide(M, [])).status, 400);
  assert.equal((await P.decide(M, items, 'xoa')).status, 400);
  assert.equal(
    (
      await P.decide(
        M,
        Array.from({ length: 201 }, (_, i) => ({ username: `qa_${i}`, rev: 1 }))
      )
    ).status,
    400
  );
  // lô đúng thì duyệt hết
  P.must(await P.decide(M, items), 'lô đúng');
  assert.deepEqual(
    (await P.slipRows(M)).map(r => r.status),
    ['approved', 'approved', 'approved', 'approved']
  );
});

test('approve kỳ đóng băng số Admin sửa vào override_json của phiếu (kèm lý do), rồi sửa tiếp vẫn lưu kèm cảnh báo PERIOD_LOCKED, số đã đóng băng giữ nguyên', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  const set = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv2', month: M, values: { otPay: 123456, workDays: 20 }, reason: 'Điều chỉnh theo biên bản họp' }
  });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  assert.equal(set.data.rev, 1);
  // trước khi duyệt kỳ chưa có gì được đóng băng
  assert.equal((await flow.payslipsOf(M)).slips.qa_nv2.override_json, null);
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  const { slips } = await flow.payslipsOf(M);
  const frozen = JSON.parse(slips.qa_nv2.override_json);
  assert.deepEqual(frozen.values, { otPay: 123456, workDays: 20 });
  assert.equal(frozen.reason, 'Điều chỉnh theo biên bản họp');
  assert.equal(frozen.rev, 1);
  assert.equal(frozen.updatedBy, 'admin');
  for (const name of NAMES.filter(n => n !== 'qa_nv2')) assert.equal(slips[name].override_json, null, name);
  const locked = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv2', month: M, values: { otPay: 1 }, reason: 'Thử sửa sau khi đóng băng' }
  });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.ok(
    locked.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
    JSON.stringify(locked.data.warnings)
  );
  assert.equal(JSON.parse((await flow.payslipsOf(M)).slips.qa_nv2.override_json).values.otPay, 123456);
});

/* ================= kiểm lại bản chụp ================= */
test('verify: trả {checked, mismatched: []} sau khi tính; sửa thẳng lịch của MỘT người chỉ làm người đó lệch; đổi hồ sơ hay tham số sau đó không làm ai lệch', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const clean = await F.call('GET', `/periods/${M}/verify`);
  assert.equal(clean.status, 200);
  assert.equal(clean.data.checked, 4);
  assert.deepEqual(clean.data.mismatched, []);
  assert.equal(clean.data.engineVersion, Engine.ENGINE_VERSION);
  assert.equal(clean.data.engineChanged, false);

  // sửa trực tiếp lịch của qa_nv2 (ngoài đường API, vì API đã khoá)
  const original = await store.getSheet('qa_nv2', M);
  const days = JSON.parse(JSON.stringify(original.days));
  const date = Object.keys(days).find(d => days[d].kind === 'work');
  days[date] = { kind: 'unpaid' };
  await store.setSheet('qa_nv2', M, days);
  try {
    const dirty = await F.call('GET', `/periods/${M}/verify`);
    assert.deepEqual(dirty.data.mismatched, ['qa_nv2']);
    assert.equal(dirty.data.checked, 4);
  } finally {
    await store.setSheet('qa_nv2', M, original.days);
  }
  assert.deepEqual((await F.call('GET', `/periods/${M}/verify`)).data.mismatched, []);

  // đổi hồ sơ (level) và thêm dòng tham số có hiệu lực từ tháng này: bản chụp dùng điều khoản và tham số đã chụp nên không ai lệch
  await store.db.prepare("UPDATE staff SET level = 4 WHERE username = 'qa_nv1'").run();
  await store.setSetting('params_mode', 'active');
  try {
    await store.db
      .prepare(
        'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        'attendance.overLimitHours',
        M,
        '12',
        'Thử đổi tham số sau khi tính',
        'admin',
        new Date(Date.now()).toISOString()
      );
    assert.deepEqual((await F.call('GET', `/periods/${M}/verify`)).data.mismatched, []);
  } finally {
    await store.setSetting('params_mode', 'defaults-only');
  }
});

test('Phiếu trong cơ sở dữ liệu: tiền là số nguyên đồng, bản chụp giải nén được và khớp cột; lần chạy final không sửa trực tiếp được', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  const run = (await P.runsOf(M))[0];
  assert.equal(run.status, 'final');
  const row = await store.db.prepare('SELECT * FROM payslips WHERE run_id = ? ORDER BY username LIMIT 1').get(run.id);
  const snapshot = JSON.parse(zlib.gunzipSync(Buffer.from(row.snapshot_gz)).toString('utf8'));
  assert.equal(snapshot.net.net, row.net);
  await assert.rejects(
    async () => await store.db.prepare('UPDATE payslips SET net = 1 WHERE id = ?').run(row.id),
    /không được/
  );
  await assert.rejects(
    async () => await store.db.prepare("UPDATE payroll_runs SET params_hash = 'x' WHERE id = ?").run(run.id),
    /không được/
  );
  await assert.rejects(
    async () => await store.db.prepare('DELETE FROM payslips WHERE id = ?').run(row.id),
    /không được xoá/
  );
});
