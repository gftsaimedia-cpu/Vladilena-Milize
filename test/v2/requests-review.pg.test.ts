import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client, Pool } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';

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
    new HolidaysRepository(db),
    new DayStatusRepository(db)
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

    await t.test('request detail lists the days the request holds (dates)', async () => {
      const created = await service.createLeaveRequest({ ...leaveInput('pg-user', '2026-11-24'), endDate: '2026-11-25' });
      const detail = await service.getById(created.id);
      assert.deepEqual(detail?.dates, ['2026-11-24', '2026-11-25']);
    });

    await t.test('leave with makeup saves its slots inside the lock transaction, on submit and on approval', async () => {
      const created = await service.createLeaveWithMakeupRequest({
        employeeId: 'pg-user',
        title: 'Nghỉ bù',
        reason: 'Việc nhà',
        startDate: '2026-11-19',
        endDate: '2026-11-19',
        slots: [
          { date: '2026-11-20', startTime: '18:00', endTime: '22:00' },
          { date: '2026-11-23', startTime: '18:00', endTime: '22:00' }
        ]
      });
      const reviewed = await service.reviewRequest(created.id, 'pg-admin', 'APPROVE');
      assert.deepEqual([reviewed.status, reviewed.makeupSlots.length], ['APPROVED', 2]);
      const slots = await client.query(`SELECT count(*)::int AS n FROM makeup_slots WHERE request_id = $1`, [created.id]);
      assert.equal(slots.rows[0].n, 2);
    });

    await t.test('a failing save rolls back the leave days written by the approval', async () => {
      // Trigger chỉ chặn việc chuyển đơn có lý do "Lưu lỗi" sang APPROVED: lịch đã ghi trước đó phải huỷ theo.
      // (Đánh dấu bằng lý do vì tiêu đề do server đặt.)
      await client.query(`
        CREATE FUNCTION fail_review() RETURNS trigger AS $$
        BEGIN
          IF NEW.reason = 'Lưu lỗi' AND NEW.status = 'APPROVED' THEN RAISE EXCEPTION 'lưu đơn lỗi (test)'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_review BEFORE UPDATE ON system_requests FOR EACH ROW EXECUTE FUNCTION fail_review();
      `);
      const created = await service.createLeaveRequest({
        ...leaveInput('pg-user', '2026-11-16'),
        endDate: '2026-11-17',
        reason: 'Lưu lỗi'
      });

      await assert.rejects(service.reviewRequest(created.id, 'pg-admin', 'APPROVE'), /lưu đơn lỗi \(test\)/);

      const row = await client.query(`SELECT status, reviewed_by FROM system_requests WHERE id = $1`, [created.id]);
      assert.deepEqual(row.rows, [{ status: 'PENDING', reviewed_by: null }]);
      const days = await client.query(
        `SELECT work_date FROM work_schedules WHERE employee_id = 'pg-uuid-1' AND work_date BETWEEN '2026-11-16' AND '2026-11-17'`
      );
      assert.deepEqual(days.rows, []);
    });

    await t.test('a two-connection pool serves four employees at once without running dry', async () => {
      const ids = ['pg-c1', 'pg-c2', 'pg-c3', 'pg-c4'];
      for (const id of ids) {
        await client.query(
          `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid) VALUES ($1, $1, 'nv', 1, 'x', $2, $3)`,
          [id, new Date().toISOString(), `${id}-uuid`]
        );
      }
      // Pool nhỏ, chờ kết nối tối đa 3 giây: nếu truy vấn trong khoá xin thêm kết nối thì cạn pool và báo timeout.
      const small = createKysely(new Pool({ connectionString: tempUrl.toString(), max: 2, connectionTimeoutMillis: 3000 }));
      try {
        const smallService = serviceOn(small);
        const results = await Promise.allSettled(ids.map(id => smallService.createLeaveRequest(leaveInput(id, '2026-11-18'))));
        assert.deepEqual(
          results.map(r => (r.status === 'fulfilled' ? r.value.status : String(r.reason?.message ?? r.reason))),
          ['PENDING', 'PENDING', 'PENDING', 'PENDING']
        );
      } finally {
        await small.destroy();
      }
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
