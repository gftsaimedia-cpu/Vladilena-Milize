// Kiểm tra check-in / check-out qua API thật, DB tạm, đồng hồ giả: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');

require('../helpers/require-isolated-database');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth'),
  server = require('../helpers/server');
const sessionBody = require('../helpers/session-contract-helper');
const recordedDay = async (u?, date?) =>
  (await (await store.listSessions({ username: u, date })).at(-1))?.entry || null;

let base,
  clock = Date.parse('2026-10-07T07:00:00+07:00');
const realNow = Date.now;
const at = (s?) => {
  clock = Date.parse(s + '+07:00');
}; // đặt đồng hồ giả theo giờ VN
async function call(cookie?, method?, url?, body?) {
  body = await sessionBody(store, await auth.readSession(cookie), method, url, body);
  // Check-in trễ / ngoài ca cần giải trình lúc bấm; ở đây chỉ là đầu vào nên luôn kèm (lần bấm hợp lệ bỏ qua câu này)
  if (url === '/api/punch' && method === 'POST' && body && body.type === 'in' && body.explanation === undefined)
    body = { ...body, explanation: 'Giải trình lúc bấm' };
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return {
    status: r.status,
    data: (await r.json().catch(() => ({}))) as any,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0]
  };
}
const login = async (u?) => (await call(null, 'POST', '/api/login', { username: u, password: 'test-pass' })).cookie;
const day = (u?, date?) => recordedDay(u, date);
const estimate = async (u?, date?) => (await store.getSheet(u, date.slice(0, 7))).days[date];

before(async () => {
  Date.now = () => clock;
  for (const s of [
    { username: 'admin', name: 'Admin', role: 'admin', type: 'tts', level: 0 },
    { username: 'an', name: 'An', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' },
    { username: 'dem', name: 'Đêm', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'g2' },
    { username: 'tudo', name: 'Chưa gán ca', role: 'staff', type: 'nv', level: 1 }
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

test('Check-in luôn bật (23/10/2026: bỏ ngày bắt đầu Check-in): GET /punch báo enabled true; giờ làm vẫn tự khai được', async () => {
  const an = await login('an');
  await at('2026-10-06T07:58:00');
  const state = await call(an, 'GET', '/api/punch');
  assert.equal(state.data.enabled, true);
  assert.equal(state.data.from, undefined);
  const w = { kind: 'work', in: '08:00', out: '17:00' };
  assert.equal(
    (
      await call(an, 'PUT', '/api/sheet', {
        month: '2026-10',
        days: {
          '2026-10-03': w,
          '2026-10-05': w,
          '2026-10-09': {
            kind: 'willmakeup',
            makeupPlans: [{ date: '2026-10-13', from: '08:00', to: '17:00' }]
          }
        }
      })
    ).status,
    200
  );
  // xong thì Check-out để không ảnh hưởng bài sau
  const inRes = await call(an, 'POST', '/api/punch', { type: 'in' });
  assert.equal(inRes.status, 200, JSON.stringify(inRes.data));
  await at('2026-10-06T17:05:00');
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'out' })).status, 200);
  assert.equal((await estimate('an', '2026-10-05')).kind, 'work', 'lịch ước tính không đổi vì Check-in');
});

test('PUT /api/settings/checkin đã xoá (23/10/2026): mặc định từ chối 403 cả với Admin, không đổi gì', async () => {
  const adm = await login('admin');
  const before = JSON.stringify(await store.getSheet('an', '2026-10'));
  for (const body of [{ from: '2026-10-05' }, { from: null }, {}]) {
    const r = await call(adm, 'PUT', '/api/settings/checkin', body);
    assert.equal(r.status, 403, JSON.stringify(body));
    assert.equal(r.data.code, 'NO_ROUTE_POLICY');
  }
  assert.equal(JSON.stringify(await store.getSheet('an', '2026-10')), before);
  assert.equal(await store.getSetting('checkin_from', null), null, 'không còn cài đặt checkin_from');
});

test('check-in → check-out gửi giờ có mặt riêng cho Admin, không tạo ngày lương', async () => {
  const an = await login('an');
  const original = await store.getSheet('an', '2026-10');
  await at('2026-10-07T07:58:00');
  let r = await call(an, 'POST', '/api/punch', { type: 'in' });
  assert.equal(r.status, 200);
  assert.equal(r.data.open.since, '07:58');
  assert.equal((await day('an', '2026-10-07')).reason, 'open'); // đang trong ca
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'in' })).status, 409); // bấm trùng
  await at('2026-10-07T17:40:00');
  // Check-out muộn 40 phút sau giờ hết ca 17:00 (quá CHECKOUT_GRACE_MIN): phải giải trình, giờ ra chỉ tính khi Admin duyệt
  // (src/domain/explanation/late-checkout-session.ts)
  r = await call(an, 'POST', '/api/punch', { type: 'out' });
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  r = await call(an, 'POST', '/api/punch', { type: 'out', explanation: 'Họp cuối ngày' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.done, null);
  assert.equal(r.data.pending, 'forgot-out');
  assert.equal((await day('an', '2026-10-07')).presOut, undefined, 'giờ ra chưa được áp khi chưa duyệt');
  const adm = await login('admin');
  const late = (await call(adm, 'GET', '/api/explanations?status=answered&user=an')).data.items.find(
    x => x.kind === 'late-checkout'
  );
  assert.ok(late);
  const decided = await call(adm, 'POST', `/api/explanations/${late.id}/decide`, { approve: true });
  assert.equal(decided.status, 200, JSON.stringify(decided.data));
  assert.deepEqual((await call(an, 'GET', '/api/punch')).data.done, { in: '07:58', out: '17:40' });
  const d = await day('an', '2026-10-07');
  assert.equal(d.kind, 'work');
  assert.equal(d.in, '08:00');
  assert.equal(d.out, '17:00');
  assert.equal(d.src, 'punch');
  assert.deepEqual(await store.getSheet('an', '2026-10'), original);
  const saved = (await call(an, 'GET', '/api/sheet?month=2026-10')).data;
  assert.equal(saved.days['2026-10-07'], undefined);
  assert.deepEqual(saved.attendanceSessions.find(s => s.date === '2026-10-07')?.entry, d);
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'out' })).status, 409); // chưa check-in
  assert.equal((await store.listSessions({ username: 'an', date: '2026-10-07' })).length, 1);
  assert.deepEqual((await store.listSessions({ username: 'an', date: '2026-10-07' }))[0].entry, d);
});

test('PUT /sheet: vẫn tự sửa, xoá ngày và ước tính OT độc lập với khoảng check-in/out', async () => {
  // Nhân sự chưa gán ca cố định (shiftCode null) tự khai giờ được; người có ca thì bị khoá giờ theo ca (sheet-shift-lock.test.ts)
  const tudo = await login('tudo');
  await at('2026-10-07T07:58:00');
  // Lượt đã đóng ngoài ca của người chưa gán ca: có mặt 07:58–17:40, chờ xử lý
  await store.createSession('tudo', '2026-10-07', 'closed', {
    kind: 'pending',
    reason: 'off-shift',
    src: 'punch',
    outsideShift: true,
    presIn: '2026-10-07T00:58:00.000Z',
    presOut: '2026-10-07T10:40:00.000Z'
  });
  const days = (await store.getSheet('tudo', '2026-10')).days;
  const recorded = await day('tudo', '2026-10-07');
  assert.ok(recorded, 'đã có giờ check-in/out gửi Admin');
  const put = (d?) => call(tudo, 'PUT', '/api/sheet', { month: '2026-10', days: d });
  const manual = { kind: 'work', in: '08:00', out: '16:00' };
  assert.equal((await put({ ...days, '2026-10-07': manual })).status, 200);
  assert.equal((await estimate('tudo', '2026-10-07')).out, '16:00');
  assert.equal(
    (await put({ ...days, '2026-10-07': { ...manual, out: '17:00', extraKind: 'ot', extraOut: '18:00' } })).status,
    200
  );
  assert.equal((await estimate('tudo', '2026-10-07')).extraOut, '18:00'); // được ước tính sau lúc đã check-out 17:40
  assert.equal((await put(days)).status, 200);
  assert.equal(await estimate('tudo', '2026-10-07'), undefined);
  assert.equal((await put({ ...days, '2026-10-07': { kind: 'unpaid' } })).status, 200);
  assert.equal((await put({ ...days, '2026-10-06': { kind: 'work', in: '08:00', out: '17:00' } })).status, 200);
  assert.equal(
    (
      await put({
        ...days,
        '2026-10-06': {
          kind: 'willmakeup',
          makeupPlans: [{ date: '2026-10-14', from: '08:00', to: '17:00' }]
        }
      })
    ).status,
    200
  ); // chọn nghỉ vẫn được
  assert.equal((await put({ ...days, '2026-10-02': { kind: 'pending' } })).status, 400); // không giả ngày "chờ xử lý"
  assert.deepEqual(await day('tudo', '2026-10-07'), recorded, 'sửa lịch ước tính không sửa giờ đã gửi Admin');
  await at('2026-10-07T18:00:00');
});

test('quên check-out: quá 16 tiếng tự đóng, không bịa giờ ra và không ghi lịch ước tính', async () => {
  const an = await login('an');
  const original = await store.getSheet('an', '2026-10');
  await at('2026-10-08T08:02:00');
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'in' })).status, 200);
  await at('2026-10-09T00:30:00'); // 16 tiếng 28 phút sau
  assert.equal((await call(an, 'GET', '/api/punch')).data.open, null);
  assert.equal((await day('an', '2026-10-08')).reason, 'forgot-out');
  assert.equal((await day('an', '2026-10-08')).presOut, undefined);
  assert.deepEqual(await store.getSheet('an', '2026-10'), original, 'tự đóng lượt không ghi lịch ước tính');
});

test('ca đêm qua 0 giờ giữ ngày ca; Chủ nhật ngoài lịch không Check-in được', async () => {
  const dem = await login('dem');
  await at('2026-10-08T00:30:00');
  assert.equal((await call(dem, 'POST', '/api/punch', { type: 'in' })).status, 200);
  await at('2026-10-08T07:05:00');
  assert.equal((await call(dem, 'POST', '/api/punch', { type: 'out' })).status, 200);
  assert.equal((await day('dem', '2026-10-07')).kind, 'pending');
  assert.equal((await day('dem', '2026-10-07')).reason, 'incomplete-shift');
  assert.equal((await day('dem', '2026-10-07')).plannedShift.in, '22:00');
  assert.equal(await day('dem', '2026-10-08'), null);
  await at('2026-10-11T21:55:00'); // tối Chủ nhật → ca bắt đầu Chủ nhật, ngoài lịch và không có OT / làm bù được duyệt
  const sunday = await call(dem, 'POST', '/api/punch', { type: 'in' });
  assert.equal(sunday.status, 409);
  assert.match(sunday.data.error, /không có lịch làm việc/);
  assert.equal(await day('dem', '2026-10-11'), null, 'lượt bị từ chối không được ghi');
});

test('Admin: trang Hôm nay hiện lượt đang mở, giờ vào và số phút đi trễ', async () => {
  await at('2026-10-12T08:15:00'); // thứ 2
  const an = await login('an');
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'in' })).status, 200);
  const adm = await login('admin');
  const rowAn = (await call(adm, 'GET', '/api/today')).data.rows.find(x => x.username === 'an');
  assert.equal(rowAn.open, true);
  assert.equal(rowAn.in, '08:15');
  assert.equal(rowAn.late, 15);
});

// Không có chức năng sửa giờ Check-in/out: bảng corrections và dòng sẵn có giữ nguyên, nhân viên vẫn đọc lịch sử qua /sheet; mọi đường ghi bị từ chối
test('lịch sử điều chỉnh cũ chỉ đọc: nhân viên thấy qua /sheet, /api/corrections bị từ chối và không đổi dữ liệu', async () => {
  const an = await login('an');
  const historical = await store.addCorrection({
    username: 'an',
    date: '2026-10-08',
    reqIn: '2026-10-08T01:02:00.000Z',
    reqOut: '2026-10-08T10:05:00.000Z',
    reason: 'Quên bấm check-out'
  });
  await store.decideCorrection(historical, 'approved', 'admin', null);
  const originalAttendance = await store.listSessions(),
    originalCorrections = await store.listCorrections();
  const sheetsOfAll = async () => {
    const out: any[] = [];
    for (const s of await store.listStaff())
      out.push({ username: s.username, sheets: await store.listSheets(s.username) });
    return out;
  };
  const originalSheets = await sheetsOfAll();
  const payload = { date: '2026-10-09', in: '08:00', out: '17:00', reason: 'Thử sửa giờ' };
  for (const body of [payload, { ...payload, user: 'an', approve: true }, { ...payload, user: 'dem', approve: true }]) {
    const r = await call(an, 'POST', '/api/corrections', body);
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'NO_ROUTE_POLICY');
  }
  assert.equal((await call(an, 'PUT', `/api/corrections/${historical}`, { action: 'approve' })).status, 403);
  assert.equal((await call(an, 'GET', '/api/corrections')).status, 403);
  const sheet = (await call(an, 'GET', '/api/sheet?month=2026-10')).data;
  assert.ok(sheet.corrections.some(c => c.id === historical && c.status === 'approved'));
  assert.ok(sheet.corrections.every(c => c.username === 'an'));
  assert.deepEqual(await store.listSessions(), originalAttendance);
  assert.deepEqual(await store.listCorrections(), originalCorrections);
  assert.deepEqual(await sheetsOfAll(), originalSheets);
});

test('OT tự khai chỉ là ước tính, không tự tạo yêu cầu duyệt hoặc sửa dữ liệu Admin', async () => {
  const an = await login('an'),
    adm = await login('admin');
  await at('2026-10-14T07:50:00');
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'in' })).status, 200);
  await at('2026-10-14T19:10:00'); // muộn quá mức cho phép: giải trình gửi kèm, lượt chờ Admin duyệt
  assert.equal((await call(an, 'POST', '/api/punch', { type: 'out', explanation: 'Làm thêm' })).status, 200);
  const recorded = await day('an', '2026-10-14');
  const days = async () => (await store.getSheet('an', '2026-10')).days,
    put = (d?) => call(an, 'PUT', '/api/sheet', { month: '2026-10', days: d });
  const withOt = async (x?) => ({
    ...(await days()),
    '2026-10-14': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', ...x }
  });
  assert.equal((await put(await withOt({ extraOut: '19:00', otReview: { ok: true } }))).status, 200);
  assert.equal((await estimate('an', '2026-10-14')).otReview, undefined);
  assert.equal((await estimate('an', '2026-10-14')).src, undefined);
  assert.equal((await estimate('an', '2026-10-14')).extraOut, '19:00');
  assert.equal((await call(an, 'GET', '/api/ot')).status, 403);
  assert.ok(!(await call(adm, 'GET', '/api/ot')).data.ot.some(x => x.username === 'an' && x.date === '2026-10-14'));
  assert.equal(
    (await call(adm, 'GET', '/api/team?month=2026-10')).data.rows.find(x => x.staff.username === 'an').pendingOt,
    0
  );
  assert.equal((await call(adm, 'PUT', '/api/ot', { user: 'an', date: '2026-10-14', action: 'approve' })).status, 404);
  assert.equal((await put(await withOt({ extraOut: '18:30' }))).status, 200);
  assert.equal((await estimate('an', '2026-10-14')).extraOut, '18:30');
  assert.deepEqual(await day('an', '2026-10-14'), recorded);
});

test('Admin xem được lịch sử check-in/out cả tháng; tài khoản nhân viên không xem của người khác', async () => {
  const an = await login('an'),
    adm = await login('admin');
  assert.equal((await call(null, 'GET', '/api/attendance?month=2026-10')).status, 401);
  assert.equal((await call(an, 'GET', '/api/attendance?month=2026-10')).status, 403);
  assert.equal((await call(adm, 'GET', '/api/attendance?month=wrong')).status, 400);
  const r = await call(adm, 'GET', '/api/attendance?month=2026-10');
  assert.equal(r.status, 200);
  const a = r.data.rows.find(x => x.username === 'an' && x.date === '2026-10-07');
  assert.equal(a.name, 'An');
  assert.equal(a.entry.presIn, '2026-10-07T00:58:00.000Z');
  assert.equal(a.entry.presOut, '2026-10-07T10:40:00.000Z');
  assert.ok(r.data.rows.some(x => x.username === 'dem' && x.date === '2026-10-07'));
  assert.ok(
    !r.data.rows.some(x => x.username === 'an' && x.date === '2026-10-05'),
    'ngày tự khai không có check-in không giả thành bản ghi Admin'
  );
  assert.deepEqual((await call(adm, 'GET', '/api/attendance?month=2026-11')).data.rows, []);
});

test('ca đêm khai OT trong lịch ước tính: lưu được và vẫn giới hạn 12 giờ ròng/ngày', async () => {
  const dem = await login('dem');
  const put = (d?) => call(dem, 'PUT', '/api/sheet', { month: '2026-11', days: d });
  const night = { kind: 'work', in: '22:00', out: '07:00', extraKind: 'ot' };
  assert.equal((await put({ '2026-11-04': { ...night, extraOut: '09:00' } })).status, 200);
  assert.equal((await store.getSheet('dem', '2026-11')).days['2026-11-04'].extraKind, 'ot');
  const tooLong = await put({ '2026-11-04': { ...night, extraOut: '13:00' } }); // ca 8 giờ ròng + 6 giờ OT = 14 giờ
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.data.error, /tối đa 12 giờ một ngày/);
  assert.equal((await put({ '2026-11-04': { ...night, extraIn: '20:00', extraOut: '' } })).status, 200); // OT trước giờ vào, ngoài khung 22h–6h
  assert.equal(
    (
      await put({
        '2026-11-04': { ...night, extraIn: '21:00', extraOut: '' },
        '2026-11-05': { ...night, extraOut: '06:30' }
      })
    ).status,
    400
  ); // OT vẫn không được rơi vào 22h–6h
});

test('làm bù trước rồi nghỉ vào ngày làm việc cuối tháng vẫn lưu được', async () => {
  const an = await login('an');
  const ahead = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '21:00' };
  const days = {
    '2026-11-02': ahead,
    '2026-11-03': ahead,
    '2026-11-30': {
      kind: 'willmakeup',
      makeupPlans: [{ date: '2026-11-27', from: '08:00', to: '17:00' }]
    }
  }; // 30/11/2026 là thứ Hai cuối tháng
  assert.equal((await call(an, 'PUT', '/api/sheet', { month: '2026-11', days })).status, 200);
  assert.equal((await estimate('an', '2026-11-30')).kind, 'willmakeup');
  assert.equal((await estimate('an', '2026-11-02')).extraOut, '21:00');
});
