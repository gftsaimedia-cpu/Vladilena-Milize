import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { hashPassword } from '../../src/modules/employees/employees.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tạo DB tạm,
// nạp schema, dựng máy chủ HTTP thật trên cổng ngẫu nhiên, và xoá DB khi xong.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const PASS = 'Matkhau@123';
const NV1 = '11111111-1111-4111-8111-111111111111';
/** Sau cả ba ngày thử, nên ngày làm đã tới mốc xét. */
const NOW = new Date('2026-10-20T05:00:00Z');

test('/me đọc dòng ngày dùng chung trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `me_att_${process.pid}_${Date.now()}`;
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
    // Loại 'nv' có sẵn trong schema: tuần T2–T7 từ 2000-01, ân hạn vào trễ 15 phút.
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
       VALUES ('nv1', 'nv1', 'staff', 'nv', 1, $1, $2, $3, '2026-01-05')`,
      [hashPassword(PASS), new Date().toISOString(), NV1]
    );
    // Thứ Tư 14/10/2026: vào 08:40, ra 17:00 (giờ VN). Thứ Năm 15/10 không chấm. Chủ nhật 18/10 không chấm.
    for (const [at, type] of [
      ['2026-10-14T01:40:00Z', 'IN'],
      ['2026-10-14T10:00:00Z', 'OUT']
    ]) {
      await client.query(
        `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
           accuracy_meters, distance_meters, is_within_office, created_at)
         VALUES (gen_random_uuid(), $1, $2, '2026-10-14', $3, 0, 0, 1, 1, true, now())`,
        [NV1, at, type]
      );
    }
    await client.end();

    // Ghi dòng ngày bằng dịch vụ thật, như job hằng giờ và các nơi gọi khác.
    db = createKysely(createPgPool(tempUrl.toString()));
    const days = new AttendanceDaysService(
      new AttendanceDaysRepository(db),
      new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
      new TransactionCoordinator(db)
    );
    await days.refreshDays(NV1, ['2026-10-14', '2026-10-15', '2026-10-18'], { now: NOW });

    // DATABASE_URL phải đặt trước khi nạp bootstrap (module DB đọc biến lúc nạp).
    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const login = await fetch(base + '/api/v2/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nv1', password: PASS })
    });
    assert.equal(login.status, 201);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const get = async (path: string) => {
      const res = await fetch(base + path, { headers: { cookie } });
      assert.equal(res.status, 200, path);
      return (await res.json()) as any;
    };

    const month = await get('/api/v2/me/attendance?month=2026-10');
    const late = month.days.find((d: any) => d.date === '2026-10-14');
    assert.equal(late.kind, 'todo');
    assert.equal(late.explanationStatus, 'none');
    assert.equal(late.cases[0].code, 'LATE_CHECK_IN');
    assert.equal(late.cases[0].affectsPay, true);
    assert.deepEqual([late.in, late.out], ['08:40', '17:00']);

    assert.equal(month.days.find((d: any) => d.date === '2026-10-15').kind, 'absent');
    assert.equal(month.days.find((d: any) => d.date === '2026-10-18').kind, 'off');
    assert.equal(month.totals.workDays, 0); // ngày trễ chưa giải trình thì chưa tính công
    assert.equal(month.totals.standardDays, 26); // tuần T2–T7 của loại 'nv', công chuẩn 26

    const day = await get('/api/v2/me/attendance/2026-10-14');
    assert.equal(day.kind, 'todo');
    assert.equal(day.explanationStatus, 'none');
    assert.deepEqual(day.shift, { start: '08:00', end: '17:00' });
    assert.equal(day.cases[0].code, 'LATE_CHECK_IN');
    assert.ok('explanation' in day && 'due' in day, 'phần giải trình của đơn từ vẫn nằm trên route ngày');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.destroy();
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
