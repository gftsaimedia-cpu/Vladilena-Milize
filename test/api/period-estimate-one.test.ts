'use strict';
// GET /api/periods/:month/estimates/:username: phiếu ước tính đầy đủ của MỘT người khi kỳ chưa tính lương.
// Giao diện Admin (src/engine/admin/view-ky-luong-phieu.js → A.actions.kyslip) gọi đường dẫn này để hiện phiếu ước tính.
// Hợp đồng: cùng dạng với GET /periods/:month/payslips/:username (src/domain/period/periods.ts → payslip) nhưng tính trực tiếp như GET /periods/:month/estimates, không ghi gì:
//   200 { month, period, run: null, source: 'estimate', payslip: { …hàng của danh sách estimates, staffTerms, snapshot } };
//   quyền payroll.view phạm vi toàn bộ (như danh sách); chưa đăng nhập 401; nhân sự 403 FORBIDDEN_CAP; tên không có trong bảng lương 404 PAYSLIP_NOT_FOUND;
//   tháng sai 400 BAD_MONTH; hồ sơ sai (bậc/loại) 200 với payslip.status 'error' và errorCode, không bao giờ 0 ₫.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool). Chỉ người bịa (qa_*).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const NAMES = ['qa_ctv1', 'qa_nv1', 'qa_nv2', 'qa_tts1'];
const one = async (month?, username?, who = 'admin') =>
  await F.call('GET', `/periods/${month}/estimates/${username}`, { who });
const list = async (month?, who = 'admin') => await F.call('GET', `/periods/${month}/estimates?pageSize=200`, { who });
const MONEY = ['gross', 'insurance', 'tax', 'advance', 'net'];
const LINES = ['workDays', 'tienNgayCong', 'phuCap', 'ot', 'kpi', 'truTreSom', 'khac'];
const rowCount = async (table?) => (await store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;

test('S2: phiếu ước tính của một người trả 200, source estimate, run null, kỳ chưa tính, đủ staffTerms và snapshot', async () => {
  const M = monthOf();
  await P.seed(M);
  const res = await one(M, 'qa_nv1');
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(res.data.month, M);
  assert.equal(res.data.source, 'estimate');
  assert.equal(res.data.run, null);
  assert.equal(res.data.period.month, M);
  assert.equal(res.data.period.status, 'open');
  const slip = res.data.payslip;
  assert.equal(slip.username, 'qa_nv1');
  assert.equal(slip.status, 'draft');
  assert.equal(slip.name, 'Người thử qa_nv1');
  assert.equal(slip.type, 'nv');
  assert.ok(Number.isInteger(slip.gross) && slip.gross > 0, `gross ${slip.gross}`);
  assert.ok(Number.isInteger(slip.net) && slip.net > 0, `net ${slip.net}`);
  assert.equal(slip.staffTerms.type, 'nv');
  assert.equal(slip.staffTerms.level, 1);
  assert.equal(typeof slip.snapshot, 'object');
  assert.ok(slip.snapshot !== null, 'có bản chụp để vẽ phiếu đầy đủ');
  for (const key of LINES) assert.equal(typeof slip[key], 'number', key);
  // chưa có lần tính nên không có phiên bản duyệt hay người duyệt
  assert.equal(slip.rev, null);
  assert.equal(slip.decidedBy, null);
});

test('S2: net, gross và các dòng tiền của từng người bằng hàng của cùng người trong GET /estimates (đủ bốn người)', async () => {
  const M = monthOf();
  await P.seed(M);
  const rows = (await list(M)).data.rows;
  assert.deepEqual(rows.map(r => r.username).sort(), NAMES);
  for (const row of rows) {
    const res = await one(M, row.username);
    assert.equal(res.status, 200, `${row.username}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
    for (const key of [...MONEY, ...LINES]) assert.equal(res.data.payslip[key], row[key], `${row.username}.${key}`);
    assert.equal(res.data.payslip.status, row.status, row.username);
    assert.equal(res.data.payslip.type, row.type, row.username);
  }
});

test('S2: số ước tính của một người bằng số phiếu sau khi chốt công và tính lương cùng dữ liệu (từng đồng)', async () => {
  const M = monthOf();
  await P.seed(M);
  const before: Record<string, any> = {};
  for (const name of NAMES) {
    const res = await one(M, name);
    assert.equal(res.status, 200, `${name}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
    before[name] = res.data.payslip;
  }
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  for (const name of NAMES) {
    const stored = P.must(await F.call('GET', `/periods/${M}/payslips/${name}`), `phiếu ${name}`).data.payslip;
    for (const key of [...MONEY, ...LINES]) assert.equal(before[name][key], stored[key], `${name}.${key}`);
  }
});

test('S2: gọi phiếu ước tính không ghi gì: số dòng payroll_runs, payslips, audit_log và mọi bảng khác không đổi', async () => {
  const M = monthOf();
  await P.seed(M);
  const counts = async () => await Promise.all(['payroll_runs', 'payslips', 'audit_log'].map(rowCount));
  const countsBefore = await counts();
  const snapBefore = await F.snapshot();
  P.must(await one(M, 'qa_ctv1'), 'phiếu ước tính');
  P.must(await one(M, 'qa_ctv1'), 'phiếu ước tính lần hai');
  assert.deepEqual(await counts(), countsBefore, 'payroll_runs, payslips, audit_log');
  assert.deepEqual(F.changedTables(snapBefore, await F.snapshot()), [], 'không bảng nào đổi');
  assert.equal(await store.payroll.currentRun(M), null, 'vẫn chưa có lần tính');
});

test('S2: chưa đăng nhập bị 401 và không lộ số tiền', async () => {
  const M = monthOf();
  await P.seed(M);
  const res = await one(M, 'qa_nv1', null);
  assert.equal(res.status, 401);
  assert.equal(JSON.stringify(res.data).includes('net'), false);
});

test('S2: tài khoản nhân sự bị 403 FORBIDDEN_CAP, kể cả xem phiếu ước tính của chính mình, và không lộ số tiền hay người khác', async () => {
  const M = monthOf();
  await P.seed(M);
  for (const [who, target] of [
    ['qa_nv1', 'qa_nv1'],
    ['qa_nv1', 'qa_ctv1'],
    ['qa_tts1', 'qa_nv2']
  ]) {
    const res = await one(M, target, who);
    assert.equal(res.status, 403, `${who} xem ${target}: ${res.status}`);
    assert.equal(res.data.code, 'FORBIDDEN_CAP', `${who} xem ${target}`);
    const text = JSON.stringify(res.data);
    assert.equal(text.includes('"net"') || text.includes('gross'), false, 'không lộ số tiền');
  }
});

test('S2: tên không có trong bảng lương của tháng là 404 PAYSLIP_NOT_FOUND và không ghi gì', async () => {
  const M = monthOf();
  await P.seed(M);
  const snapBefore = await F.snapshot();
  for (const name of ['qa_khong_co', 'admin']) {
    const res = await one(M, name);
    assert.equal(res.status, 404, `${name}: ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'PAYSLIP_NOT_FOUND', name);
  }
  assert.deepEqual(F.changedTables(snapBefore, await F.snapshot()), []);
});

test('S2: tháng sai dạng là 400 BAD_MONTH', async () => {
  const M = monthOf();
  await P.seed(M);
  for (const bad of ['2026-13', '2026-1', 'abc', '2026-00']) {
    const res = await one(bad, 'qa_nv1');
    assert.equal(res.status, 400, `${bad}: ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'BAD_MONTH', bad);
  }
});

test('S2: hồ sơ sai bậc hoặc loại là 200 với payslip.status error và errorCode, tiền không phải 0 ₫; người khác không bị ảnh hưởng', async () => {
  const M = monthOf();
  await P.seed(M);
  await store.db.prepare("UPDATE staff SET level = 99 WHERE username = 'qa_ctv1'").run();
  await store.db.prepare("UPDATE staff SET type = 'xyz' WHERE username = 'qa_tts1'").run();
  const badLevel = await one(M, 'qa_ctv1');
  assert.equal(badLevel.status, 200, JSON.stringify(badLevel.data).slice(0, 300));
  assert.equal(badLevel.data.source, 'estimate');
  assert.equal(badLevel.data.payslip.status, 'error');
  assert.equal(badLevel.data.payslip.errorCode, 'PAYROLL_BAD_LEVEL');
  const badType = await one(M, 'qa_tts1');
  assert.equal(badType.status, 200);
  assert.deepEqual([badType.data.payslip.status, badType.data.payslip.errorCode], ['error', 'PAYROLL_BAD_TYPE']);
  for (const slip of [badLevel.data.payslip, badType.data.payslip])
    for (const key of MONEY)
      assert.ok(slip[key] == null, `${slip.username}.${key} phải trống, không phải ${slip[key]}`);
  // đúng như danh sách estimates
  const listed = (await list(M)).data.rows.find(r => r.username === 'qa_ctv1');
  assert.deepEqual([listed.status, listed.errorCode], ['error', 'PAYROLL_BAD_LEVEL']);
  const good = await one(M, 'qa_nv1');
  assert.equal(good.data.payslip.status, 'draft');
  assert.ok(Number.isInteger(good.data.payslip.net) && good.data.payslip.net > 0);
});

test('S2: ghi vào đường dẫn phiếu ước tính (POST, PUT, DELETE) bị từ chối và không ghi gì', async () => {
  const M = monthOf();
  await P.seed(M);
  const snapBefore = await F.snapshot();
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = await F.call(method, `/periods/${M}/estimates/qa_nv1`, { who: 'admin', body: { rev: 1 } });
    assert.ok([403, 404, 405].includes(res.status), `${method}: ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(JSON.stringify(res.data).includes('"net"'), false, `${method}: không lộ số tiền`);
  }
  assert.deepEqual(F.changedTables(snapBefore, await F.snapshot()), []);
});

test('S2: tên viết hoa vẫn ra phiếu của đúng người; dấu gạch chéo cuối chỉ là danh sách; tên thừa đoạn hoặc mã hoá sai không lộ số tiền và không ghi gì', async () => {
  const M = monthOf();
  await P.seed(M);
  const snapBefore = await F.snapshot();
  const lower = await one(M, 'qa_nv1');
  const upper = await one(M, 'QA_NV1');
  assert.equal(upper.status, 200, JSON.stringify(upper.data).slice(0, 200));
  assert.equal(upper.data.payslip.username, 'qa_nv1');
  assert.equal(upper.data.payslip.net, lower.data.payslip.net);
  // dấu gạch chéo cuối bị bỏ khi tách đường dẫn: đây là GET /estimates (danh sách), không phải phiếu một người
  const slash = await F.call('GET', `/periods/${M}/estimates/`, { who: 'admin' });
  assert.equal(slash.status, 200);
  assert.ok(Array.isArray(slash.data.rows) && slash.data.payslip === undefined);
  assert.equal((await F.call('GET', `/periods/${M}/estimates/`, { who: 'qa_nv1' })).status, 403);
  for (const path of [
    `/periods/${M}/estimates/qa_nv1/thua`, // sáu đoạn
    `/periods/${M}/estimates/%E0%A4%A` // mã hoá sai
  ]) {
    const res = await F.call('GET', path, { who: 'admin' });
    assert.ok(res.status >= 400 && res.status < 500, `${path}: ${res.status}`);
    assert.equal(JSON.stringify(res.data).includes('"net"'), false, `${path}: không lộ số tiền`);
  }
  assert.deepEqual(F.changedTables(snapBefore, await F.snapshot()), []);
});
