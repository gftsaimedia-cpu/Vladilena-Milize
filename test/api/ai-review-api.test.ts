// Route soát dữ liệu trước khi chốt lương: GET /api/ai/review?month=YYYY-MM[&impacts=1].
// Chỉ dùng người giả qa_* và DB trong bộ nhớ; đồng hồ giả bằng Date.now.
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'ai-review-api-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base,
  clock = Date.parse('2026-10-20T12:00:00+07:00');
const realNow = Date.now;
const at = (s?) => {
  clock = Date.parse(s + '+07:00');
};
const MONTH = '2026-10';
const NAMES = {
  qa_admin: 'Quản Trị QA Một',
  qa_bon: 'Nguyễn Văn QA Bốn',
  qa_ba: 'Trần Thị QA Ba',
  qa_mo: 'Lê Hoàng QA Mở'
};

async function call(method?, route?, body?, who = 'qa_admin') {
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const review = async (query = 'month=' + MONTH, who?) => await call('GET', '/ai/review?' + query, undefined, who);

async function person(username?, overrides: any = {}) {
  await store.upsertStaff({
    username,
    name: NAMES[username] || username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass'),
    ...overrides
  });
}
// Chụp MỌI bảng của DB (theo sqlite_master), để mọi thứ bị ghi nhầm đều lộ ra
async function snapshot() {
  const tables = await store.db
    .prepare(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name"
    )
    .all();
  return Object.fromEntries(
    await Promise.all(
      tables.map(async t => [t.name, await store.db.prepare(`SELECT * FROM "${t.name}" ORDER BY ctid`).all()])
    )
  );
}
const KEY_TABLES = [
  'timesheets',
  'sheet_approvals',
  'attendance_sessions',
  'punches',
  'settings',
  'kpi_scores',
  'kpi_score_log',
  'slip_overrides'
];
// iSAT chỉ áp dụng vào Thứ Bảy (máy chủ từ chối ngày khác): 5 Thứ Bảy của tháng 10/2026
const ISAT_DAYS = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'];
async function declareIsat(who?, count?) {
  const days = Object.fromEntries(ISAT_DAYS.slice(0, count).map(d => [d, { kind: 'isat' }]));
  const r = await call('PUT', '/sheet', { month: MONTH, days }, who);
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
const isatFindingsOf = (data?, username?) =>
  data.findings.filter(f => f.rule === 'isat-frequency' && f.username === username);

before(async () => {
  Date.now = () => clock;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  await at('2026-10-20T12:00:00');
  for (const table of [
    'kpi_score_log',
    'kpi_scores',
    'slip_overrides',
    'sheet_approvals',
    'corrections',
    'punches',
    'attendance_sessions',
    'attendance_days',
    'timesheets',
    'staff',
    'settings'
  ]) {
    try {
      await store.db.exec('DELETE FROM ' + table);
    } catch (error) {
      if (!/no such table/.test(error.message)) throw error;
    }
  }
  await require('../../src/platform/agents').set(true); // route AI chỉ trả lời khi công tắc Agents bật
  await person('qa_admin', { role: 'admin', type: 'tts', level: 0 });
  await person('qa_bon');
  await person('qa_ba');
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// ================= quyền và đầu vào =================

test('chưa đăng nhập: 401; không có phát hiện nào trong phản hồi', async () => {
  await declareIsat('qa_bon', 4);
  const r = await review(undefined, null);
  assert.equal(r.status, 401);
  assert.equal(r.data.findings, undefined);
});

test('nhân sự: 403 dù có khoản của chính mình; không lộ phát hiện, tên hay ngưỡng', async () => {
  await declareIsat('qa_bon', 4);
  for (const who of ['qa_bon', 'qa_ba']) {
    const r = await review('month=' + MONTH, who);
    assert.equal(r.status, 403, who);
    assert.equal(r.data.findings, undefined);
    assert.equal(r.data.names, undefined);
    assert.equal(r.data.thresholds, undefined);
  }
});

test('tháng thiếu hoặc sai dạng: 400 "month phải dạng YYYY-MM"', async () => {
  for (const query of [
    '',
    'month=',
    'month=2026-1',
    'month=2026-13',
    'month=2026-10-01',
    'month=abc',
    'month=202610'
  ]) {
    const r = await review(query);
    assert.equal(r.status, 400, query);
    assert.match(r.data.error, /month phải dạng YYYY-MM/, query);
  }
});

// ================= chỉ đọc =================

test('không ghi gì: mọi bảng giống hệt trước và sau, kể cả khi có điểm KPI, phiếu sửa, khoản chờ duyệt và lượt mở', async () => {
  await declareIsat('qa_bon', 4);
  await store.setKpiScores(
    'qa_bon',
    MONTH,
    { wework: 9000, user: 8000, peer: 8000, manager: 8000, self: 8000 },
    'qa_admin',
    null
  );
  await store.setSlipOverride('qa_bon', MONTH, { kpiPay: 1234567 }, 'qa_admin');
  const before = await snapshot();
  for (const table of KEY_TABLES) assert.ok(table in before, 'bảng ' + table + ' có trong ảnh chụp');
  assert.ok(before.sheet_approvals.length > 0, 'có khoản chờ duyệt để soát');
  assert.ok(before.kpi_scores.length > 0 && before.slip_overrides.length > 0 && before.kpi_score_log.length > 0);
  for (const query of ['month=' + MONTH, 'month=' + MONTH + '&impacts=1', 'month=2026-09', 'month=2026-11']) {
    const r = await review(query);
    assert.equal(r.status, 200, query + ' ' + JSON.stringify(r.data));
  }
  assert.deepEqual(await snapshot(), before);
});

test('lượt Check-in mở quá 16 giờ KHÔNG bị route này đóng (khác /today và /alerts): lượt vẫn mở, DB nguyên vẹn', async () => {
  await person('qa_mo');
  await at('2026-10-19T08:00:00');
  const punched = await call('POST', '/punch', { type: 'in', requestId: crypto.randomUUID() }, 'qa_mo');
  assert.equal(punched.status, 200, JSON.stringify(punched.data));
  await at('2026-10-20T12:00:00'); // 28 giờ sau: quá 16 giờ
  assert.ok(await store.openSession('qa_mo'), 'có lượt đang mở');
  const before = await snapshot();
  const r = await review('month=' + MONTH + '&impacts=1');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(await store.openSession('qa_mo'), 'route review không được đóng lượt mở');
  assert.equal((await store.openSession('qa_mo')).state, 'open');
  assert.deepEqual(await snapshot(), before);
  assert.equal(before.punches.filter(p => p.type === 'out').length, 0);
});

test('đối chứng: cùng lượt mở quá 16 giờ bị GET /alerts đóng (nên phép kiểm trên không rỗng)', async () => {
  await person('qa_mo');
  await at('2026-10-19T08:00:00');
  assert.equal((await call('POST', '/punch', { type: 'in', requestId: crypto.randomUUID() }, 'qa_mo')).status, 200);
  await at('2026-10-20T12:00:00');
  assert.equal((await call('GET', '/alerts?month=' + MONTH)).status, 200);
  assert.equal(await store.openSession('qa_mo'), null, '/alerts đóng lượt quá hạn');
});

// ================= hình dạng phản hồi 200 =================

test('200 có đủ asOf, month, findings, checked, checklist, summary, thresholds, names; không có impacts khi không xin', async () => {
  await declareIsat('qa_bon', 4);
  const r = await review();
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = r.data;
  assert.equal(typeof d.asOf, 'string');
  assert.equal(d.month, MONTH);
  assert.ok(Array.isArray(d.findings));
  assert.equal(typeof d.checked, 'object');
  assert.ok(Number.isInteger(d.checked.rules) && d.checked.rules > 0);
  assert.ok(Array.isArray(d.checked.ruleIds));
  assert.equal(d.checked.ruleIds.length, d.checked.rules);
  assert.ok(Array.isArray(d.checked.skipped));
  assert.ok(Array.isArray(d.checklist));
  assert.ok(d.checklist.some(c => c.id === 'pending-items'));
  for (const c of d.checklist) {
    assert.equal(typeof c.id, 'string');
    assert.ok(['ok', 'attention', 'info'].includes(c.status), c.id + ' ' + c.status);
  }
  assert.equal(d.summary.total, d.findings.length);
  assert.equal(typeof d.summary.bySeverity, 'object');
  assert.equal(typeof d.summary.byRule, 'object');
  assert.equal(typeof d.thresholds, 'object');
  assert.equal(typeof d.names, 'object');
  assert.ok(!('impacts' in d), 'impacts chỉ có khi impacts=1');
  for (const f of d.findings) {
    for (const key of ['rule', 'severity', 'username', 'month', 'message', 'evidence', 'id', 'digest'])
      assert.ok(key in f, `phát hiện thiếu ${key}`);
    assert.ok(['high', 'medium', 'low'].includes(f.severity));
    assert.ok(f.evidence && f.evidence.inputs && f.evidence.threshold, 'evidence nêu đầu vào và ngưỡng');
  }
});

test('impacts=1: có mảng impacts, mỗi phần tử { username, date, item, impactVnd }; impacts=0 hoặc rỗng thì không có', async () => {
  await declareIsat('qa_bon', 4);
  const withImpacts = await review('month=' + MONTH + '&impacts=1');
  assert.equal(withImpacts.status, 200);
  assert.ok(Array.isArray(withImpacts.data.impacts), 'impacts là mảng');
  for (const x of withImpacts.data.impacts) {
    assert.equal(typeof x.username, 'string');
    assert.match(x.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof x.item, 'string');
    assert.equal(typeof x.impactVnd, 'number');
  }
  for (const query of ['month=' + MONTH, 'month=' + MONTH + '&impacts=0', 'month=' + MONTH + '&impacts=']) {
    assert.ok(!('impacts' in (await review(query)).data), query);
  }
});

test('thresholds: bảng { value, proposal, source } cho từng ngưỡng; isatPerMonth = 4 là đề xuất, kpiFullPct = 100 là đã chốt', async () => {
  const { data } = await review();
  const entries = Object.entries<any>(data.thresholds);
  assert.ok(entries.length >= 10, 'bảng ngưỡng không rỗng');
  for (const [name, entry] of entries) {
    assert.ok('value' in entry, name + ' thiếu value');
    assert.equal(typeof entry.proposal, 'boolean', name + ' proposal');
    assert.equal(typeof entry.source, 'string', name + ' source');
  }
  assert.equal(data.thresholds.isatPerMonth.value, 4);
  assert.equal(data.thresholds.isatPerMonth.proposal, true);
  assert.equal(data.thresholds.kpiFullPct.value, 100);
  assert.equal(data.thresholds.kpiFullPct.proposal, false);
});

test('asOf theo đồng hồ giả (không phải giờ máy), múi giờ ISO; đổi đồng hồ thì asOf đổi', async () => {
  await at('2026-10-20T12:00:00');
  assert.equal((await review()).data.asOf, new Date(clock).toISOString());
  await at('2026-11-04T09:30:15');
  assert.equal((await review()).data.asOf, '2026-11-04T02:30:15.000Z');
});

// ================= luật isat-frequency =================

test('4 iSAT chờ duyệt trong tháng của một NV giả cho phát hiện isat-frequency (lần thứ 4), có luật, đầu vào, ngưỡng', async () => {
  await declareIsat('qa_bon', 4);
  const r = await review();
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const found = isatFindingsOf(r.data, 'qa_bon');
  assert.ok(found.length >= 1, 'phải có isat-frequency cho qa_bon');
  const f = found[0];
  assert.equal(f.month, MONTH);
  assert.equal(f.item, 'isat');
  assert.ok(ISAT_DAYS.includes(f.date));
  assert.equal(f.evidence.inputs.ordinal, 4);
  assert.equal(f.evidence.inputs.count, 4);
  assert.equal(f.evidence.threshold.isatPerMonth, 4);
  assert.equal(f.evidence.threshold.proposal, true, 'ngưỡng này chủ dự án chưa chốt');
  assert.ok(r.data.summary.byRule['isat-frequency'] >= 1);
  assert.ok(r.data.checked.ruleIds.includes('isat-frequency'));
});

test('3 iSAT chờ duyệt thì KHÔNG có isat-frequency (dưới ngưỡng 4); người có 4 iSAT bên cạnh vẫn có', async () => {
  await declareIsat('qa_ba', 3);
  await declareIsat('qa_bon', 4);
  const { data } = await review();
  assert.equal(isatFindingsOf(data, 'qa_ba').length, 0, '3 iSAT không đủ ngưỡng');
  assert.ok(isatFindingsOf(data, 'qa_bon').length >= 1);
});

test('đổi ngưỡng không có tác dụng qua query: ngưỡng chỉ lấy từ bảng THRESHOLDS (isatPerMonth=1 trong query bị bỏ qua)', async () => {
  await declareIsat('qa_ba', 3);
  const { data } = await review('month=' + MONTH + '&isatPerMonth=1');
  assert.equal(isatFindingsOf(data, 'qa_ba').length, 0);
  assert.equal(data.thresholds.isatPerMonth.value, 4);
});

// ================= tên và dữ liệu cá nhân =================

test('names: chỉ gồm các username có trong phát hiện, đúng tên hiển thị; người không có phát hiện và Admin không có', async () => {
  await declareIsat('qa_ba', 3);
  await declareIsat('qa_bon', 4);
  const { data } = await review();
  const inFindings = new Set<any>(data.findings.map(f => f.username));
  assert.ok(inFindings.has('qa_bon'));
  assert.deepEqual(Object.keys(data.names).sort(), [...inFindings].sort());
  assert.equal(data.names.qa_bon, NAMES.qa_bon);
  for (const user of inFindings) assert.equal(typeof data.names[user], 'string', user);
  assert.ok(!('qa_admin' in data.names));
  if (!inFindings.has('qa_ba')) assert.ok(!('qa_ba' in data.names), 'người không có phát hiện không có trong names');
});

test('không có phát hiện nào: names là đối tượng rỗng', async () => {
  const { data } = await review('month=2026-01');
  assert.equal(data.findings.length, 0);
  assert.deepEqual(data.names, {});
});

test('evidence của mọi phát hiện không chứa tên hiển thị (tên chỉ ở "names"); thông điệp cũng không', async () => {
  await declareIsat('qa_bon', 4);
  await declareIsat('qa_ba', 3);
  const { data } = await review('month=' + MONTH + '&impacts=1');
  assert.ok(data.findings.length > 0);
  for (const f of data.findings) {
    const evidence = JSON.stringify(f.evidence);
    const message = String(f.message);
    for (const name of Object.values<any>(NAMES)) {
      assert.ok(!evidence.includes(name), `evidence chứa tên "${name}" ở ${f.rule}`);
      assert.ok(!message.includes(name), `message chứa tên "${name}" ở ${f.rule}`);
    }
    assert.ok(!('name' in f) && !('displayName' in f), 'phát hiện không mang trường tên');
  }
});

// ================= log chỉ có số đếm =================

test('log một dòng "[ai-review]" chỉ có số đếm: không username, không tên, không số tiền', async () => {
  await declareIsat('qa_bon', 4);
  await store.setKpiScores(
    'qa_bon',
    MONTH,
    { wework: 9000, user: 8000, peer: 8000, manager: 8000, self: 8000 },
    'qa_admin',
    null
  );
  const lines: any[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const originals = Object.fromEntries(methods.map(m => [m, console[m]]));
  for (const m of methods) console[m] = (...args) => lines.push(args.map(String).join(' '));
  let r;
  try {
    r = await review('month=' + MONTH + '&impacts=1');
  } finally {
    for (const m of methods) console[m] = originals[m];
  }
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const own = lines.filter(l => l.startsWith('[ai-review]'));
  assert.equal(own.length, 1, 'đúng một dòng [ai-review]: ' + JSON.stringify(lines));
  assert.match(own[0], /^\[ai-review\] month=2026-10 rules=\d+ staff=\d+ days=\d+ findings=\d+ high=\d+ skipped=\d+$/);
  const all = lines.join('\n');
  for (const user of ['qa_bon', 'qa_ba', 'qa_admin']) assert.ok(!all.includes(user), 'log lộ username ' + user);
  for (const name of Object.values<any>(NAMES)) assert.ok(!all.includes(name), 'log lộ tên ' + name);
  assert.ok(!/\d{1,3}(\.\d{3})+/.test(all) && !/₫|VND|đ\b/.test(all), 'log lộ số tiền: ' + all);
  for (const x of r.data.impacts || []) {
    if (Math.abs(x.impactVnd) >= 1000) assert.ok(!all.includes(String(Math.abs(x.impactVnd))), 'log lộ tiền tác động');
  }
  // số đếm trong log khớp phản hồi
  const n = (k?) => Number(new RegExp(k + '=(\\d+)').exec(own[0])[1]);
  assert.equal(n('findings'), r.data.summary.total);
  assert.equal(n('high'), r.data.summary.bySeverity.high || 0);
  assert.equal(n('rules'), r.data.checked.rules);
  assert.equal(n('skipped'), r.data.checked.skipped.length);
});
