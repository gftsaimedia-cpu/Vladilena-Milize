// GPS check-in phía máy chủ: ngoài khu vực công ty, thiếu vị trí hoặc vị trí kém chính xác thì Check-in vẫn được ghi kèm cảnh báo
// (GEO_OUTSIDE, GEO_NO_LOCATION, GEO_LOW_ACCURACY); không lưu toạ độ ở bất kỳ đâu.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');

const HQ = { lat: 10.7769, lng: 106.7009 };
const M = (Math.PI / 180) * 6371000; // mét trên một độ vĩ tuyến
const north = (m?) => HQ.lat + m / M; // điểm cách HQ m mét về phía bắc

let base,
  clock = Date.parse('2026-10-07T07:50:00+07:00');
const realNow = Date.now;
let seq = 0;
async function call(cookie?, method?, url?, body?, raw?) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined
  });
  return {
    status: r.status,
    text: null,
    data: (await r.json().catch(() => ({}))) as any,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0]
  };
}
const login = async (u?) => (await call(null, 'POST', '/api/login', { username: u, password: 'test-pass' })).cookie;
const punchIn = (cookie?, location?) =>
  call(cookie, 'POST', '/api/punch', {
    type: 'in',
    requestId: `geo-test-${++seq}-aaaa`,
    explanation: 'Giải trình lúc bấm', // ngoài vùng, trễ hoặc lượt thứ hai trong ca cần giải trình lúc bấm
    ...(location === undefined ? {} : { location })
  });
const warned = (r?, code?) => (r.data.warnings || []).some(w => w.code === code);
let outSeq = 0;
const punchOut = (cookie?, r?) =>
  call(cookie, 'POST', '/api/punch', {
    type: 'out',
    requestId: `geo-test-out-seq-${++outSeq}`,
    sessionId: r.data.openSession.id
  });
const setFence = (cookie?, body?, raw?) => call(cookie, 'PUT', '/api/settings/geofence', body, raw);
const sessionsOf = async (u?) => await store.listSessions({ username: u });
const FENCE = { ...HQ, radiusM: 150, maxAccuracyM: 80 };

before(async () => {
  Date.now = () => clock;
  for (const s of [
    { username: 'admin', name: 'Admin', role: 'admin', type: 'tts', level: 0 },
    { username: 'an', name: 'An', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' },
    { username: 'binh', name: 'Bình', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' },
    { username: 'chi', name: 'Chi', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' }
  ])
    await store.upsertStaff({ ...s, passHash: auth.hashPassword('test-pass') });
  await new Promise<any>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  Date.now = realNow;
  server.closeAllConnections();
  server.close();
});

test('GPS: chưa đặt vùng thì Check-in như cũ, không cần vị trí', async () => {
  const an = await login('an');
  assert.equal((await call(an, 'GET', '/api/me')).data.geofenceRequired, false);
  assert.equal((await call(await login('admin'), 'GET', '/api/me')).data.geofence, null);
  const r = await punchIn(an);
  assert.equal(r.status, 200);
  const out = await call(an, 'POST', '/api/punch', {
    type: 'out',
    requestId: 'geo-test-out-first',
    sessionId: r.data.openSession.id
  });
  assert.equal(out.status, 200);
});

test('GPS: PUT /settings/geofence chỉ Admin; chưa đăng nhập 401, nhân sự 403', async () => {
  const an = await login('an');
  assert.equal((await setFence(null, FENCE)).status, 401);
  assert.equal((await setFence(an, FENCE)).status, 403);
  assert.equal((await setFence(an, null, 'null')).status, 403);
  assert.equal(await store.getSetting('geofence', null), null, 'nhân sự không đặt được vùng');
});

test('GPS: kiểm tra giá trị vùng, sai thì 400 và không lưu gì', async () => {
  const adm = await login('admin');
  const bad = [
    { ...FENCE, lat: 90.0001 },
    { ...FENCE, lat: -91 },
    { ...FENCE, lng: 180.5 },
    { ...FENCE, lng: -181 },
    { ...FENCE, radiusM: 19 },
    { ...FENCE, radiusM: 5001 },
    { ...FENCE, maxAccuracyM: 9 },
    { ...FENCE, maxAccuracyM: 1001 },
    { ...FENCE, lat: '10.77' },
    { ...FENCE, radiusM: null },
    { lng: HQ.lng, radiusM: 100 },
    { lat: HQ.lat, radiusM: 100 },
    { lat: HQ.lat, lng: HQ.lng }
  ];
  for (const body of bad) assert.equal((await setFence(adm, body)).status, 400, JSON.stringify(body));
  // 1e400 thành Infinity khi đọc JSON: không được lọt vào
  assert.equal(
    (await setFence(adm, null, `{"lat":1e400,"lng":${HQ.lng},"radiusM":100,"maxAccuracyM":50}`)).status,
    400
  );
  assert.equal(
    (await setFence(adm, null, `{"lat":${HQ.lat},"lng":${HQ.lng},"radiusM":1e400,"maxAccuracyM":50}`)).status,
    400
  );
  assert.equal(await store.getSetting('geofence', null), null, 'giá trị sai không được lưu');
});

test('GPS: lưu vùng hợp lệ, mặc định độ chính xác 100 m; Admin thấy đủ, nhân sự chỉ thấy cờ', async () => {
  const adm = await login('admin'),
    an = await login('an');
  const edge = await setFence(adm, { lat: -90, lng: 180, radiusM: 20, maxAccuracyM: 10 });
  assert.equal(edge.status, 200);
  const r = await setFence(adm, { ...HQ, radiusM: 150 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.geofence, { ...HQ, radiusM: 150, maxAccuracyM: 100 });
  assert.equal((await setFence(adm, FENCE)).status, 200);
  const adminMe = (await call(adm, 'GET', '/api/me')).data;
  assert.equal(adminMe.geofenceRequired, true);
  assert.deepEqual(adminMe.geofence, FENCE);
  const staffMe = (await call(an, 'GET', '/api/me')).data;
  assert.equal(staffMe.geofenceRequired, true);
  assert.ok(!('geofence' in staffMe), 'nhân sự không được thấy toạ độ công ty');
  assert.ok(!JSON.stringify(staffMe).includes(String(HQ.lat)), 'toạ độ công ty không lọt vào phản hồi của nhân sự');
  const staffLogin = await call(null, 'POST', '/api/login', { username: 'an', password: 'test-pass' });
  assert.equal(staffLogin.data.geofenceRequired, true);
  assert.ok(!('geofence' in staffLogin.data));
  const adminLogin = await call(null, 'POST', '/api/login', { username: 'admin', password: 'test-pass' });
  assert.deepEqual(adminLogin.data.geofence, FENCE);
  assert.equal(
    (await call(null, 'GET', '/api/me')).data.geofenceRequired,
    undefined,
    'khách chưa đăng nhập không thấy cờ'
  );
});

test('GPS: Check-in thiếu vị trí hoặc vị trí không hợp lệ vẫn được ghi, kèm cảnh báo GEO_NO_LOCATION', async () => {
  const bn = await login('binh');
  let count = 0;
  for (const loc of [
    undefined,
    null,
    'x',
    {},
    { lat: HQ.lat, lng: HQ.lng },
    { lat: '10.7', lng: HQ.lng, accuracy: 10 },
    { lat: 91, lng: HQ.lng, accuracy: 10 },
    { lat: HQ.lat, lng: 181, accuracy: 10 },
    { lat: HQ.lat, lng: HQ.lng, accuracy: -1 }
  ]) {
    const r = await punchIn(bn, loc);
    assert.equal(r.status, 200, JSON.stringify(loc));
    assert.ok(warned(r, 'GEO_NO_LOCATION'), JSON.stringify(r.data.warnings));
    count += 1;
    assert.equal((await sessionsOf('binh')).length, count);
    assert.equal((await punchOut(bn, r)).status, 200);
  }
});

test('GPS: độ chính xác kém (accuracy > maxAccuracyM) vẫn Check-in được kèm cảnh báo GEO_LOW_ACCURACY; đúng bằng ngưỡng thì không cảnh báo', async () => {
  const bn = await login('binh');
  const before = (await sessionsOf('binh')).length;
  const r = await punchIn(bn, { ...HQ, accuracy: 80.5 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(warned(r, 'GEO_LOW_ACCURACY'), JSON.stringify(r.data.warnings));
  assert.equal((await sessionsOf('binh')).length, before + 1);
  assert.equal((await punchOut(bn, r)).status, 200);
  const edge = await punchIn(bn, { ...HQ, accuracy: 80 });
  assert.equal(edge.status, 200);
  assert.ok(!warned(edge, 'GEO_LOW_ACCURACY'));
  assert.equal((await punchOut(bn, edge)).status, 200);
});

test('GPS: ở ngoài bán kính vẫn Check-in được kèm cảnh báo GEO_OUTSIDE; trong bán kính (kể cả cách 100 m) thì không cảnh báo', async () => {
  const chi = await login('chi');
  const far = await punchIn(chi, { lat: north(151), lng: HQ.lng, accuracy: 10 });
  assert.equal(far.status, 200, JSON.stringify(far.data));
  assert.ok(warned(far, 'GEO_OUTSIDE'), JSON.stringify(far.data.warnings));
  assert.equal((await sessionsOf('chi')).length, 1);
  assert.equal((await punchOut(chi, far)).status, 200);
  const farAway = await punchIn(chi, { lat: 21.0285, lng: 105.8542, accuracy: 5 });
  assert.equal(farAway.status, 200);
  assert.ok(warned(farAway, 'GEO_OUTSIDE'));
  assert.equal((await punchOut(chi, farAway)).status, 200);
  const near = await punchIn(chi, { lat: north(100), lng: HQ.lng, accuracy: 10 });
  assert.equal(near.status, 200);
  assert.ok(!warned(near, 'GEO_OUTSIDE'));
  assert.equal(near.data.openSession.state, 'open');
  assert.equal((await punchOut(chi, near)).status, 200);
});

test('GPS: bán kính 50 m cảnh báo điểm cách 100 m, bán kính 150 m nhận điểm đó không cảnh báo', async () => {
  const adm = await login('admin'),
    an = await login('an');
  const spot = { lat: north(100), lng: HQ.lng, accuracy: 10 };
  assert.equal((await setFence(adm, { ...HQ, radiusM: 50, maxAccuracyM: 50 })).status, 200);
  const outside = await punchIn(an, spot);
  assert.equal(outside.status, 200, JSON.stringify(outside.data));
  assert.ok(warned(outside, 'GEO_OUTSIDE'));
  assert.equal((await punchOut(an, outside)).status, 200);
  assert.equal((await setFence(adm, { ...HQ, radiusM: 150, maxAccuracyM: 50 })).status, 200);
  const r = await punchIn(an, spot);
  assert.equal(r.status, 200);
  assert.ok(!warned(r, 'GEO_OUTSIDE'));
  assert.equal((await punchOut(an, r)).status, 200);
  assert.equal((await setFence(adm, FENCE)).status, 200);
});

test('GPS: Check-out không cần vị trí, kể cả khi đang ở ngoài khu vực', async () => {
  const chi = await login('chi');
  const far = await punchIn(chi, { lat: north(151), lng: HQ.lng, accuracy: 10 });
  assert.equal(far.status, 200, JSON.stringify(far.data));
  const open = await store.openSession('chi');
  assert.ok(open);
  clock = Date.parse('2026-10-07T17:05:00+07:00');
  const r = await call(chi, 'POST', '/api/punch', { type: 'out', requestId: 'geo-test-out-chi-1', sessionId: open.id });
  assert.equal(r.status, 200);
  assert.equal(r.data.openSession, null);
});

test('GPS: không lưu toạ độ, độ chính xác hay khoảng cách ở bất kỳ đâu (DB, phản hồi, thông báo lỗi)', async () => {
  const adm = await login('admin'),
    dm = store.db;
  assert.equal((await setFence(adm, FENCE)).status, 200);
  const staffName = 'giahuy-geo';
  await store.upsertStaff({
    username: staffName,
    name: 'Gia Huy',
    role: 'staff',
    type: 'nv',
    level: 1,
    nightPct: 40,
    shiftCode: 'n1',
    passHash: auth.hashPassword('test-pass')
  });
  clock = Date.parse('2026-10-08T07:55:00+07:00');
  const cookie = await login(staffName);
  const lat = north(37.123456789),
    lng = HQ.lng + 0.000123456,
    accuracy = 12.3456789;
  const responses: any[] = [];
  const ok = await punchIn(cookie, { lat, lng, accuracy });
  assert.equal(ok.status, 200);
  responses.push(ok);
  clock = Date.parse('2026-10-08T17:10:00+07:00');
  const out = await call(cookie, 'POST', '/api/punch', {
    type: 'out',
    requestId: 'geo-test-out-gh-1',
    sessionId: ok.data.openSession.id,
    location: { lat, lng, accuracy } // Check-out không cần, nếu có gửi cũng không được lưu
  });
  assert.equal(out.status, 200);
  responses.push(out);
  clock = Date.parse('2026-10-09T09:10:00+07:00');
  const outsideReply = await punchIn(cookie, { lat: north(5000.987654321), lng, accuracy });
  assert.ok(warned(outsideReply, 'GEO_OUTSIDE'), JSON.stringify(outsideReply.data));
  responses.push(outsideReply);
  assert.equal((await punchOut(cookie, outsideReply)).status, 200);
  clock = Date.parse('2026-10-09T13:20:00+07:00');
  const noAcc = await punchIn(cookie, { lat, lng, accuracy: 999.5 });
  assert.ok(warned(noAcc, 'GEO_LOW_ACCURACY'), JSON.stringify(noAcc.data));
  responses.push(noAcc);
  assert.equal((await punchOut(cookie, noAcc)).status, 200);
  responses.push(await call(cookie, 'GET', '/api/punch'));
  responses.push(await call(cookie, 'GET', '/api/me'));
  responses.push(await call(adm, 'GET', '/api/attendance?month=2026-10'));

  const needles = [String(lat), String(lng), String(accuracy), '37.12', '5000.98', '0.000123456', '12.3456'];
  const forbiddenKeys = /"(lat|lng|latitude|longitude|accuracy|location|distance|distanceM|geo)"/i;
  for (const r of responses) {
    const text = JSON.stringify(r.data);
    for (const n of needles) assert.ok(!text.includes(n), `phản hồi ${r.status} lộ ${n}`);
    assert.ok(!forbiddenKeys.test(text), `phản hồi ${r.status} có khoá vị trí`);
  }
  for (const r of [outsideReply, noAcc])
    for (const w of r.data.warnings)
      assert.ok(!/\d/.test(w.message), 'cảnh báo không chứa số đo (khoảng cách, độ chính xác)');
  // toàn bộ dữ liệu của lượt chấm công: punches, attendance_sessions, punch_requests, corrections, attendance_days
  for (const table of ['punches', 'attendance_sessions', 'punch_requests', 'corrections', 'attendance_days']) {
    const rows = await dm.prepare(`SELECT * FROM ${table}`).all();
    const text = JSON.stringify(rows);
    for (const n of needles) assert.ok(!text.includes(n), `bảng ${table} lộ ${n}`);
    assert.ok(!forbiddenKeys.test(text), `bảng ${table} có khoá vị trí / khoảng cách`);
    for (const row of rows)
      for (const col of Object.keys(row)) assert.ok(!/lat|lng|geo|accur|dist|loc/i.test(col), `cột ${table}.${col}`);
  }
  // và không bảng nào ngoài cấu hình công ty chứa toạ độ nhân sự
  const tables = await dm
    .prepare(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'"
    )
    .all();
  for (const { name } of tables) {
    if (name === 'settings') continue;
    const text = JSON.stringify(await dm.prepare(`SELECT * FROM "${name}"`).all());
    for (const n of needles) assert.ok(!text.includes(n), `bảng ${name} lộ ${n}`);
  }
  const session = await (await sessionsOf(staffName)).at(-1);
  assert.ok(session);
  assert.ok(!JSON.stringify(session).match(forbiddenKeys));
});

test('GPS: tắt bằng null (hoặc { geofence: null }), Check-in không cần vị trí nữa', async () => {
  const adm = await login('admin');
  const offRaw = await setFence(adm, null, 'null');
  assert.equal(offRaw.status, 200);
  assert.equal(offRaw.data.geofence, null);
  assert.equal(await store.getSetting('geofence', 'x'), null);
  assert.equal((await call(adm, 'GET', '/api/me')).data.geofenceRequired, false);
  assert.equal((await call(adm, 'GET', '/api/me')).data.geofence, null);
  clock = Date.parse('2026-10-09T07:55:00+07:00');
  const an = await login('an');
  assert.equal((await call(an, 'GET', '/api/me')).data.geofenceRequired, false);
  const r = await punchIn(an);
  assert.equal(r.status, 200);
  assert.equal(
    (
      await call(an, 'POST', '/api/punch', {
        type: 'out',
        requestId: 'geo-test-out-an-3',
        sessionId: r.data.openSession.id
      })
    ).status,
    200
  );
  // bật lại rồi tắt bằng dạng { geofence: null }
  assert.equal((await setFence(adm, FENCE)).status, 200);
  assert.equal((await call(adm, 'GET', '/api/me')).data.geofenceRequired, true);
  assert.equal((await setFence(adm, { geofence: null })).status, 200);
  assert.equal((await call(adm, 'GET', '/api/me')).data.geofenceRequired, false);
  // thân yêu cầu rỗng hay kiểu lạ không được ngầm hiểu là tắt
  assert.equal((await setFence(adm, FENCE)).status, 200);
  assert.equal((await setFence(adm, {})).status, 400);
  assert.equal((await setFence(adm, null, '"off"')).status, 400);
  assert.equal((await setFence(adm, null, '[]')).status, 400);
  assert.deepEqual(await store.getSetting('geofence', null), FENCE, 'yêu cầu sai không làm tắt vùng');
});

test('GPS: gửi lại cùng requestId trả đúng kết quả cũ, không kiểm vị trí lần nữa', async () => {
  const adm = await login('admin');
  assert.equal((await setFence(adm, FENCE)).status, 200);
  clock = Date.parse('2026-10-10T07:55:00+07:00');
  const an = await login('an');
  const body = { type: 'in', requestId: 'geo-test-replay-1', location: { ...HQ, accuracy: 10 } };
  const first = await call(an, 'POST', '/api/punch', body);
  assert.equal(first.status, 200);
  const again = await call(an, 'POST', '/api/punch', { ...body, location: { lat: 21, lng: 105, accuracy: 10 } });
  assert.equal(again.status, 200);
  assert.deepEqual(again.data, first.data);
  assert.equal((await sessionsOf('an')).filter(s => s.date === '2026-10-10').length, 1);
});
