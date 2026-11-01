'use strict';
// Số ước tính của chính nhân sự (src/domain/period/periods.ts → estimate, route GET /api/me/estimate):
//   - CHỈ dữ liệu của người đăng nhập (tham số user bị bỏ qua); chưa đăng nhập là 401; người không được trả lương nhận payrollSubject:false;
//   - mặc định không có từng dòng ngày, chỉ khi rows=1; tháng hiện tại tính tới hôm nay (đồng hồ giả);
//   - slip.staffVisibleFrom: mặc định afterPaid: kỳ đã chi trả thì nhân sự thấy BẢN CHỤP chính thức (official: true), chưa chi trả là số ước tính;
//     đặt estimateOnly thì luôn số ước tính; afterApproval chuyển sang bản chụp ngay khi kỳ được duyệt;
//   - allowanceStatus: NV có chuyên cần, CTV và TTS thì không, ngưỡng lấy đúng từ tham số của tháng;
//   - số ước tính bằng đúng kết quả bộ máy trên cùng đầu vào, từng đồng.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool). Các test đổi tham số (param_versions, chỉ-thêm-dòng, hiệu lực từ
// tháng của nó trở đi) đặt CUỐI FILE theo thứ tự tháng tăng dần.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const service = require('../../src/domain/payroll/payroll-service');

const { F, store, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const estimate = async (month?, who = 'qa_nv1', query = '') =>
  await F.call('GET', `/me/estimate?month=${month}${query}`, { who });
const setParam = async (key?, month?, valueJson?) =>
  await store.db
    .prepare(
      'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(key, month, valueJson, 'Thử tham số cho test ước tính', 'admin', new Date(Date.now()).toISOString());
// Chạy fn với params_mode = active, trả về chế độ cũ
async function withActiveParams(fn?) {
  await store.setSetting('params_mode', 'active');
  try {
    return await fn();
  } finally {
    await store.setSetting('params_mode', 'defaults-only');
  }
}
// Kết quả của bộ máy lương chung (cũng là bộ máy tính phiếu) trên đầu vào đọc thẳng từ DB, không qua đường nạp của route; upTo null là cả tháng
const engineFull = async (username?, month?, upTo: any = null) => {
  const input = await flow.legacyInput(username, month);
  input.upTo = upTo;
  return service.engineFor((await service.paramsFor(month)).params).computeMonth(input).m;
};
// Phản hồi qua JSON (-0 thành 0, bỏ undefined) để so với kết quả bộ máy
const viaJson = (value?) => JSON.parse(JSON.stringify(value));

/* ================= chỉ dữ liệu của mình ================= */
test('Chưa đăng nhập là 401; tháng sai dạng là 400 BAD_MONTH; không có tháng thì lấy tháng hiện tại theo đồng hồ giả', async () => {
  const M = monthOf();
  await P.seed(M); // đồng hồ giả: ngày 02 tháng sau
  assert.equal((await estimate(M, null)).status, 401);
  for (const bad of ['2026-13', '2026-1', 'abc']) {
    const res = await estimate(bad, 'qa_nv1');
    assert.equal(res.status, 400, bad);
    assert.equal(res.data.code, 'BAD_MONTH');
  }
  const current = await F.call('GET', '/me/estimate', { who: 'qa_nv1' });
  assert.equal(current.status, 200);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
  assert.equal(current.data.month, today);
});

test('Chỉ dữ liệu của người đăng nhập: user/username/who trong query bị bỏ qua, phản hồi không chứa tên hay số của người khác', async () => {
  const M = monthOf();
  await P.seed(M);
  const own = (await estimate(M, 'qa_nv1')).data;
  const plain = JSON.stringify(own);
  for (const probe of ['user=qa_nv2', 'username=qa_nv2', 'who=qa_nv2', 'user=qa_nv2&username=qa_nv2']) {
    const res = await estimate(M, 'qa_nv1', `&${probe}`);
    assert.equal(res.status, 200, probe);
    assert.equal(JSON.stringify(res.data), plain, `${probe}: phải là dữ liệu của qa_nv1`);
  }
  const other = (await estimate(M, 'qa_nv2')).data;
  assert.notEqual(other.m.total, own.m.total, 'điều kiện của bài: hai người có số khác nhau');
  for (const name of ['qa_nv2', 'qa_ctv1', 'qa_tts1', 'Người thử qa_nv2'])
    assert.equal(plain.includes(name), false, `phản hồi của qa_nv1 không được nhắc ${name}`);
  assert.equal(plain.includes(String(other.m.total)), false);
});

test('Người không được trả lương (Admin) nhận payrollSubject:false, estimate:null và không có số tiền nào', async () => {
  const M = monthOf();
  await P.seed(M);
  const res = await estimate(M, 'admin');
  assert.equal(res.status, 200);
  assert.equal(res.data.payrollSubject, false);
  assert.equal(res.data.estimate, null);
  assert.equal(res.data.m, undefined);
  assert.equal(res.data.net, undefined);
  assert.equal(res.data.month, M);
});

test('Nhân sự chưa bắt đầu làm trong tháng nhận estimate:null, reason NOT_STARTED', async () => {
  const M = monthOf();
  await P.seed(M);
  await F.person('qa_late', 'staff', { type: 'nv', level: 1, startDate: '2999-01-01' });
  const res = await estimate(M, 'qa_late');
  assert.equal(res.status, 200);
  assert.equal(res.data.estimate, null);
  assert.equal(res.data.reason, 'NOT_STARTED');
});

/* ================= dòng ngày ================= */
test('Không có từng dòng ngày (m.rows) trừ khi rows=1', async () => {
  const M = monthOf();
  await P.seed(M);
  for (const query of ['', '&rows=0', '&rows=true', '&rows=']) {
    const res = (await estimate(M, 'qa_nv1', query)).data;
    assert.equal(Object.hasOwn(res.m, 'rows'), false, `query "${query}"`);
  }
  const withRows = (await estimate(M, 'qa_nv1', '&rows=1')).data;
  assert.ok(Array.isArray(withRows.m.rows) && withRows.m.rows.length > 0);
  const plain = (await estimate(M, 'qa_nv1')).data;
  assert.equal(withRows.m.total, plain.m.total, 'rows=1 chỉ thêm dòng, không đổi số');
});

/* ================= đúng bằng bộ máy ================= */
test('Số ước tính của cả bốn người (TTS, CTV, hai NV) bằng đúng kết quả bộ máy chung trên cùng đầu vào: tổng, các phụ cấp, KPI, bảng khấu trừ từng đồng', async () => {
  const M = monthOf();
  await P.seed(M);
  for (const { username } of flow.PEOPLE) {
    const body = (await estimate(M, username)).data;
    const want = await engineFull(username, M);
    assert.equal(body.estimate, true, username);
    assert.equal(body.source, 'estimate');
    assert.equal(body.official, false);
    assert.match(body.label, /ước tính/i);
    for (const key of ['total', 'work', 'travel', 'attendance', 'kpiPay', 'count', 'overHours'])
      assert.equal(body.m[key], want[key], `${username}.${key}`);
    assert.deepEqual(body.net, viaJson(want.net), `${username}: bảng khấu trừ và thực lĩnh`);
    assert.equal(body.net.gross, body.m.total, `${username}: tổng thu nhập của bảng khấu trừ`);
    assert.equal(
      body.net.net,
      body.net.gross - body.net.insurance - body.net.tax - body.net.advance,
      `${username}: thực lĩnh = tổng thu nhập − bảo hiểm − thuế − tạm ứng`
    );
    assert.equal(body.toDate, null, `${username}: tháng đã qua không có khối tới-hôm-nay`);
    assert.match(body.paramsHash, /^[0-9a-f]{64}$/);
    assert.equal(body.engineVersion, require('../../src/engine/payroll-engine').ENGINE_VERSION);
  }
});

test('Một ca cụ thể: NV level 1, 20 ngày chấm đủ ca, không KPI: tổng thu nhập 5.307.693 ₫ (chuyên cần mất vì 6 ngày công chuẩn vắng), bảo hiểm 630.000 ₫, thuế 0', async () => {
  const M = monthOf();
  await P.seed(M);
  await store.setSetting('holidays', []); // ngày lễ có lương làm số ngày trả lệch khỏi số ngày làm
  await F.person('qa_exact', 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
  const PunchRules = require('../../src/engine/punch');
  const holidays = await store.getSetting('holidays', []);
  const [tin, tout] = PunchRules.SHIFT.n1;
  const workDates = Array.from({ length: 31 }, (_, i) => `${M}-${String(i + 1).padStart(2, '0')}`).filter(d => {
    const day = new Date(d + 'T00:00:00Z'); // ngày không có trong tháng (31 của tháng 30 ngày) bị loại
    return day.toISOString().slice(0, 10) === d && day.getUTCDay() !== 0 && !holidays.includes(d);
  });
  const dates = workDates.slice(0, 20);
  const days = Object.fromEntries(dates.map(d => [d, { kind: 'work', in: tin, out: tout, preset: 'n1' }]));
  const saved = await F.call('PUT', '/sheet', { who: 'qa_exact', body: { month: M, days } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  // mỗi ngày khai có một lượt Check-in/out đúng giờ ca (ngày công là ngày có Check-in/out)
  for (const date of dates) {
    const plan = PunchRules.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, date);
    const entry = PunchRules.buildDay({ shiftCode: 'n1' }, plan.startIso, plan.endIso, 'punch', {
      plannedShift: plan,
      approveIncomplete: true
    }).entry;
    await store.createSession('qa_exact', plan.date, 'closed', entry);
  }
  const body = (await estimate(M, 'qa_exact', '&rows=0')).data;
  // lương cơ bản 6.000.000 ₫; ngày công chuẩn NV 26; đi lại 15 %, chuyên cần 25 % (TYPES.nv); mỗi dòng tiền làm tròn đồng một lần
  assert.equal(body.m.count, 20);
  assert.equal(body.m.work, 4615385, '6.000.000 × 20 ÷ 26 = 4.615.384,62');
  assert.equal(body.m.travel, 692308, '6.000.000 × 15 % × 20 ÷ 26 = 692.307,69');
  assert.equal(body.m.attendance, 0, '6 ngày công chuẩn không đi làm = 48 giờ vượt ngưỡng 24 giờ nên mất chuyên cần');
  assert.equal(body.net.gross, 5307693, '4.615.385 + 692.308');
  assert.equal(body.net.insurance, 630000);
  assert.equal(body.net.tax, 0);
  assert.equal(body.net.net, body.net.gross - body.net.insurance - body.net.tax - body.net.advance);
  assert.equal(body.m.paidDays, 20, 'chỉ 20 ngày chấm công là ngày có lương');
  assert.equal(body.net.noPayDays, 6, 'ngày công chuẩn 26 trừ 20 ngày có lương');
  assert.deepEqual(body.net, viaJson((await engineFull('qa_exact', M)).net), 'bằng bộ máy chung trên cùng đầu vào');
});

/* ================= tháng hiện tại tính tới hôm nay ================= */
test('Tháng hiện tại (đồng hồ giả): m, net và trace tính cả tháng trên những gì đã ghi nhận tới hôm nay (ngày chưa tới chờ, không tính vắng); khối toDate là phần tới hôm nay (bằng bộ máy với upTo = hôm nay, không kèm net); tháng đã qua không có toDate', async () => {
  const M = monthOf();
  await P.seed(M);
  const full = (await estimate(M, 'qa_nv1')).data; // đồng hồ ở ngày 02 tháng sau: tháng đã qua
  assert.equal(full.toDate, null);
  assert.equal(full.m.total, (await engineFull('qa_nv1', M)).total);

  const middle = `${M}-15`;
  await F.at(`${middle}T10:00:00`);
  const body = (await estimate(M, 'qa_nv1', '&rows=1')).data;
  // Ngày công là ngày có Check-in/out: các lượt sau hôm nay chưa tồn tại nên ngày chưa tới chờ (không tính vắng, không trả tiền); phép đã khai vẫn có lương
  assert.ok(body.m.count < full.m.count, `giữa tháng: ${body.m.count} ngày công < cả tháng ${full.m.count}`);
  assert.ok(body.m.total < full.m.total);
  assert.equal(body.m.noshow, 0, 'ngày chưa tới không phải ngày vắng');
  assert.ok(body.m.pending > 0, 'ngày chưa tới chờ');
  assert.equal(body.m.total, (await engineFull('qa_nv1', M)).total, 'm bằng bộ máy chung trên cùng đồng hồ');
  assert.deepEqual(
    body.net,
    viaJson((await engineFull('qa_nv1', M)).net),
    'bảo hiểm, thuế, thực lĩnh tính trên cả tháng'
  );
  // tiền ngày của m bằng tổng tiền từng dòng ngày (cả ngày phép đã khai ở nửa sau tháng)
  assert.equal(
    body.m.rows.reduce((sum, row) => sum + row.pay, 0),
    body.m.work,
    'tiền ngày = tổng các dòng ngày'
  );
  assert.equal(body.upTo, null);
  assert.ok(body.toDate, 'tháng hiện tại có khối tới-hôm-nay');
  assert.equal(body.toDate.upTo, middle);
  assert.equal(body.toDate.count, body.m.count, 'cùng các ngày đã chấm công');
  const want = await engineFull('qa_nv1', M, middle);
  assert.equal(body.toDate.total, want.total);
  assert.equal(body.toDate.count, want.count);
  assert.equal(body.toDate.gross, want.net.gross);
  assert.equal(Object.hasOwn(body.toDate, 'net'), false, 'phần tới hôm nay không kèm bảng khấu trừ');
  assert.ok(Array.isArray(body.toDate.rows), 'rows=1 thêm dòng ngày cho phần tới hôm nay');
  assert.equal(Object.hasOwn((await estimate(M, 'qa_nv1')).data.toDate, 'rows'), false);

  // đầu tháng: ít ngày đã chấm công hơn
  await F.at(`${M}-02T09:00:00`);
  const early = (await estimate(M, 'qa_nv1')).data;
  assert.ok(early.toDate.count <= body.toDate.count);
  assert.ok(early.m.count <= body.m.count);
});

/* ================= tình trạng phụ cấp chuyên cần ================= */
test('allowanceStatus: NV có chuyên cần với ngưỡng bằng đúng tham số; CTV và TTS thì hasAttendance:false', async () => {
  const M = monthOf();
  await P.seed(M);
  const nv = (await estimate(M, 'qa_nv1')).data;
  const want = await engineFull('qa_nv1', M);
  assert.deepEqual(nv.allowanceStatus, {
    hasAttendance: true,
    absentDays: want.absent,
    maxAbsent: DEFAULTS['type.nv.maxAbsent'],
    absentCompare: DEFAULTS['attendance.absentCompare'],
    overLimitHours: want.overHours,
    overLimitThreshold: DEFAULTS['attendance.overLimitHours'],
    overLimitCompare: DEFAULTS['attendance.overLimitCompare'],
    kept: want.attendOk,
    // còn bao nhiêu thì mất, theo phép so sánh gte của tham số (chạm ngưỡng là mất)
    daysUntilLoss: Math.max(0, DEFAULTS['type.nv.maxAbsent'] - want.absent),
    hoursUntilLoss: Math.max(0, DEFAULTS['attendance.overLimitHours'] - want.overHours),
    hoursLossStrict: false
  });
  assert.equal(DEFAULTS['attendance.absentCompare'], 'gte');
  assert.equal(DEFAULTS['attendance.overLimitCompare'], 'gte');
  assert.equal(DEFAULTS['type.nv.maxAbsent'], 3, 'điều kiện của bài: mặc định hôm nay là 3 ngày');
  assert.equal(DEFAULTS['attendance.overLimitHours'], 24);
  for (const username of ['qa_ctv1', 'qa_tts1']) {
    const body = (await estimate(M, username)).data;
    assert.deepEqual(body.allowanceStatus, { hasAttendance: false }, username);
  }
});

/* ================= slip.staffVisibleFrom (đặt cuối: các dòng tham số) ================= */
test('Mặc định afterPaid: kỳ đã chi trả nhân sự thấy bản chụp chính thức (source snapshot, official true, estimate false, số bằng phiếu); chưa chi trả vẫn là số ước tính', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'approved');
  assert.equal(DEFAULTS['slip.staffVisibleFrom'], 'afterPaid', 'điều kiện của bài: mặc định là afterPaid');
  const before = (await estimate(M, 'qa_nv1')).data;
  assert.equal(before.source, 'estimate', 'đã duyệt kỳ nhưng chưa chi trả');
  assert.equal(before.official, false);
  P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  const body = (await estimate(M, 'qa_nv1')).data;
  assert.equal(body.source, 'snapshot');
  assert.equal(body.official, true);
  assert.equal(body.estimate, false);
  assert.equal(body.period.status, 'paid');
  assert.equal(body.net.net, (await flow.payslipsOf(M)).slips.qa_nv1.net, 'số bằng phiếu đã chốt');
});

test('Đặt estimateOnly rõ ràng (từ tháng T): kỳ đã chi trả vẫn trả số ước tính (source estimate, official false)', async () => {
  const T = monthOf();
  await P.setupMonth(T, 'paid');
  await setParam('slip.staffVisibleFrom', T, '"estimateOnly"');
  await withActiveParams(async () => {
    const body = (await estimate(T, 'qa_nv1')).data;
    assert.equal(body.source, 'estimate');
    assert.equal(body.official, false);
    assert.equal(body.estimate, true);
    assert.equal(body.period.status, 'paid');
  });
});

test('slip.staffVisibleFrom = afterPaid (từ tháng X): chưa chi trả là số ước tính; chi trả rồi là BẢN CHỤP chính thức (official true, estimate false, số bằng phiếu)', async () => {
  const X = monthOf();
  await P.setupMonth(X, 'approved');
  await setParam('slip.staffVisibleFrom', X, '"afterPaid"');
  await withActiveParams(async () => {
    const before = (await estimate(X, 'qa_nv1')).data;
    assert.equal(before.source, 'estimate', 'đã duyệt nhưng chưa chi trả');
    assert.equal(before.official, false);
    P.must(await P.step(X, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
    const paid = (await estimate(X, 'qa_nv1')).data;
    assert.equal(paid.source, 'snapshot');
    assert.equal(paid.official, true);
    assert.equal(paid.estimate, false);
    assert.equal(paid.label, 'Phiếu lương chính thức');
    const stored = await flow.payslipsOf(X);
    assert.equal(paid.paramsHash, stored.run.params_hash, 'băm tham số của lần chạy đã chốt');
    assert.equal(paid.engineVersion, stored.run.engine_version);
    assert.equal(paid.net.net, stored.slips.qa_nv1.net);
    assert.equal(paid.net.gross, stored.slips.qa_nv1.gross);
    assert.equal(paid.m.total, stored.slips.qa_nv1.snapshot.total);
    assert.equal(Object.hasOwn(paid.m, 'rows'), false, 'không có dòng ngày nếu không xin');
    assert.ok(Array.isArray((await estimate(X, 'qa_nv1', '&rows=1')).data.m.rows));
    assert.equal(paid.pendingItems, null);
    assert.ok(paid.allowanceStatus.hasAttendance);
    // người khác không thấy phiếu của mình qua route này
    const ctv = (await estimate(X, 'qa_ctv1')).data;
    assert.equal(ctv.net.net, stored.slips.qa_ctv1.net);
  });
});

test('slip.staffVisibleFrom = afterApproval (từ tháng Y): reviewed vẫn ước tính, approved là bản chụp chính thức', async () => {
  const Y = monthOf();
  await P.setupMonth(Y, 'reviewed');
  await setParam('slip.staffVisibleFrom', Y, '"afterApproval"');
  await withActiveParams(async () => {
    assert.equal((await estimate(Y, 'qa_nv1')).data.source, 'estimate');
    P.must(await P.approveAllPending(Y), 'duyệt phiếu');
    assert.equal((await estimate(Y, 'qa_nv1')).data.source, 'estimate', 'phiếu duyệt rồi nhưng kỳ chưa approved');
    P.must(await P.step(Y, 'approve'), 'duyệt kỳ');
    const body = (await estimate(Y, 'qa_nv1')).data;
    assert.equal(body.source, 'snapshot');
    assert.equal(body.official, true);
    assert.equal(body.net.net, (await flow.payslipsOf(Y)).slips.qa_nv1.net);
  });
});

test('Bản chụp chính thức theo SỐ CHI TRẢ (16/10/2026): số Admin đã sửa và duyệt là số nhân sự thấy, kèm overridden:true; số tự tính và giá trị ô sửa không lọt ra; phiếu không sửa không có overridden', async () => {
  const Z = monthOf();
  await P.setupMonth(Z, 'reviewed');
  await setParam('slip.staffVisibleFrom', Z, '"afterApproval"');
  await withActiveParams(async () => {
    P.must(
      await F.call('PUT', '/slip-override', {
        body: { user: 'qa_nv1', month: Z, values: { otPay: 4242424 }, reason: P.text(10) }
      }),
      'sửa phiếu'
    );
    P.must(await P.approveAllPending(Z), 'duyệt phiếu');
    P.must(await P.step(Z, 'approve'), 'duyệt kỳ');
    const body = (await estimate(Z, 'qa_nv1')).data;
    const stored = (await flow.payslipsOf(Z)).slips;
    const slip = (await P.slipRows(Z)).find(r => r.username === 'qa_nv1');
    assert.equal(body.source, 'snapshot');
    assert.equal(body.overridden, true);
    assert.equal(JSON.stringify(body).includes('4242424'), false, 'giá trị ô Admin gõ không lọt ra');
    assert.equal(body.net.net, slip.net, 'nhân sự thấy đúng số chi trả của phiếu');
    assert.ok(body.net.net > stored.qa_nv1.net, 'số chi trả cao hơn số tự tính vì ô OT được sửa lên');
    assert.equal(body.net.gross, slip.gross);
    assert.equal(slip.computed.net, stored.qa_nv1.net, 'số tự tính vẫn nguyên trong bản chụp');
    for (const hidden of ['computed']) assert.equal(Object.hasOwn(body, hidden), false, hidden);
    // người không bị sửa: số chi trả bằng số tự tính, không có cờ overridden
    const other = (await estimate(Z, 'qa_ctv1')).data;
    assert.equal(other.source, 'snapshot');
    assert.equal(Object.hasOwn(other, 'overridden'), false);
    assert.equal(other.net.net, stored.qa_ctv1.net);
  });
});

test('allowanceStatus lấy ngưỡng từ THAM SỐ của tháng: type.nv.maxAbsent = 2 từ tháng W thì maxAbsent là 2, tháng trước vẫn 3', async () => {
  const V = monthOf();
  const W = monthOf();
  await P.seed(W);
  await setParam('type.nv.maxAbsent', W, '2');
  await withActiveParams(async () => {
    assert.equal((await estimate(V, 'qa_nv1')).data.allowanceStatus.maxAbsent, 3, 'trước hiệu lực');
    const body = (await estimate(W, 'qa_nv1')).data;
    assert.equal(body.allowanceStatus.maxAbsent, 2);
    assert.equal(body.allowanceStatus.hasAttendance, true);
  });
  // chế độ defaults-only bỏ qua dòng tham số
  assert.equal((await estimate(W, 'qa_nv1')).data.allowanceStatus.maxAbsent, 3);
});

test('Tháng chưa tới (tương lai) tính cả tháng, không cắt theo hôm nay', async () => {
  const M = monthOf();
  await P.seed(M);
  await F.at('2026-10-05T09:00:00'); // trước tháng M
  const body = (await estimate(M, 'qa_nv1')).data;
  // Chưa có Check-in nào nên chưa có ngày công; 3 ngày phép và 1 ngày lễ đã khai vẫn có lương ở cả tháng: 4 × 6.000.000 ÷ 26 = 923.076,92
  // (tháng có quyết toán phép dư thì cộng thêm m.settlePay)
  assert.equal(body.m.count, 0);
  assert.equal(body.m.total - (body.m.settlePay || 0), 923077);
  assert.equal(body.m.leave, 3);
  assert.equal(body.m.holiday, 1);
  assert.equal(body.toDate, null);
});
