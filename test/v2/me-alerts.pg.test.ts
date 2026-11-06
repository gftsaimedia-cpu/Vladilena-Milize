import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { hashPassword } from '../../src/modules/employees/employees.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';

// Cần PostgreSQL thật (PG_TEST_URL). D9 (06/11): GET /api/v2/me/today nhắc mọi ngày còn cần giải trình trong các tháng chưa
// Phê duyệt kỳ, không chỉ tuần hiện tại. Đồng hồ máy chủ được đặt cố định (chỉ Date) trong lúc gọi HTTP.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const PASS = 'Matkhau@123';
const NV1 = '11111111-1111-4111-8111-111111111111';
/** Thứ Sáu 20/11/2026 12:00 giờ VN. Tuần hiện tại là 16–22/11. */
const NOW = new Date('2026-11-20T05:00:00Z');

test('/me/today nhắc ngày chưa giải trình của tháng chưa duyệt, không nhắc tháng đã duyệt (D9)', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `me_alerts_${process.pid}_${Date.now()}`;
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
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
       VALUES ('nv1', 'nv1', 'staff', 'nv', 1, $1, $2, $3, '2026-01-05')`,
      [hashPassword(PASS), new Date().toISOString(), NV1]
    );
    // Vào muộn 08:40 (ân hạn 15 phút) ở ba ngày thứ Tư: 16/09 (tháng 9), 14/10 (tháng 10), 04/11 và 18/11 (tháng 11).
    // 04/11 nằm ngoài tuần hiện tại; 18/11 nằm trong tuần hiện tại. 11/11 đã giải trình xong (đang chờ duyệt).
    const lateDays = ['2026-09-16', '2026-10-14', '2026-11-04', '2026-11-11', '2026-11-18'];
    for (const date of lateDays) {
      for (const [at, type] of [
        [`${date}T08:40:00+07:00`, 'IN'],
        [`${date}T17:00:00+07:00`, 'OUT']
      ]) {
        await client.query(
          `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
             accuracy_meters, distance_meters, is_within_office, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
          [NV1, at, date, type]
        );
      }
    }
    // Đơn giải trình đang chờ duyệt của 11/11: ngày đó không nhắc nữa.
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at, explanation_date)
       VALUES (gen_random_uuid(), $1, 'Giải trình 11/11', 'EXPLANATION', 'Kẹt xe', 'PENDING', now(), now(), '2026-11-11')`,
      [NV1]
    );
    // Kỳ lương tháng 10 đã phê duyệt: 14/10 vẫn là todo nhưng không được nhắc, và quét dừng ở đó (16/09 cũng không).
    await client.query(`INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'approved')`);
    await client.end();

    db = createKysely(createPgPool(tempUrl.toString()));
    const days = new AttendanceDaysService(
      new AttendanceDaysRepository(db),
      new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
      new TransactionCoordinator(db)
    );
    await days.refreshDays(NV1, lateDays, { now: NOW });

    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Đăng nhập và đọc /today cùng trong một đồng hồ cố định, để phiên không lệch hạn.
    mock.timers.enable({ apis: ['Date'], now: NOW });
    let today: any;
    try {
      const login = await fetch(base + '/api/v2/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'nv1', password: PASS })
      });
      assert.equal(login.status, 201);
      const cookie = String(login.headers.get('set-cookie')).split(';')[0];
      const res = await fetch(base + '/api/v2/me/today', { headers: { cookie } });
      assert.equal(res.status, 200);
      today = await res.json();
    } finally {
      mock.timers.reset();
    }

    assert.equal(today.date, '2026-11-20');
    // 04/11 (hai tuần trước, cùng tháng mở) và 18/11 được nhắc; 11/11 đang chờ duyệt, 14/10 thuộc tháng đã duyệt, 16/09 sau tháng đã duyệt.
    assert.deepEqual(today.alerts, [
      { date: '2026-11-04', kind: 'todo' },
      { date: '2026-11-18', kind: 'todo' }
    ]);
    assert.deepEqual(today.alert, { date: '2026-11-18', kind: 'todo' });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.destroy();
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
