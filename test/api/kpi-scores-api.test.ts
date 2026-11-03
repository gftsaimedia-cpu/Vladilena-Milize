// KPI 5 thành phần: các route điểm do Admin nhập.
// KHÔNG có công tắc kpi_five_from: KPI luôn tính theo 5 thành phần ở mọi tháng;
// PUT /api/settings/kpi-five không tồn tại (trả lời như mọi route lạ), không có lỗi KPI_FIVE_NOT_ON và KPI_FIVE_FROM_PAST; /me, /sheet, /team không có trường kpiFrom.
// Hợp đồng được kiểm:
//   - GET /api/kpi/scores?month=, PUT /api/kpi/scores.
//   - bảng kpi_scores (username, month, wework, user_score, peer, manager, self_score, ...) và kpi_score_log
//     (username, month, field, old_value, new_value, by, at, reason).
//   - item của GET/PUT: { username, scores:{wework,user,peer,manager,self}, complete, total, weworkOk, pass, amtApproved, updatedBy }.
//   - GET /sheet: kpiParts = { complete:false } khi chưa đủ 5 điểm; khi đủ thì { complete:true, wework, user, peer, manager, self }
//     (test chấp nhận cả dạng lồng { complete:true, scores:{...} }).
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'kpi-scores-api-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base,
  clock = Date.parse('2026-10-15T12:00:00+07:00');
const realNow = Date.now;
const MONTH = '2026-10'; // tháng chuyển đổi trong các test (tháng hiện tại của đồng hồ giả)
const OLD_MONTH = '2026-09';
const KEYS = ['wework', 'user', 'peer', 'manager', 'self'];

async function call(method?, route?, body?, who = 'admin', raw?) {
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const putScores = (body?, who?, raw?) => call('PUT', '/kpi/scores', body, who, raw);
const getScores = (month?, who?) => call('GET', '/kpi/scores?month=' + month, undefined, who);
const warned = (res?, code?) => (res.data.warnings || []).some(w => w.code === code);
const all = (parts: any = {}) => ({ wework: 100, user: 90, peer: 80, manager: 85, self: 100, ...parts }); // tổng 92,2%

async function person(username?, overrides: any = {}) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass'),
    ...overrides
  });
}
// Chụp trạng thái các bảng liên quan; bảng chưa có thì coi là rỗng (test vẫn thất bại ở phép kiểm mã trạng thái trước)
async function snapshot() {
  const out: Record<string, any> = {};
  for (const table of ['kpi_scores', 'kpi_score_log', 'timesheets', 'settings']) {
    try {
      out[table] = await store.db.prepare('SELECT * FROM ' + table + ' ORDER BY ctid').all();
    } catch (error) {
      if (!/no such table/.test(error.message)) throw error;
      out[table] = [];
    }
  }
  return out;
}
const rows = (sql, ...args) => {
  try {
    return store.db.prepare(sql).all(...args);
  } catch (error) {
    if (/no such table/.test(error.message)) return [];
    throw error;
  }
};
const logOf = (u?, m = MONTH) => rows('SELECT * FROM kpi_score_log WHERE username = ? AND month = ? ORDER BY id', u, m);
const scoreRows = () => rows('SELECT * FROM kpi_scores');
const scoresOf = (kpiParts?) => kpiParts.scores || kpiParts;

before(async () => {
  Date.now = () => clock;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  clock = Date.parse('2026-10-15T12:00:00+07:00');
  for (const table of [
    'kpi_score_log',
    'kpi_scores',
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
  await person('admin', { role: 'admin', type: 'tts', level: 0 });
  await person('an');
  await person('binh');
  await person('cong', { type: 'ctv', level: 1 });
  await person('thuctap', { type: 'tts', level: 1 });
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

// ================= quyền =================

test('chưa đăng nhập: PUT và GET /api/kpi/scores đều 401, không ghi gì', async () => {
  const before = await snapshot();
  assert.equal((await putScores({ user: 'an', month: MONTH, scores: all() }, null)).status, 401);
  assert.equal((await getScores(MONTH, null)).status, 401);
  assert.deepEqual(await snapshot(), before);
});

test('nhân sự (không phải Admin): PUT và GET /api/kpi/scores đều 403, không ghi gì, kể cả điểm của chính mình', async () => {
  const before = await snapshot();
  for (const who of ['an', 'binh']) {
    assert.equal((await putScores({ user: 'an', month: MONTH, scores: all() }, who)).status, 403, who);
    assert.equal((await getScores(MONTH, who)).status, 403, who);
  }
  assert.deepEqual(await snapshot(), before);
  assert.equal((await scoreRows()).length, 0);
  assert.equal((await logOf('an')).length, 0);
});

test('PUT /api/settings/kpi-five đã xoá (23/10/2026): trả lời y như mọi route lạ — chưa đăng nhập 401, còn lại 403 mặc định từ chối (cả Admin), không đổi gì', async () => {
  const before = await snapshot();
  for (const who of [null, 'an', 'admin']) {
    for (const body of [{ from: '2026-11' }, { from: null }, {}]) {
      const gone = await call('PUT', '/settings/kpi-five', body, who);
      const unknown = await call('PUT', '/settings/khong-co-route-nay', body, who);
      assert.equal(gone.status, unknown.status, String(who));
      assert.deepEqual(gone.data, unknown.data, String(who));
    }
  }
  assert.equal((await call('PUT', '/settings/kpi-five', { from: '2026-11' }, null)).status, 401);
  const admin = await call('PUT', '/settings/kpi-five', { from: '2026-11' }, 'admin');
  assert.equal(admin.status, 403, JSON.stringify(admin.data));
  assert.equal(admin.data.code, 'NO_ROUTE_POLICY');
  assert.deepEqual(await snapshot(), before, 'không ghi gì');
  assert.equal((await store.db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'kpi_five_from'").get()).n, 0);
});

test('GET /api/team của nhân sự là 403: điểm KPI của người khác không lộ qua /team', async () => {
  await putScores({ user: 'binh', month: MONTH, scores: all() });
  const r = await call('GET', '/team?month=' + MONTH, undefined, 'an');
  assert.equal(r.status, 403);
  assert.ok(!JSON.stringify(r.data).includes('kpiParts'));
});

// ================= KPI luôn theo 5 thành phần, tháng nào cũng vậy =================

test('KPI 5 thành phần ở mọi tháng: /me, /sheet, /team không còn trường kpiFrom; dòng kpi_five_from cũ trong DB không được đọc', async () => {
  assert.equal('kpiFrom' in (await call('GET', '/me', undefined, 'an')).data, false);
  assert.equal('kpiFrom' in (await call('GET', '/sheet?month=' + MONTH, undefined, 'an')).data, false);
  assert.equal('kpiFrom' in (await call('GET', '/team?month=' + MONTH, undefined, 'admin')).data, false);
  await store.setSetting('kpi_five_from', { from: '2026-12', setBy: 'cu', setAt: '2026-10-01T00:00:00.000Z' });
  assert.equal((await getScores(MONTH)).data.method, 'five');
});

// ================= PUT /api/kpi/scores: ghi hợp lệ =================

test('Admin ghi đủ 5 điểm: 200 { ok, item }, GET trả complete true, kpi_scores 1 dòng, kpi_score_log 5 dòng (cũ null, mới, người sửa)', async () => {
  const r = await putScores({ user: 'an', month: MONTH, scores: all(), reason: 'Chốt điểm tháng 10' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ok, true);
  assert.equal(r.data.item.username, 'an');
  assert.deepEqual(r.data.item.scores, all());
  assert.equal(r.data.item.complete, true);
  assert.equal(r.data.item.total, 92.2);
  assert.equal(r.data.item.weworkOk, true);
  assert.equal(r.data.item.pass, true);
  assert.equal(r.data.item.updatedBy, 'admin');

  const list = await getScores(MONTH);
  assert.equal(list.status, 200);
  const item = list.data.items.find(i => i.username === 'an');
  assert.deepEqual(item.scores, all());
  assert.equal(item.complete, true);

  assert.equal((await scoreRows()).length, 1);
  const log = await logOf('an');
  assert.equal(log.length, 5);
  assert.deepEqual(log.map(l => l.field).sort(), [...KEYS].sort());
  for (const l of log) {
    assert.equal(l.old_value, null, l.field);
    assert.equal(l.new_value, all()[l.field] * 100, l.field); // DB giữ điểm theo phần trăm của điểm (số nguyên, 1/100)
    assert.equal(l.by, 'admin');
  }
});

test('Admin sửa một điểm: 200, log thêm đúng 1 dòng (cũ, mới), bốn điểm khác nguyên', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  const r = await putScores({ user: 'an', month: MONTH, scores: { peer: 70 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.item.scores, all({ peer: 70 }));
  const log = await logOf('an');
  assert.equal(log.length, 6);
  const last = await log.at(-1);
  assert.equal(last.field, 'peer');
  assert.equal(last.old_value, 8000); // hợp đồng lưu trữ: điểm × 100
  assert.equal(last.new_value, 7000);
  assert.equal((await scoreRows()).length, 1);
});

test('điểm 0 là điểm hợp lệ (khác chưa nhập) và điểm có 2 chữ số thập phân được nhận đúng', async () => {
  const r = await putScores({ user: 'an', month: MONTH, scores: all({ self: 0, wework: 87.5, user: 92.25 }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.item.complete, true);
  assert.equal(r.data.item.scores.self, 0);
  assert.equal(r.data.item.scores.user, 92.25);
});

test('null xóa một điểm: 200, complete về false, log ghi giá trị cũ và mới là null', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  const r = await putScores({ user: 'an', month: MONTH, scores: { manager: null } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.item.complete, false);
  assert.equal(r.data.item.scores.manager, null);
  const last = await (await await logOf('an')).at(-1);
  assert.equal(last.field, 'manager');
  assert.equal(last.old_value, 8500);
  assert.equal(last.new_value, null);
});

test('ghi điểm từng phần: chưa đủ 5 thì complete false; điểm mỗi người mỗi tháng riêng nhau', async () => {
  const a = await putScores({ user: 'an', month: MONTH, scores: { wework: 90 } });
  assert.equal(a.status, 200);
  assert.equal(a.data.item.complete, false);
  await putScores({ user: 'binh', month: MONTH, scores: all() });
  const list = (await getScores(MONTH)).data.items;
  assert.equal(list.find(i => i.username === 'an').complete, false);
  assert.equal(list.find(i => i.username === 'binh').complete, true);
  assert.equal(
    (await getScores('2026-09')).data.items.find(i => i.username === 'binh').complete,
    false,
    'tháng khác không có điểm'
  );
});

test('hai lần ghi cùng lúc cùng (người, tháng): đúng 1 dòng kpi_scores, cả hai điểm được lưu, log đủ hai dòng', async () => {
  const [x, y] = await Promise.all([
    putScores({ user: 'an', month: MONTH, scores: { wework: 91 } }),
    putScores({ user: 'an', month: MONTH, scores: { user: 82 } })
  ]);
  assert.equal(x.status, 200, JSON.stringify(x.data));
  assert.equal(y.status, 200, JSON.stringify(y.data));
  assert.equal((await scoreRows()).length, 1);
  const item = (await getScores(MONTH)).data.items.find(i => i.username === 'an');
  assert.equal(item.scores.wework, 91);
  assert.equal(item.scores.user, 82);
  assert.deepEqual((await logOf('an')).map(l => l.field).sort(), ['user', 'wework']);
});

test('amt hợp lệ ghi mức KPI đã duyệt (kpi_adm_amt) và nhật ký field "amt", kpi_adm_pct vẫn null cho tháng mới', async () => {
  const r = await putScores({ user: 'an', month: MONTH, scores: all(), amt: 4000000 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.item.amtApproved, 4000000);
  const row = await store.db
    .prepare('SELECT kpi_adm_pct, kpi_adm_amt FROM timesheets WHERE username = ? AND month = ?')
    .get('an', MONTH);
  assert.equal(row.kpi_adm_amt, 4000000);
  assert.equal(row.kpi_adm_pct, null);
  const amtLog = (await logOf('an')).filter(l => l.field === 'amt');
  assert.equal(amtLog.length, 1);
  assert.equal(amtLog[0].new_value, 4000000);
});

// ================= PUT /api/kpi/scores: từ chối, không lưu gì =================

test('K1: điểm ngoài 0-100, kiểu sai hoặc quá 2 chữ số thập phân: 400 từng cái, KHÔNG kẹp, không lưu, không ghi log (đề xuất, chờ lead)', async () => {
  const before = await snapshot();
  const bads = [101, -1, 100.01, 850, '90', '', true, [90], {}, 87.125, 0.001];
  for (const v of bads) {
    const r = await putScores({ user: 'an', month: MONTH, scores: { wework: v } });
    assert.equal(r.status, 400, `điểm ${JSON.stringify(v)} phải bị từ chối`);
    assert.equal(typeof r.data.error, 'string');
  }
  assert.deepEqual(await snapshot(), before, 'không dòng nào được lưu và không có log');
  assert.equal((await scoreRows()).length, 0);
});

test('K1: 1e400 (vô cực) và NaN gửi thẳng trong thân JSON: 400, không lưu', async () => {
  const before = await snapshot();
  const rawBody = (v?) => `{"user":"an","month":"${MONTH}","scores":{"wework":${v}}}`;
  assert.equal((await putScores(undefined, 'admin', rawBody('1e400'))).status, 400);
  assert.equal((await putScores(undefined, 'admin', rawBody('NaN'))).status, 400);
  assert.deepEqual(await snapshot(), before);
});

test('một điểm sai trong yêu cầu nhiều điểm: cả yêu cầu bị từ chối, điểm hợp lệ đi kèm cũng không được lưu', async () => {
  const before = await snapshot();
  const r = await putScores({ user: 'an', month: MONTH, scores: { wework: 90, user: 101, peer: 80 } });
  assert.equal(r.status, 400);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await logOf('an')).length, 0);
});

test('khóa lạ trong scores (bonus, self_score, kpiBase) là 400, không lưu', async () => {
  const before = await snapshot();
  for (const key of ['bonus', 'self_score', 'kpiBase', 'user_score']) {
    const r = await putScores({ user: 'an', month: MONTH, scores: { [key]: 90 } });
    assert.equal(r.status, 400, key);
  }
  assert.deepEqual(await snapshot(), before);
});

test('yêu cầu không có gì để đổi (scores rỗng, không amt; hoặc không có scores) là 400', async () => {
  const before = await snapshot();
  assert.equal((await putScores({ user: 'an', month: MONTH, scores: {} })).status, 400);
  assert.equal((await putScores({ user: 'an', month: MONTH })).status, 400);
  assert.equal((await putScores({ user: 'an', month: MONTH, reason: 'chỉ có lý do' })).status, 400);
  assert.deepEqual(await snapshot(), before);
});

test('người dùng không hợp lệ: không tồn tại 404; TTS và Admin không có KPI 400; không lưu', async () => {
  const before = await snapshot();
  assert.equal((await putScores({ user: 'khongco', month: MONTH, scores: all() })).status, 404);
  assert.equal((await putScores({ user: 'thuctap', month: MONTH, scores: all() })).status, 400);
  assert.equal((await putScores({ user: 'admin', month: MONTH, scores: all() })).status, 400);
  assert.deepEqual(await snapshot(), before);
});

test('tháng sai dạng hoặc thiếu: 400 và không lưu; tháng sau tháng hiện tại (giờ Việt Nam) vẫn lưu, kèm cảnh báo KPI_MONTH_FUTURE', async () => {
  const before = await snapshot();
  for (const month of [undefined, '', '2026-1', '2026-13', '2026-10-01', 'abc', 202610]) {
    assert.equal((await putScores({ user: 'an', month, scores: all() })).status, 400, String(month));
  }
  assert.deepEqual(await snapshot(), before);
  const future = await putScores({ user: 'an', month: '2026-11', scores: all() });
  assert.equal(future.status, 200, JSON.stringify(future.data));
  assert.ok(warned(future, 'KPI_MONTH_FUTURE'), JSON.stringify(future.data.warnings));
  assert.equal((await scoreRows()).length, 1);
});

test('amt âm là 400 và không lưu gì; amt vượt trần level (6.500.000 cho NV L1, 1.500.001 cho CTV L1) vẫn lưu, kèm cảnh báo KPI_OVER_CAP', async () => {
  const before = await snapshot();
  assert.equal((await putScores({ user: 'an', month: MONTH, scores: all(), amt: -1 })).status, 400);
  assert.deepEqual(await snapshot(), before);
  for (const [user, amt] of [
    ['an', 6500000],
    ['cong', 1500001]
  ]) {
    const res = await putScores({ user, month: MONTH, scores: all(), amt });
    assert.equal(res.status, 200, `${user}: ${JSON.stringify(res.data)}`);
    assert.ok(warned(res, 'KPI_OVER_CAP'), JSON.stringify(res.data.warnings));
  }
});

test('U4: amt đúng bằng KPI tối đa của bậc thì lưu không cảnh báo (NV L1 6.000.000, CTV L1 1.500.000), lớn hơn một đồng thì vẫn lưu kèm cảnh báo KPI_OVER_CAP', async () => {
  for (const [user, max] of <any[]>[
    ['an', 6000000],
    ['cong', 1500000]
  ]) {
    const exact = await putScores({ user, month: MONTH, scores: all(), amt: max });
    assert.equal(exact.status, 200, `${user}: ${JSON.stringify(exact.data)}`);
    assert.ok(!warned(exact, 'KPI_OVER_CAP'), user);
    const over = await putScores({ user, month: MONTH, scores: all(), amt: max + 1 });
    assert.equal(over.status, 200, user);
    assert.ok(warned(over, 'KPI_OVER_CAP'), JSON.stringify(over.data.warnings));
  }
});

test('lý do dài quá 300 ký tự là 400, không lưu', async () => {
  const before = await snapshot();
  const r = await putScores({ user: 'an', month: MONTH, scores: all(), reason: 'x'.repeat(301) });
  assert.equal(r.status, 400);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await putScores({ user: 'an', month: MONTH, scores: all(), reason: 'x'.repeat(300) })).status, 200);
});

// ================= GET /api/kpi/scores =================

test('GET /api/kpi/scores: Admin thấy phương pháp, kpiFrom, trọng số và chỉ nhân sự có KPI (NV, CTV; không TTS, không Admin)', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  const r = await getScores(MONTH);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.month, MONTH);
  assert.equal(r.data.method, 'five');
  assert.ok(r.data.weights, 'có bảng trọng số');
  const users = r.data.items.map(i => i.username).sort();
  assert.deepEqual(users, ['an', 'binh', 'cong']);
  const an = r.data.items.find(i => i.username === 'an');
  assert.equal(an.kpiMax, 6000000);
  assert.equal(r.data.items.find(i => i.username === 'cong').kpiMax, 1500000);
});

test('GET /api/kpi/scores: method là "five" ở mọi tháng, không cần công tắc', async () => {
  const now = await getScores(MONTH);
  assert.equal(now.status, 200);
  assert.equal(now.data.method, 'five');
  assert.equal((await getScores(OLD_MONTH)).data.method, 'five');
});

test('GET /api/kpi/scores: tháng thiếu hoặc sai dạng là 400', async () => {
  for (const month of ['', '2026-1', 'abc', '2026-13']) assert.equal((await getScores(month)).status, 400, month);
  assert.equal((await call('GET', '/kpi/scores')).status, 400);
});

// ================= nhân sự xem điểm của mình =================

test('K10: nhân sự chưa đủ 5 điểm chỉ nhận kpiParts = { complete:false }, không lộ điểm từng phần (đề xuất, chờ lead)', async () => {
  const empty = await call('GET', '/sheet?month=' + MONTH, undefined, 'an');
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.kpiParts, { complete: false });
  await putScores({ user: 'an', month: MONTH, scores: { wework: 93, user: 81, peer: 77, manager: 66 } }); // thiếu self
  const partial = await call('GET', '/sheet?month=' + MONTH, undefined, 'an');
  assert.deepEqual(partial.data.kpiParts, { complete: false });
  const text = JSON.stringify(partial.data.kpiParts);
  for (const v of ['93', '81', '77', '66']) assert.ok(!text.includes(v), 'lộ điểm ' + v);
});

test('K10: đủ 5 điểm thì nhân sự thấy điểm của chính mình, Admin xem /sheet?user= cũng thấy; điểm người khác không lẫn vào', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  await putScores({
    user: 'binh',
    month: MONTH,
    scores: all({ wework: 60, user: 61, peer: 62, manager: 63, self: 64 })
  });
  const own = await call('GET', '/sheet?month=' + MONTH, undefined, 'an');
  assert.equal(own.data.kpiParts.complete, true);
  const mine = await scoresOf(own.data.kpiParts);
  assert.deepEqual(Object.fromEntries(KEYS.map(k => [k, mine[k]])), all(), 'khớp điểm của an');
  const viaAdmin = await call('GET', '/sheet?month=' + MONTH + '&user=an', undefined, 'admin');
  assert.equal(viaAdmin.data.kpiParts.complete, true);
  const binh = await call('GET', '/sheet?month=' + MONTH, undefined, 'binh');
  assert.equal((await scoresOf(binh.data.kpiParts)).wework, 60);
});

test('nhân sự xem bảng của người khác (GET /sheet?user=) là 403, không lộ kpiParts', async () => {
  await putScores({ user: 'binh', month: MONTH, scores: all() });
  const r = await call('GET', '/sheet?month=' + MONTH + '&user=binh', undefined, 'an');
  assert.equal(r.status, 403);
  assert.ok(!JSON.stringify(r.data).includes('kpiParts'));
});

test('Admin xem /team: mỗi dòng nhân sự có kpiParts (đủ điểm hoặc { complete:false })', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  const r = await call('GET', '/team?month=' + MONTH, undefined, 'admin');
  assert.equal(r.status, 200);
  const rowOf = (u?) => r.data.rows.find(x => x.staff.username === u);
  assert.equal((await rowOf('an')).kpiParts.complete, true);
  assert.deepEqual((await rowOf('binh')).kpiParts, { complete: false });
});

test('kpi_scores không bị sửa bởi PUT /api/sheet của nhân sự (nhân sự không ghi được điểm nào qua API)', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  const before = await rows('SELECT * FROM kpi_scores');
  const r = await call(
    'PUT',
    '/sheet',
    { month: MONTH, days: {}, kpiPct: 100, kpiAmt: 6000000, kpiParts: all({ wework: 0 }), scores: all({ wework: 0 }) },
    'an'
  );
  assert.ok([200, 400].includes(r.status), 'PUT /sheet trả ' + r.status);
  assert.deepEqual(await rows('SELECT * FROM kpi_scores'), before);
  assert.equal((await logOf('an')).length, 5);
});

// ================= điểm đủ 5 hiện cho nhân sự ở mọi tháng =================

test('K10: điểm của tháng 2026-09 cũng hiện cho nhân sự khi nhập đủ 5, như mọi tháng', async () => {
  await putScores({ user: 'an', month: OLD_MONTH, scores: all() });
  const staff = await call('GET', '/sheet?month=' + OLD_MONTH, undefined, 'an');
  assert.equal(staff.data.kpiParts.complete, true);
  const admin = await call('GET', '/sheet?month=' + OLD_MONTH + '&user=an', undefined, 'admin');
  assert.equal(admin.data.kpiParts.complete, true);
});

test('K10: điểm của tháng từ 2026-10 hiện cho nhân sự ngay khi nhập đủ 5, không cần bật gì', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  const staff = await call('GET', '/sheet?month=' + MONTH, undefined, 'an');
  assert.equal(staff.data.kpiParts.complete, true);
  assert.equal(staff.data.kpiParts.wework, 100);
  const team = await call('GET', '/team?month=' + MONTH, undefined, 'admin');
  assert.equal(team.data.rows.find(r => r.staff.username === 'an').kpiParts.complete, true);
});

// ================= thân yêu cầu hỏng =================

test('thân JSON null, mảng, chuỗi hoặc hỏng: 400 (không 500), không lưu, cho route ghi điểm', async () => {
  const before = await snapshot();
  for (const raw of ['null', '[]', '"x"', '{', '123']) {
    assert.equal((await putScores(undefined, 'admin', raw)).status, 400, 'scores ' + raw);
  }
  assert.deepEqual(await snapshot(), before);
});

test('scores không phải đối tượng (mảng, chuỗi, số, null) là 400, không lưu', async () => {
  const before = await snapshot();
  for (const scores of [[90], 'abc', 90, null, true])
    assert.equal((await putScores({ user: 'an', month: MONTH, scores })).status, 400, JSON.stringify(scores));
  assert.deepEqual(await snapshot(), before);
});

test('user viết hoa vẫn tìm đúng người; user không phải chuỗi hợp lệ là 400', async () => {
  assert.equal((await putScores({ user: 'AN', month: MONTH, scores: { wework: 90 } })).status, 200);
  assert.equal((await scoreRows())[0].username, 'an');
  const before = await snapshot();
  for (const user of [123, null, ['an'], '', 'a b', '../x'])
    assert.equal((await putScores({ user, month: MONTH, scores: { wework: 90 } })).status, 400, JSON.stringify(user));
  assert.deepEqual(await snapshot(), before);
});

test('K1: điểm có nhiều hơn 2 chữ số thập phân sát số nguyên (74,999999999) bị từ chối 400, không lưu thành 75,00', async () => {
  const before = await snapshot();
  assert.equal((await putScores({ user: 'an', month: MONTH, scores: { wework: 74.999999999 } })).status, 400);
  assert.deepEqual(await snapshot(), before);
});

test('GET /sheet của người không còn có KPI (đã đổi sang TTS) không trả điểm KPI còn sót trong kpi_scores', async () => {
  await putScores({ user: 'an', month: MONTH, scores: all() });
  await person('an', { type: 'tts', level: 1 });
  const r = await call('GET', '/sheet?month=' + MONTH, undefined, 'an');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.kpiParts, { complete: false });
  const team = await call('GET', '/team?month=' + MONTH, undefined, 'admin');
  assert.deepEqual(team.data.rows.find(x => x.staff.username === 'an').kpiParts, { complete: false });
});

// ================= amt chỉ nhận ở tháng tính theo 5 thành phần =================

const adm = async (u?, m?) =>
  await store.db.prepare('SELECT kpi_adm_pct, kpi_adm_amt FROM timesheets WHERE username = ? AND month = ?').get(u, m);

test('amt (mức KPI) nhận ở MỌI tháng, kể cả tháng trước 2026-10: không còn 409 KPI_FIVE_NOT_ON hay KPI_FIVE_FROM_PAST (chủ dự án bỏ công tắc 23/10/2026)', async () => {
  await store.setKpiApproval('an', OLD_MONTH, 80, 4000000); // tháng cũ đã duyệt theo cách cũ
  const old = await putScores({ user: 'an', month: OLD_MONTH, amt: 3000000 });
  assert.equal(old.status, 200, JSON.stringify(old.data));
  assert.equal((await adm('an', OLD_MONTH)).kpi_adm_amt, 3000000);
  assert.equal((await logOf('an', OLD_MONTH)).length, 1, 'nhật ký ghi lần đặt mức');
  // điểm đi kèm amt cũng được lưu
  const withScores = await putScores({ user: 'binh', month: MONTH, scores: all(), amt: 3000000 });
  assert.equal(withScores.status, 200, JSON.stringify(withScores.data));
  assert.equal((await adm('binh', MONTH)).kpi_adm_amt, 3000000);
  assert.equal((await scoreRows()).length, 1);
  assert.equal((await logOf('binh')).length, 6, 'năm điểm và mức KPI');
  // không có mã lỗi của công tắc ở bất kỳ câu trả lời nào
  assert.ok(!JSON.stringify([old.data, withScores.data]).includes('KPI_FIVE'));
});

test('tìm thấy 7: amt được nhận (200) ở tháng 2026-09 và tháng quản lý đầu tiên 2026-10', async () => {
  for (const month of ['2026-09', MONTH]) {
    const r = await putScores({ user: 'an', month, amt: 3500000 });
    assert.equal(r.status, 200, month + ' ' + JSON.stringify(r.data));
    assert.equal((await adm('an', month)).kpi_adm_amt, 3500000, month);
    assert.equal((await adm('an', month)).kpi_adm_pct, null);
  }
});

test('tìm thấy 7: chỉ có điểm, không amt, ở tháng trước 2026-10: vẫn 200 (nhập điểm trước, K10)', async () => {
  const unset = await putScores({ user: 'an', month: MONTH, scores: all() });
  assert.equal(unset.status, 200, JSON.stringify(unset.data));
  const early = await putScores({ user: 'binh', month: OLD_MONTH, scores: all() });
  assert.equal(early.status, 200, JSON.stringify(early.data));
  assert.equal((await scoreRows()).length, 2);
  assert.equal((await logOf('an')).length, 5);
});

test('tìm thấy 7: tháng cũ có amt mà thân yêu cầu hỏng vẫn là 400/404 (không lưu gì)', async () => {
  const before = await snapshot();
  const bad = [
    [{ user: 'an', month: OLD_MONTH, amt: -1 }, 400, 'amt âm'],
    [{ user: 'an', month: OLD_MONTH, amt: 'abc' }, 400, 'amt không phải số'],
    [{ user: 'an', month: OLD_MONTH, amt: 3000000, scores: { wework: 101 } }, 400, 'điểm ngoài 0-100'],
    [{ user: 'an', month: OLD_MONTH, amt: 3000000, scores: { bonus: 90 } }, 400, 'khóa lạ'],
    [{ user: 'an', month: OLD_MONTH, amt: 3000000, reason: 'x'.repeat(301) }, 400, 'lý do quá dài'],
    [{ user: 'an', month: '2026-1', amt: 3000000 }, 400, 'tháng sai dạng'],
    [{ user: 'thuctap', month: OLD_MONTH, amt: 3000000 }, 400, 'TTS không có KPI'],
    [{ user: 'khongco', month: OLD_MONTH, amt: 3000000 }, 404, 'không có nhân sự']
  ];
  for (const [body, status, label] of bad) assert.equal((await putScores(body)).status, status, label);
  assert.deepEqual(await snapshot(), before);
});

test('tìm thấy 7: phân quyền: chưa đăng nhập 401, nhân sự 403 dù tháng cũ có amt', async () => {
  const before = await snapshot();
  assert.equal((await putScores({ user: 'an', month: OLD_MONTH, amt: 3000000 }, null)).status, 401);
  assert.equal((await putScores({ user: 'an', month: OLD_MONTH, amt: 3000000 }, 'an')).status, 403);
  assert.deepEqual(await snapshot(), before);
});
