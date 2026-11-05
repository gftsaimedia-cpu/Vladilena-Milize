import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy lược đồ trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

const MONTH = '2026-10';
const UUID = 'pp-uuid-1';
const USERNAME = 'pp-user';

test('Phiếu lương A4 trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `payroll_print_${process.pid}_${Date.now()}`;
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

    // ===== Seed =====
    // Một nhân sự nv bậc 1, hợp đồng dài hạn, một ngày công NORMAL. Các task sau thêm seed vào đây.
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid,
         leave_balance, leave_balance_on, contract_status)
       VALUES ($1, 'Nhân viên in phiếu', 'nv', 1, 'x', $2, 'long', $3, 12, '2026-10-01', 'probation')`,
      [USERNAME, now, UUID]
    );
    await client.query(
      `INSERT INTO timesheet_entries (id, employee_id, work_date, shift_type, shift_start_time, shift_end_time,
         shift_allowance_pct, work_hours, status, day_status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-10-01', 'NORMAL', '08:00', '17:00', 0, 8, 'PRESENT', 'VALID', now(), now())`,
      [UUID]
    );
    // Phép năm: số dư 12 tính từ 2026-10-01; ba ngày phép năm đã duyệt (20/10, 21/10, 05/11) và một đơn đang chờ (27/10).
    const leaveRequests: Array<[string, string, string]> = [
      ['00000000-0000-4000-8000-000000000001', 'APPROVED', '2026-10-20'],
      ['00000000-0000-4000-8000-000000000002', 'APPROVED', '2026-10-21'],
      ['00000000-0000-4000-8000-000000000003', 'APPROVED', '2026-11-05'],
      ['00000000-0000-4000-8000-000000000004', 'PENDING', '2026-10-27']
    ];
    for (const [id, status, day] of leaveRequests) {
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, leave_type, leave_start_date,
           leave_end_date, leave_days_count, created_at, updated_at)
         VALUES ($1, $2, 'Nghỉ phép năm', 'LEAVE', 'Việc riêng', $3, 'ANNUAL', $4, $4, 1, now(), now())`,
        [id, UUID, status, day]
      );
      await client.query(
        `INSERT INTO day_status (employee_id, work_date, status, request_id) VALUES ($1, $2, 'LEAVE', $3)`,
        [UUID, day, id]
      );
    }

    // Giờ thật: ngày 07/10 chỉ có giờ vào 08:12 (giờ Việt Nam), giờ ra thiếu được lấp bằng đơn giải trình đã duyệt 19:20.
    await client.query(
      `INSERT INTO timesheet_entries (id, employee_id, work_date, shift_type, shift_start_time, shift_end_time,
         shift_allowance_pct, work_hours, actual_check_in, actual_check_out, status, day_status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-10-07', 'NORMAL', '08:00', '17:00', 0, 8, '2026-10-07 08:12:00+07', NULL,
         'PRESENT', 'VALID', now(), now())`,
      [UUID]
    );
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, explanation_date, actual_check_in,
         actual_check_out, created_at, updated_at)
       VALUES ('00000000-0000-4000-8000-000000000005', $1, 'Giải trình', 'EXPLANATION', 'Quên chấm ra', 'APPROVED',
         '2026-10-07', NULL, '19:20', now(), now())`,
      [UUID]
    );

    db = createKysely(createPgPool(tempUrl.toString()));
    const repo = new PayrollRepository(db);
    const service = new PayrollService(repo);

    const slip = await service.generateMonthlyPayslip(UUID, MONTH);
    await repo.savePayrollRunAndSlips(MONTH, 'tester', [slip]);

    // ===== Assert =====
    // Các task sau thêm assert vào đây.
    await t.test('Loại, bậc, trạng thái nhân sự và phép năm còn lại tính từ day_status', async () => {
      const october = await repo.getMonthlyData(UUID, '2026-10');
      assert.equal(october?.staff.remainingAnnualLeaveDays, 10);
      assert.equal(october?.staff.employmentStatus, 'probation');
      assert.equal(october?.staff.level, 1);
      assert.equal((await repo.getMonthlyData(UUID, '2026-11'))?.staff.remainingAnnualLeaveDays, 9);
      const details = (await repo.getPayslip(MONTH, UUID))?.details;
      assert.equal(details?.employeeType, 'nv');
      assert.equal(details?.employmentStatus, 'probation');
      assert.equal(details?.remainingAnnualLeaveDays, 10);
    });

    await t.test('Dòng ngày hiện giờ vào thật và giờ ra lấp từ đơn giải trình đã duyệt', async () => {
      const line = slip.dailyLines.find(l => l.date === '2026-10-07');
      assert.equal(line?.checkIn, '08:12');
      assert.equal(line?.checkOut, '19:20');
      assert.equal(line?.inOutText, '08:12–19:20');
      assert.equal(slip.dailyLines.find(l => l.date === '2026-10-01')?.inOutText, '—–—');
    });

    await t.test('Từ chối lưu trạng thái rejected cùng lý do, người và lúc quyết định', async () => {
      const rejected = await repo.decidePayslip(MONTH, USERNAME, 'rejected', 'admin', 'Thiếu điểm KPI Quản lý');
      assert.equal(rejected?.status, 'rejected');
      assert.equal(rejected?.note, 'Thiếu điểm KPI Quản lý');
      assert.equal(rejected?.decidedBy, 'admin');
      assert.equal(typeof rejected?.decidedAt, 'string');
      assert.equal((await repo.getPayslip(MONTH, UUID))?.status, 'rejected');
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
