import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { hashPassword } from '../../src/modules/employees/employees.service';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tạo DB tạm,
// chạy migration, dựng máy chủ HTTP thật trên cổng ngẫu nhiên, và xoá DB khi xong.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS = ['0001_baseline.sql', '0002_seed.sql', '0003_payroll_rules.sql', '0004_isat_registrations.sql', '0005_requests_rules.sql'];
const PASS = 'Matkhau@123';

test('xác thực qua HTTP trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `auth_http_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;
  const control = new Client({ connectionString: CONTROL_URL });
  await control.connect();
  await control.query(`CREATE DATABASE ${dbName}`);

  let server: any;
  try {
    const client = new Client({ connectionString: tempUrl.toString() });
    await client.connect();
    for (const file of MIGRATIONS) {
      await client.query(readFileSync(join(__dirname, '..', '..', 'migrations', 'postgres', file), 'utf8'));
    }
    const now = new Date().toISOString();
    for (const [username, role] of [['admin', 'admin'], ['nv1', 'staff']]) {
      await client.query(
        `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid) VALUES ($1, $1, $2, 'nv', 1, $3, $4, $1)`,
        [username, role, hashPassword(PASS), now]
      );
    }
    await client.end();

    // DATABASE_URL phải đặt trước khi nạp bootstrap (module DB đọc biến lúc nạp).
    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const call = (method: string, path: string, opts: { cookie?: string; body?: unknown; type?: string } = {}) =>
      fetch(base + path, {
        method,
        headers: {
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...(opts.body !== undefined ? { 'content-type': opts.type ?? 'application/json' } : {})
        },
        body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
      });
    const login = async (username: string) => {
      const res = await call('POST', '/api/v2/auth/login', { body: { username, password: PASS } });
      assert.equal(res.status, 201); // mã mặc định của @Post trong NestJS
      const body = await res.json();
      assert.equal(body.token, undefined, 'token không được trả trong thân');
      return String(res.headers.get('set-cookie')).split(';')[0];
    };

    // Chưa đăng nhập: /api/me trả 200 { user: null } (HEALTHCHECK của Dockerfile dựa vào điều này).
    const anon = await call('GET', '/api/me');
    assert.equal(anon.status, 200);
    assert.deepEqual(await anon.json(), { user: null });

    const adminCookie = await login('admin');
    const me = await (await call('GET', '/api/v2/auth/me', { cookie: adminCookie })).json();
    assert.equal(me.user.username, 'admin');
    assert.equal(me.caps.length, 9);
    assert.equal((await call('GET', '/api/v2/employees', { cookie: adminCookie })).status, 200);

    const staffCookie = await login('nv1');
    assert.equal((await call('GET', '/api/v2/employees', { cookie: staffCookie })).status, 403);
    assert.equal((await call('GET', '/api/v2/employees')).status, 401);

    // Ghi không phải JSON bị chặn trước khi tới controller.
    assert.equal((await call('POST', '/api/v2/auth/logout', { body: 'x', type: 'text/plain' })).status, 415);

    // Đổi mật khẩu làm phiên cũ của chính người đó hết hiệu lực; cookie mới vẫn dùng được.
    const changed = await call('PUT', '/api/v2/auth/password', {
      cookie: staffCookie,
      body: { oldPassword: PASS, newPassword: 'MoiMoi@456' }
    });
    assert.equal(changed.status, 200);
    const fresh = String(changed.headers.get('set-cookie')).split(';')[0];
    assert.deepEqual(await (await call('GET', '/api/me', { cookie: staffCookie })).json(), { user: null });
    assert.equal((await (await call('GET', '/api/me', { cookie: fresh })).json()).user.username, 'nv1');

    // Đăng xuất xoá cookie phía trình duyệt.
    const out = await call('POST', '/api/v2/auth/logout', { cookie: adminCookie, body: {} });
    assert.match(String(out.headers.get('set-cookie')), /Max-Age=0/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
