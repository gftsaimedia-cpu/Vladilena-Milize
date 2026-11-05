import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { hashPassword } from '../../src/modules/employees/employees.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';

// Cần PostgreSQL thật (PG_TEST_URL, vai trò được CREATE/DROP DATABASE): DB tạm, máy chủ HTTP thật cổng ngẫu nhiên.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const PASS = 'Matkhau@123';
const ADMIN = '00000000-0000-4000-8000-000000000001';
const NV1 = '11111111-1111-4111-8111-111111111111';
const NV2 = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-20T05:00:00Z');

test('API Admin: chấm công tuần, chi tiết nhân sự, tổng quan', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const dbName = `overview_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;
  const control = new Client({ connectionString: CONTROL_URL });
  await control.connect();
  await control.query(`CREATE DATABASE ${dbName}`);

  let server: any;
  let db: ReturnType<typeof createKysely> | undefined;
  try {
    const client = new Client({ connectionString: tempUrl.toString() });
    await client.connect();
    await client.query(readFileSync(SCHEMA, 'utf8'));
    for (const [username, name, role, uuid, start] of [
      ['admin', 'Quản trị', 'admin', ADMIN, '2026-01-01'],
      ['nv1', 'Nguyễn Văn Một', 'staff', NV1, '2026-01-05'],
      ['nv2', 'Trần Thị Hai', 'staff', NV2, '2026-01-05']
    ]) {
      await client.query(
        `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
         VALUES ($1, $2, $3, 'nv', 1, $4, $5, $6, $7)`,
        [username, name, role, hashPassword(PASS), new Date().toISOString(), uuid, start]
      );
    }
    // nv1: thứ Tư 14/10/2026 vào 08:00 ra 17:00 (giờ VN, đúng giờ).
    for (const [at, type] of [
      ['2026-10-14T01:00:00Z', 'IN'],
      ['2026-10-14T10:00:00Z', 'OUT']
    ]) {
      await client.query(
        `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
           accuracy_meters, distance_meters, is_within_office, created_at)
         VALUES (gen_random_uuid(), $1, $2, '2026-10-14', $3, 0, 0, 1, 1, true, now())`,
        [NV1, at, type]
      );
    }
    // nv2 có đơn nghỉ chờ duyệt 15–16/10 và một dòng nhật ký trong tháng 10 của nv1.
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, leave_type, leave_start_date,
         leave_end_date, leave_days_count, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Nghỉ', 'LEAVE', 'việc riêng', 'PENDING', 'ANNUAL', '2026-10-15', '2026-10-16', 2, now(), now())`,
      [NV2]
    );
    await client.query(
      `INSERT INTO audit_log (at, actor, action, entity_kind, entity_id, subject, month, reason, prev_hash, hash)
       VALUES ('2026-10-20T01:00:00.000Z', 'admin', 'attendance.recalculate', 'timesheet', '2026-10-14', 'nv1', '2026-10', 'sửa giờ', 'p', 'h')`
    );
    // Phiếu lương tháng 10: hai phiếu, lớn nhất là nv2.
    await client.query(
      `INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'calculated')`
    );
    await client.query(
      `INSERT INTO payroll_runs (id, month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, created_by, created_at)
       VALUES (1, '2026-10', 1, 'draft', 'x', 'x', 1, '{}', '{}', 'admin', '2026-10-31T00:00:00Z')`
    );
    for (const [username, net] of [['nv1', 7000000], ['nv2', 9000000]] as const) {
      await client.query(
        `INSERT INTO payslips (run_id, username, status, gross, insurance, tax, advance, net, staff_terms_json, snapshot_gz)
         VALUES (1, $1, 'draft', $2, 0, 0, 0, $2, '{}', $3)`,
        [username, net, gzipSync(Buffer.from('{}'))]
      );
    }
    await client.end();

    db = createKysely(createPgPool(tempUrl.toString()));
    const days = new AttendanceDaysService(
      new AttendanceDaysRepository(db),
      new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
      new TransactionCoordinator(db)
    );
    await days.refreshDays(NV1, ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'], { now: NOW });

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
    const admin = await loginAs('admin');
    const staff = await loginAs('nv1');
    const get = async (path: string, cookie = admin) => {
      const res = await fetch(base + path, { headers: { cookie } });
      return { status: res.status, body: (await res.json()) as any };
    };

    // ---- Tuần ----
    const week = await get('/api/v2/attendance/week?from=2026-10-14');
    assert.equal(week.status, 200);
    assert.deepEqual(week.body.days, [
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'
    ]);
    const row1 = week.body.rows.find((r: any) => r.username === 'nv1');
    assert.equal(row1.name, 'Nguyễn Văn Một');
    assert.equal(row1.days.length, 7);
    assert.equal(row1.days[2].kind, 'work');
    assert.deepEqual([row1.days[2].in, row1.days[2].out], ['08:00', '17:00']);
    assert.equal(row1.days[3].kind, 'absent');
    assert.equal(row1.days[6].kind, 'off'); // Chủ nhật
    assert.deepEqual(week.body.pending, [{ username: 'nv2', date: '2026-10-15', kind: 'leave' }]);

    const filtered = await get('/api/v2/attendance/week?from=2026-10-14&q=trần');
    assert.deepEqual(filtered.body.rows.map((r: any) => r.username), ['nv2']);
    const none = await get('/api/v2/attendance/week?from=2026-10-14&group=zzz');
    assert.deepEqual(none.body.rows, []);
    assert.equal((await get('/api/v2/attendance/week?from=2026-02-30')).status, 400);

    // ---- Chi tiết một người ----
    const one = await get('/api/v2/attendance/employees/nv1?month=2026-10');
    assert.equal(one.status, 200);
    assert.equal(one.body.person.username, 'nv1');
    assert.equal(one.body.days.length, 31);
    assert.equal(one.body.days[13].kind, 'work');
    assert.equal(one.body.totals.workDays, 1);
    assert.equal(one.body.totals.standardDays, 26);
    assert.deepEqual(one.body.history, [{ at: '2026-10-20T01:00:00.000Z', actor: 'admin', text: 'attendance.recalculate: sửa giờ' }]);
    assert.equal((await get('/api/v2/attendance/employees/khong-co?month=2026-10')).status, 404);
    assert.equal((await get('/api/v2/attendance/employees/nv1?month=2026-13')).status, 400);

    // ---- Tổng quan ----
    const ov = await get('/api/v2/overview?month=2026-10');
    assert.equal(ov.status, 200);
    assert.equal(ov.body.kpis.headcount, 3);
    assert.equal(ov.body.kpis.pendingRequests, 1);
    assert.equal(ov.body.kpis.payrollNet, 16000000);
    const counts = ov.body.attendance.today;
    assert.equal(Object.values<number>(counts).reduce((a, b) => a + b, 0), 3);
    assert.ok(ov.body.kpis.presentToday >= 0);
    assert.equal(ov.body.payroll.status, 'calculated');
    assert.deepEqual(ov.body.payroll.lines.map((l: any) => [l.username, l.name, l.net]), [
      ['nv2', 'Trần Thị Hai', 9000000],
      ['nv1', 'Nguyễn Văn Một', 7000000]
    ]);
    assert.deepEqual(ov.body.period, { month: '2026-10', state: 'calculated' });
    assert.equal((await get('/api/v2/overview?month=abc')).status, 400);

    // ---- Quyền ----
    for (const path of ['/api/v2/attendance/week', '/api/v2/attendance/employees/nv1', '/api/v2/overview']) {
      assert.equal((await get(path, staff)).status, 403, path);
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.destroy();
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
