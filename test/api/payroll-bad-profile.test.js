'use strict';
// Qua API: hồ sơ nhân sự có bậc lương hoặc loại không có trong bảng không bao giờ ra phiếu 0 ₫ hay số ước tính 0 ₫.
//   - POST /api/periods/:month/calculate: người đó có phiếu `error` (errorCode PAYROLL_BAD_LEVEL / PAYROLL_BAD_TYPE, net null), người khác vẫn draft;
//   - GET /api/me/estimate: 200 với estimate:null, reason, message; lỗi khác vẫn là 500;
//   - GET /api/ai/review: checked.payrollErrors đếm người đó, không phát hiện 0 ₫.
// Hồ sơ sai được đặt thẳng bằng UPDATE (API đã chặn nhập bậc lạ). Mỗi test một tháng riêng (test/helpers/period-api.js → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../lib/payroll-service');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const setLevel = (username, level) =>
  store.db.prepare('UPDATE staff SET level = ? WHERE username = ?').run(level, username);
const setType = (username, type) =>
  store.db.prepare('UPDATE staff SET type = ? WHERE username = ?').run(type, username);
const estimate = (month, who) => F.call('GET', `/me/estimate?month=${month}`, { who });

/* ================= calculate ================= */
test('calculate: người có bậc lương 99 nhận phiếu error PAYROLL_BAD_LEVEL (net null, không 0 ₫); các phiếu khác vẫn draft và đúng số', async () => {
  const M = monthOf();
  await P.seed(M);
  // số của ba người còn lại khi tính một mình (để chứng minh người sai không kéo theo ai)
  setLevel('qa_ctv1', 99);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const calc = P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.deepEqual(calc.data.counts, { draft: 3, pending: 0, approved: 0, error: 1, total: 4 });
  assert.equal(calc.data.run.slipsError, 1);

  const { run, slips } = P.flow.payslipsOf(M);
  assert.equal(run.slips_error, 1);
  const bad = slips.qa_ctv1;
  assert.equal(bad.status, 'error');
  assert.equal(bad.error_code, 'PAYROLL_BAD_LEVEL');
  assert.match(bad.error_detail, /Bậc lương/);
  assert.match(bad.error_detail, /99/);
  assert.equal(bad.net, null);
  assert.equal(bad.gross, null);
  assert.equal(bad.insurance, null);
  for (const name of ['qa_nv1', 'qa_nv2', 'qa_tts1']) {
    assert.equal(slips[name].status, 'draft', name);
    assert.ok(Number.isInteger(slips[name].net) && slips[name].gross > 0, `${name}: số tiền hợp lệ`);
  }
  const rows = await P.slipRows(M);
  const apiBad = rows.find(r => r.username === 'qa_ctv1');
  assert.deepEqual([apiBad.status, apiBad.errorCode, apiBad.net], ['error', 'PAYROLL_BAD_LEVEL', null]);
});

test('calculate: mọi kiểu hồ sơ sai (bậc 0, 7 của tts, loại xyz) đều thành phiếu error có mã đúng; duyệt phiếu lỗi bị chặn, duyệt kỳ loại phiếu lỗi ra kèm lý do', async () => {
  const M = monthOf();
  await P.seed(M);
  setLevel('qa_tts1', 7); // tts chỉ có bậc 1 đến 6
  setLevel('qa_nv1', 0);
  setType('qa_nv2', 'xyz');
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const calc = P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.deepEqual(calc.data.counts, { draft: 1, pending: 0, approved: 0, error: 3, total: 4 });
  const { slips } = P.flow.payslipsOf(M);
  assert.equal(slips.qa_tts1.error_code, 'PAYROLL_BAD_LEVEL');
  assert.equal(slips.qa_nv1.error_code, 'PAYROLL_BAD_LEVEL');
  assert.equal(slips.qa_nv2.error_code, 'PAYROLL_BAD_TYPE');
  assert.match(slips.qa_nv2.error_detail, /Loại nhân sự/);
  assert.equal(slips.qa_ctv1.status, 'draft');
  for (const name of ['qa_tts1', 'qa_nv1', 'qa_nv2']) assert.equal(slips[name].net, null, name);

  P.must(await P.step(M, 'ai-review'), 'AI kiểm tra');
  const rows = await P.slipRows(M);
  assert.deepEqual(
    rows
      .filter(r => r.status === 'error')
      .map(r => r.username)
      .sort(),
    ['qa_nv1', 'qa_nv2', 'qa_tts1']
  );
  const denied = await P.decide(M, [{ username: 'qa_nv1', rev: rows.find(r => r.username === 'qa_nv1').rev }]);
  assert.equal(denied.status, 409);
  assert.equal(denied.data.code, 'PAYSLIP_ERROR');
  P.must(await P.decide(M, P.itemsOf(rows.filter(r => r.status === 'pending'))), 'duyệt phiếu tốt');
  const excluded = P.must(
    await P.step(M, 'approve', {
      excludeErrors: ['qa_nv1', 'qa_nv2', 'qa_tts1'].map(username => ({ username, reason: 'Hồ sơ sai, xử lý riêng' }))
    }),
    'duyệt kỳ có loại phiếu lỗi'
  );
  assert.equal(excluded.data.status, 'approved');
});

test('calculate: sửa hồ sơ rồi tính lại thì phiếu hết lỗi (run_no 2), phiếu lỗi cũ vẫn còn trong lần chạy bị thay', async () => {
  const M = monthOf();
  await P.seed(M);
  setLevel('qa_ctv1', 99);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương lần 1');
  setLevel('qa_ctv1', 2); // hồ sơ gốc của qa_ctv1 trong period-flow
  const again = P.must(await P.step(M, 'calculate'), 'tính lại');
  assert.deepEqual(again.data.counts, { draft: 4, pending: 0, approved: 0, error: 0, total: 4 });
  assert.equal(again.data.run.runNo, 2);
  const first = store.db.prepare('SELECT id FROM payroll_runs WHERE month = ? AND run_no = 1').get(M);
  const old = store.db
    .prepare("SELECT status, error_code FROM payslips WHERE run_id = ? AND username = 'qa_ctv1'")
    .get(first.id);
  assert.deepEqual(
    { ...old },
    { status: 'error', error_code: 'PAYROLL_BAD_LEVEL' },
    'lần chạy cũ giữ nguyên phiếu lỗi'
  );
  assert.equal(P.flow.payslipsOf(M).slips.qa_ctv1.status, 'draft');
});

/* ================= estimate ================= */
test('estimate: bậc lương sai là 200 với estimate:null, reason PAYROLL_BAD_LEVEL và message tiếng Việt; không có m, net hay số 0 ₫; người khác không bị ảnh hưởng', async () => {
  const M = monthOf();
  await P.seed(M);
  setLevel('qa_nv1', 99);
  const res = await estimate(M, 'qa_nv1');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.estimate, null);
  assert.equal(res.data.reason, 'PAYROLL_BAD_LEVEL');
  assert.match(res.data.message, /Bậc lương/);
  assert.match(res.data.message, /99/);
  for (const key of ['m', 'net', 'trace', 'allowanceStatus', 'toDate'])
    assert.equal(Object.hasOwn(res.data, key), false, `không được có ${key}`);
  assert.equal(res.data.month, M);
  const other = await estimate(M, 'qa_nv2');
  assert.equal(other.status, 200);
  assert.equal(other.data.estimate, true);
  assert.ok(other.data.net.gross > 0);
});

test('estimate: loại nhân sự sai (xyz) là 200 với reason PAYROLL_BAD_TYPE; sửa hồ sơ thì có số ước tính trở lại', async () => {
  const M = monthOf();
  await P.seed(M);
  setType('qa_nv1', 'xyz');
  const res = await estimate(M, 'qa_nv1');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual([res.data.estimate, res.data.reason], [null, 'PAYROLL_BAD_TYPE']);
  assert.match(res.data.message, /Loại nhân sự/);
  setType('qa_nv1', 'nv');
  const fixed = await estimate(M, 'qa_nv1');
  assert.equal(fixed.data.estimate, true);
  assert.ok(fixed.data.net.gross > 0);
});

test('estimate: chỉ hai mã PAYROLL_BAD_TYPE / PAYROLL_BAD_LEVEL được trả 200; lỗi khác (kể cả lỗi có mã lạ) vẫn là 500 và không lộ chi tiết', async () => {
  const M = monthOf();
  await P.seed(M);
  const original = service.computeFor;
  try {
    for (const make of [
      () => new Error('lỗi nội bộ thử'),
      () => Object.assign(new Error('lỗi có mã lạ'), { code: 'SOMETHING_ELSE' }),
      () => Object.assign(new Error('gần giống'), { code: 'PAYROLL_BAD_OTHER' }),
      () => new TypeError('Cannot read properties of undefined')
    ]) {
      service.computeFor = () => {
        throw make();
      };
      const res = await estimate(M, 'qa_nv1');
      assert.equal(res.status, 500, JSON.stringify(res.data));
      assert.equal(JSON.stringify(res.data).includes('lỗi nội bộ thử'), false, 'không lộ thông báo nội bộ');
    }
  } finally {
    service.computeFor = original;
  }
  assert.equal((await estimate(M, 'qa_nv1')).status, 200, 'hết lỗi giả thì ước tính lại bình thường');
});

test('estimate: người có hồ sơ sai nhưng kỳ đã có bản chụp chính thức (afterPaid) vẫn xem bản chụp, không bị chặn bởi hồ sơ hiện tại', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  store.db
    .prepare(
      'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      'slip.staffVisibleFrom',
      M,
      '"afterApproval"',
      'Thử hiện phiếu sau duyệt',
      'admin',
      new Date(Date.now()).toISOString()
    );
  store.setSetting('params_mode', 'active');
  try {
    setLevel('qa_nv1', 99); // hồ sơ hỏng SAU khi đã chụp phiếu
    const res = await estimate(M, 'qa_nv1');
    assert.equal(res.status, 200);
    assert.equal(res.data.source, 'snapshot');
    assert.equal(res.data.official, true);
    assert.equal(res.data.net.net, P.flow.payslipsOf(M).slips.qa_nv1.net);
  } finally {
    store.setSetting('params_mode', 'defaults-only');
  }
});

/* ================= AI soát dữ liệu ================= */
test('GET /api/ai/review: người có bậc lương sai được đếm vào checked.payrollErrors, không có phát hiện dựa trên tiền của người đó; người khác không đổi', async () => {
  const M = monthOf();
  await P.seed(M);
  const clean = (await F.call('GET', `/ai/review?month=${M}`)).data;
  assert.equal(clean.checked.payrollErrors, 0);
  setLevel('qa_ctv1', 99);
  const res = await F.call('GET', `/ai/review?month=${M}`);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(res.data.checked.payrollErrors >= 1, `payrollErrors ${res.data.checked.payrollErrors}`);
  const PAYROLL_RULES = ['attendance-allowance-risk', 'large-pay-impact', 'ot-above-team', 'slip-override-gap'];
  const bad = res.data.findings.filter(f => f.username === 'qa_ctv1' && PAYROLL_RULES.includes(f.rule));
  assert.deepEqual(bad, []);
  assert.equal(/"impactVnd":0\b/.test(JSON.stringify(res.data.findings)), false);
  const strip = (r, user) => r.findings.filter(f => f.username === user).map(f => `${f.rule}|${f.date}|${f.message}`);
  for (const user of ['qa_nv1', 'qa_nv2', 'qa_tts1']) assert.deepEqual(strip(res.data, user), strip(clean, user), user);
});

test('ai-review của kỳ (POST /periods/:month/ai-review) vẫn chạy được khi có phiếu lỗi hồ sơ, và không biến phiếu lỗi thành chờ duyệt', async () => {
  const M = monthOf();
  await P.seed(M);
  setLevel('qa_ctv1', 99);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const ai = P.must(await P.step(M, 'ai-review'), 'AI kiểm tra');
  assert.equal(ai.data.status, 'reviewed');
  const rows = await P.slipRows(M);
  assert.equal(rows.find(r => r.username === 'qa_ctv1').status, 'error');
  assert.deepEqual(
    rows.filter(r => r.username !== 'qa_ctv1').map(r => r.status),
    ['pending', 'pending', 'pending']
  );
});
