'use strict';
// Lịch làm việc của một người luôn suy từ loại nhân sự (và ca được gán); không có lịch riêng từng người.
//   - PUT /api/staff/:u/schedule và POST /api/staff/:u/schedule/preview không còn: không có trong bảng quyền ROUTE_CAPS, bị từ chối mặc định;
//   - GET /api/staff/:u/schedule trả lịch THEO LOẠI NHÂN SỰ (hình dữ liệu Vue đọc: schedule.pattern.dows, source 'type');
//   - tham số schedule.person.* không còn trong registry và bộ tham số mặc định;
//   - dữ liệu cũ còn sót trong cột staff.schedule_json (DB đã chạy trước đây) không được đọc: lịch, ngày công chuẩn và tiền không đổi.
const S = require('../helpers/schedule-api');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../src/platform/authz');
const registry = require('../../src/params/registry');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const payrollService = require('../../src/domain/payroll/payroll-service');
const paramsStore = require('../../src/params/store');

const { F, store, F0 } = S;

before(F.start);
after(F.stop);
beforeEach(S.world);

test('PUT và POST preview của lịch riêng không còn trong bảng quyền', () => {
  for (const method of ['PUT', 'POST']) {
    const tail =
      method === 'PUT' ? ['api', 'staff', 'qa_s_nv', 'schedule'] : ['api', 'staff', 'qa_s_nv', 'schedule', 'preview'];
    assert.equal(authz.policyOf(authz.routeKey(method, tail)), null, `${method} ${tail.join('/')}`);
  }
  assert.ok(authz.policyOf(authz.routeKey('GET', ['api', 'staff', 'qa_s_nv', 'schedule'])), 'GET vẫn có chính sách');
  assert.deepEqual(
    Object.keys(authz.ROUTE_CAPS).filter(key => key.includes('/schedule') && !key.startsWith('GET ')),
    []
  );
});

test('PUT và POST preview bị từ chối mặc định (Admin 403 NO_ROUTE_POLICY, chưa đăng nhập 401) và không ghi gì', async () => {
  const before = await F.snapshot();
  const body = {
    from: S.MONTH,
    pattern: { type: 'week', dows: F0.MWF },
    workdays: { mode: 'fixed', value: 26 },
    rev: 0
  };
  for (const [method, path] of [
    ['PUT', S.url('qa_s_nv')],
    ['POST', S.url('qa_s_nv', '/preview')]
  ]) {
    const admin = await F.call(method, path, { who: 'admin', body });
    assert.equal(admin.status, 403, `${method} ${path}: ${JSON.stringify(admin.data)}`);
    assert.equal(admin.data.code, 'NO_ROUTE_POLICY');
    const anon = await F.call(method, path, { who: null, body });
    assert.equal(anon.status, 401, `${method} ${path} chưa đăng nhập`);
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('GET lịch theo loại nhân sự: NV T2–T7 (25 ngày tháng 11), TTS T2–T6 (21 ngày), CTV T2–T7; nguồn "type", không còn rev, history, personEnabled', async () => {
  await F.person('qa_s_ctv', 'staff', { type: 'ctv', level: 1 });
  const expect = [
    ['qa_s_nv', 'nv', F0.MON_SAT, 25],
    ['qa_s_tts', 'tts', F0.MON_FRI, 21],
    ['qa_s_ctv', 'ctv', F0.MON_SAT, 25]
  ];
  for (const [username, type, dows, count] of expect) {
    const res = S.must(await S.get(username), `GET lịch ${username}`);
    assert.equal(res.data.username, username);
    assert.equal(res.data.month, S.MONTH);
    assert.equal(res.data.type, type);
    assert.equal(res.data.source, 'type');
    assert.deepEqual(res.data.schedule.pattern, { type: 'week', dows }, username);
    assert.equal(res.data.scheduledDates.length, count, username);
    assert.deepEqual(res.data.scheduledDates, F0.datesOn(S.MONTH, dows), username);
    assert.equal(typeof res.data.workdaysStd, 'number', username);
    for (const gone of ['rev', 'history', 'personEnabled'])
      assert.equal(gone in res.data, false, `${username}: ${gone}`);
  }
});

test('GET lịch: tháng mặc định là tháng hiện tại, tháng sai dạng 400 BAD_MONTH, người không có 404; nhân viên xem lịch người khác 403 như nhau dù tên có tồn tại hay không', async () => {
  const now = S.must(await F.call('GET', S.url('qa_s_nv'), { who: 'admin' }), 'không nêu tháng');
  assert.equal(now.data.month, S.MONTH);
  const bad = await S.get('qa_s_nv', 'xx');
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'BAD_MONTH');
  assert.equal((await S.get('qa_khong_co', S.MONTH, 'admin')).status, 404);
  const exists = await S.get('qa_s_nv2', S.MONTH, 'qa_s_nv');
  const nobody = await S.get('qa_khong_co', S.MONTH, 'qa_s_nv');
  assert.equal(exists.status, 403);
  assert.equal(nobody.status, 403, JSON.stringify(nobody.data));
  assert.deepEqual(nobody.data, exists.data, 'cùng nội dung lỗi');
  assert.equal((await S.get('qa_s_nv', S.MONTH, 'qa_s_nv')).status, 200, 'xem lịch của chính mình');
});

test('tham số schedule.person.* không còn: không có trong bộ tham số mặc định, registry, và bộ tham số của tháng', async () => {
  for (const key of ['schedule.person.enabled', 'schedule.person.maxEntries']) {
    assert.equal(Object.hasOwn(DEFAULTS, key), false, `DEFAULTS ${key}`);
    assert.equal(registry.entryFor(key), null, `registry ${key}`);
    assert.equal(Object.hasOwn((await paramsStore.resolve('2026-11')).params, key), false, `params của tháng ${key}`);
  }
  assert.deepEqual(
    registry.entries.filter(e => String(e.id).startsWith('schedule.person')).map(e => e.id),
    []
  );
});

// DB đã chạy trước đây còn cột staff.schedule_json (và trigger chỉ-thêm): dựng lại cột đó rồi ghi một lịch riêng cũ Hai-Tư-Sáu
async function legacyColumn(username?) {
  const columns = await store.db
    .prepare(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff'"
    )
    .all();
  if (!columns.some(c => c.name === 'schedule_json'))
    await store.db.exec('ALTER TABLE staff ADD COLUMN schedule_json TEXT');
  const entry = {
    from: '2026-10',
    pattern: { type: 'week', dows: F0.MWF },
    workdays: { mode: 'fixed', value: 13 },
    reason: 'Dữ liệu cũ (bịa)',
    by: 'admin',
    at: '2026-10-16T01:00:00.000Z'
  };
  await store.db
    .prepare('UPDATE staff SET schedule_json = ? WHERE username = ?')
    .run(JSON.stringify([entry]), username);
}

test('dữ liệu cũ trong cột schedule_json không được đọc: GET lịch, GET /sheet và /team vẫn theo loại nhân sự', async () => {
  await legacyColumn('qa_s_nv');
  const view = S.must(await S.get('qa_s_nv'), 'GET lịch');
  assert.equal(view.data.source, 'type');
  assert.deepEqual(view.data.schedule.pattern.dows, F0.MON_SAT);
  assert.equal(view.data.scheduledDates.length, 25);
  const sheet = S.must(await F.call('GET', `/sheet?month=${S.MONTH}`, { who: 'qa_s_nv' }), 'GET /sheet');
  assert.equal(sheet.data.workSchedule.source, 'type');
  assert.deepEqual(sheet.data.workSchedule.pattern.dows, F0.MON_SAT);
  const team = S.must(await F.call('GET', `/team?month=${S.MONTH}`, { who: 'admin' }), 'GET /team');
  const row = team.data.rows.find(r => (r.staff || r).username === 'qa_s_nv');
  assert.ok(row, 'hàng của qa_s_nv');
  assert.equal('workSchedule' in row, false, 'hàng không mang lịch riêng');
  assert.deepEqual(team.data.schedules.nv.pattern.dows, F0.MON_SAT);
});

test('dữ liệu cũ trong cột schedule_json không đổi tiền: đầu vào bộ máy không có khoá schedule, gộp và thực lĩnh bằng người không có dữ liệu cũ', async () => {
  const month = '2026-10';
  const days = F0.fullDays(month, F0.MON_SAT);
  await store.setSheet('qa_s_nv', month, days);
  await store.setSheet('qa_s_nv2', month, days);
  const compute = async (username?) => {
    const inputs = await payrollService.loadInputs(month, { usernames: [username], asOf: '2026-11-04T09:00:00+07:00' });
    const person = inputs.people.get(username);
    assert.equal(Object.hasOwn(person.staff, 'schedule'), false, `${username}: không có khoá staff.schedule`);
    const m = (
      await payrollService.computeFor(month, person.staff, inputs, (await paramsStore.resolve(month)).params, {
        upTo: null
      })
    ).m;
    return { gross: m.net.gross, net: m.net.net, count: m.count, workdaysStd: m.workdaysStd };
  };
  const before = await compute('qa_s_nv');
  await legacyColumn('qa_s_nv');
  const after = await compute('qa_s_nv');
  assert.deepEqual(after, before, 'tiền không đổi khi cột cũ có dữ liệu');
  assert.deepEqual(after, await compute('qa_s_nv2'), 'bằng người cùng loại không có dữ liệu cũ');
  assert.equal(after.workdaysStd, undefined);
});
