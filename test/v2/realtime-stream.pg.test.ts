import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { hashPassword } from '../../src/modules/employees/employees.service';

// Cần PostgreSQL thật (PG_TEST_URL), dựng máy chủ HTTP thật như me-attendance.pg.test.ts.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const PASS = 'Matkhau@123';
const NV1 = '11111111-1111-4111-8111-111111111111';

/** Đọc khung SSE từ luồng; `next(ms)` trả khung kế tiếp (bỏ comment) hoặc null nếu hết giờ. */
function sseReader(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  return {
    async next(ms: number): Promise<{ event: string; data: any } | null> {
      const deadline = Date.now() + ms;
      for (;;) {
        const i = buf.indexOf('\n\n');
        if (i >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(frame);
          const data = /^data: (.*)$/m.exec(frame);
          if (ev && data) return { event: ev[1], data: JSON.parse(data[1]) };
          continue;
        }
        const left = deadline - Date.now();
        if (left <= 0) return null;
        // Giữ lần đọc đang chờ giữa các lần gọi, để hết giờ không làm mất dữ liệu.
        pending ??= reader.read();
        const chunk = await Promise.race([pending, new Promise<null>(r => setTimeout(() => r(null), left))]);
        if (chunk === null) return null;
        pending = null;
        if (chunk.done) return null;
        buf += decoder.decode(chunk.value, { stream: true });
      }
    },
    cancel: () => reader.cancel()
  };
}

test('SSE /api/v2/realtime/stream: admin nhận sự kiện chấm công của nhân viên', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const dbName = `rt_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;
  const control = new Client({ connectionString: CONTROL_URL });
  await control.connect();
  await control.query(`CREATE DATABASE ${dbName}`);
  let server: any;
  try {
    const client = new Client({ connectionString: tempUrl.toString() });
    await client.connect();
    await client.query(readFileSync(SCHEMA, 'utf8'));
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
       VALUES ('nv1', 'Nguyễn Văn A', 'staff', 'nv', 1, $1, $2, $3, '2026-01-05'),
              ('boss', 'Sếp', 'admin', 'nv', 1, $1, $2, '99999999-9999-4999-8999-999999999999', '2026-01-05')`,
      [hashPassword(PASS), new Date().toISOString(), NV1]
    );
    await client.query(
      `INSERT INTO attendance_zone (id, lat, lng, radius_m, updated_by, updated_at) VALUES (1, 10.8, 106.7, 500, 'x', now())`
    );
    await client.end();

    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const loginAs = async (username: string) => {
      const res = await fetch(base + '/api/v2/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: PASS })
      });
      assert.equal(res.status, 201);
      return String(res.headers.get('set-cookie')).split(';')[0];
    };
    const admin = await loginAs('boss');
    const staff = await loginAs('nv1');

    // 401 / 403
    assert.equal((await fetch(base + '/api/v2/realtime/stream')).status, 401);
    assert.equal((await fetch(base + '/api/v2/realtime/stream', { headers: { cookie: staff } })).status, 403);

    // Admin mở luồng
    const ac = new AbortController();
    const res = await fetch(base + '/api/v2/realtime/stream', { headers: { cookie: admin }, signal: ac.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(res.headers.get('cache-control'), 'no-cache, no-transform');
    assert.equal(res.headers.get('x-accel-buffering'), 'no');
    const sse = sseReader(res);
    const ready = await sse.next(2000);
    assert.equal(ready?.event, 'ready');

    // Chấm bị từ chối (thiếu vị trí) thì không có sự kiện
    const bad = await fetch(base + '/api/v2/me/punches', {
      method: 'POST',
      headers: { cookie: staff, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'IN' })
    });
    assert.equal(bad.status, 400);
    assert.equal(await sse.next(400), null);

    // Chấm hợp lệ: admin nhận sự kiện trong 2 giây
    const before = Date.now();
    const ok = await fetch(base + '/api/v2/me/punches', {
      method: 'POST',
      headers: { cookie: staff, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'IN', lat: 10.8, lng: 106.7, accuracyM: 5 })
    });
    assert.equal(ok.status, 201, await ok.clone().text());
    const got = await sse.next(2000);
    assert.ok(got, 'không nhận được sự kiện');
    assert.equal(got.event, 'attendance.punched');
    assert.equal(got.data.type, 'attendance.punched');
    assert.equal(got.data.username, 'nv1');
    assert.equal(got.data.name, 'Nguyễn Văn A');
    assert.equal(got.data.direction, 'IN');
    assert.equal(got.data.source, 'self');
    assert.match(got.data.workDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(got.data.time, /^\d{2}:\d{2}$/);
    const at = Date.parse(got.data.at);
    assert.ok(at >= before - 1000 && at <= Date.now() + 1000);

    // Giới hạn 5 luồng mỗi người; ngắt hết thì mở lại được (listener đã được huỷ)
    ac.abort();
    const opened: AbortController[] = [];
    for (let i = 0; i < 5; i++) {
      const c = new AbortController();
      opened.push(c);
      const r = await fetch(base + '/api/v2/realtime/stream', { headers: { cookie: admin }, signal: c.signal });
      assert.equal(r.status, 200);
    }
    const sixth = await fetch(base + '/api/v2/realtime/stream', { headers: { cookie: admin } });
    assert.equal(sixth.status, 429);
    await sixth.text();
    opened.forEach(c => c.abort());
    await new Promise(resolve => setTimeout(resolve, 200));
    const again = await fetch(base + '/api/v2/realtime/stream', { headers: { cookie: admin } });
    assert.equal(again.status, 200);
    await again.body!.cancel();
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
