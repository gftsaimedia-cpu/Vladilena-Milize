'use strict';
// Bỏ qua phát hiện AI của phiếu lương, có lý do (lib/findings.ts): đơn vị là CỜ của phiếu (tháng, tài khoản, mã luật).
//   dismiss({ month, username, rule, reason, by }, actx?)   lý do không bắt buộc, tối đa 300 ký tự; ghi nhật ký cùng giao dịch; lặp lại thì không ghi thêm
//   activeFindings(month, username) / annotate(month, danh sách { username, rule })
//   - tính lại với đầu vào ĐỔI thì băm đầu vào của lần chạy đổi và mọi lần bỏ qua cũ hết hiệu lực; đầu vào y nguyên thì giữ.
// Cờ được gắn thẳng bằng store.payroll.applyAiReview (mô phỏng kết quả "AI kiểm tra"). Mỗi test dùng một tháng riêng.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const findings = require('../../lib/findings');
const warnings = require('../../lib/warnings');

const { F, store, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const FLAGS = ['isat-frequency', 'late-declaration'];
// Kỳ đã qua AI kiểm tra, phiếu qa_nv1 mang hai cờ
async function flaggedMonth(flags = FLAGS) {
  const M = monthOf();
  await P.setupMonth(M, 'reviewed');
  await store.payroll.applyAiReview((await store.payroll.currentRun(M)).id, { qa_nv1: flags });
  return M;
}
const dismiss = (M?, rule?, extra: any = {}) =>
  findings.dismiss({
    month: M,
    username: 'qa_nv1',
    rule,
    reason: 'Đã xem, hợp lệ theo biên bản',
    by: 'admin',
    ...extra
  });
const dismissRows = async (M?) =>
  await store.db
    .prepare("SELECT * FROM audit_log WHERE action = 'ai.finding.dismiss' AND month = ? ORDER BY id")
    .all(M);
const actionRows = async (M?) =>
  await store.db.prepare('SELECT * FROM ai_finding_actions WHERE month = ? ORDER BY id').all(M);
const throwsCode = async (fn?, code?, httpStatus?) =>
  await assert.rejects(
    fn,
    error => error.code === code && (httpStatus === undefined || error.httpStatus === httpStatus),
    `${code}`
  );

test('dismiss: lý do không bắt buộc (rỗng, ngắn, sai kiểu đều nhận); quá 300 ký tự là REASON_REQUIRED 400 và không ghi gì; đúng 10 và đúng 300 ký tự được nhận', async () => {
  const M = await flaggedMonth();
  const before = await F.snapshot();
  await throwsCode(() => dismiss(M, 'isat-frequency', { reason: P.text(301) }), 'REASON_REQUIRED', 400);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal((await dismiss(M, 'isat-frequency', { reason: `  ${P.text(10)}  ` })).dismissed, true);
  assert.equal((await dismiss(M, 'late-declaration', { reason: P.text(300) })).dismissed, true);
  assert.deepEqual(
    (await actionRows(M)).map(r => r.note),
    [P.text(10), P.text(300)],
    'lý do được cắt dấu cách hai đầu và lưu nguyên'
  );
  for (const reason of [undefined, null, '', '   ', 'ngắn', 12345678901, {}]) {
    const N = await flaggedMonth(['isat-frequency']);
    assert.equal((await dismiss(N, 'isat-frequency', { reason })).dismissed, true, JSON.stringify(reason));
  }
});

test('dismiss: ghi nhật ký (ai.finding.dismiss, mức pay, đúng người, đúng lý do) cùng một dòng ai_finding_actions; trả remaining', async () => {
  const M = await flaggedMonth();
  const audit0 = (await dismissRows(M)).length;
  const result = await dismiss(M, 'isat-frequency');
  assert.deepEqual(
    [result.dismissed, result.already, result.by, result.remaining],
    [true, false, 'admin', ['late-declaration']]
  );
  const rows = (await dismissRows(M)).slice(audit0);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].actor, rows[0].entity_kind, rows[0].entity_id, rows[0].subject, rows[0].sensitivity, rows[0].reason],
    ['admin', 'ai-finding', `slip:isat-frequency:qa_nv1:${M}`, 'qa_nv1', 'pay', 'Đã xem, hợp lệ theo biên bản']
  );
  assert.equal((await actionRows(M)).length, 1);
  assert.equal((await actionRows(M))[0].action, 'dismiss');
  assert.equal(findings.findingIdOf(M, 'qa_nv1', 'isat-frequency'), `slip:isat-frequency:qa_nv1:${M}`);
  assert.equal((await F.call('GET', '/audit/verify')).data.ok, true);
});

test('dismiss: lặp lại cùng một cờ không ghi thêm (một dòng nhật ký, một dòng hành động), trả already:true', async () => {
  const M = await flaggedMonth();
  const first = await dismiss(M, 'isat-frequency');
  const rowsAfterFirst = [(await dismissRows(M)).length, (await actionRows(M)).length];
  const again = await dismiss(M, 'isat-frequency', { reason: 'Lý do khác nhưng cùng cờ đó' });
  assert.equal(again.already, true);
  assert.deepEqual([(await dismissRows(M)).length, (await actionRows(M)).length], rowsAfterFirst);
  assert.deepEqual([again.by, again.at], [first.by, first.at], 'giữ người và lúc của lần đầu');
  assert.equal((await actionRows(M))[0].note, 'Đã xem, hợp lệ theo biên bản', 'lý do lần đầu không bị ghi đè');
});

test('dismiss: lỗi có mã — PAYSLIP_NOT_FOUND (404) khi người đó không có phiếu, FINDING_NOT_FOUND (404) khi phiếu không mang cờ đó, PERIOD_NOT_READY khi chưa tính lương, PERIOD_STATE khi lần chạy đã chốt, BAD_MONTH, thiếu tham số', async () => {
  const M = await flaggedMonth();
  const before = await F.snapshot();
  await throwsCode(
    () =>
      findings.dismiss({ month: M, username: 'qa_khong_co', rule: 'isat-frequency', reason: P.text(12), by: 'admin' }),
    'PAYSLIP_NOT_FOUND',
    404
  );
  await throwsCode(() => dismiss(M, 'luat-khong-gan-co'), 'FINDING_NOT_FOUND', 404);
  await throwsCode(
    () => findings.dismiss({ month: '2026-13', username: 'qa_nv1', rule: 'x', reason: P.text(12), by: 'admin' }),
    'BAD_MONTH',
    400
  );
  for (const bad of [{ username: '' }, { rule: '' }, { by: '' }, { username: undefined }])
    await throwsCode(() => dismiss(M, 'isat-frequency', bad), 'BAD_ARGS', 400);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'lỗi không ghi gì');
  // chưa có lần tính lương
  const N = monthOf();
  await P.seed(N);
  await throwsCode(() => dismiss(N, 'isat-frequency'), 'PERIOD_NOT_READY', 409);
  // lần chạy đã chốt (final): bỏ qua vẫn được ghi, kèm cảnh báo PERIOD_STATE (phiếu đã chốt không đổi số tiền)
  const K = await flaggedMonth();
  P.must(await P.approveAllPending(K), 'duyệt phiếu');
  P.must(await P.step(K, 'approve'), 'duyệt kỳ');
  const warned = await warnings.run(async () => [await dismiss(K, 'isat-frequency'), warnings.take()]);
  assert.equal(warned[0].dismissed, true);
  assert.deepEqual(
    warned[1].map(w => w.code),
    ['PERIOD_STATE']
  );
});

test('activeFindings và annotate: cờ còn hiệu lực giảm dần khi bỏ qua; annotate gắn dismissed { by, at, note } hoặc null cho từng cờ; phiếu không cờ hoặc kỳ chưa tính thì rỗng', async () => {
  const M = await flaggedMonth();
  const listOf = (username?) => FLAGS.map(rule => ({ username, rule }));
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv1'), FLAGS);
  assert.deepEqual(
    (await findings.annotate(M, listOf('qa_nv1'))).map(f => [f.rule, f.dismissed]),
    [
      ['isat-frequency', null],
      ['late-declaration', null]
    ]
  );
  await dismiss(M, 'isat-frequency');
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv1'), ['late-declaration']);
  const status = await findings.annotate(M, listOf('qa_nv1'));
  assert.deepEqual(
    status.map(s => [s.rule, s.dismissed !== null]),
    [
      ['isat-frequency', true],
      ['late-declaration', false]
    ]
  );
  assert.equal(status[0].dismissed.by, 'admin');
  assert.match(status[0].dismissed.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof status[0].dismissed.note, 'string', 'lý do bỏ qua đi kèm');
  await dismiss(M, 'late-declaration');
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv1'), []);
  // người khác không bị ảnh hưởng (phiếu không có cờ) và kỳ không có lần tính
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv2'), []);
  assert.deepEqual(
    (await findings.annotate(M, listOf('qa_nv2'))).map(f => f.dismissed),
    [null, null]
  );
  const N = monthOf();
  await P.seed(N);
  assert.deepEqual(await findings.activeFindings(N, 'qa_nv1'), []);
  assert.deepEqual(
    (await findings.annotate(N, listOf('qa_nv1'))).map(f => f.dismissed),
    [null, null],
    'chưa có lần tính thì chưa ai bỏ qua được'
  );
  assert.deepEqual(await findings.annotate(M, []), []);
  await throwsCode(() => findings.activeFindings('abc', 'qa_nv1'), 'BAD_MONTH', 400);
  await throwsCode(() => findings.activeFindings(M, ''), 'BAD_ARGS', 400);
});

test('Tính lại với đầu vào y nguyên GIỮ lần bỏ qua (cùng băm đầu vào); phiếu của lần chạy mới phải được gắn cờ lại bởi AI', async () => {
  const M = await flaggedMonth();
  await dismiss(M, 'isat-frequency');
  const digest1 = (await store.payroll.currentRun(M)).inputsDigest;
  P.must(await P.step(M, 'calculate'), 'tính lại');
  const run2 = await store.payroll.currentRun(M);
  assert.equal(run2.runNo, 2);
  assert.equal(run2.inputsDigest, digest1, 'đầu vào không đổi thì băm không đổi');
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv1'), [], 'lần chạy mới chưa có cờ nào');
  await store.payroll.applyAiReview(run2.id, { qa_nv1: FLAGS });
  assert.deepEqual(
    await findings.activeFindings(M, 'qa_nv1'),
    ['late-declaration'],
    'cờ đã bỏ qua vẫn bỏ qua; cờ chưa bỏ qua còn hiệu lực'
  );
  const listOf = (rules?) => rules.map(rule => ({ username: 'qa_nv1', rule }));
  assert.notEqual(
    (await findings.annotate(M, listOf(FLAGS)))[0].dismissed,
    null,
    'lần bỏ qua cũ vẫn gắn vào cờ của lần chạy mới'
  );
  assert.equal((await dismiss(M, 'isat-frequency')).already, true, 'bỏ qua lại ở lần chạy mới là no-op');
});

test('Tính lại với đầu vào ĐÃ ĐỔI làm mọi lần bỏ qua cũ hết hiệu lực (băm đầu vào đổi): cờ hiện lại và bỏ qua được lần nữa kèm lý do mới', async () => {
  const M = await flaggedMonth();
  await dismiss(M, 'isat-frequency');
  await dismiss(M, 'late-declaration');
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv1'), []);
  const digest1 = (await store.payroll.currentRun(M)).inputsDigest;
  // đổi đầu vào ngoài đường API (kỳ đã khoá): bỏ một ngày công của qa_nv1
  const sheet = await store.getSheet('qa_nv1', M);
  const days = JSON.parse(JSON.stringify(sheet.days));
  delete days[Object.keys(days).find(d => days[d].kind === 'work')];
  await store.setSheet('qa_nv1', M, days);
  P.must(await P.step(M, 'calculate'), 'tính lại với đầu vào đã đổi');
  const run2 = await store.payroll.currentRun(M);
  assert.notEqual(run2.inputsDigest, digest1);
  await store.payroll.applyAiReview(run2.id, { qa_nv1: FLAGS });
  assert.deepEqual(await findings.activeFindings(M, 'qa_nv1'), FLAGS, 'bỏ qua cũ không còn hiệu lực');
  assert.deepEqual(
    (
      await findings.annotate(
        M,
        FLAGS.map(rule => ({ username: 'qa_nv1', rule }))
      )
    ).map(f => f.dismissed),
    [null, null],
    'đầu vào đổi: cờ hiện lại, chưa bỏ qua'
  );
  const again = await dismiss(M, 'isat-frequency', { reason: 'Bỏ qua lại sau khi dữ liệu đổi' });
  assert.equal(again.already, false);
  assert.equal((await actionRows(M)).length, 3, 'lịch sử giữ cả lần cũ và lần mới (chỉ thêm dòng)');
});

test('Duyệt phiếu có cờ: phiếu còn cờ chưa bỏ qua vẫn duyệt được, cả trong lô lẫn riêng lẻ, kèm cảnh báo PAYSLIP_FLAGGED nêu phiếu và cờ', async () => {
  const M = await flaggedMonth();
  const rows = await P.slipRows(M);
  const flagged = rows.find(r => r.username === 'qa_nv1');
  const others = rows.filter(r => r.username !== 'qa_nv1' && r.status === 'pending');
  const batch = await P.decide(M, P.itemsOf([flagged, others[0]]), 'approve', 'Đã xem các phát hiện');
  assert.equal(batch.status, 200, JSON.stringify(batch.data));
  const warning = batch.data.warnings.find(w => w.code === 'PAYSLIP_FLAGGED');
  assert.ok(warning, JSON.stringify(batch.data.warnings));
  assert.equal(warning.count, 1);
  assert.deepEqual(warning.details.items, [{ username: 'qa_nv1', flags: FLAGS }]);
  assert.equal(batch.data.items.find(i => i.username === 'qa_nv1').status, 'approved');

  const N = await flaggedMonth();
  const slip = (await P.slipRows(N)).find(r => r.username === 'qa_nv1');
  const alone = await P.decide(N, [{ username: 'qa_nv1', rev: slip.rev }], 'approve', 'Đã xem các phát hiện');
  assert.equal(alone.status, 200, JSON.stringify(alone.data));
  assert.ok(alone.data.warnings.some(w => w.code === 'PAYSLIP_FLAGGED'));
  assert.equal(alone.data.items[0].status, 'approved');
  // phiếu không cờ không bị ảnh hưởng, vẫn duyệt cả lô được
  const rest = (await P.slipRows(N)).filter(r => r.status === 'pending');
  P.must(await P.decide(N, P.itemsOf(rest)), 'lô không cờ');
  assert.equal(flow.PEOPLE.length, 4);
});
