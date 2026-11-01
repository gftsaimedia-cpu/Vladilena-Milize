'use strict';
// Qua API: hồ sơ nhân sự có bậc lương hoặc loại không có trong bảng không bao giờ ra phiếu 0 ₫ hay số ước tính 0 ₫.
//   - POST /api/periods/:month/calculate: người đó có phiếu `error` (errorCode PAYROLL_BAD_LEVEL / PAYROLL_BAD_TYPE, net null), người khác vẫn draft;
//   - GET /api/me/estimate: 200 với estimate:null, reason, message; lỗi khác vẫn là 500;
//   - GET /api/ai/review: checked.payrollErrors đếm người đó, không phát hiện 0 ₫.
// Hồ sơ sai được đặt thẳng bằng UPDATE (API đã chặn nhập bậc lạ). Mỗi test một tháng riêng (test/helpers/period-api.ts → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/domain/payroll/payroll-service');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const setLevel = async (username?, level?) =>
  await store.db.prepare('UPDATE staff SET level = ? WHERE username = ?').run(level, username);
const setType = async (username?, type?) =>
  await store.db.prepare('UPDATE staff SET type = ? WHERE username = ?').run(type, username);
const estimate = async (month?, who?) => await F.call('GET', `/me/estimate?month=${month}`, { who });

/* ================= calculate ================= */
test('calculate: người có bậc lương 99 nhận phiếu error PAYROLL_BAD_LEVEL (net null, không 0 ₫); các phiếu khác vẫn draft và đúng số', async () => {
  const M = monthOf();
  await P.seed(M);
  // số của ba người còn lại khi tính một mình (để chứng minh người sai không kéo theo ai)
  await setLevel('qa_ctv1', 99);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const calc = P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.deepEqual(calc.data.counts, { draft: 3, pending: 0, approved: 0, error: 1, total: 4 });
  assert.equal(calc.data.run.slipsError, 1);

  const { run, slips } = await P.flow.payslipsOf(M);
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
  await setLevel('qa_tts1', 7); // tts chỉ có bậc 1 đến 6
  await setLevel('qa_nv1', 0);
  await setType('qa_nv2', 'xyz');
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const calc = P.must(await P.step(M, 'calculate'), 'tính lương');
  assert.deepEqual(calc.data.counts, { draft: 1, pending: 0, approved: 0, error: 3, total: 4 });
  const { slips } = await P.flow.payslipsOf(M);
  assert.equal(slips.qa_tts1.error_code, 'PAYROLL_BAD_LEVEL');
  assert.equal(slips.qa_nv1.error_code, 'PAYROLL_BAD_LEVEL');
  assert.equal(slips.qa_nv2.error_code, 'PAYROLL_BAD_TYPE');
  assert.match(slips.qa_nv2.error_detail, /Loại nhân sự/);
  assert.equal(slips.qa_ctv1.status, 'draft');
  for (const name of ['qa_tts1', 'qa_nv1', 'qa_nv2']) assert.equal(slips[name].net, null, name);

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
  P.must(await P.decide(M, P.itemsOf(rows.filter(r => r.status === 'draft'))), 'duyệt phiếu tốt');
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
  await setLevel('qa_ctv1', 99);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương lần 1');
  await setLevel('qa_ctv1', 2); // hồ sơ gốc của qa_ctv1 trong period-flow
  const again = P.must(await P.step(M, 'calculate'), 'tính lại');
  assert.deepEqual(again.data.counts, { draft: 4, pending: 0, approved: 0, error: 0, total: 4 });
  assert.equal(again.data.run.runNo, 2);
  const first = await store.db.prepare('SELECT id FROM payroll_runs WHERE month = ? AND run_no = 1').get(M);
  const old = await store.db
    .prepare("SELECT status, error_code FROM payslips WHERE run_id = ? AND username = 'qa_ctv1'")
    .get(first.id);
  assert.deepEqual(
    { ...old },
    { status: 'error', error_code: 'PAYROLL_BAD_LEVEL' },
    'lần chạy cũ giữ nguyên phiếu lỗi'
  );
  assert.equal((await P.flow.payslipsOf(M)).slips.qa_ctv1.status, 'draft');
});

/* ================= estimate ================= */
test('estimate: bậc lương sai là 200 với estimate:null, reason PAYROLL_BAD_LEVEL và message tiếng Việt; không có m, net hay số 0 ₫; người khác không bị ảnh hưởng', async () => {
  const M = monthOf();
  await P.seed(M);
  await setLevel('qa_nv1', 99);
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
  await setType('qa_nv1', 'xyz');
  const res = await estimate(M, 'qa_nv1');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual([res.data.estimate, res.data.reason], [null, 'PAYROLL_BAD_TYPE']);
  assert.match(res.data.message, /Loại nhân sự/);
  await setType('qa_nv1', 'nv');
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
  await store.db
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
  await store.setSetting('params_mode', 'active');
  try {
    await setLevel('qa_nv1', 99); // hồ sơ hỏng SAU khi đã chụp phiếu
    const res = await estimate(M, 'qa_nv1');
    assert.equal(res.status, 200);
    assert.equal(res.data.source, 'snapshot');
    assert.equal(res.data.official, true);
    assert.equal(res.data.net.net, (await P.flow.payslipsOf(M)).slips.qa_nv1.net);
  } finally {
    await store.setSetting('params_mode', 'defaults-only');
  }
});

/* ================= AI soát dữ liệu ================= */
test('tính lương vẫn chạy được khi có phiếu lỗi hồ sơ, các phiếu còn lại là bản nháp', async () => {
  const M = monthOf();
  await P.seed(M);
  await setLevel('qa_ctv1', 99);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const rows = await P.slipRows(M);
  assert.equal(rows.find(r => r.username === 'qa_ctv1').status, 'error');
  assert.deepEqual(
    rows.filter(r => r.username !== 'qa_ctv1').map(r => r.status),
    ['draft', 'draft', 'draft']
  );
});
