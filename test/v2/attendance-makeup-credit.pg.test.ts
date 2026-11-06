import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService, type CreateExplanationInput } from '../../src/modules/requests/requests.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Loại `nv` có sẵn trong schema.sql: tuần T2–T7, ca 08–17,
// bậc 1 lương 6.000.000, công chuẩn 26.
//
// FP6 (người dùng chốt 06/11), đầu–cuối bằng dịch vụ thật: Bình nghỉ có bù 13/11 (nợ 480 phút), bù hai buổi Chủ nhật
// 18:00–22:00 (08/11 và 15/11). 08/11 làm đủ. 15/11 vào 18:30, ra 22:00 và nộp giải trình "vào trễ" qua
// `RequestsService.createExplanationRequest` (đường nộp thật của Đơn từ), Admin duyệt qua `reviewRequest`.
//   Trả lương: 240 + 210 = 450 phút = 6.000.000 x 7,5 / 208 = 216.346.
//   Ghi nhận bù: chưa duyệt 450 (thiếu 30 phút -> còn nợ 1 ngày), duyệt rồi 480 (hết nợ).
const NOW = new Date('2026-11-16T10:00:00+07:00'); // Thứ Hai: 15/11 đã qua mốc xét
const MONTH_END = new Date('2026-12-01T03:00:00Z');
const BINH = '11111111-1111-4111-8111-111111111111';
const FIRST = '2026-11-08';
const SECOND = '2026-11-15';
const ADMIN = '99999999-9999-4999-8999-999999999999';

async function seedBinh(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
     VALUES ('nv-binh', 'Bình', 'nv', 1, 'x', '2026-01-01', 'long', $1, '2026-10-01')`,
    [BINH]
  );
  await client.query(
    `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ('admin', 'admin', 'admin', 'nv', 1, 'x', '2026-01-01', $1, '2026-01-05')`,
    [ADMIN]
  );
}

/** Đơn nghỉ có bù đã duyệt (nghỉ Thứ Sáu 13/11) với hai khung bù 18:00–22:00, và lịch nghỉ do `markLeaveDays` ghi. */
async function leaveWithMakeup(client: Client): Promise<void> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
       leave_type, leave_start_date, leave_end_date, leave_days_count)
     VALUES ($1, $2, 'Nghỉ có làm bù', 'LEAVE_WITH_MAKEUP', 'Việc nhà', 'APPROVED', now(), now(),
       'PERSONAL_UNPAID', '2026-11-13', '2026-11-13', 1)`,
    [id, BINH]
  );
  for (const date of [FIRST, SECOND]) {
    await client.query(
      `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes) VALUES ($1, $2, '18:00', '22:00', 240)`,
      [id, date]
    );
  }
  await client.query(
    `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time,
       schedule_type, status, source_request_id)
     VALUES ($1, '2026-11-13', 'NORMAL', '08:00', '17:00', 'REGULAR', 'ON_LEAVE', $2)`,
    [BINH, id]
  );
}

/**
 * Chuyên cần của Bình đo được trên phiếu: đi làm đủ mọi ngày T2–T7 của tháng 11 trừ ngày nghỉ có bù 13/11 và hai ngày nghỉ
 * không lương 17, 18/11 (hai ngày nghỉ cho chuyên cần). Ngưỡng mất chuyên cần mặc định là 3 ngày: thiếu bù 30 phút thành
 * 2 + 1 = 3 ngày thì mất; ghi nhận đủ khung thì 2 ngày, giữ.
 */
async function fullAttendanceMonth(client: Client): Promise<void> {
  const unpaid = randomUUID();
  await client.query(
    `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
       leave_type, leave_start_date, leave_end_date, leave_days_count)
     VALUES ($1, $2, 'Nghỉ không lương', 'LEAVE', 'Việc nhà', 'APPROVED', now(), now(),
       'PERSONAL_UNPAID', '2026-11-17', '2026-11-18', 2)`,
    [unpaid, BINH]
  );
  for (const date of ['2026-11-17', '2026-11-18']) {
    await client.query(
      `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time,
         schedule_type, status, source_request_id)
       VALUES ($1, $2, 'NORMAL', '08:00', '17:00', 'REGULAR', 'ON_LEAVE', $3)`,
      [BINH, date, unpaid]
    );
  }
  const skipped = new Set(['13', '17', '18']);
  for (let d = 2; d <= 30; d++) {
    const dd = String(d).padStart(2, '0');
    const date = `2026-11-${dd}`;
    if (skipped.has(dd) || new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;
    await punch(client, date, '08:00', '17:00');
  }
}

/** Chấm vào / ra theo giờ Việt Nam. */
async function punch(client: Client, date: string, inTime: string, outTime: string): Promise<void> {
  for (const [time, type] of [
    [inTime, 'IN'],
    [outTime, 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [BINH, `${date}T${time}:00+07:00`, date, type]
    );
  }
}

function build(db: Kysely<DB>) {
  const tx = new TransactionCoordinator(db);
  const reader = new SettingsReader(new SettingsRepository(db));
  const days = new AttendanceDaysService(new AttendanceDaysRepository(db), new SettingsAttendanceSettings(reader), tx);
  const explanations = new ExplanationsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    new HolidaysRepository(db),
    new DayStatusRepository(db),
    new ExplanationRemindersRepository(db),
    undefined,
    reader
  );
  explanations.now = () => NOW;
  const requests = new RequestsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    tx,
    new HolidaysRepository(db),
    new DayStatusRepository(db),
    undefined,
    undefined,
    explanations,
    undefined,
    undefined,
    days
  );
  requests.now = () => NOW;
  // The payslip refreshes the month under the employee lock on its own connection, so a test never holds that lock while
  // it generates one: the services are built here, but a payslip is only asked for between the filing steps.
  const payroll = new PayrollService(new PayrollRepository(db), reader, days, tx);
  payroll.now = () => MONTH_END;
  return { requests, payroll, rebuild: (dates: string[]) => days.refreshDays(BINH, dates, { now: NOW }) };
}

const dayRow = async (client: Client, date: string) =>
  (
    await client.query(
      `SELECT status, explanation_status, makeup_minutes, makeup_credit_minutes, pay_units, deduction_minutes
       FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`,
      [BINH, date]
    )
  ).rows[0];

describe('Vào trễ ở khung bù, giải trình được duyệt: trả phút có mặt, ghi nhận cả khung (FP6, 06/11)', () => {
  it('Bình 15/11 vào 18:30 ra 22:00: 210 phút trả, 240 ghi nhận; hết nợ nghỉ có bù khi Admin duyệt', async t => {
    await withTempDb(t, 'mk_credit_e2e', async (db, client) => {
      await seedBinh(client);
      await leaveWithMakeup(client);
      await fullAttendanceMonth(client);
      await punch(client, FIRST, '18:00', '22:00');
      await punch(client, SECOND, '18:30', '22:00');
      const f = build(db);
      await f.rebuild([FIRST, SECOND]);

      // Chưa giải trình: ghi nhận bằng phút có mặt (210), tháng thiếu 30 phút -> còn nợ 1 ngày.
      assert.deepEqual(
        [(await dayRow(client, FIRST)).makeup_minutes, (await dayRow(client, FIRST)).makeup_credit_minutes],
        [240, 240]
      );
      const before = await dayRow(client, SECOND);
      assert.deepEqual(
        [before.status, before.explanation_status, before.makeup_minutes, before.makeup_credit_minutes],
        ['EXTRA', 'NONE', 210, 210]
      );
      const slipBefore = await f.payroll.generateMonthlyPayslip(BINH, '2026-11');
      const creditOf = (slip: typeof slipBefore) => slip.dailyLines.reduce((sum, l) => sum + l.makeupCreditMinutes, 0);
      assert.equal(slipBefore.makeupPay, 216_346);
      assert.equal(creditOf(slipBefore), 450);
      // 22 work days; 2 unpaid leave days + the 30 minutes short (ceil(30 / 480) = 1) = 3 absence days: chuyên cần lost.
      assert.equal(slipBefore.actualWorkDays, 22);
      assert.equal(slipBefore.attendanceAllowanceActual, 0);

      // Bình nộp "vào trễ" bằng đường nộp thật của Đơn từ; Admin duyệt.
      const filed = await f.requests.createExplanationRequest({
        employeeId: 'nv-binh',
        reason: 'Kẹt xe',
        workDate: SECOND
      } satisfies CreateExplanationInput);
      assert.deepEqual(filed.explanationCases, ['LATE_CHECK_IN']);
      // Pending explanation: nothing is credited beyond the minutes present.
      const pending = await dayRow(client, SECOND);
      assert.deepEqual(
        [pending.explanation_status, pending.makeup_minutes, pending.makeup_credit_minutes],
        ['PENDING', 210, 210]
      );
      const reviewed = await f.requests.reviewRequest(filed.id, 'admin', 'APPROVE');
      assert.equal(reviewed.status, 'APPROVED');

      const after = await dayRow(client, SECOND);
      assert.deepEqual(
        [after.explanation_status, after.makeup_minutes, after.makeup_credit_minutes],
        ['APPROVED', 210, 240]
      );
      assert.equal(after.pay_units, 0); // a rest day: still no day salary, no deduction
      assert.equal(after.deduction_minutes, 0);

      const slip = await f.payroll.generateMonthlyPayslip(BINH, '2026-11');
      // Pay is the minutes present, to the dong: 6.000.000 x (450 / 60) / 208.
      assert.equal(slip.makeupPay, 216_346);
      const line = slip.dailyLines.find(l => l.date === SECOND);
      assert.deepEqual(
        [line?.makeupMinutes, line?.makeupCreditMinutes, line?.makeupPay, line?.daySalary, line?.deductionAmount],
        [210, 240, 100_962, 0, 0]
      );
      assert.equal(creditOf(slip), 480);
      // The slip's own outcome: 2 absence days + shortfall 0 = 2 < 3, chuyên cần kept
      // (25% x 6.000.000 x 22 work days / 26 = 1.269.230,77).
      assert.equal(slip.attendanceAllowanceActual, 1_269_231);
    });
  });

  it('Admin từ chối giải trình: ghi nhận quay về 210', async t => {
    await withTempDb(t, 'mk_credit_reject', async (db, client) => {
      await seedBinh(client);
      await leaveWithMakeup(client);
      await punch(client, SECOND, '18:30', '22:00');
      const f = build(db);
      await f.rebuild([SECOND]);
      const filed = await f.requests.createExplanationRequest({
        employeeId: 'nv-binh',
        reason: 'Kẹt xe',
        workDate: SECOND
      } satisfies CreateExplanationInput);
      await f.requests.reviewRequest(filed.id, 'admin', 'REJECT', 'Không đủ lý do');
      const row = await dayRow(client, SECOND);
      assert.deepEqual(
        [row.explanation_status, row.makeup_minutes, row.makeup_credit_minutes],
        ['REJECTED', 210, 210]
      );
    });
  });
});
