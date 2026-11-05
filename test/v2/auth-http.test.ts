import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

// Máy chủ HTTP thật (Express + NestJS + AuthGuard) nhưng không cần DB: mọi ca dưới đây trả lời trước khi chạm DB
// (không cookie thì guard không đọc staff). Pool của pg chỉ nối khi có truy vấn đầu tiên.
describe('HTTP không cần DB', () => {
  let server: any;
  let base = '';

  before(async () => {
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  });

  it('GET /api/me without a session answers 200 { user: null }', async () => {
    const res = await fetch(`${base}/api/me`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });

  it('GET /api/v2/auth/me without a session answers 200 { user: null }', async () => {
    const res = await fetch(`${base}/api/v2/auth/me`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });

  it('every capability route answers 401 without a session', async () => {
    for (const path of ['/api/v2/employees', '/api/v2/requests', '/api/v2/payroll/2026-10', '/api/v2/system/settings', '/api/roles', '/api/v2/me/profile', '/api/v2/me/today']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 401, path);
      assert.equal((await res.json()).code, 'UNAUTHENTICATED', path);
    }
  });

  it('removed V1 auth aliases are gone', async () => {
    const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 404);
  });

  it('a non-JSON write answers 415', async () => {
    const res = await fetch(`${base}/api/v2/auth/logout`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    assert.equal(res.status, 415);
    assert.equal((await res.json()).code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('a body over 1 MB answers 413', async () => {
    const res = await fetch(`${base}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y'.repeat(1_100_000) })
    });
    assert.equal(res.status, 413);
  });

  it('broken JSON answers 400 INVALID_JSON', async () => {
    const res = await fetch(`${base}/api/v2/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'INVALID_JSON');
  });

  it('logout clears the cookie', async () => {
    const res = await fetch(`${base}/api/v2/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.match(String(res.headers.get('set-cookie')), /^session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0/);
  });
});
