'use strict';
// Số tổng hợp cho màn Lương của Admin (src/domain/period/periods.ts): GET /api/periods/:month trả totals, attendanceKept, needsRecalculate;
// danh sách phiếu có tên, số ngày công và các dòng tiền lấy từ bản chụp (tổng các dòng bằng tổng thu nhập trong 0,5 đồng); lọc theo loại nhân sự;
// GET /api/periods/:month/estimates tính cả kỳ TRƯỚC khi có lần tính lương (hàng lỗi cho hồ sơ sai, không bao giờ 0 ₫) và tổng bằng tổng sau khi tính lương.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/domain/payroll/payroll-service');

const { F, store, flow } = P;
const monthOf = P.monthPool();
const NAMES = flow.PEOPLE.map(p => p.username).sort();

before(F.start);
after(F.stop);

const view = async (month?) => (await F.call('GET', `/periods/${month}`)).data;
const list = async (month?, query = '', who = 'admin') =>
  await F.call('GET', `/periods/${month}/payslips?pageSize=200${query}`, { who });
const estimates = async (month?, query = '', who = 'admin') =>
  await F.call('GET', `/periods/${month}/estimates${query ? '?' + query : ''}`, { who });
// options rỗng: test lọc ?type= luôn chạy
const typeFilterWired: Record<string, any> = {};
const estimatesWired = P.pendingUnless(
  'route GET /periods/:month/estimates chưa có',
  P.mentions('src/platform/authz.ts', /periods\/:month\/estimates/)
);
const SUM_KEYS = ['gross', 'insurance', 'tax', 'advance', 'net'];
const dbSlips = async (month?) => Object.values<any>((await flow.payslipsOf(month)).slips);
const sumOf = (rows?, key?) => rows.reduce((t, r) => t + (typeof r[key] === 'number' ? r[key] : 0), 0);

/* ================= view: totals, attendanceKept, needsRecalculate ================= */
test('view.totals là tổng các số đồng nguyên đã lưu trên từng phiếu + số phiếu theo trạng thái; đổi theo từng bước (draft → approved)', async () => {
  const M = monthOf();
  await P.seed(M);
  assert.equal((await view(M)).totals, null, 'chưa tính lương: không có tổng');
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  assert.equal((await view(M)).totals, null);
  P.must(await P.step(M, 'calculate'), 'tính lương');
  let totals = (await view(M)).totals;
  const slips = await dbSlips(M);
  assert.equal(totals.people, 4);
  for (const key of SUM_KEYS) assert.equal(totals[key], sumOf(slips, key), key);
  assert.deepEqual([totals.draft, totals.pending, totals.approved, totals.error], [4, 0, 0, 0]);
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  totals = (await view(M)).totals;
  assert.deepEqual([totals.draft, totals.pending, totals.approved, totals.error], [0, 0, 4, 0]);
  assert.ok(Number.isInteger(totals.gross) && Number.isInteger(totals.net));
});

test('view.totals: phiếu lỗi được đếm là error và cộng 0 vào tiền (không bao giờ thành số tiền giả); các phiếu khác vẫn cộng', async () => {
  const M = monthOf();
  await P.seed(M);
  await store.db.prepare("UPDATE staff SET level = 99 WHERE username = 'qa_ctv1'").run();
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const totals = (await view(M)).totals;
  assert.deepEqual([totals.people, totals.error, totals.draft], [4, 1, 3]);
  const good = (await dbSlips(M)).filter(s => s.status !== 'error');
  assert.equal(good.length, 3);
  for (const key of SUM_KEYS) assert.equal(totals[key], sumOf(good, key), key);
});

test('view.attendanceKept { kept, of }: of là số người có phụ cấp chuyên cần (NV), kept là số người còn giữ, khớp attendOk trong bản chụp', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const kept = (await view(M)).attendanceKept;
  const nv = (await dbSlips(M)).filter(s => s.terms.type === 'nv');
  assert.equal(kept.of, nv.length, 'chỉ NV có phụ cấp chuyên cần');
  assert.equal(kept.kept, nv.filter(s => s.snapshot.attendOk === true).length);
  assert.ok(kept.kept <= kept.of);
  assert.equal((await view(M)).totals.people, 4);
  // kỳ chưa tính lương thì null
  const N = monthOf();
  await P.seed(N);
  assert.equal((await view(N)).attendanceKept, null);
});

test('view.needsRecalculate: false khi chưa tính hoặc đã có lần tính hiện hành; true sau khi mở lại về calculated (lần tính hiện hành bị xoá), hết khi tính lại; totals là null lúc đó', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  assert.equal((await view(M)).needsRecalculate, false);
  P.must(await P.step(M, 'reopen', { to: 'calculated', reason: 'Mở lại để tính lại' }), 'mở lại');
  const reopened = await view(M);
  assert.equal(reopened.status, 'calculated');
  assert.equal(reopened.needsRecalculate, true);
  assert.equal(reopened.run, null);
  assert.equal(reopened.totals, null);
  assert.equal(reopened.attendanceKept, null);
  P.must(await P.step(M, 'calculate'), 'tính lại');
  const again = await view(M);
  assert.equal(again.needsRecalculate, false);
  assert.equal(again.totals.people, 4);
  // kỳ mở và kỳ chưa có dòng: false
  const N = monthOf();
  await P.seed(N);
  assert.equal((await view(N)).needsRecalculate, false);
});

/* ================= danh sách phiếu: tên, ngày công, dòng tiền ================= */
test('Hàng phiếu có tên, loại, bậc, số ngày công và các dòng tiền từ bản chụp; tổng các dòng cộng lại bằng tổng thu nhập trong 0,5 đồng; phụ cấp chuyên cần chỉ ở NV', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated', { withActual: true });
  const res = await list(M);
  assert.equal(res.status, 200);
  assert.equal(res.data.rows.length, 4);
  const db = (await flow.payslipsOf(M)).slips;
  for (const row of res.data.rows) {
    const snap = db[row.username].snapshot;
    assert.equal(row.name, `Người thử ${row.username}`);
    assert.equal(row.workDays, snap.count, `${row.username}: workDays`);
    assert.equal(row.truTreSom, Math.round(snap.cut), `${row.username}: truTreSom là m.cut làm tròn đồng`);
    for (const key of ['tienNgayCong', 'phuCap', 'ot', 'kpi', 'truTreSom', 'khac'])
      assert.equal(typeof row[key], 'number', `${row.username}.${key}`);
    // truTreSom đã nằm trong tienNgayCong nên KHÔNG cộng thêm
    const sum = row.tienNgayCong + row.phuCap + row.ot + row.kpi + row.khac;
    assert.ok(Math.abs(sum - row.gross) <= 0.5, `${row.username}: ${sum} khác tổng thu nhập ${row.gross}`);
    assert.equal(row.attendOk, row.type === 'nv' ? snap.attendOk : null, `${row.username}: attendOk`);
    if (row.type !== 'nv') assert.equal(row.phuCap, 0, `${row.username}: phụ cấp đi lại/chuyên cần chỉ NV`);
  }
  assert.ok(
    res.data.rows.some(r => r.truTreSom > 0),
    'điều kiện của bài: có người bị trừ đi trễ/về sớm (bật giờ thực tế)'
  );
});

test('Phiếu lỗi: hàng có mã và chi tiết lỗi, các dòng tiền là null (không 0), không có workDays', async () => {
  const M = monthOf();
  await P.seed(M);
  await store.db.prepare("UPDATE staff SET level = 99 WHERE username = 'qa_ctv1'").run();
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const row = (await list(M)).data.rows.find(r => r.username === 'qa_ctv1');
  assert.equal(row.status, 'error');
  assert.equal(row.errorCode, 'PAYROLL_BAD_LEVEL');
  assert.match(row.errorDetail, /Bậc lương/);
  for (const key of [
    'workDays',
    'tienNgayCong',
    'phuCap',
    'ot',
    'kpi',
    'truTreSom',
    'khac',
    'attendOk',
    'gross',
    'net'
  ])
    assert.equal(row[key], null, key);
  assert.equal(row.name, 'Người thử qa_ctv1');
});

test(
  'Lọc theo loại nhân sự (?type=nv): chỉ hàng của loại đó, total theo bộ lọc; type lạ hoặc trùng tên thuộc tính Object là 400 BAD_TYPE; kết hợp được với status và q',
  typeFilterWired,
  async () => {
    const M = monthOf();
    await P.setupMonth(M, 'reviewed');
    const nv = await list(M, '&type=nv');
    assert.equal(nv.status, 200, JSON.stringify(nv.data).slice(0, 200));
    assert.deepEqual(nv.data.rows.map(r => r.username).sort(), ['qa_nv1', 'qa_nv2']);
    assert.equal(nv.data.total, 2);
    assert.ok(nv.data.rows.every(r => r.type === 'nv'));
    assert.deepEqual(
      (await list(M, '&type=ctv')).data.rows.map(r => r.username),
      ['qa_ctv1']
    );
    assert.equal((await list(M, '&type=tts')).data.total, 1);
    for (const bad of ['xyz', 'constructor', '__proto__', 'NV']) {
      const res = await list(M, `&type=${bad}`);
      assert.equal(res.status, 400, bad);
      assert.equal(res.data.code, 'BAD_TYPE');
    }
    assert.equal((await list(M, '&type=nv&status=approved')).data.total, 0);
    assert.equal((await list(M, '&type=nv&status=draft')).data.total, 2);
    assert.deepEqual(
      (await list(M, '&type=nv&q=nv2')).data.rows.map(r => r.username),
      ['qa_nv2']
    );
    assert.equal((await list(M, '')).data.total, 4, 'không lọc thì đủ bốn người');
    // totals của view không theo bộ lọc
    assert.equal((await view(M)).totals.people, 4);
  }
);

/* ================= estimates: ước tính cả kỳ trước khi có lần tính lương ================= */
test(
  'GET /periods/:month/estimates: tính mọi nhân sự được trả lương trước khi chốt công; hàng source estimate, status draft, kèm paramsHash, engineVersion, asOf; không ghi gì',
  estimatesWired,
  async () => {
    const M = monthOf();
    await P.seed(M);
    const before = await F.snapshot();
    const res = await estimates(M);
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'không ghi gì');
    assert.equal(res.data.source, 'estimate');
    assert.equal(res.data.run, null);
    assert.equal(res.data.period.status, 'open');
    assert.match(res.data.paramsHash, /^[0-9a-f]{64}$/);
    assert.equal(res.data.engineVersion, require('../../src/engine/payroll-engine').ENGINE_VERSION);
    assert.equal(typeof res.data.asOf, 'string');
    assert.deepEqual(res.data.rows.map(r => r.username).sort(), NAMES);
    for (const row of res.data.rows) {
      assert.equal(row.source, 'estimate');
      assert.equal(row.status, 'draft');
      assert.equal(row.rev, null);
      assert.ok(Number.isInteger(row.gross) && row.gross > 0, `${row.username}: gross ${row.gross}`);
      assert.equal(row.name, `Người thử ${row.username}`);
      assert.ok(Math.abs(row.tienNgayCong + row.phuCap + row.ot + row.kpi + row.khac - row.gross) <= 0.5);
    }
    assert.equal(res.data.total, 4);
  }
);

test(
  'estimates: tổng của cả kỳ bằng tổng sau khi chốt công và tính lương (cùng dữ liệu, cùng tham số), từng người cũng bằng',
  estimatesWired,
  async () => {
    const M = monthOf();
    await P.seed(M);
    const est = (await estimates(M)).data;
    P.must(await P.step(M, 'lock-attendance'), 'chốt công');
    P.must(await P.step(M, 'calculate'), 'tính lương');
    const after = await view(M);
    for (const key of ['people', ...SUM_KEYS]) assert.equal(est.totals[key], after.totals[key], key);
    assert.deepEqual(est.attendanceKept, after.attendanceKept);
    const slips = (await list(M)).data.rows;
    for (const row of est.rows) {
      const same = slips.find(s => s.username === row.username);
      for (const key of [
        'gross',
        'insurance',
        'tax',
        'advance',
        'net',
        'workDays',
        'tienNgayCong',
        'phuCap',
        'ot',
        'kpi',
        'khac'
      ])
        assert.equal(row[key], same[key], `${row.username}.${key}`);
    }
  }
);

test(
  'estimates: hồ sơ sai là hàng error có mã (PAYROLL_BAD_LEVEL), tiền null, không bao giờ 0 ₫; totals đếm error và cộng 0; người khác không ảnh hưởng',
  estimatesWired,
  async () => {
    const M = monthOf();
    await P.seed(M);
    await store.db.prepare("UPDATE staff SET level = 99 WHERE username = 'qa_ctv1'").run();
    await store.db.prepare("UPDATE staff SET type = 'xyz' WHERE username = 'qa_tts1'").run();
    const res = (await estimates(M)).data;
    const bad = res.rows.find(r => r.username === 'qa_ctv1');
    assert.deepEqual([bad.status, bad.errorCode], ['error', 'PAYROLL_BAD_LEVEL']);
    // hàng lỗi của estimates bỏ hẳn trường tiền (undefined), còn danh sách phiếu trả null: đều KHÔNG phải 0 ₫
    assert.ok(bad.gross == null && bad.net == null, `gross ${bad.gross}, net ${bad.net}`);
    const badType = res.rows.find(r => r.username === 'qa_tts1');
    assert.deepEqual([badType.status, badType.errorCode], ['error', 'PAYROLL_BAD_TYPE']);
    assert.deepEqual([res.totals.error, res.totals.draft, res.totals.people], [2, 2, 4]);
    const good = res.rows.filter(r => r.status === 'draft');
    assert.equal(
      res.totals.gross,
      good.reduce((t, r) => t + r.gross, 0)
    );
  }
);

test(
  'estimates: phân trang (pageSize), lọc q theo tài khoản hoặc tên, lọc type; totals luôn của cả kỳ; type sai là 400 BAD_TYPE',
  estimatesWired,
  async () => {
    const M = monthOf();
    await P.seed(M);
    const all = (await estimates(M)).data;
    const page1 = (await estimates(M, 'pageSize=2&page=1')).data;
    const page2 = (await estimates(M, 'pageSize=2&page=2')).data;
    assert.deepEqual([page1.total, page1.pageSize, page1.rows.length, page2.rows.length], [4, 2, 2, 2]);
    assert.deepEqual(
      [...page1.rows, ...page2.rows].map(r => r.username),
      all.rows.map(r => r.username)
    );
    assert.deepEqual(page1.totals, all.totals);
    const q = (await estimates(M, 'q=NV1')).data;
    assert.deepEqual(
      q.rows.map(r => r.username),
      ['qa_nv1'],
      'không phân biệt hoa thường'
    );
    assert.deepEqual(q.totals, all.totals, 'totals không theo q');
    assert.deepEqual(
      (await estimates(M, 'q=' + encodeURIComponent('Người thử qa_tts1'))).data.rows.map(r => r.username),
      ['qa_tts1']
    );
    const nv = (await estimates(M, 'type=nv')).data;
    assert.deepEqual(nv.rows.map(r => r.username).sort(), ['qa_nv1', 'qa_nv2']);
    assert.deepEqual(nv.totals, all.totals, 'totals không theo type');
    for (const bad of ['xyz', 'constructor']) {
      const res = await estimates(M, 'type=' + bad);
      assert.equal(res.status, 400, bad);
      assert.equal(res.data.code, 'BAD_TYPE');
    }
    assert.equal((await estimates('2026-13')).status, 400);
  }
);

test(
  'estimates: quyền như xem lương (Admin, C&B, Kế toán được; nhân sự thường 403; ẩn danh 401)',
  estimatesWired,
  async () => {
    const M = monthOf();
    await P.seed(M);
    await P.grant('qa_nv1', 'cb');
    await P.grant('qa_ctv1', 'accounting');
    await P.grant('qa_nv2', 'hr');
    for (const who of ['admin', 'qa_nv1', 'qa_ctv1']) assert.equal((await estimates(M, '', who)).status, 200, who);
    for (const who of ['qa_nv2', 'qa_tts1']) {
      const res = await estimates(M, '', who);
      assert.equal(res.status, 403, who);
      assert.equal(res.data.code, 'FORBIDDEN_CAP');
    }
    assert.equal((await estimates(M, '', null)).status, 401);
  }
);
