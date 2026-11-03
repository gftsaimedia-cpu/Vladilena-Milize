'use strict';
// Ma trận quyền:
//   - tài khoản `admin` hiện có giữ TOÀN BỘ năng lực: mọi route chỉ-Admin cho Admin vào (không 401, không 403);
//   - nhân sự (role `staff`) bị 403 ở mọi route chỉ-Admin và không đọc được dữ liệu của người khác; chưa đăng nhập bị 401.
// Nhóm 1 kiểm hợp đồng quyền ở tầng HTTP; nhóm 2 kiểm khung năng lực của src/platform/authz.ts (ROLE_CAPS, ROUTE_CAPS).
const F = require('../helpers/api-fixture'); // xác nhận database test tạm trước khi require src/platform/db
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pending, need, ROOT } = require('../helpers/red');
const { serverSource, routeKeysInSource, adminRouteKeysInSource } = require('../helpers/server-source');

const { store } = F;
before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('worker');
  await F.person('other');
});

/* ================= nhóm 1: hợp đồng quyền ở tầng HTTP ================= */
// Route chỉ-Admin của server.js (handler gọi needAdmin() đầu tiên), kèm yêu cầu tối thiểu. Với Admin, mã nào ngoài 401 và 403 đều chấp nhận
// (400 hoặc 404 vì dữ liệu mẫu, 200): chỉ kiểm quyền, không kiểm nghiệp vụ. Tên đăng nhập không tồn tại để không đổi dữ liệu thật của test.
const ADMIN_ONLY: any[] = [
  ['PUT', '/holidays', { dates: [] }],
  ['PUT', '/sheet/bulk', {}],
  ['GET', '/kpi/scores?month=2026-10'],
  ['PUT', '/kpi/scores', { user: 'qa_nobody', month: '2026-10', scores: { wework: 80 } }],
  ['GET', '/approvals'],
  ['GET', '/approvals/count'],
  ['GET', '/alerts'],
  ['PUT', '/approvals/decide', { action: 'approve', items: [] }],
  ['GET', '/slip-override?user=qa_nobody&month=2026-10'],
  ['PUT', '/slip-override', { user: 'qa_nobody', month: '2026-10', values: {} }],
  ['GET', '/ot'],
  ['POST', '/ot', {}],
  ['PUT', '/ot', {}],
  ['GET', '/today'],
  ['GET', '/attendance?month=2026-10'],
  ['PUT', '/settings/geofence', { lat: 'x' }],
  ['GET', '/staff'],
  ['GET', '/team?month=2026-10'],
  ['PUT', '/staff/qa_nobody', {}],
  ['GET', '/roles'],
  ['PUT', '/staff/qa_nobody/roles', { roles: ['staff'], reason: 'Thử quyền của route vai trò' }],
  ['POST', '/staff/qa_nobody/password', { password: 'MatKhau-Thu-12345' }],
  ['PUT', '/staff/shift-bulk', {}]
];
const keyOf = ([method, url]: any) => `${method} ${'/' + url.slice(1).split('?')[0].split('/').slice(0, 2).join('/')}`;
const adminOnlyKeys = new Set<any>(ADMIN_ONLY.map(keyOf).map(k => k.replace(/\/(qa_nobody|999999)$/, '/:id')));

test('permissions-matrix: mọi route chỉ-Admin trong server.js có mặt trong bảng của test này (thêm route Admin mới mà quên thì đỏ)', () => {
  const source = serverSource(); // mã máy chủ: server.js, lib/routes và src/domain
  const lines = source.split('\n');
  // khoá có tham số của nhóm /staff/:u (hồ sơ, vai trò, mật khẩu) gom về 'METHOD /staff/:id' như keyOf ở trên
  const found = new Set<any>(
    [...adminRouteKeysInSource(source)].map(k => k.replace(/^(\w+) \/staff\/:u(\/.*)?$/, '$1 /staff/:id'))
  );
  assert.ok(found.size >= 19, `chỉ nhận ra ${found.size} route chỉ-Admin: mẫu nhận dạng đã lỗi thời`);
  assert.deepEqual(
    [...found].filter(k => !adminOnlyKeys.has(k)),
    [],
    'route chỉ-Admin chưa có trong ADMIN_ONLY của test'
  );
});

for (const [method, url, body] of ADMIN_ONLY)
  test(`permissions-matrix: ${method} /api${url.split('?')[0]}: Admin vào được, nhân sự bị 403, chưa đăng nhập bị 401`, async () => {
    const got = {
      anonymous: (await F.call(method, url, { who: null, body })).status,
      staff: (await F.call(method, url, { who: 'worker', body })).status
    };
    assert.deepEqual(got, { anonymous: 401, staff: 403 });
    const admin = await F.call(method, url, { who: 'admin', body });
    assert.ok(![401, 403].includes(admin.status), `Admin bị chặn: ${admin.status} ${JSON.stringify(admin.data)}`);
  });

test('permissions-matrix: nhân sự không đọc được lịch, đối soát hay điều chỉnh của người khác; Admin đọc được của mọi người', async () => {
  await store.setSheet('other', '2026-10', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } });
  const own = await F.call('GET', '/sheet?month=2026-10', { who: 'worker' });
  assert.equal(own.status, 200);
  const foreign = await F.call('GET', '/sheet?month=2026-10&user=other', { who: 'worker' });
  assert.equal(foreign.status, 403, JSON.stringify(foreign.data));
  assert.ok(!JSON.stringify(foreign.data).includes('2026-10-07'), 'phản hồi 403 không được lộ lịch của người khác');
  assert.equal((await F.call('GET', '/sheet?month=2026-10&user=other', { who: 'admin' })).status, 200);
  // nhân sự không ghi được lịch của người khác: PUT /api/sheet nhận user; người không có quyền
  // duyệt gửi user của người khác thì bị 403 và không lưu gì.
  const before = JSON.stringify(await store.getSheet('other', '2026-10'));
  const mine = JSON.stringify(await store.getSheet('worker', '2026-10'));
  const day = { kind: 'work', in: '08:00', out: '17:00' };
  const write = await F.call('PUT', '/sheet', {
    who: 'worker',
    body: { month: '2026-10', user: 'other', days: { '2026-10-08': day } }
  });
  assert.equal(write.status, 403, JSON.stringify(write.data));
  assert.equal(JSON.stringify(await store.getSheet('other', '2026-10')), before, 'lịch của người khác không được đổi');
  assert.equal(
    JSON.stringify(await store.getSheet('worker', '2026-10')),
    mine,
    'bị từ chối thì lịch của chính họ cũng không đổi'
  );
  // không gửi user: ghi vào lịch của chính mình
  const saved = await F.call('PUT', '/sheet', {
    who: 'worker',
    body: { month: '2026-10', days: { '2026-10-08': day } }
  });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(await store.getSheet('other', '2026-10')), before);
  assert.ok((await store.getSheet('worker', '2026-10')).days['2026-10-08'], 'lịch của chính mình được lưu');
});

test('permissions-matrix: GET /api/me của Admin và nhân sự giữ các trường hôm nay; chưa đăng nhập thì user là null', async () => {
  const admin = await F.call('GET', '/me', { who: 'admin' });
  const staff = await F.call('GET', '/me', { who: 'worker' });
  const anon = await F.call('GET', '/me', { who: null });
  assert.equal(admin.data.user.role, 'admin');
  assert.equal(staff.data.user.role, 'staff');
  assert.equal(anon.data.user, null);
  for (const res of [admin, staff]) assert.ok('holidays' in res.data);
});

/* ================= nhóm 2: khung năng lực (src/platform/authz.ts) ================= */
// Danh sách năng lực (request.decide.<nhóm> là họ khoá có khuôn; request.config nằm trong config.payroll)
const CAPABILITIES = [
  'profile.read',
  'profile.write',
  'profile.read.pii',
  'profile.sensitive.read',
  'profile.sensitive.write',
  'contract.read',
  'contract.write',
  'salary.read',
  'salary.write',
  'attendance.read',
  'attendance.correct',
  'attendance.lock',
  'attendance.import',
  'kpi.score.write',
  'payroll.view',
  'payroll.calculate',
  'payroll.approve',
  'payroll.override',
  'payroll.pay',
  'period.reopen',
  'period.reopen.inputs',
  'config.read',
  'config.payroll',
  'config.legal',
  'config.profile',
  'audit.read',
  'report.read',
  'report.export',
  'roles.manage',
  'staff.lock'
];
// Năng lực mà nhân sự thường KHÔNG được có (nhân sự chỉ có phạm vi "tự mình" cho hồ sơ, chấm công, lương; không gì khác)
const SELF_ONLY = new Set<any>(['profile.read', 'attendance.read', 'salary.read', 'payroll.view', 'contract.read']);
const authzReady = pending('V1-A bước 3: src/platform/authz.ts chưa có', 'src/platform/authz.ts');

// ROLE_CAPS[vai trò] có thể là mảng, Set hoặc '*' (toàn quyền); chuẩn hoá thành hàm kiểm
function hasCap(roleCaps?, cap?) {
  if (roleCaps === '*') return true;
  const list = roleCaps instanceof Set ? [...roleCaps] : Array.isArray(roleCaps) ? roleCaps : [];
  return list.includes('*') || list.includes(cap) || list.some(c => c.endsWith('.*') && cap.startsWith(c.slice(0, -1)));
}

test('permissions-matrix: src/platform/authz.ts xuất ROLE_CAPS, ROUTE_CAPS và can(me, cap, target)', authzReady, () => {
  const authz = need('src/platform/authz.ts');
  assert.equal(typeof authz.can, 'function', 'can(me, cap, target)');
  assert.ok(authz.ROLE_CAPS && typeof authz.ROLE_CAPS === 'object', 'ROLE_CAPS');
  assert.ok(authz.ROUTE_CAPS && typeof authz.ROUTE_CAPS === 'object', 'ROUTE_CAPS');
  assert.ok('admin' in authz.ROLE_CAPS && 'staff' in authz.ROLE_CAPS, 'ROLE_CAPS cần ít nhất vai trò admin và staff');
});

test(
  'permissions-matrix: vai trò admin có mọi năng lực của TK 10.2 (tài khoản admin hiện có giữ nguyên quyền)',
  authzReady,
  async () => {
    const { can, ROLE_CAPS } = need('src/platform/authz.ts');
    const admin = await store.getStaff('admin');
    const missing = CAPABILITIES.filter(cap => !hasCap(ROLE_CAPS.admin, cap) || !can(admin, cap));
    assert.deepEqual(missing, []);
    assert.ok(can(admin, 'request.decide.leave') && can(admin, 'request.decide.isat'), 'request.decide.<nhóm>');
  }
);

test(
  'permissions-matrix: nhân sự (role staff) chỉ có năng lực "tự mình", mọi năng lực quản trị bị từ chối',
  authzReady,
  async () => {
    const { can, ROLE_CAPS } = need('src/platform/authz.ts');
    const staff = await store.getStaff('worker');
    const leaked: any[] = [];
    for (const cap of CAPABILITIES)
      if (!SELF_ONLY.has(cap) && (hasCap(ROLE_CAPS.staff, cap) || (await can(staff, cap)))) leaked.push(cap);
    assert.deepEqual(leaked, [], 'nhân sự có năng lực quản trị');
    assert.ok(!(await can(staff, 'request.decide.leave')), 'nhân sự không duyệt yêu cầu');
  }
);

test(
  'permissions-matrix: năng lực phạm vi "tự mình": nhân sự đọc được hồ sơ và chấm công của chính mình, không của người khác',
  authzReady,
  async () => {
    const { can } = need('src/platform/authz.ts');
    const me = await store.getStaff('worker');
    for (const cap of ['profile.read', 'attendance.read']) {
      assert.equal(await can(me, cap, { username: 'worker' }), true, `${cap} của chính mình`);
      assert.equal(await can(me, cap, { username: 'other' }), false, `${cap} của người khác`);
    }
    const admin = await store.getStaff('admin');
    assert.equal(await can(admin, 'attendance.read', { username: 'other' }), true);
  }
);

test(
  'permissions-matrix: mọi route của server.js có chính sách trong ROUTE_CAPS (route không có thì 403 NO_ROUTE_POLICY)',
  authzReady,
  () => {
    const { ROUTE_CAPS } = need('src/platform/authz.ts');
    const routes = routeKeysInSource(); // `route === '…'` hoặc mục bảng `'GET /x': async …` trong mã máy chủ
    assert.ok(routes.size >= 30, `chỉ tìm thấy ${routes.size} route trong mã máy chủ`);
    // route có tham số (staff/:username …) do server.js dò bằng seg[...] nên không kiểm khoá của chúng ở đây
    const missing = [...routes].filter(r => !Object.hasOwn(ROUTE_CAPS, r));
    assert.deepEqual(missing, []);
  }
);

test(
  'permissions-matrix: mỗi năng lực nêu trong ROUTE_CAPS là năng lực đã biết và admin có nó (cho cả dạng "self-or:<năng lực>")',
  authzReady,
  () => {
    const { ROUTE_CAPS, ROLE_CAPS } = need('src/platform/authz.ts');
    const known = new Set<any>(CAPABILITIES);
    const problems: any[] = [];
    for (const [route, entry] of Object.entries<any>(ROUTE_CAPS)) {
      if (!entry || entry.public || !entry.cap) continue;
      for (const raw of [].concat(entry.cap)) {
        const cap = String(raw).replace(/^self-or:/, '');
        const wildcard = /^request\.decide\./.test(cap) || cap === 'request.config';
        if (!known.has(cap) && !wildcard) problems.push(`${route}: năng lực lạ ${cap}`);
        else if (!hasCap(ROLE_CAPS.admin, cap)) problems.push(`${route}: admin không có ${cap}`);
      }
    }
    assert.deepEqual(problems, []);
  }
);

test(
  'permissions-matrix: GET /api/me trả roles, caps và payrollSubject (admin cũ không là nhân sự được trả lương)',
  authzReady,
  async () => {
    // roles, caps, payrollSubject có thể nằm ở gốc phản hồi hoặc trong `user`
    const flat = (data?) => ({ ...(data.user || {}), ...data });
    const admin = flat((await F.call('GET', '/me', { who: 'admin' })).data);
    const staff = flat((await F.call('GET', '/me', { who: 'worker' })).data);
    assert.ok(Array.isArray(admin.roles) && admin.roles.includes('admin'), JSON.stringify(admin).slice(0, 200));
    assert.ok(
      Array.isArray(admin.caps) && CAPABILITIES.every(c => admin.caps.includes(c)),
      'admin thiếu năng lực trong caps'
    );
    assert.equal(admin.payrollSubject, false);
    assert.ok(Array.isArray(staff.roles) && staff.roles.includes('staff'));
    assert.ok(!staff.caps.includes('payroll.approve') && !staff.caps.includes('config.payroll'));
    assert.equal(staff.payrollSubject, true);
  }
);
