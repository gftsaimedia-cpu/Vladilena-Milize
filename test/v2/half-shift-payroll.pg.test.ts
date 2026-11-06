import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import type { DB } from '../../src/database/schema.js';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository.js';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port.js';
import { AuditLog } from '../../src/modules/audit/audit-log.js';
import { AuditRepository } from '../../src/modules/audit/audit.repository.js';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository.js';
import { PayrollService } from '../../src/modules/payroll/payroll.service.js';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository.js';
import { PeriodsService } from '../../src/modules/periods/periods.service.js';
import { PeriodGate } from '../../src/modules/periods/period-gate.js';
import { SettingsReader } from '../../src/modules/settings/settings-reader.js';
import { SettingsRepository } from '../../src/modules/settings/settings.repository.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { withTempDb } from './helpers/pg-temp-db.js';

const MONTH = '2026-11';
const NV_UUID = '0a7c4e2e-2222-4a6b-9c1d-000000000001';
const ADMIN_UUID = '0a7c4e2e-2222-4a6b-9c1d-000000000000';

test('Task 10: PostgreSQL - Bù và OT thật trên phiếu lương, đổi chấm công tính lại, duyệt đơn đưa phiếu về nháp', async (t) => {
  await withTempDb(t, 'half_shift_payroll_pg', async (db, client) => {
    // 1. Seed staff
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, contract, uuid, start_date)
       VALUES 
         ('admin', 'Quản trị', 'admin', 'nv', 1, 'x', now(), 'long', $1, '2026-01-01'),
         ('nv01', 'Nhân viên 01', 'staff', 'nv', 1, 'x', now(), 'long', $2, '2026-01-01')`,
      [ADMIN_UUID, NV_UUID]
    );

    const tx = new TransactionCoordinator(db);
    const setRepo = new SettingsRepository(db);
    const setReader = new SettingsReader(setRepo);
    const attSettings = new SettingsAttendanceSettings(setReader);
    const attDaysRepo = new AttendanceDaysRepository(db);
    const attDaysService = new AttendanceDaysService(attDaysRepo, attSettings, tx);
    const attRepo = new AttendanceRepository(db);
    const periodsRepo = new PeriodsRepository(db);
    const auditLog = new AuditLog(new AuditRepository(), tx);
    const periodsService = new PeriodsService(periodsRepo, tx, auditLog);
    periodsService.now = () => new Date('2026-12-01T08:00:00+07:00');

    const payrollRepo = new PayrollRepository(db);
    const payrollService = new PayrollService(payrollRepo, setReader, attDaysService, tx, periodsService);

    const reqRepo = new RequestsRepository(db);
    const holRepo = new HolidaysRepository(db);
    const dayStatusRepo = new DayStatusRepository(db);
    const periodGate = new PeriodGate(periodsRepo);
    const requestsService = new RequestsService(
      reqRepo,
      attRepo,
      tx,
      holRepo,
      dayStatusRepo,
      periodGate,
      payrollService,
      undefined,
      undefined,
      undefined,
      attDaysService
    );

    // 2. Chốt công kỳ 2026-11
    await client.query(
      `INSERT INTO payroll_periods (month, status)
       VALUES ($1, 'open')`,
      [MONTH]
    );

    // 3. Tạo các đơn: nửa ca 12/11 duyệt, hai khung OT 13/11 và 16/11 duyệt, và 1 đơn nửa ca 19/11 chờ duyệt
    const reqHalf = await requestsService.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Nghỉ nửa ca'
    });
    await requestsService.reviewRequest(reqHalf.id, 'admin', 'APPROVE');

    const reqNew = await requestsService.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-19',
      half: 'FIRST',
      reason: 'Nghỉ thêm nửa ca'
    });

    // Chèn 2 đơn OT đã duyệt
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, reason, type, status, ot_date, ot_start_time, ot_end_time, ot_hours, created_at, updated_at)
       VALUES 
         ('33333333-3333-4333-8333-333333333313', $1, 'Làm thêm', 'Tăng ca', 'OVERTIME', 'APPROVED', '2026-11-13', '18:00', '21:00', 3, now(), now()),
         ('33333333-3333-4333-8333-333333333316', $1, 'Làm thêm', 'Tăng ca', 'OVERTIME', 'APPROVED', '2026-11-16', '18:00', '21:00', 3, now(), now())`,
      [NV_UUID]
    );

    // 4. Chèn chấm công vào punch_events
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude, accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES 
         (gen_random_uuid(), $1, '2026-11-12T08:00:00+07:00', '2026-11-12', 'IN', 0, 0, 10, 0, true, now()),
         (gen_random_uuid(), $1, '2026-11-12T12:00:00+07:00', '2026-11-12', 'OUT', 0, 0, 10, 0, true, now()),
         (gen_random_uuid(), $1, '2026-11-13T08:00:00+07:00', '2026-11-13', 'IN', 0, 0, 10, 0, true, now()),
         (gen_random_uuid(), $1, '2026-11-13T21:00:00+07:00', '2026-11-13', 'OUT', 0, 0, 10, 0, true, now()),
         (gen_random_uuid(), $1, '2026-11-16T08:00:00+07:00', '2026-11-16', 'IN', 0, 0, 10, 0, true, now()),
         (gen_random_uuid(), $1, '2026-11-16T21:00:00+07:00', '2026-11-16', 'OUT', 0, 0, 10, 0, true, now())`,
      [NV_UUID]
    );

    // Tính phiếu lương
    const slip1 = await payrollService.generateMonthlyPayslip(NV_UUID, MONTH);
    assert.equal(slip1.halfShiftOwedMinutes, 240);
    assert.equal(slip1.halfShiftRepaidMinutes, 240);
    assert.equal(slip1.halfShiftRepaidPay, 115_385);
    assert.equal(slip1.ot15Hours, 2);
    assert.equal(slip1.ot15Pay, 86_538);
    assert.equal(slip1.halfShiftDroppedMinutes, 0);

    // 5. Đổi chấm công: 16/11 chỉ làm đến 17:00 (không có mặt khung 18-21)
    await client.query(
      `UPDATE punch_events 
       SET punched_at = '2026-11-16T17:00:00+07:00'
       WHERE employee_id = $1 AND work_date = '2026-11-16' AND type = 'OUT'`,
      [NV_UUID]
    );

    // Tính lại phiếu lương
    const slip2 = await payrollService.generateMonthlyPayslip(NV_UUID, MONTH);
    assert.equal(slip2.halfShiftOwedMinutes, 240);
    assert.equal(slip2.halfShiftRepaidMinutes, 180);
    assert.equal(slip2.halfShiftRepaidPay, 86_538);
    assert.equal(slip2.halfShiftDroppedMinutes, 60);
    assert.equal(slip2.ot15Hours, 0);

    // 6. Chốt công và tính toán kỳ lương để lưu phiếu vào DB, chuyển trạng thái period sang 'calculated'
    await periodsService.lock(MONTH, 'admin');
    await payrollService.calculatePeriodPayslips(MONTH, undefined, 'admin');

    // Phê duyệt phiếu lương
    await payrollService.decidePayslip(MONTH, 'nv01', 'approved', 'admin', 'ok');
    const slipStatusBefore = (await client.query(
      `SELECT status FROM payslips WHERE username = $1 ORDER BY id DESC LIMIT 1`,
      ['nv01']
    )).rows[0]?.status;
    assert.equal(slipStatusBefore, 'approved');

    // 7. Duyệt đơn nửa ca 19/11 trong tháng đã tính -> phiếu phải về 'draft'
    await requestsService.reviewRequest(reqNew.id, 'admin', 'APPROVE');

    const slipStatusAfter = (await client.query(
      `SELECT status FROM payslips WHERE username = $1 ORDER BY id DESC LIMIT 1`,
      ['nv01']
    )).rows[0]?.status;
    assert.equal(slipStatusAfter, 'draft');
  });
});
