import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy migration trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

/** Service đầy đủ trên một Kysely: khoá theo nhân viên chạy bằng advisory lock thật. */
function serviceOn(db: Kysely<DB>): RequestsService {
  return new RequestsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    new TransactionCoordinator(db),
    new HolidaysRepository(db)
  );
}

const leaveInput = (employeeId: string, date: string) => ({
  employeeId,
  title: 'Nghỉ',
  reason: 'Việc nhà',
  leaveType: 'PERSONAL_UNPAID',
  startDate: date,
  endDate: date
});

test('Duyệt đơn trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `requests_review_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;

  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  let db: Kysely<DB> | null = null;
  let controlConnected = false;
  let clientConnected = false;

  try {
    await control.connect();
    controlConnected = true;
    await control.query(`CREATE DATABASE ${dbName}`);
    await client.connect();
    clientConnected = true;
    for (const file of MIGRATIONS) {
      await client.query(readFileSync(file, 'utf8'));
    }
    // Như DB thật: mọi tài khoản có uuid khác tên đăng nhập.
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'pg-uuid-1'),
              ('pg-admin', 'Quản trị PG', 'nv', 1, 'x', $1, 'pg-admin-uuid')`,
      [new Date().toISOString()]
    );
    db = createKysely(createPgPool(tempUrl.toString()));
    const service = serviceOn(db);

    await t.test('approving by username stores the reviewer uuid and marks the day', async () => {
      const created = await service.createLeaveRequest(leaveInput('pg-user', '2026-11-12'));
      const reviewed = await service.reviewRequest(created.id, 'pg-admin', 'APPROVE');
      assert.equal(reviewed.reviewedBy, 'pg-admin-uuid');

      const row = await client.query(`SELECT status, reviewed_by FROM system_requests WHERE id = $1`, [created.id]);
      assert.deepEqual(row.rows, [{ status: 'APPROVED', reviewed_by: 'pg-admin-uuid' }]);
      const day = await client.query(
        `SELECT status, source_request_id FROM work_schedules WHERE employee_id = 'pg-uuid-1' AND work_date = '2026-11-12'`
      );
      assert.deepEqual(day.rows, [{ status: 'ON_LEAVE', source_request_id: created.id }]);
    });

    await t.test('rejecting by username stores the reviewer uuid', async () => {
      const created = await service.createLeaveRequest(leaveInput('pg-user', '2026-11-13'));
      await service.reviewRequest(created.id, 'pg-admin', 'REJECT', 'Không đủ người');
      const row = await client.query(`SELECT status, reviewed_by FROM system_requests WHERE id = $1`, [created.id]);
      assert.deepEqual(row.rows, [{ status: 'REJECTED', reviewed_by: 'pg-admin-uuid' }]);
    });
  } finally {
    if (db) await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});
