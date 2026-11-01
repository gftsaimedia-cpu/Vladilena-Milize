'use strict';
// Vai trò và gán ca hàng loạt (server.js → GET /roles, PUT /staff/:u/roles, PUT /staff/shift-bulk; src/platform/db.ts → store.roles; src/platform/events.ts → roles.changed):
//   GET /api/roles          cần roles.manage: { roles:[{id,caps,scope}], caps, staff:[{username,name,roles,rev,locked}] }, không có số liệu lương
//   PUT /api/staff/:u/roles { roles, reason 10–300, expectedRev? } → { username, roles, granted, revoked, rev }; một dòng nhật ký role.grant / role.revoke cho mỗi vai trò đổi
//   PUT /api/staff/shift-bulk { usernames, preset | in+out, effective?, reason } → { ok, shiftCode, updated, unchanged }; tất cả hoặc không
// staff_roles và audit_log là bảng chỉ-thêm-dòng nên mỗi test dùng tên đăng nhập riêng. Chỉ người bịa (qa_*).
const http = require('node:http');
const F = require('../helpers/api-fixture');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const events = require('../../src/platform/events');
const authz = require('../../src/platform/authz');
const auth = require('../../src/platform/auth');
const config = require('../../src/platform/config');
const PunchRules = require('../../src/engine/punch');

const { store } = F;

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
});
after(F.stop);
afterEach(() => {
  events.closeAll();
});

const staff = async (username?, extra: any = {}) =>
  await F.person(username, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05', ...extra });
const putRoles = async (username?, body?, who = 'admin') =>
  await F.call('PUT', `/staff/${username}/roles`, { who, body });
const shiftBulk = async (body?, who = 'admin') => await F.call('PUT', '/staff/shift-bulk', { who, body });
const REASON = 'Phân quyền theo quyết định tháng này';
const auditOf = async (like?, entity?) =>
  await store.db
    .prepare('SELECT * FROM audit_log WHERE action LIKE ? AND entity_id LIKE ? ORDER BY id')
    .all(like, entity || '%');

/* ================= GET /api/roles ================= */
test('GET /api/roles: Admin nhận { roles:[{id,caps,scope}], caps, staff:[{username,name,roles,rev,locked}] }; nhân sự 403, chưa đăng nhập 401; không lộ số liệu lương', async () => {
  await staff('qa_list1');
  const res = await F.call('GET', '/roles');
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  // Hợp đồng mở rộng (vai trò tuỳ chỉnh, ma trận khu vực): thêm khoá, giữ nguyên caps, roles, staff
  for (const key of ['caps', 'roles', 'staff']) assert.ok(Object.hasOwn(res.data, key), key);
  assert.deepEqual(res.data.roles.map(r => r.id).sort(), Object.keys(authz.ROLE_CAPS).sort(), 'đủ mọi vai trò đã biết');
  for (const role of res.data.roles) {
    for (const key of ['caps', 'id', 'scope']) assert.ok(Object.hasOwn(role, key), key);
    assert.deepEqual(role.caps, [...authz.ROLE_CAPS[role.id]]);
    assert.equal(role.scope, authz.ROLE_SCOPE[role.id] || null);
  }
  assert.ok(res.data.caps.includes('roles.manage') && res.data.caps.includes(authz.DECIDE_ALL));
  const mine = res.data.staff.find(s => s.username === 'qa_list1');
  assert.deepEqual(Object.keys(mine).sort(), ['locked', 'name', 'rev', 'roles', 'username']);
  assert.equal(mine.locked, false);
  assert.ok(Number.isInteger(mine.rev) && mine.rev >= 0);
  assert.ok(Array.isArray(mine.roles) && mine.roles.every(r => Object.hasOwn(authz.ROLE_CAPS, r)));
  const admin = res.data.staff.find(s => s.username === 'admin');
  assert.ok(admin.roles.includes('admin'), 'admin cũ (staff.role) hiện là vai trò admin');
  assert.equal(res.data.staff.length, (await store.listStaff()).length);
  // không có trường lương/hồ sơ nhạy cảm
  const text = JSON.stringify(res.data);
  for (const word of ['level', 'salary', 'pass', 'base', 'dependants', 'birthday', 'nightPct', 'startDate'])
    assert.ok(!text.toLowerCase().includes(`"${word.toLowerCase()}"`), `phản hồi không được có trường ${word}`);
  assert.equal((await F.call('GET', '/roles', { who: 'qa_plain' })).status, 403);
  assert.equal((await F.call('GET', '/roles', { who: null })).status, 401);
});

/* ================= PUT /api/staff/:u/roles ================= */
test('PUT roles: cấp vai trò trả { username, roles, granted, revoked, rev }; nhật ký role.grant có lý do, người bị đổi và mức pii; rev tăng', async () => {
  await staff('qa_role_a');
  const before = (await F.call('GET', '/roles')).data.staff.find(s => s.username === 'qa_role_a');
  const res = await putRoles('qa_role_a', { roles: [...before.roles, 'cb'], reason: REASON, expectedRev: before.rev });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(Object.keys(res.data).sort(), ['granted', 'rev', 'revoked', 'roles', 'username']);
  assert.equal(res.data.username, 'qa_role_a');
  assert.deepEqual(res.data.granted, ['cb']);
  assert.deepEqual(res.data.revoked, []);
  assert.ok(res.data.roles.includes('cb'));
  assert.ok(res.data.rev > before.rev, 'rev tăng sau khi đổi');
  assert.deepEqual(await store.roles.activeRoles('qa_role_a'), ['cb']);
  const rows = await auditOf('role.grant', 'qa_role_a:%');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity_id, 'qa_role_a:cb');
  assert.equal(rows[0].reason, REASON);
  assert.equal(rows[0].subject, 'qa_role_a');
  assert.equal(rows[0].sensitivity, 'pii');
  assert.equal(rows[0].actor, 'admin');
  // GET /roles thấy vai trò mới và rev mới
  const after = (await F.call('GET', '/roles')).data.staff.find(s => s.username === 'qa_role_a');
  assert.ok(after.roles.includes('cb'));
  assert.equal(after.rev, res.data.rev);
});

test('PUT roles: đặt lại đúng bộ vai trò hiện có là 200 với granted và revoked rỗng, không thêm dòng nhật ký, không đổi rev; gỡ vai trò ghi role.revoke', async () => {
  await staff('qa_role_b');
  const current = (await putRoles('qa_role_b', { roles: ['staff', 'cb'], reason: REASON })).data;
  assert.equal(current.status, undefined);
  const same = await putRoles('qa_role_b', { roles: current.roles, reason: REASON });
  assert.equal(same.status, 200, JSON.stringify(same.data));
  assert.deepEqual([same.data.granted, same.data.revoked], [[], []]);
  assert.equal(same.data.rev, current.rev, 'không đổi gì thì rev đứng yên');
  assert.equal((await auditOf('role.%', 'qa_role_b:%')).length, 1, 'chỉ dòng role.grant của lần cấp đầu');
  // gỡ cb
  const without = current.roles.filter(r => r !== 'cb');
  const revoked = await putRoles('qa_role_b', { roles: without, reason: 'Thu hồi vai trò C&B theo quyết định' });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
  assert.deepEqual(revoked.data.revoked, ['cb']);
  assert.deepEqual(revoked.data.granted, []);
  assert.ok(revoked.data.rev > current.rev);
  assert.deepEqual(await store.roles.activeRoles('qa_role_b'), []);
  const rows = await auditOf('role.revoke', 'qa_role_b:%');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity_id, 'qa_role_b:cb');
  assert.equal(rows[0].reason, 'Thu hồi vai trò C&B theo quyết định');
  // trùng tên trong mảng được gộp
  const dup = await putRoles('qa_role_b', { roles: ['staff', 'hr', 'hr'], reason: REASON });
  assert.equal(dup.status, 200);
  assert.deepEqual(dup.data.granted, ['hr']);
});

test('PUT roles: lý do ngắn, thiếu hoặc null vẫn lưu (lý do là tuỳ chọn)', async () => {
  await staff('qa_role_opt');
  const bodies = [
    { roles: ['staff', 'cb'], reason: 'ngắn' },
    { roles: ['staff', 'hr'], reason: '   ngắn quá   ' },
    { roles: ['staff', 'cb'] },
    { roles: ['staff', 'hr'], reason: null }
  ];
  for (const body of bodies) {
    const res = await putRoles('qa_role_opt', body);
    assert.equal(res.status, 200, `${JSON.stringify(body)}: ${JSON.stringify(res.data)}`);
  }
});

test('PUT roles: vai trò lạ, roles không phải mảng, lý do dài quá giới hạn, expectedRev không nguyên là 400 và không ghi gì; tài khoản không có là 404', async () => {
  await staff('qa_role_c');
  const roleNames = Object.keys(authz.ROLE_CAPS).join(', ');
  const cases: any[] = [
    [{ roles: ['boss'], reason: REASON }, 400, /roles phải là mảng vai trò/],
    [{ roles: ['ADMIN'], reason: REASON }, 400, /roles phải là mảng/],
    [{ roles: 'cb', reason: REASON }, 400, /roles phải là mảng/],
    [{ roles: [1], reason: REASON }, 400, /roles phải là mảng/],
    [{ reason: REASON }, 400, /roles phải là mảng/],
    [{ roles: ['cb'], reason: 'x'.repeat(config.REASON_MAX + 1) }, 400, /Lý do/, 'REASON_REQUIRED'],
    [{ roles: ['cb'], reason: REASON, expectedRev: 'abc' }, 400, /expectedRev phải là số nguyên/],
    [{ roles: ['cb'], reason: REASON, expectedRev: 1.5 }, 400, /expectedRev phải là số nguyên/]
  ];
  for (const [body, status, message, code] of cases) {
    const snap = await F.snapshot();
    const res = await putRoles('qa_role_c', body);
    assert.equal(res.status, status, `${JSON.stringify(body)}: ${JSON.stringify(res.data)}`);
    assert.match(res.data.error, message, JSON.stringify(body));
    if (code) assert.equal(res.data.code, code);
    assert.deepEqual(F.changedTables(snap, await F.snapshot()), [], `${JSON.stringify(body)} không được ghi gì`);
  }
  assert.ok(roleNames.includes('cb'));
  assert.deepEqual(await store.roles.activeRoles('qa_role_c'), []);
  // lý do đúng 10 và đúng 300 ký tự được nhận
  assert.equal((await putRoles('qa_role_c', { roles: ['staff', 'hr'], reason: 'x'.repeat(10) })).status, 200);
  assert.equal(
    (await putRoles('qa_role_c', { roles: ['staff', 'cb'], reason: 'y'.repeat(config.REASON_MAX) })).status,
    200
  );
  // tài khoản không có
  const snap = await F.snapshot();
  const missing = await putRoles('qa_khong_co', { roles: ['cb'], reason: REASON });
  assert.equal(missing.status, 404, JSON.stringify(missing.data));
  assert.deepEqual(F.changedTables(snap, await F.snapshot()), []);
});

test('PUT roles: expectedRev cũ là 409 ROLES_STALE (kèm rev hiện tại) và không ghi gì; đúng rev thì lưu được', async () => {
  await staff('qa_role_d');
  const first = await putRoles('qa_role_d', { roles: ['staff', 'hr'], reason: REASON });
  assert.equal(first.status, 200);
  const snap = await F.snapshot();
  const stale = await putRoles('qa_role_d', {
    roles: ['staff', 'cb'],
    reason: REASON,
    expectedRev: first.data.rev - 1
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'ROLES_STALE');
  assert.equal(stale.data.rev, first.data.rev);
  assert.deepEqual(F.changedTables(snap, await F.snapshot()), []);
  const fresh = await putRoles('qa_role_d', { roles: ['staff', 'cb'], reason: REASON, expectedRev: first.data.rev });
  assert.equal(fresh.status, 200, JSON.stringify(fresh.data));
  assert.deepEqual([fresh.data.granted, fresh.data.revoked], [['cb'], ['hr']]);
  // hai lần lưu cùng expectedRev: một thành công, một ROLES_STALE
  const rev = fresh.data.rev;
  const [a, b] = await Promise.all([
    await putRoles('qa_role_d', { roles: ['staff'], reason: REASON, expectedRev: rev }),
    await putRoles('qa_role_d', { roles: ['staff', 'hr'], reason: REASON, expectedRev: rev })
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find(r => r.status === 409).data.code, 'ROLES_STALE');
});

test('PUT roles: Admin không tự bỏ quyền Admin của mình (403 SELF_ADMIN_REMOVAL); admin gốc là vai trò suy ra không gỡ được (409 ROLE_DERIVED); gỡ staff là 200 và tắt payrollSubject', async () => {
  await F.person('qa_admin2', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await staff('qa_role_e');
  const before = await F.snapshot();
  const self = await putRoles('admin', { roles: [], reason: REASON });
  assert.equal(self.status, 403, JSON.stringify(self.data));
  assert.equal(self.data.code, 'SELF_ADMIN_REMOVAL');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  // admin gốc của người khác (staff.role = 'admin'): gỡ ở đây là 409 ROLE_DERIVED
  const snap = await F.snapshot();
  const derived = await putRoles('qa_admin2', { roles: [], reason: REASON });
  assert.equal(derived.status, 409, JSON.stringify(derived.data));
  assert.equal(derived.data.code, 'ROLE_DERIVED');
  assert.equal(derived.data.role, 'admin');
  assert.equal((await store.getStaff('qa_admin2')).role, 'admin');
  // vai trò staff = nhân sự được trả lương: gỡ staff là 200 và tắt payrollSubject; chỉ admin gốc mới là vai trò suy ra
  const staffRole = await putRoles('qa_role_e', { roles: [], reason: REASON });
  assert.equal(staffRole.status, 200, JSON.stringify(staffRole.data));
  assert.deepEqual(staffRole.data.revoked, ['staff']);
  assert.equal((await store.getStaff('qa_role_e')).payrollSubject, false, 'gỡ staff thì ra khỏi bảng lương');
  assert.ok(F.changedTables(snap, await F.snapshot()).includes('staff'), 'cờ payrollSubject đã đổi');
  // cấp thêm admin đã lưu cho người khác rồi gỡ được (vai trò đã lưu)
  const grant = await putRoles('qa_role_e', { roles: ['staff', 'admin'], reason: REASON });
  assert.equal(grant.status, 200, JSON.stringify(grant.data));
  assert.equal((await store.getStaff('qa_role_e')).payrollSubject, true, 'cấp lại staff thì vào bảng lương');
  const revoke = await putRoles('qa_role_e', { roles: ['staff'], reason: REASON });
  assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
  assert.deepEqual(revoke.data.revoked, ['admin']);
});

test('PUT roles: nhân sự thường bị 403 và chưa đăng nhập bị 401, không ai tự cấp được vai trò cho mình', async () => {
  await staff('qa_role_f');
  const snap = await F.snapshot();
  for (const who of ['qa_plain', 'qa_role_f'])
    assert.equal((await putRoles('qa_role_f', { roles: ['admin'], reason: REASON }, who)).status, 403, who);
  assert.equal((await putRoles('qa_role_f', { roles: ['admin'], reason: REASON }, null)).status, 401);
  assert.deepEqual(F.changedTables(snap, await F.snapshot()), []);
  assert.deepEqual(await store.roles.activeRoles('qa_role_f'), []);
});

/* ================= roles.changed ================= */
async function openStream(who?) {
  return new Promise<any>(async (resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: F.server.address().port,
        path: '/api/events',
        method: 'GET',
        headers: { Cookie: auth.cookieHeader(await auth.createSession(who), 86400), Accept: 'text/event-stream' }
      },
      res => {
        const stream = { who, frames: [] as any[], close: () => req.destroy() };
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          buffer += chunk;
          let at;
          while ((at = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            if (raw.startsWith(':')) continue;
            const frame: Record<string, any> = { event: null, data: null };
            for (const line of raw.split('\n')) {
              if (line.startsWith('event: ')) frame.event = line.slice(7);
              else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
            }
            stream.frames.push(frame);
          }
        });
        resolve(stream);
      }
    );
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms?) => new Promise<any>(resolve => setTimeout(resolve, ms));
async function until(predicate?, what?, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail(`quá ${ms} ms chờ: ${what}`);
}
let sentinel = 0;
// Tin chốt tới mọi luồng rồi trả các khung ứng dụng đã nhận (bỏ hello và tin chốt)
async function settle(streams?) {
  const id = ++sentinel;
  await events.publish('announcement.posted', { id }, { all: true });
  for (const s of streams)
    await until(
      () => s.frames.some(f => f.event === 'announcement.posted' && f.data.id === id),
      `tin chốt tới ${s.who}`
    );
  return Object.fromEntries(
    streams.map(s => [s.who, s.frames.filter(f => !['hello', 'resync', 'announcement.posted'].includes(f.event))])
  );
}

test('roles.changed: chỉ người bị đổi vai trò nhận (payload rỗng); người khác và Admin không nhận; đặt lại đúng bộ vai trò thì không phát', async () => {
  await staff('qa_role_g');
  await staff('qa_role_h');
  const target = await openStream('qa_role_g');
  const other = await openStream('qa_role_h');
  const admin = await openStream('admin');
  for (const s of [target, other, admin]) await until(() => s.frames.some(f => f.event === 'hello'), `hello ${s.who}`);
  const res = await putRoles('qa_role_g', { roles: ['staff', 'hr'], reason: REASON });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  let got = await settle([target, other, admin]);
  assert.deepEqual(
    got.qa_role_g.map(f => f.event),
    ['roles.changed']
  );
  assert.deepEqual(got.qa_role_g[0].data, {}, 'không mang dữ liệu');
  assert.deepEqual(got.qa_role_h, []);
  assert.deepEqual(got.admin, []);
  // đặt lại cùng bộ vai trò: không đổi gì nên không phát
  target.frames.length = other.frames.length = admin.frames.length = 0;
  const same = await putRoles('qa_role_g', { roles: ['staff', 'hr'], reason: REASON });
  assert.equal(same.status, 200);
  got = await settle([target, other, admin]);
  assert.deepEqual(got.qa_role_g, []);
  // lỗi (400) cũng không phát
  assert.equal((await putRoles('qa_role_g', { roles: ['boss'], reason: REASON })).status, 400);
  got = await settle([target, other, admin]);
  assert.deepEqual(got.qa_role_g, []);
  // gỡ vai trò thì phát lại
  assert.equal((await putRoles('qa_role_g', { roles: ['staff'], reason: REASON })).status, 200);
  got = await settle([target, other, admin]);
  assert.deepEqual(
    got.qa_role_g.map(f => f.event),
    ['roles.changed']
  );
  for (const s of [target, other, admin]) s.close();
});

test('roles.changed: có trong danh mục, chỉ cho người nhận kiểu users (publish cho tất cả là lỗi lập trình) và emit.rolesChanged phát đúng một luồng', async () => {
  assert.ok(Object.hasOwn(events.EVENTS, 'roles.changed'));
  assert.deepEqual(events.EVENTS['roles.changed'].audiences, ['users']);
  assert.deepEqual(events.EVENTS['roles.changed'].tiers[0].fields, []);
  await assert.rejects(
    async () => events.publish('roles.changed', {}, { all: true }),
    /không được phát tới kiểu người nhận này/
  );
  assert.equal(await events.emit.rolesChanged('qa_khong_ket_noi'), 0, 'không có kết nối thì 0 luồng, không lỗi');
});

/* ================= PUT /api/staff/shift-bulk ================= */
const SHIFTS = PunchRules.SHIFT;
const codes = Object.keys(SHIFTS);
// Hồ sơ lưu mã ca Normal1 …: yêu cầu vẫn gửi được mã ngắn (n1 …), kết quả trả về và giá trị lưu là mã Normal1 …
const canon = (code?) => PunchRules.canonicalOf(code);

test('shift-bulk: gán ca bằng preset cho nhiều người trả { ok, shiftCode, updated, unchanged }; người đã đúng ca nằm trong unchanged; mỗi người đổi có một dòng nhật ký, người không đổi không có', async () => {
  const target = codes.find(c => c !== 'n1');
  await staff('qa_sb_a', { shiftCode: 'n1' });
  await staff('qa_sb_b', { shiftCode: target });
  await staff('qa_sb_c', { shiftCode: null });
  const res = await shiftBulk({ usernames: ['qa_sb_a', 'qa_sb_b', 'qa_sb_c'], preset: target, reason: REASON });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(Object.keys(res.data).sort(), ['ok', 'shiftCode', 'unchanged', 'updated']);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.shiftCode, await canon(target));
  assert.deepEqual(res.data.updated, [
    { username: 'qa_sb_a', shiftCode: await canon(target) },
    { username: 'qa_sb_c', shiftCode: await canon(target) }
  ]);
  assert.deepEqual(res.data.unchanged, ['qa_sb_b']);
  for (const u of ['qa_sb_a', 'qa_sb_b', 'qa_sb_c'])
    assert.equal((await store.getStaff(u)).shiftCode, await canon(target), u);
  const rows = await auditOf('staff.update', 'qa_sb_%');
  assert.deepEqual(rows.map(r => r.entity_id).sort(), ['qa_sb_a', 'qa_sb_c']);
  const a = rows.find(r => r.entity_id === 'qa_sb_a');
  assert.equal(a.reason, REASON);
  assert.equal(a.subject, 'qa_sb_a');
  assert.deepEqual(JSON.parse(a.before_json), { shiftCode: await canon('n1') });
  assert.deepEqual(JSON.parse(a.after_json), { shiftCode: await canon(target) });
  // gửi lại cùng yêu cầu: không còn ai đổi, không thêm dòng nhật ký
  const again = await shiftBulk({ usernames: ['qa_sb_a', 'qa_sb_b', 'qa_sb_c'], preset: target, reason: REASON });
  assert.equal(again.status, 200);
  assert.deepEqual(again.data.updated, []);
  assert.deepEqual(again.data.unchanged, ['qa_sb_a', 'qa_sb_b', 'qa_sb_c']);
  assert.equal((await auditOf('staff.update', 'qa_sb_%')).length, 2);
});

test('shift-bulk: cặp giờ in + out trùng một ca cố định cũng được; tên đăng nhập viết hoa được quy về chữ thường; effective = hôm nay hoặc bỏ trống đều được', async () => {
  const code = codes.find(c => c !== 'n1');
  const [tin, tout] = SHIFTS[code];
  await staff('qa_sb_d');
  await staff('qa_sb_e');
  const byTimes = await shiftBulk({ usernames: ['QA_SB_D'], in: tin, out: tout, reason: REASON });
  assert.equal(byTimes.status, 200, JSON.stringify(byTimes.data));
  assert.equal(byTimes.data.shiftCode, await canon(code));
  assert.equal((await store.getStaff('qa_sb_d')).shiftCode, await canon(code));
  for (const effective of ['2026-11-02', null, undefined]) {
    const res = await shiftBulk({ usernames: ['qa_sb_e'], preset: 'n1', effective, reason: REASON });
    assert.equal(res.status, 200, `effective ${effective}: ${JSON.stringify(res.data)}`);
  }
});

test('shift-bulk: danh sách rỗng, không phải mảng, quá 200 người, trùng tên, tên sai dạng là 400 và không ghi gì', async () => {
  await staff('qa_sb_f');
  const base = { preset: 'n1', reason: REASON };
  const many = Array.from({ length: 201 }, (_, i) => `qa_many_${i}`);
  const cases: any[] = [
    [{ ...base, usernames: [] }, 'USERNAMES_REQUIRED'],
    [{ ...base }, 'USERNAMES_REQUIRED'],
    [{ ...base, usernames: 'qa_sb_f' }, 'USERNAMES_REQUIRED'],
    [{ ...base, usernames: many }, 'TOO_MANY'],
    [{ ...base, usernames: ['qa_sb_f', 'qa_sb_f'] }],
    [{ ...base, usernames: ['qa_sb_f', 'QA_SB_F'] }],
    [{ ...base, usernames: ['qa_sb_f', 7] }],
    [{ ...base, usernames: ['qa sai ten'] }]
  ];
  for (const [body, code] of cases) {
    const snap = await F.snapshot();
    const res = await shiftBulk(body);
    assert.equal(res.status, 400, `${JSON.stringify(body).slice(0, 80)}: ${JSON.stringify(res.data).slice(0, 120)}`);
    if (code) assert.equal(res.data.code, code);
    assert.deepEqual(F.changedTables(snap, await F.snapshot()), []);
  }
  // đúng 200 người thì qua bước kiểm số lượng (tên không có nên 404 chứ không phải 400)
  const exactly = await shiftBulk({ ...base, usernames: many.slice(0, 200) });
  assert.equal(exactly.status, 404, JSON.stringify(exactly.data).slice(0, 120));
});

test('shift-bulk: tên không có tài khoản là 404 STAFF_NOT_FOUND kèm danh sách thiếu, và tất cả hoặc không: người hợp lệ trong cùng lô không bị đổi ca', async () => {
  await staff('qa_sb_g', { shiftCode: 'n1' });
  const target = codes.find(c => c !== 'n1');
  const snap = await F.snapshot();
  const res = await shiftBulk({
    usernames: ['qa_sb_g', 'qa_khong_co_1', 'qa_khong_co_2'],
    preset: target,
    reason: REASON
  });
  assert.equal(res.status, 404, JSON.stringify(res.data));
  assert.equal(res.data.code, 'STAFF_NOT_FOUND');
  assert.deepEqual(res.data.missing, ['qa_khong_co_1', 'qa_khong_co_2']);
  assert.equal((await store.getStaff('qa_sb_g')).shiftCode, await canon('n1'));
  assert.deepEqual(F.changedTables(snap, await F.snapshot()), []);
});

test('shift-bulk: lý do ngắn hoặc thiếu vẫn đổi ca (lý do là tuỳ chọn)', async () => {
  await staff('qa_sb_opt', { shiftCode: 'n1' });
  const target = codes.find(c => c !== 'n1');
  const short = await shiftBulk({ usernames: ['qa_sb_opt'], preset: target, reason: 'ngắn' });
  assert.equal(short.status, 200, JSON.stringify(short.data));
  assert.equal((await store.getStaff('qa_sb_opt')).shiftCode, await canon(target));
  const none = await shiftBulk({ usernames: ['qa_sb_opt'], preset: 'n1' });
  assert.equal(none.status, 200, JSON.stringify(none.data));
  assert.equal((await store.getStaff('qa_sb_opt')).shiftCode, await canon('n1'));
});

test('shift-bulk: ca lạ (preset không có, cặp giờ không trùng ca nào, thiếu cả hai) là 400 SHIFT_UNKNOWN; effective khác hôm nay là 400 EFFECTIVE_UNSUPPORTED; lý do dài quá giới hạn là 400; không ghi gì', async () => {
  await staff('qa_sb_h', { shiftCode: 'n1' });
  const [n1in] = SHIFTS.n1;
  const cases: any[] = [
    [{ preset: 'zz', reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ preset: 'NORMAL', reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ preset: 7, reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ preset: 'constructor', reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ in: '03:17', out: '04:21', reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ in: n1in, reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ reason: REASON }, 'SHIFT_UNKNOWN'],
    [{ preset: 'n2', effective: '2026-11-03', reason: REASON }, 'EFFECTIVE_UNSUPPORTED'],
    [{ preset: 'n2', effective: '2026-11-01', reason: REASON }, 'EFFECTIVE_UNSUPPORTED'],
    [{ preset: 'n2', effective: 'hôm nay', reason: REASON }, 'EFFECTIVE_UNSUPPORTED'],
    [{ preset: 'n2', reason: 'x'.repeat(config.REASON_MAX + 1) }, 'REASON_REQUIRED']
  ];
  for (const [rest, code] of cases) {
    const snap = await F.snapshot();
    const res = await shiftBulk({ usernames: ['qa_sb_h'], ...rest });
    assert.equal(res.status, 400, `${JSON.stringify(rest)}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, code, JSON.stringify(rest));
    assert.deepEqual(F.changedTables(snap, await F.snapshot()), [], `${JSON.stringify(rest)} không được ghi gì`);
  }
  assert.equal((await store.getStaff('qa_sb_h')).shiftCode, await canon('n1'));
});

test('shift-bulk: nhân sự thường bị 403 và chưa đăng nhập bị 401, ca không đổi', async () => {
  await staff('qa_sb_i', { shiftCode: 'n1' });
  const body = { usernames: ['qa_sb_i'], preset: 'n2', reason: REASON };
  assert.equal((await shiftBulk(body, 'qa_plain')).status, 403);
  assert.equal((await shiftBulk(body, 'qa_sb_i')).status, 403, 'không tự đổi ca của mình bằng route này');
  assert.equal((await shiftBulk(body, null)).status, 401);
  assert.equal((await store.getStaff('qa_sb_i')).shiftCode, await canon('n1'));
});
