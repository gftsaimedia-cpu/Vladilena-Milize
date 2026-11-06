import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { Client } from 'pg';
import { hashPassword } from '../../src/modules/employees/employees.service';

// Cần PostgreSQL thật (PG_TEST_URL): DB tạm, máy chủ HTTP thật cổng ngẫu nhiên, đồng hồ cố định thứ Ba 20/10/2026.
// Màn Admin đọc tuần làm của từng người từ kho cài đặt (không giả định thứ Hai–thứ Bảy), và không cắt bớt đơn hay giờ OT.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const PASS = 'Matkhau@123';
const ADMIN = '00000000-0000-4000-8000-000000000001';
const T1 = '33333333-3333-4333-8333-333333333333';
const T2 = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-20T05:00:00Z');

test('Admin: lịch tuần theo tuần làm từng người, đơn chờ và giờ OT đếm đủ', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const dbName = `overview_weeks_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;
  const control = new Client({ connectionString: CONTROL_URL });
  await control.connect();
  await control.query(`CREATE DATABASE ${dbName}`);

  let server: any;
  const client = new Client({ connectionString: tempUrl.toString() });
  try {
    await client.connect();
    await client.query(readFileSync(SCHEMA, 'utf8'));
    // Cả ba người đều là thực tập sinh: loại 'tts' làm thứ Hai–thứ Sáu (bảng position_types của schema).
    for (const [username, name, role, uuid] of [
      ['admin', 'Quản trị', 'admin', ADMIN],
      ['tt1', 'Lê Văn Một', 'staff', T1],
      ['tt2', 'Phạm Thị Hai', 'staff', T2]
    ]) {
      await client.query(
        `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
         VALUES ($1, $2, $3, 'tts', 1, $4, $5, $6, '2026-01-05')`,
        [username, name, role, hashPassword(PASS), new Date().toISOString(), uuid]
      );
    }

    mock.timers.enable({ apis: ['Date'], now: NOW });
    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const login = await fetch(base + '/api/v2/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: PASS })
    });
    assert.equal(login.status, 201);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const get = async (path: string) => {
      const res = await fetch(base + path, { headers: { cookie } });
      assert.equal(res.status, 200, path);
      return (await res.json()) as any;
    };
    const scheduledOf = (body: any) => body.days.map((d: any) => [d.iso.slice(8), d.scheduled]);
    const recentOf = (body: any) => body.attendance.days.map((d: any) => d.date);

    // ---- Không ai làm thứ Bảy: cột 17/10 không phải ngày làm, dải "gần đây" bỏ cả thứ Bảy lẫn Chủ nhật ----
    assert.deepEqual(scheduledOf(await get('/api/v2/attendance/week?from=2026-10-14')), [
      ['12', true], ['13', true], ['14', true], ['15', true], ['16', true], ['17', false], ['18', false]
    ]);
    assert.deepEqual(recentOf(await get('/api/v2/overview?month=2026-10')), [
      '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20'
    ]);

    // ---- tt2 có tuần riêng thứ Hai–thứ Bảy từ tháng 10 ----
    await client.query(
      `INSERT INTO staff_work_weeks (employee_id, effective_month, weekdays, updated_by, updated_at)
       VALUES ($1, '2026-10', '[1,2,3,4,5,6]', 'admin', now())`,
      [T2]
    );
    assert.deepEqual(scheduledOf(await get('/api/v2/attendance/week?from=2026-10-14'))[5], ['17', true]);
    // Chỉ những người đang hiện trên lưới: lọc còn tt1 (thứ Hai–thứ Sáu) thì thứ Bảy lại không phải ngày làm.
    const onlyT1 = await get('/api/v2/attendance/week?from=2026-10-14&q=tt1');
    assert.deepEqual(onlyT1.rows.map((r: any) => r.username), ['tt1']);
    assert.deepEqual(scheduledOf(onlyT1)[5], ['17', false]);
    // Lọc không còn ai: tiêu đề theo mọi người trong danh sách (có tt2 làm thứ Bảy).
    const nobody = await get('/api/v2/attendance/week?from=2026-10-14&q=zzz');
    assert.deepEqual(nobody.rows, []);
    assert.deepEqual(scheduledOf(nobody)[5], ['17', true]);
    assert.deepEqual(recentOf(await get('/api/v2/overview?month=2026-10')), [
      '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20'
    ]);

    // ---- tt2 nghỉ việc từ 16/10: thứ Bảy 17/10 không còn ai đang làm và làm thứ Bảy ----
    await client.query(`UPDATE staff SET resigned_on = '2026-10-16' WHERE uuid = $1`, [T2]);
    assert.deepEqual(recentOf(await get('/api/v2/overview?month=2026-10')), [
      '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20'
    ]);
    await client.query(`UPDATE staff SET resigned_on = NULL WHERE uuid = $1`, [T2]);

    // ---- 501 đơn OT chờ duyệt của tt1 (tháng 12): không đơn nào bị cắt ----
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_start_time, ot_end_time, ot_hours,
         created_at, updated_at)
       SELECT gen_random_uuid(), $1, 'OT', 'OVERTIME', 'việc gấp', 'PENDING', '2026-12-01', '18:00', '19:00', 1,
              '2026-10-19T00:00:00Z'::timestamptz + make_interval(secs => g), '2026-10-19T00:00:00Z'
       FROM generate_series(1, 501) AS g`,
      [T1]
    );
    const ov = await get('/api/v2/overview?month=2026-10');
    assert.equal(ov.kpis.pendingRequests, 501);
    assert.deepEqual(ov.approvals.groups.find((g: any) => g.key === 'ot')?.count, 501);
    assert.equal(ov.payroll.updatedAt, '12:00');

    // ---- Giờ OT đã duyệt của tháng 10: 5000 đơn OT đã duyệt mới hơn (tháng khác) không đẩy đơn tháng 10 ra ngoài ----
    const ot = (employee: string, date: string, hours: number, status: string, createdAt: string) =>
      client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_start_time, ot_end_time, ot_hours,
           created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'OT', 'OVERTIME', 'việc gấp', $2, $3, '18:00', '20:30', $4, $5, $5)`,
        [employee, status, date, hours, createdAt]
      );
    await ot(T1, '2026-10-05', 2.5, 'APPROVED', '2026-10-01T00:00:00Z');
    await ot(T1, '2026-10-31', 1.5, 'APPROVED', '2026-10-02T00:00:00Z'); // ngày cuối tháng vẫn tính
    await ot(T1, '2026-09-30', 4, 'APPROVED', '2026-10-01T00:00:00Z'); // tháng 9: không tính
    await ot(T1, '2026-11-01', 4, 'APPROVED', '2026-10-01T00:00:00Z'); // tháng 11: không tính
    await ot(T1, '2026-10-06', 3, 'REJECTED', '2026-10-01T00:00:00Z');
    await ot(T2, '2026-10-07', 1, 'APPROVED', '2026-10-01T00:00:00Z');
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_start_time, ot_end_time, ot_hours,
         created_at, updated_at)
       SELECT gen_random_uuid(), $1, 'OT', 'OVERTIME', 'việc gấp', 'APPROVED', '2025-06-02', '18:00', '19:00', 1,
              '2026-10-15T00:00:00Z'::timestamptz + make_interval(secs => g), '2026-10-15T00:00:00Z'
       FROM generate_series(1, 5000) AS g`,
      [T2]
    );
    const week = await get('/api/v2/attendance/week?from=2026-10-14&month=2026-10');
    const totalsOf = (u: string) => week.rows.find((r: any) => r.username === u).totals.otHours;
    assert.deepEqual([totalsOf('tt1'), totalsOf('tt2'), totalsOf('admin')], [4, 1, 0]);
    assert.equal(week.tiles.find((x: any) => x.key === 'ot').value, 5);
    const one = await get('/api/v2/attendance/employees/tt1?month=2026-10');
    assert.equal(one.totals.otHours, 4);
    assert.equal(one.stats.find((s: any) => s.key === 'ot').value, 4);
  } finally {
    mock.timers.reset();
    if (server) await new Promise(resolve => server.close(resolve));
    await client.end().catch(() => {});
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
