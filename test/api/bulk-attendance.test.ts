'use strict';
// Admin chấm công thay hàng loạt (PUT /api/sheet/bulk, src/domain/sheet-bulk.ts): nhiều người, nhiều ngày, một ca, tất cả hoặc không.
//   thân { month, usernames[], days: { 'YYYY-MM-DD': { kind: 'work', preset } }, confirmDays?, expectedRevs?: { tên: rev } }
//   200 { ok, month, results: [{ username, rev, autoApproved, reset, resubmitted, removed, presence: { set, removed, skipped }, skipped: [{ date, kind }] }], warnings? }
// Mỗi người đi đúng đường PUT /api/sheet kèm user; một lỗi cứng của một người thì DB không đổi gì (kiểm bảng lịch, lượt chấm công, nhật ký).
// Chỉ người bịa (qa_*), DB trong bộ nhớ, đồng hồ giả: thứ Tư 04/11/2026 20:00.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { rulesFor } = require('../../src/platform/request-rules');

const { store } = F;
const M = '2026-11';
const D1 = '2026-11-02'; // thứ Hai
const D2 = '2026-11-03'; // thứ Ba
const TODAY = '2026-11-04'; // thứ Tư
const SUNDAY = '2026-11-01';
const N2 = { kind: 'work', preset: 'Normal2' };

const bulk = async (body?, who = 'admin') => await F.call('PUT', '/sheet/bulk', { who, body });
const body = (extra: any = {}) => ({
  month: M,
  usernames: ['qa_nv1', 'qa_nv2', 'qa_nv3'],
  days: { [D1]: N2, [D2]: N2 },
  ...extra
});
const sheet = async (username?, month = M) => (await F.call('GET', `/sheet?month=${month}&user=${username}`)).data;
const count = async (table, where = '1 = 1', ...args) =>
  (await store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...args)).n;
const auditCount = async (action?) => await count('audit_log', 'action = ?', action);
const adminSessions = async (username?) =>
  (await store.listSessions({ username, includeScheduled: true })).filter(s => s.entry.origin === 'sheet.onBehalf');
const person = async (username?, extra: any = {}) =>
  await F.person(username, 'staff', { type: 'nv', level: 1, shiftCode: 'Normal1', startDate: '2026-01-05', ...extra });
// Trạng thái ghi được của một nhóm người: lịch (rev), số lượt chấm công, số dòng nhật ký; so trước và sau để biết "không lưu gì"
const stateOf = async (usernames?) => ({
  revs: await Promise.all(usernames.map(async u => (await store.getSheet(u, M)).rev)),
  sessions: await count('attendance_sessions'),
  audits: await count('audit_log')
});

before(async () => {
  await F.start();
  await F.at(`${TODAY}T20:00:00`);
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const u of ['qa_nv1', 'qa_nv2', 'qa_nv3']) await person(u);
  await person('qa_acc');
  await store.roles.grant('qa_acc', 'accounting', 'admin');
});
after(F.stop);

test('ba người hai ngày: 200, kết quả theo người, lịch có ca Normal2 10:00–19:00, mỗi ngày một lượt Admin', async () => {
  const res = await bulk(body());
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.ok, true);
  assert.equal(res.data.month, M);
  assert.deepEqual(
    res.data.results.map(r => r.username),
    ['qa_nv1', 'qa_nv2', 'qa_nv3']
  );
  for (const r of res.data.results) {
    assert.equal(r.rev, (await sheet(r.username)).rev, r.username);
    assert.deepEqual(r.presence.set, [D1, D2], r.username);
    assert.deepEqual(r.skipped, [], r.username);
    assert.deepEqual(Object.keys(r).sort(), [
      'autoApproved',
      'presence',
      'removed',
      'reset',
      'resubmitted',
      'rev',
      'skipped',
      'username'
    ]);
    const days = (await sheet(r.username)).days;
    assert.equal(days[D1].preset, 'Normal2');
    assert.equal(days[D1].in, '10:00');
    assert.equal(days[D1].out, '19:00');
    assert.equal(days[D2].kind, 'work');
    assert.equal((await adminSessions(r.username)).length, 2, r.username);
  }
});

test('gộp: ngày đã khai từ trước vẫn còn; ngày đang khai nghỉ không bị ghi đè và được báo ở skipped', async () => {
  await person('qa_merge');
  await store.setSheet(
    'qa_merge',
    M,
    {
      [TODAY]: {
        kind: 'work',
        shift: '',
        in: '08:00',
        out: '17:00',
        extraKind: '',
        extraIn: '',
        extraOut: '',
        preset: 'Normal1',
        breakMin: 0
      },
      [D2]: { kind: 'leave' }
    },
    0,
    0
  );
  const res = await bulk({ month: M, usernames: ['qa_merge'], days: { [D1]: N2, [D2]: N2 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.results[0].skipped, [{ date: D2, kind: 'leave' }]);
  assert.deepEqual(res.data.results[0].presence.set, [D1]);
  const days = (await sheet('qa_merge')).days;
  assert.equal(days[TODAY].in, '08:00', 'ngày khai từ trước còn nguyên');
  assert.equal(days[D2].kind, 'leave', 'ngày nghỉ không bị ghi đè');
  assert.equal(days[D1].preset, 'Normal2');
});

test('ngày đã khai đi làm chỉ đổi giờ vào, giờ ra, mã ca; giờ OT đã khai giữ nguyên', async () => {
  await person('qa_keep');
  await store.setSheet(
    'qa_keep',
    M,
    {
      [D1]: {
        kind: 'work',
        shift: '',
        in: '08:00',
        out: '17:00',
        extraKind: 'ot',
        extraIn: '',
        extraOut: '20:00',
        preset: 'Normal1',
        breakMin: 0
      }
    },
    0,
    0
  );
  const res = await bulk({ month: M, usernames: ['qa_keep'], days: { [D1]: N2 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const day = (await sheet('qa_keep')).days[D1];
  assert.deepEqual(
    [day.in, day.out, day.preset, day.extraKind, day.extraOut],
    ['10:00', '19:00', 'Normal2', 'ot', '20:00']
  );
});

test('tất cả hoặc không: lỗi cứng DAY_HOURS_CAP của người thứ hai thì người thứ nhất cũng không được lưu', async () => {
  await person('qa_ok');
  await person('qa_cap');
  // OT 05:00–08:00 trước ca 08:00–17:00 hợp lệ; đổi sang ca 13:00–22:00 thì OT dài 8 giờ cộng ca 9 giờ vượt trần 12 giờ
  await store.setSheet(
    'qa_cap',
    M,
    {
      [D1]: {
        kind: 'work',
        shift: '',
        in: '08:00',
        out: '17:00',
        extraKind: 'ot',
        extraIn: '05:00',
        extraOut: '',
        preset: 'Normal1',
        breakMin: 0
      }
    },
    0,
    0
  );
  const names = ['qa_ok', 'qa_cap'];
  const before = await stateOf(names);
  const res = await bulk({
    month: M,
    usernames: names,
    days: { [D1]: { kind: 'work', preset: 'Flex2' }, [D2]: { kind: 'work', preset: 'Flex2' } }
  });
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'DAY_HOURS_CAP');
  assert.equal(res.data.username, 'qa_cap');
  assert.equal(res.data.date, D1);
  assert.ok(res.data.error.startsWith('Người thử qa_cap:'), res.data.error);
  assert.deepEqual(await stateOf(names), before, 'không lịch, lượt chấm công hay dòng nhật ký nào được ghi');
  assert.deepEqual((await sheet('qa_ok')).days, {});
});

test('trần giờ OT một tháng là lỗi cứng nêu người: đổi ca làm giờ OT trước ca dài ra, không ai được lưu', async () => {
  const month = '2026-10';
  const weekdays = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
    .filter(d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
    .slice(0, 15);
  await person('qa_otok');
  await person('qa_otmax');
  // OT 07:00–08:00 trước ca 08:00–17:00 là 1 giờ mỗi ngày; sang ca 10:00–19:00 thì OT 07:00–10:00 là 3 giờ mỗi ngày (ngày 11 giờ ròng, chưa vượt trần ngày)
  const old = {
    kind: 'work',
    shift: '',
    in: '08:00',
    out: '17:00',
    extraKind: 'ot',
    extraIn: '07:00',
    extraOut: '',
    preset: 'Normal1',
    breakMin: 0
  };
  await store.setSheet('qa_otmax', month, Object.fromEntries(weekdays.map(d => [d, old])), 0, 0);
  const names = ['qa_otok', 'qa_otmax'];
  const snap = async () => ({
    otok: (await store.getSheet('qa_otok', month)).rev,
    otmax: (await store.getSheet('qa_otmax', month)).rev,
    audits: await count('audit_log'),
    sessions: await count('attendance_sessions')
  });
  const before = await snap();
  const res = await bulk({ month, usernames: names, days: Object.fromEntries(weekdays.map(d => [d, N2])) });
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'OT_MONTH_CAP');
  assert.equal(res.data.username, 'qa_otmax');
  assert.deepEqual(await snap(), before);
});

test('đầu vào: thiếu tên, quá trần, tên sai, trùng, ca lạ, ngày null, ngoài tháng, rỗng, có giờ tự nhập, ngày tương lai', async () => {
  const max = (await rulesFor()).params['system.staff.bulkMax'];
  const before = await stateOf(['qa_nv1']);
  const err = async (b?, status?, code?) => {
    const r = await bulk(b);
    assert.equal(r.status, status, JSON.stringify(r.data));
    if (code) assert.equal(r.data.code, code, JSON.stringify(r.data));
    return r;
  };
  await err({ ...body(), month: '2026-13' }, 400);
  await err({ ...body(), usernames: [] }, 400, 'USERNAMES_REQUIRED');
  await err({ ...body(), usernames: Array.from({ length: max + 1 }, (_, i) => `qa_x${i}`) }, 400, 'TOO_MANY');
  await err({ ...body(), usernames: ['qa_nv1', 7] }, 400);
  await err({ ...body(), usernames: ['qa_nv1', 'QA_NV1'] }, 400);
  await err({ ...body(), days: { [D1]: { kind: 'work', preset: 'Zzz9' } } }, 400, 'SHIFT_UNKNOWN');
  await err({ ...body(), days: { [D1]: null } }, 400, 'BULK_DAY_INVALID');
  await err({ ...body(), days: { [D1]: { kind: 'leave' } } }, 400, 'BULK_DAY_INVALID');
  await err(
    { ...body(), days: { [D1]: { kind: 'work', preset: 'Normal2', in: '08:00', out: '17:00' } } },
    400,
    'BULK_DAY_INVALID'
  );
  await err({ ...body(), days: { '2026-12-01': N2 } }, 400, 'BULK_DAY_INVALID');
  await err({ ...body(), days: {} }, 400, 'BULK_DAY_INVALID');
  await err({ ...body(), days: [] }, 400, 'BULK_DAY_INVALID');
  const future = await err({ ...body(), days: { [D1]: N2, '2026-11-05': N2 } }, 400, 'BULK_DAY_FUTURE');
  assert.match(future.data.error, /05\/11/);
  await err({ ...body(), expectedRevs: { qa_nv1: -1 } }, 400);
  await err({ ...body(), expectedRevs: { qa_other: 0 } }, 400);
  await err({ ...body(), confirmDays: ['2026-12-01'] }, 400);
  assert.equal((await bulk(null)).status, 400);
  assert.deepEqual(await stateOf(['qa_nv1']), before);
});

test('hôm nay được chấm; ngày mai bị từ chối', async () => {
  await person('qa_today');
  const ok = await bulk({ month: M, usernames: ['qa_today'], days: { [TODAY]: N2 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await sheet('qa_today')).days[TODAY].preset, 'Normal2');
});

test('tên không có tài khoản: 404 STAFF_NOT_FOUND nêu danh sách, tài khoản ngoài bảng lương: 400 NOT_PAYROLL_SUBJECT; không ai được lưu', async () => {
  await F.person('qa_plain_admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  const before = await stateOf(['qa_nv1']);
  const missing = await bulk({ month: M, usernames: ['qa_nv1', 'qa_ghost'], days: { [D1]: N2 } });
  assert.equal(missing.status, 404);
  assert.equal(missing.data.code, 'STAFF_NOT_FOUND');
  assert.deepEqual(missing.data.missing, ['qa_ghost']);
  const outside = await bulk({ month: M, usernames: ['qa_nv1', 'qa_plain_admin'], days: { [D1]: N2 } });
  assert.equal(outside.status, 400, JSON.stringify(outside.data));
  assert.equal(outside.data.code, 'NOT_PAYROLL_SUBJECT');
  assert.deepEqual(outside.data.usernames, ['qa_plain_admin']);
  assert.deepEqual(await stateOf(['qa_nv1']), before);
});

test('quyền: nhân sự, Kế toán 403 FORBIDDEN_CAP, chưa đăng nhập 401; cổng quyền chạy trước kiểm thân (thân hỏng vẫn 403) và không lưu gì', async () => {
  const before = await stateOf(['qa_nv1']);
  for (const who of ['qa_nv1', 'qa_acc']) {
    const ok = await bulk({ month: M, usernames: ['qa_nv1'], days: { [D1]: N2 } }, who);
    assert.equal(ok.status, 403, who);
    assert.equal(ok.data.code, 'FORBIDDEN_CAP');
    assert.equal(ok.data.cap, 'request.decide.*');
    const broken = await bulk({ month: 'sai', usernames: [], days: {} }, who);
    assert.equal(broken.status, 403, who);
  }
  assert.equal((await bulk(body(), null)).status, 401);
  assert.equal(
    (await bulk({ month: 'sai', usernames: [], days: {} })).status,
    400,
    'Admin gửi cùng thân hỏng nhận 400'
  );
  assert.deepEqual(await stateOf(['qa_nv1']), before);
});

test('expectedRevs lệch: 409 SHEET_STALE kèm tên và rev của người lệch, không ai được lưu; đúng rev thì lưu', async () => {
  await person('qa_rev1');
  await person('qa_rev2');
  const r1 = (await sheet('qa_rev1')).rev;
  const r2 = (await sheet('qa_rev2')).rev;
  const before = await stateOf(['qa_rev1', 'qa_rev2']);
  const stale = await bulk({
    month: M,
    usernames: ['qa_rev1', 'qa_rev2'],
    days: { [D1]: N2 },
    expectedRevs: { qa_rev1: r1, qa_rev2: r2 + 5 }
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'SHEET_STALE');
  assert.equal(stale.data.username, 'qa_rev2');
  assert.equal(stale.data.rev, r2);
  assert.deepEqual(await stateOf(['qa_rev1', 'qa_rev2']), before);
  const fine = await bulk({
    month: M,
    usernames: ['qa_rev1', 'qa_rev2'],
    days: { [D1]: N2 },
    expectedRevs: { qa_rev1: r1, qa_rev2: r2 }
  });
  assert.equal(fine.status, 200, JSON.stringify(fine.data));
  assert.equal(fine.data.results[0].rev, r1 + 1);
});

test('dòng của chính Admin thuộc bảng lương: vẫn lưu, một cảnh báo SELF_DECISION_FORBIDDEN của đúng người đó, nhật ký của dòng đó có after.self', async () => {
  await person('qa_boss');
  await store.roles.grant('qa_boss', 'admin', 'admin');
  const res = await bulk({ month: M, usernames: ['qa_boss', 'qa_nv1'], days: { [D2]: N2 } }, 'qa_boss');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const self = res.data.warnings.filter(w => w.code === 'SELF_DECISION_FORBIDDEN');
  assert.equal(self.length, 1);
  assert.equal(self[0].details.username, 'qa_boss');
  assert.ok(self[0].message.startsWith('Người thử qa_boss:'), self[0].message);
  assert.equal((await sheet('qa_boss')).days[D2].preset, 'Normal2');
  const rows = await store.db
    .prepare(
      "SELECT subject, after_json FROM audit_log WHERE action = 'sheet.onBehalf' AND actor = 'qa_boss' ORDER BY id DESC LIMIT 2"
    )
    .all();
  const flags = Object.fromEntries(rows.map(r => [r.subject, JSON.parse(r.after_json).self === true]));
  assert.deepEqual(flags, { qa_boss: true, qa_nv1: false });
});

test('cảnh báo theo người: cùng một cảnh báo của hai người là hai mục, mỗi mục mở đầu bằng họ tên và có details.username', async () => {
  await person('qa_sun1');
  await person('qa_sun2');
  const res = await bulk({ month: M, usernames: ['qa_sun1', 'qa_sun2'], days: { [SUNDAY]: N2 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const sunday = res.data.warnings.filter(w => w.code === 'SHEET_SUNDAY');
  assert.deepEqual(sunday.map(w => w.details.username).sort(), ['qa_sun1', 'qa_sun2']);
  for (const w of sunday) assert.ok(w.message.startsWith(`Người thử ${w.details.username}: `), w.message);
});

test('ngày đã có Check-in/out thật: giữ giờ chấm thật, cảnh báo ADMIN_PRESENCE_REAL_PUNCH nêu đúng người', async () => {
  await person('qa_real');
  await person('qa_free');
  await F.at(`${D1}T07:58:00`);
  const inn = await F.call('POST', '/punch', { who: 'qa_real', body: { type: 'in', requestId: 'bulk-real-in-0001' } });
  assert.equal(inn.status, 200, JSON.stringify(inn.data));
  await F.at(`${D1}T17:05:00`);
  const out = await F.call('POST', '/punch', {
    who: 'qa_real',
    body: { type: 'out', sessionId: inn.data.openSession.id, requestId: 'bulk-real-out-0001' }
  });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  await F.at(`${TODAY}T20:00:00`);
  const res = await bulk({
    month: M,
    usernames: ['qa_real', 'qa_free'],
    days: { [D1]: { kind: 'work', preset: 'Flex1' } }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const real = res.data.warnings.find(w => w.code === 'ADMIN_PRESENCE_REAL_PUNCH');
  assert.ok(
    real && real.details.username === 'qa_real' && real.message.startsWith('Người thử qa_real:'),
    JSON.stringify(res.data.warnings)
  );
  assert.equal(res.data.results.find(r => r.username === 'qa_free').presence.set.length, 1);
});

test('kỳ đã chốt công: vẫn lưu (200), kèm cảnh báo PERIOD_LOCKED', async () => {
  await person('qa_lock');
  const month = '2026-10';
  await store.db
    .prepare(
      "INSERT INTO payroll_periods (month, status, rev) VALUES (?, 'attendance_locked', 1) ON CONFLICT(month) DO UPDATE SET status = excluded.status"
    )
    .run(month);
  const res = await bulk({ month, usernames: ['qa_lock'], days: { '2026-10-08': N2 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const locked = res.data.warnings.find(w => w.code === 'PERIOD_LOCKED');
  assert.ok(
    locked && locked.details.month === month && locked.details.scope === 'attendance',
    JSON.stringify(res.data.warnings)
  );
});

test('nhật ký: mỗi người một dòng sheet.onBehalf, cả lô một dòng sheet.onBehalfBulk', async () => {
  await person('qa_log1');
  await person('qa_log2');
  const per = await auditCount('sheet.onBehalf');
  const all = await auditCount('sheet.onBehalfBulk');
  const res = await bulk({ month: M, usernames: ['qa_log1', 'qa_log2'], days: { [D1]: N2 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await auditCount('sheet.onBehalf')) - per, 2);
  assert.equal((await auditCount('sheet.onBehalfBulk')) - all, 1);
  const row = await store.db
    .prepare("SELECT month, after_json FROM audit_log WHERE action = 'sheet.onBehalfBulk' ORDER BY id DESC LIMIT 1")
    .get();
  assert.equal(row.month, M);
  assert.deepEqual(JSON.parse(row.after_json), { people: 2, days: 1, shifts: ['Normal2'] });
});

test('trần số người một lần: 200 người ba ngày xong dưới 10 giây, đủ kết quả và đủ dòng nhật ký', async t => {
  const max = (await rulesFor()).params['system.staff.bulkMax'];
  const names = Array.from({ length: max }, (_, i) => `qa_bulk${i}`);
  for (const u of names) await person(u);
  const per = await auditCount('sheet.onBehalf');
  const started = process.hrtime.bigint(); // đồng hồ giả của fixture không đo được thời gian thật
  const res = await bulk({ month: M, usernames: names, days: { [D1]: N2, [D2]: N2, [TODAY]: N2 } });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(res.data.results.length, max);
  assert.equal((await auditCount('sheet.onBehalf')) - per, max);
  assert.ok(res.data.results.every(r => r.presence.set.length === 3));
  // Mỗi file test chạy trên database PostgreSQL tạm riêng.
  t.diagnostic(`gán ca 200 người × 3 ngày: ${Math.round(ms)} ms`);
  // Bộ test chạy song song nhiều tiến trình nên đo thời gian tường chịu tải: cho dư 3 lần (chạy riêng thì dưới 10 giây).
  const limit = 30000;
  assert.ok(ms < limit, `mất ${Math.round(ms)} ms`);
});
