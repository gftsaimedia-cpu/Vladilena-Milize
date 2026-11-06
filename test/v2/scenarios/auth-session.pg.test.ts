import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, PASS, type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// Tài khoản và phiên: khoá tạm do sai mật khẩu, khoá tài khoản, đặt lại mật khẩu, phiên hết hạn, cookie giả.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let counter = 0;

before(async () => {
  if (enabled) await env.start('sc_auth');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1' });
  env.at('2026-11-02T09:00:00+07:00');
  admin = await env.login(ADMIN);
});

/** Tên riêng cho mỗi ca đếm lần sai (bộ giới hạn đăng nhập nằm trong bộ nhớ của máy chủ, không reset giữa các ca). */
const fresh = async () => {
  const username = `u${++counter}`;
  await env.staff({ username });
  return username;
};
const cookieOf = (r: Response) => String(r.headers.get('set-cookie')).split(';')[0];

describe('đăng nhập', { skip: !enabled }, () => {
  it('sai mật khẩu 5 lần thì khoá tạm: lần thứ 6 kể cả đúng mật khẩu cũng 429 kèm Retry-After; tên khác không bị ảnh hưởng', async () => {
    const u = await fresh();
    for (let i = 0; i < 5; i++) assert.equal((await env.rawLogin(u, 'sai-mat-khau')).status, 401);
    const blocked = await env.rawLogin(u, PASS);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await env.rawLogin('nv1', PASS)).status, 201);
  });

  it('đăng nhập đúng xoá bộ đếm sai; chữ hoa/khoảng trắng ở tên được chuẩn hoá', async () => {
    const u = await fresh();
    for (let i = 0; i < 4; i++) await env.rawLogin(u, 'sai');
    assert.equal((await env.rawLogin(`  ${u.toUpperCase()} `, PASS)).status, 201);
    for (let i = 0; i < 4; i++) assert.equal((await env.rawLogin(u, 'sai')).status, 401);
  });

  it('thân bất thường: thiếu, kiểu lạ, rất dài → 401/400, không 500, không lộ tài khoản có hay không', async () => {
    const post = (body: unknown) =>
      fetch(env.base + '/api/v2/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const body of [{}, { username: 'nv1' }, { password: PASS }, { username: ['nv1'], password: PASS }, { username: { a: 1 }, password: 1 }, { username: 'x'.repeat(100000), password: 'y'.repeat(100000) }]) {
      const r = await post(body);
      assert.ok(r.status === 401 || r.status === 400, `${JSON.stringify(body).slice(0, 60)} → ${r.status}`);
    }
    const nobody = await post({ username: 'khong-co', password: 'abc123456' });
    const wrong = await post({ username: 'nv1', password: 'abc123456' });
    assert.equal(nobody.status, wrong.status);
    assert.deepEqual(await nobody.json(), await wrong.json());
  });

  it('tài khoản bị khoá: đúng mật khẩu → 403 ACCOUNT_LOCKED, sai mật khẩu → 401 (không lộ trạng thái khoá)', async () => {
    const u = await fresh();
    await env.q(`UPDATE staff SET locked_at = now()::text WHERE username = $1`, [u]);
    const ok = await env.rawLogin(u, PASS);
    assert.equal(ok.status, 403);
    assert.equal((await ok.json()).code, 'ACCOUNT_LOCKED');
    assert.equal((await env.rawLogin(u, 'sai')).status, 401);
  });
});

describe('phiên', { skip: !enabled }, () => {
  it('admin khoá tài khoản đang có phiên: lần gọi kế là 401; mở khoá thì đăng nhập lại được', async () => {
    const nv = await env.login('nv1');
    assert.equal((await nv.get('/api/v2/me/profile')).status, 200);
    const lock = await admin.put('/api/v2/employees/nv1', { account: { isLocked: true } });
    assert.equal(lock.status, 200, msg(lock));
    assert.equal((await nv.get('/api/v2/me/profile')).status, 401);
    assert.equal((await nv.post('/api/v2/me/punches', { kind: 'IN', lat: 10.8, lng: 106.7 })).status, 401);
    assert.equal((await env.rawLogin('nv1')).status, 403);
    const un = await admin.put('/api/v2/employees/nv1', { account: { isLocked: false } });
    assert.equal(un.status, 200, msg(un));
    assert.equal((await env.rawLogin('nv1')).status, 201);
  });

  it('khoá rồi mở khoá: cookie cũ KHÔNG dùng lại được (session_version tăng), đăng nhập mới thì được', async () => {
    const oldCookie = cookieOf(await env.rawLogin('nv1'));
    const old = env.apiWith(oldCookie);
    const before = Number((await env.q(`SELECT session_version FROM staff WHERE username='nv1'`))[0].session_version);
    assert.equal((await admin.put('/api/v2/employees/nv1', { account: { isLocked: true } })).status, 200);
    const mid = Number((await env.q(`SELECT session_version FROM staff WHERE username='nv1'`))[0].session_version);
    assert.ok(mid > before, `session_version phải tăng khi khoá (${before} -> ${mid})`);
    assert.equal((await admin.put('/api/v2/employees/nv1', { account: { isLocked: false } })).status, 200);
    assert.equal((await old.get('/api/v2/me/profile')).status, 401);
    const fresh = env.apiWith(cookieOf(await env.rawLogin('nv1')));
    assert.equal((await fresh.get('/api/v2/me/profile')).status, 200);
  });

  it('cho nghỉ việc (DELETE nhân viên) cũng huỷ phiên cũ, kể cả khi sau đó mở khoá', async () => {
    const old = env.apiWith(cookieOf(await env.rawLogin('nv1')));
    const del = await admin.del('/api/v2/employees/nv1');
    assert.ok(del.status < 300, msg(del));
    await admin.put('/api/v2/employees/nv1', { account: { isLocked: false } });
    assert.equal((await old.get('/api/v2/me/profile')).status, 401);
  });

  it('admin đặt lại mật khẩu: phiên cũ vô hiệu, mật khẩu cũ không vào được, mật khẩu mới vào được', async () => {
    const nv = await env.login('nv1');
    const res = await admin.put('/api/v2/employees/nv1', { account: { password: 'MatKhauMoi#1' } });
    assert.equal(res.status, 200, msg(res));
    assert.equal((await nv.get('/api/v2/me/profile')).status, 401);
    assert.equal((await env.rawLogin('nv1', PASS)).status, 401);
    assert.equal((await env.rawLogin('nv1', 'MatKhauMoi#1')).status, 201);
  });

  it('tự đổi mật khẩu: sai mật khẩu cũ/mật khẩu mới quá ngắn bị từ chối; thành công thì phiên cũ vô hiệu, cookie mới dùng được', async () => {
    const login = await env.rawLogin('nv1');
    const oldCookie = cookieOf(login);
    const nv = env.apiWith(oldCookie);
    assert.equal((await nv.put('/api/v2/auth/password', { oldPassword: 'sai', newPassword: 'MoiMoi#123' })).status, 400);
    assert.equal((await nv.put('/api/v2/auth/password', { oldPassword: PASS, newPassword: '123' })).status, 400);
    assert.equal((await nv.put('/api/v2/auth/password', { oldPassword: PASS })).status, 400);
    assert.equal((await nv.get('/api/v2/me/profile')).status, 200);
    const res = await fetch(env.base + '/api/v2/auth/password', {
      method: 'PUT',
      headers: { cookie: oldCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ oldPassword: PASS, newPassword: 'MoiMoi#123' })
    });
    assert.equal(res.status, 200);
    const newCookie = cookieOf(res);
    assert.equal((await nv.get('/api/v2/me/profile')).status, 401);
    assert.equal((await env.apiWith(newCookie).get('/api/v2/me/profile')).status, 200);
    assert.equal((await env.rawLogin('nv1', PASS)).status, 401);
  });

  it('cookie hết hạn đúng sau 14 ngày (biên theo mili-giây); đăng nhập lại được', async () => {
    env.at('2026-11-02T09:00:00.000Z');
    const nv = await env.login('nv1');
    env.at('2026-11-16T09:00:00.000Z'); // đúng hạn: còn dùng được
    assert.equal((await nv.get('/api/v2/me/profile')).status, 200);
    env.at('2026-11-16T09:00:00.001Z');
    assert.equal((await nv.get('/api/v2/me/profile')).status, 401);
    assert.equal((await env.rawLogin('nv1')).status, 201);
  });

  it('cookie giả/hỏng/đổi tên người: 401, /api/me trả user null, không 500', async () => {
    const good = cookieOf(await env.rawLogin('nv1'));
    const token = good.slice('session='.length);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: ADMIN, sv: 0, exp: Date.now() + 1e9 })).toString('base64url');
    for (const bad of [
      '',
      'session=',
      'session=abc',
      'session=a.b',
      `session=${payload}.${sig.slice(0, -2)}xx`,
      `session=${forged}.${sig}`,
      `session=${payload}`,
      `session=${token}.extra`,
      'session=%E0%A4%A'
    ]) {
      const api = env.apiWith(bad || null);
      assert.equal((await api.get('/api/v2/me/profile')).status, 401, bad);
      assert.deepEqual((await api.get('/api/v2/auth/me')).body, { user: null }, bad);
    }
  });

  it('đăng xuất xoá cookie phía trình duyệt (Max-Age=0)', async () => {
    const nv = await env.login('nv1');
    const out = await nv.post('/api/v2/auth/logout');
    assert.equal(out.status, 201);
    assert.match(String(out.headers.get('set-cookie')), /Max-Age=0/);
  });
});

describe('phân quyền', { skip: !enabled }, () => {
  it('nhân viên gọi route admin: 403 (đã đăng nhập) / 401 (chưa) trên đủ nhóm route', async () => {
    const nv = await env.login('nv1');
    const anon = env.apiWith(null);
    const routes: Array<[keyof Api, string]> = [
      ['get', '/api/v2/employees'],
      ['put', '/api/v2/employees/nv1'],
      ['get', '/api/v2/attendance/timesheets'],
      ['post', '/api/v2/attendance/punches'],
      ['post', '/api/v2/attendance/recalculate'],
      ['get', '/api/v2/requests'],
      ['get', '/api/v2/system/audit'],
      ['get', '/api/v2/system/audit/verify'],
      ['get', '/api/v2/system/periods'],
      ['post', '/api/v2/system/periods/2026-10/lock'],
      ['get', '/api/v2/payroll/2026-10'],
      ['put', '/api/v2/settings/attendance-zone'],
      ['post', '/api/v2/holidays'],
      ['put', '/api/v2/positions'],
      ['get', '/api/v2/realtime/stream'],
      ['get', '/api/v2/overview'],
      ['get', '/api/v2/attendance/week']
    ];
    for (const [m, p] of routes) {
      const a = await (nv as any)[m](p, {});
      assert.equal(a.status, 403, `${m} ${p} → ${a.status}`);
      const b = await (anon as any)[m](p, {});
      assert.equal(b.status, 401, `${m} ${p} (chưa đăng nhập) → ${b.status}`);
    }
  });

  it('hạ quyền admin về staff: phiên cũ của người đó mất quyền ngay', async () => {
    await env.staff({ username: 'boss2', role: 'admin' });
    const boss2 = await env.login('boss2');
    assert.equal((await boss2.get('/api/v2/employees')).status, 200);
    const res = await admin.put('/api/v2/employees/boss2', { role: 'staff' });
    assert.equal(res.status, 200, msg(res));
    assert.equal((await boss2.get('/api/v2/employees')).status, 403);
  });

  it('nhân viên không tự nâng quyền được, không đọc dữ liệu của người khác qua route /me', async () => {
    await env.staff({ username: 'nv2' });
    const nv = await env.login('nv1');
    assert.equal((await nv.put('/api/v2/employees/nv1', { role: 'admin' })).status, 403);
    assert.equal((await env.q(`SELECT role FROM staff WHERE username='nv1'`))[0].role, 'staff');
    const other = await admin.post('/api/v2/requests/leave', { employeeId: 'nv2', leaveType: 'UNPAID', reason: 'x', startDate: '2026-11-10', endDate: '2026-11-10' });
    assert.equal(other.status, 201, msg(other));
    assert.equal((await nv.get(`/api/v2/me/requests/${other.body.request.id}`)).status, 404);
    const list = await nv.get('/api/v2/me/requests');
    assert.equal(list.body.items.length, 0);
  });
});
