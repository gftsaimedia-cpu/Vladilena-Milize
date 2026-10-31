'use strict';
// GET /api/ai/review: phản hồi có `period: { status }` ở cuối và mỗi phát hiện có `dismissed: null | { by, at, note }` (khoá cuối cùng).
// Cờ lấy từ lib/findings.js → annotate(month, list): ghép theo (tháng, tài khoản, mã luật) với lần tính hiện hành, dùng CÙNG băm với
// POST /api/ai/findings/dismiss (đầu vào + băm tham số của lần chạy). Chưa có lần tính thì chưa ai bỏ qua được: tất cả null.
// Dữ liệu: bốn người bịa của test/helpers/period-flow.js; qa_nv1 và qa_nv2 khai 4 ngày iSAT mỗi người (đang chờ duyệt) nên AI có phát hiện thật
// (isat-frequency của qa_nv1, cộng attendance-allowance-risk và repeated-edits của qa_nv1; qa_nv2 có tuỳ tháng nên test không dựa vào nó). Chốt công phải bỏ qua PENDING_APPROVALS kèm lý do vì các khoản iSAT còn chờ.
// Mỗi test lấy MỘT THÁNG RIÊNG (P.monthPool) vì payslips, payroll_runs, ai_finding_actions chỉ-thêm-dòng. Không phụ thuộc ngày thật (đồng hồ giả của fixture).
const P = require('../helpers/period-api');
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const REASON = 'Đã xem, hợp lệ theo biên bản';
const FINDING_KEYS = [
  'rule',
  'severity',
  'username',
  'month',
  'date',
  'item',
  'approval',
  'message',
  'evidence',
  'id',
  'digest'
];
const TOP_KEYS = [
  'asOf',
  'month',
  'findings',
  'systemFindings',
  'checked',
  'checklist',
  'summary',
  'thresholds',
  'names'
];

const review = async (M, who = 'admin', query = '') => await F.call('GET', `/ai/review?month=${M}${query}`, { who });
const dismiss = async (M, username, rule, reason = REASON, who = 'admin') =>
  await F.call('POST', '/ai/findings/dismiss', { who, body: { month: M, username, rule, reason } });
const mark = (data, username, rule) => data.findings.filter(f => f.username === username && f.rule === rule);

// Tháng đã seed (kỳ còn "open"); qa_nv1 và qa_nv2 khai 4 Thứ Bảy iSAT, các khoản chờ duyệt
async function isatMonth() {
  const M = monthOf();
  await P.seed(M);
  for (const user of ['qa_nv1', 'qa_nv2']) {
    const got = await F.call('GET', `/sheet?month=${M}`, { who: user });
    const days = { ...got.data.days };
    for (const date of P.dowDates(M, 6).slice(0, 4)) days[date] = { kind: 'isat' };
    P.must(await F.call('PUT', '/sheet', { who: user, body: { month: M, days } }), `${user} khai iSAT`);
  }
  return M;
}
const lock = async M =>
  P.must(
    await P.step(M, 'lock-attendance', {
      reason: 'Dựng dữ liệu thử cho AI kiểm tra',
      acknowledge: ['PENDING_APPROVALS']
    }),
    'chốt công'
  );
// Tới "reviewed": đã chốt công, tính lương và chạy AI kiểm tra (phiếu mang cờ)
async function reviewedMonth() {
  const M = await isatMonth();
  await lock(M);
  P.must(await P.step(M, 'calculate'), 'tính lương');
  P.must(await P.step(M, 'ai-review'), 'AI kiểm tra');
  return M;
}
const baseline = async M => {
  const data = (await review(M)).data;
  assert.ok(
    mark(data, 'qa_nv1', 'isat-frequency').length === 1,
    'đầu vào dựng phải sinh phát hiện isat-frequency của qa_nv1'
  );
  const ids = new Set(data.findings.map(f => `${f.username}|${f.rule}`));
  assert.ok(
    ids.size >= 2,
    'cần ít nhất hai đơn vị (tài khoản, luật) khác nhau để kiểm "đơn vị khác không bị đánh dấu"'
  );
  assert.ok(data.findings.length >= 3);
  return data;
};

// Test này đứng ĐẦU file để lấy tháng đầu của monthPool (2026-10): ở tháng đó AI cho hai phát hiện repeated-edits của qa_nv1 (số phát hiện theo tháng phụ thuộc lịch,
// tháng khác có thể chỉ một), nên thứ tự file là một phần của dữ liệu thử.
test('AI soát: đơn vị bỏ qua là (tháng, tài khoản, mã luật): luật có nhiều phát hiện của cùng một người được đánh dấu cùng lúc; lý do cắt dấu cách', async () => {
  const M = await reviewedMonth();
  const before = await baseline(M);
  const many = before.findings.filter(f => f.username === 'qa_nv1' && f.rule === 'repeated-edits');
  assert.ok(many.length >= 2, 'đầu vào dựng phải có nhiều phát hiện repeated-edits của qa_nv1');
  assert.equal((await dismiss(M, 'qa_nv1', 'repeated-edits', `   ${REASON}   `)).status, 200);
  const after = (await review(M)).data;
  for (const f of mark(after, 'qa_nv1', 'repeated-edits')) assert.equal(f.dismissed.note, REASON);
  assert.equal(
    after.findings.filter(f => f.dismissed).length,
    many.length,
    'chỉ các phát hiện cùng đơn vị bị đánh dấu'
  );
});

/* ================= 1. chưa tính lương ================= */

test('AI soát: kỳ còn open (chưa tính lương) thì period.status là open và mọi phát hiện có dismissed null', async () => {
  const M = await isatMonth();
  const res = await review(M);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.deepEqual(res.data.period, { status: 'open' });
  assert.ok(res.data.findings.length >= 3, 'có phát hiện thật để kiểm');
  for (const f of res.data.findings) assert.equal(f.dismissed, null, `${f.username} ${f.rule}`);
  // đã chốt công nhưng chưa tính lương cũng chưa ai bỏ qua được
  await lock(M);
  const locked = await review(M);
  assert.deepEqual(locked.data.period, { status: 'attendance_locked' });
  assert.ok(locked.data.findings.every(f => f.dismissed === null));
});

test('AI soát: bỏ qua trước khi có lần tính lương bị từ chối (PERIOD_NOT_READY) và phản hồi vẫn toàn null', async () => {
  const M = await isatMonth();
  const res = await dismiss(M, 'qa_nv1', 'isat-frequency');
  assert.equal(res.status, 409, JSON.stringify(res.data).slice(0, 200));
  assert.equal(res.data.code, 'PERIOD_NOT_READY');
  assert.ok((await review(M)).data.findings.every(f => f.dismissed === null));
});

/* ================= 2. bỏ qua một phát hiện ================= */

test('AI soát: bỏ qua isat-frequency của qa_nv1 chỉ đánh dấu đúng phát hiện đó { by, at, note }; mọi phát hiện khác vẫn null', async () => {
  const M = await reviewedMonth();
  const before = await baseline(M);
  assert.deepEqual(before.period, { status: 'reviewed' });
  assert.ok(before.findings.every(f => f.dismissed === null));

  const res = await dismiss(M, 'qa_nv1', 'isat-frequency');
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));

  const after = (await review(M)).data;
  assert.equal(after.findings.length, before.findings.length, 'số phát hiện không đổi');
  const target = mark(after, 'qa_nv1', 'isat-frequency')[0];
  assert.deepEqual(Object.keys(target.dismissed), ['by', 'at', 'note']);
  assert.equal(target.dismissed.by, 'admin');
  assert.equal(target.dismissed.note, REASON);
  assert.match(target.dismissed.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(target.dismissed.at, res.data.at, 'cùng lúc với phản hồi của lệnh bỏ qua');
  for (const f of after.findings)
    if (f !== target) assert.equal(f.dismissed, null, `${f.username} ${f.rule} không được bị đánh dấu`);
});

/* ================= 3. đầu vào hoặc tham số đổi thì hiện lại ================= */

test('AI soát: tính lại với đầu vào y nguyên GIỮ dấu đã bỏ qua; đổi đầu vào (ngày lễ) rồi tính lại thì cùng phát hiện lại dismissed null', async () => {
  const M = await reviewedMonth();
  await baseline(M);
  assert.equal((await dismiss(M, 'qa_nv1', 'isat-frequency')).status, 200);
  const digest1 = (await store.payroll.currentRun(M)).inputsDigest;

  // y nguyên: giữ
  P.must(await P.step(M, 'calculate'), 'tính lại, đầu vào y nguyên');
  assert.equal(
    (await store.payroll.currentRun(M)).inputsDigest,
    digest1,
    'đầu vào không đổi thì băm đầu vào không đổi'
  );
  const kept = (await review(M)).data;
  assert.deepEqual(kept.period, { status: 'calculated' });
  assert.equal(mark(kept, 'qa_nv1', 'isat-frequency')[0].dismissed.by, 'admin');

  // đổi đầu vào: thêm một ngày lễ (cài đặt đi vào băm đầu vào của lần chạy) rồi tính lại
  const holiday = P.dowDates(M, 3)[2];
  await store.setSetting('holidays', [...(await store.getSetting('holidays', [])), holiday]);
  P.must(await P.step(M, 'calculate'), 'tính lại, đầu vào đã đổi');
  assert.notEqual((await store.payroll.currentRun(M)).inputsDigest, digest1, 'băm đầu vào phải đổi');
  const changed = (await review(M)).data;
  const target = mark(changed, 'qa_nv1', 'isat-frequency');
  assert.equal(target.length, 1, 'phát hiện vẫn còn sau khi đổi ngày lễ');
  assert.equal(target[0].dismissed, null, 'đầu vào đổi nên dấu bỏ qua cũ hết hiệu lực');
  assert.ok(changed.findings.every(f => f.dismissed === null));
});

test('AI soát: mở lại về open rồi chốt và tính lại với tham số y nguyên GIỮ dấu; đổi một tham số làm băm tham số của lần chạy đổi thì dismissed null', async () => {
  const M = await reviewedMonth();
  await baseline(M);
  assert.equal((await dismiss(M, 'qa_nv1', 'isat-frequency')).status, 200);
  const run1 = await store.payroll.currentRun(M);

  const cycle = async () => {
    P.must(await P.step(M, 'reopen', { to: 'open', reason: 'Mở lại để thử bỏ qua phát hiện AI' }), 'mở lại');
    await lock(M);
    P.must(await P.step(M, 'calculate'), 'tính lại');
    return await store.payroll.currentRun(M);
  };

  // tham số y nguyên: cùng băm đầu vào và cùng băm tham số -> giữ
  const run2 = await cycle();
  assert.equal(run2.inputsDigest, run1.inputsDigest);
  assert.equal(run2.paramsHash, run1.paramsHash);
  assert.equal(mark((await review(M)).data, 'qa_nv1', 'isat-frequency')[0].dismissed.by, 'admin');

  // đổi tham số có hiệu lực từ tháng này khi kỳ đang open, rồi chốt và tính lại
  const key = (await S.adminKeys())[0];
  assert.ok(key, 'registry phải có khoá số Admin sửa được');
  P.must(await P.step(M, 'reopen', { to: 'open', reason: 'Mở lại để đổi tham số thử' }), 'mở lại lần hai');
  const [value] = await S.differing(key, M);
  P.must(await S.saveChanges([{ key: key.key, value }], { month: M }), 'lưu tham số');
  await lock(M);
  P.must(await P.step(M, 'calculate'), 'tính lại với tham số mới');
  const run3 = await store.payroll.currentRun(M);
  assert.equal(run3.inputsDigest, run1.inputsDigest, 'đầu vào y nguyên');
  assert.notEqual(run3.paramsHash, run1.paramsHash, 'băm tham số của lần chạy phải đổi');
  const after = (await review(M)).data;
  const target = mark(after, 'qa_nv1', 'isat-frequency');
  assert.equal(target.length, 1);
  assert.equal(target[0].dismissed, null, 'tham số đổi nên dấu bỏ qua cũ hết hiệu lực');
});

/* ================= 4. kỳ đã duyệt hoặc đã chi trả ================= */

test('AI soát: kỳ approved rồi paid, phát hiện đã bỏ qua trước đó vẫn hiện dismissed { by, at, note }', async () => {
  const M = await reviewedMonth();
  await baseline(M);
  // bỏ qua mọi cờ trên phiếu (chỉ duyệt được phiếu có cờ sau khi từng cờ đã được bỏ qua kèm lý do)
  const flagged = (await P.slipRows(M)).filter(s => s.flags.length);
  assert.ok(flagged.length >= 1);
  const notes = new Map();
  for (const slip of flagged)
    for (const rule of slip.flags) {
      const note = `Đã đối chiếu ${slip.username} ${rule}`;
      notes.set(`${slip.username}|${rule}`, note);
      P.must(await dismiss(M, slip.username, rule, note), `bỏ qua ${slip.username} ${rule}`);
    }
  // duyệt phiếu: phiếu không cờ cả lô, phiếu có cờ từng phiếu kèm ghi chú
  const unflagged = (await P.slipRows(M)).filter(s => s.status === 'pending' && !s.flags.length);
  if (unflagged.length) P.must(await P.decide(M, P.itemsOf(unflagged)), 'duyệt phiếu không cờ');
  for (const slip of flagged) {
    const fresh = (await P.slipRows(M)).find(s => s.username === slip.username);
    P.must(
      await P.decide(M, [{ username: fresh.username, rev: fresh.rev }], 'approve', P.text(12)),
      `duyệt ${slip.username}`
    );
  }

  const check = async status => {
    const data = (await review(M)).data;
    assert.deepEqual(data.period, { status });
    assert.ok(data.findings.length >= 3);
    for (const f of data.findings) {
      assert.ok(f.dismissed, `${f.username} ${f.rule} phải còn dấu bỏ qua ở kỳ ${status}`);
      assert.deepEqual(Object.keys(f.dismissed), ['by', 'at', 'note']);
      assert.equal(f.dismissed.by, 'admin');
      assert.equal(f.dismissed.note, notes.get(`${f.username}|${f.rule}`));
    }
  };
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  await check('approved');
  P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  await check('paid');
});

/* ================= 5. quyền ================= */

test('AI soát: nhân sự thường 403, chưa đăng nhập 401; phản hồi lỗi không có phát hiện hay ghi chú bỏ qua', async () => {
  const M = await reviewedMonth();
  assert.equal((await dismiss(M, 'qa_nv1', 'isat-frequency')).status, 200);
  for (const who of ['qa_nv1', 'qa_nv2', 'qa_ctv1', 'qa_tts1']) {
    const res = await review(M, who);
    assert.equal(res.status, 403, who);
    assert.ok(!JSON.stringify(res.data).includes(REASON), 'không lộ ghi chú bỏ qua cho nhân sự');
    assert.equal(res.data.findings, undefined);
  }
  assert.equal((await review(M, null)).status, 401);
});

/* ================= 6. thứ tự khoá ================= */

test('AI soát: khoá cấp trên giữ thứ tự cũ và `period` đứng sau; mỗi phát hiện có `dismissed` là khoá cuối cùng, khoá cũ giữ thứ tự', async () => {
  const M = await reviewedMonth();
  await baseline(M);
  assert.equal((await dismiss(M, 'qa_nv1', 'isat-frequency')).status, 200);
  for (const query of ['', '&impacts=1']) {
    const data = (await review(M, 'admin', query)).data;
    const keys = Object.keys(data);
    assert.equal(await keys.at(-1), 'period', `period phải là khoá cuối${query ? ' (có impacts)' : ''}`);
    assert.deepEqual(
      keys.filter(k => k !== 'period' && k !== 'impacts'),
      TOP_KEYS,
      'các khoá cũ giữ nguyên thứ tự'
    );
    assert.ok(data.findings.length >= 3);
    for (const f of data.findings) {
      const fk = Object.keys(f);
      assert.equal(await fk.at(-1), 'dismissed', `${f.username} ${f.rule}: dismissed phải là khoá cuối`);
      assert.deepEqual(fk.slice(0, -1), FINDING_KEYS, 'các khoá cũ của phát hiện giữ nguyên thứ tự');
      assert.ok(f.dismissed === null || Object.keys(f.dismissed).join() === 'by,at,note');
    }
    assert.ok(
      data.findings.some(f => f.dismissed) && data.findings.some(f => !f.dismissed),
      'cả hai trạng thái có mặt'
    );
    // phát hiện hệ thống (không gắn với ai) không có khoá dismissed
    for (const f of data.systemFindings) assert.ok(!('dismissed' in f));
  }
});
