import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';

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

/** Một lần chấm theo giờ Việt Nam; bảng lương đọc nó qua dòng ngày công (AttendanceDaysService). */
async function punch(client: Client, employeeId: string, date: string, time: string, type: 'IN' | 'OUT') {
  await client.query(
    `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
       accuracy_meters, distance_meters, is_within_office, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
    [employeeId, `${date}T${time}:00+07:00`, date, type]
  );
}

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
    // Một nhân sự nv bậc 1, hợp đồng dài hạn. Ngày 01/10 không chấm (dòng ngày ABSENT). Các task sau thêm seed vào đây.
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid,
         leave_balance, leave_balance_on, contract_status)
       VALUES ($1, 'Nhân viên in phiếu', 'nv', 1, 'x', $2, 'long', $3, 12, '2026-10-01', 'probation')`,
      [USERNAME, now, UUID]
    );
    // Phép năm: số dư 12 tính từ 2026-10-01; ba ngày phép năm đã duyệt (20/10, 21/10, 05/11) và một đơn đang chờ (27/10).
    // Hai đơn đã duyệt không được trừ vào số dư: phép năm ngày 30/09 (trước ngày chốt số dư) và nghỉ có lương việc riêng 15/10 (không phải phép năm).
    const leaveRequests: Array<[string, string, string, string]> = [
      ['00000000-0000-4000-8000-000000000001', 'APPROVED', '2026-10-20', 'ANNUAL'],
      ['00000000-0000-4000-8000-000000000002', 'APPROVED', '2026-10-21', 'ANNUAL'],
      ['00000000-0000-4000-8000-000000000003', 'APPROVED', '2026-11-05', 'ANNUAL'],
      ['00000000-0000-4000-8000-000000000004', 'PENDING', '2026-10-27', 'ANNUAL'],
      ['00000000-0000-4000-8000-000000000007', 'APPROVED', '2026-09-30', 'ANNUAL'],
      ['00000000-0000-4000-8000-000000000008', 'APPROVED', '2026-10-15', 'PERSONAL_PAID']
    ];
    for (const [id, status, day, leaveType] of leaveRequests) {
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, leave_type, leave_start_date,
           leave_end_date, leave_days_count, created_at, updated_at)
         VALUES ($1, $2, 'Nghỉ phép', 'LEAVE', 'Việc riêng', $3, $5, $4, $4, 1, now(), now())`,
        [id, UUID, status, day, leaveType]
      );
      await client.query(
        `INSERT INTO day_status (employee_id, work_date, status, request_id) VALUES ($1, $2, 'LEAVE', $3)`,
        [UUID, day, id]
      );
    }

    // Giờ thật: ngày 07/10 chỉ có giờ vào 08:12 (giờ Việt Nam), giờ ra thiếu được lấp bằng đơn giải trình đã duyệt 19:20.
    await punch(client, UUID, '2026-10-07', '08:12', 'IN');
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, explanation_date, actual_check_in,
         actual_check_out, created_at, updated_at)
       VALUES ('00000000-0000-4000-8000-000000000005', $1, 'Giải trình', 'EXPLANATION', 'Quên chấm ra', 'APPROVED',
         '2026-10-07', NULL, '19:20', now(), now())`,
      [UUID]
    );

    // OT theo luật 04/11: thứ Bảy 10/10 là ngày lễ công ty (x3); vào 08:00, ra 20:30 (giờ Việt Nam), khung OT đã duyệt 18:00-20:00.
    await client.query(`INSERT INTO company_holidays (holiday_date, name) VALUES ('2026-10-10', 'Lễ thử')`);
    await punch(client, UUID, '2026-10-10', '08:00', 'IN');
    await punch(client, UUID, '2026-10-10', '20:30', 'OUT');
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_start_time, ot_end_time,
         ot_hours, created_at, updated_at)
       VALUES ('00000000-0000-4000-8000-000000000006', $1, 'Làm thêm giờ', 'OVERTIME', 'Chốt việc', 'APPROVED',
         '2026-10-10', '18:00', '20:00', 2, now(), now())`,
      [UUID]
    );

    db = createKysely(createPgPool(tempUrl.toString()));
    const repo = new PayrollRepository(db);
    const coordinator = new TransactionCoordinator(db);
    const days = new AttendanceDaysService(
      new AttendanceDaysRepository(db),
      new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
      coordinator
    );
    const service = new PayrollService(repo, undefined, days, coordinator);
    // Tính ngày 01/11: mọi ngày tháng 10 đã tới mốc xét.
    service.now = () => new Date('2026-11-01T03:00:00Z');

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
      assert.equal(slip.dailyLines.find(l => l.date === '2026-10-01')?.kind, 'ABSENT');
      assert.equal(slip.dailyLines.find(l => l.date === '2026-10-01')?.inOutText, '—–—');
    });

    await t.test('OT ngày lễ tính x3 trên dòng ngày từ khung đã duyệt và giờ có mặt thật', async () => {
      const line = slip.dailyLines.find(l => l.date === '2026-10-10');
      assert.equal(line?.kind, 'HOLIDAY');
      assert.equal(line?.otHours, 2);
      assert.equal(line?.otPay, 173_077);
      assert.equal(slip.ot30Hours, 2);
      assert.equal(slip.ot20Hours, 0);
      assert.equal(slip.otPayTotal, 173_077);
      const details = (await repo.getPayslip(MONTH, UUID))?.details;
      assert.equal(details?.otPayTotal, 173_077);
      assert.equal(details?.ot30Pay, 173_077);
      assert.equal(details?.dailyLines.find(l => l.date === '2026-10-10')?.otPay, 173_077);
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
