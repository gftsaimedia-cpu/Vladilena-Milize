import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL). D10 (06/11): thu nhập tạm tính giữa tháng coi khung làm bù đã xếp mà chưa kết thúc là
// sẽ làm, chỉ cho chuyên cần. Loại `nv`: lương 6.000.000, công chuẩn 26, chuyên cần 25%, mất chuyên cần từ 3 ngày nghỉ.
const BINH = '11111111-1111-4111-8111-111111111111';

async function punch(client: Client, date: string, inTime: string, outTime: string) {
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

function payrollAt(db: Kysely<DB>, now: Date) {
  const coordinator = new TransactionCoordinator(db);
  const reader = new SettingsReader(new SettingsRepository(db));
  const days = new AttendanceDaysService(new AttendanceDaysRepository(db), new SettingsAttendanceSettings(reader), coordinator);
  const payroll = new PayrollService(new PayrollRepository(db), reader, days, coordinator);
  payroll.now = () => now;
  return payroll;
}

describe('Thu nhập tạm tính đếm khung làm bù đã xếp cho chuyên cần trên PostgreSQL (D10)', () => {
  it('khung ở tương lai giữ chuyên cần; khung đã qua mà không làm thì mất; hết tháng thì không còn khung dự kiến', async t => {
    await withTempDb(t, 'payroll_makeup_est', async (db, client) => {
      await client.query(
        `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
         VALUES ('nv-binh', 'nv-binh', 'nv', 1, 'x', '2026-01-01', 'long', $1, '2026-11-02')`,
        [BINH]
      );
      // Tháng 11/2026 của Bình: làm 02, 05, 06, 07, 09, 11 (6 ngày công); vắng 03 và 04 (2 ngày nghỉ); nghỉ có bù 10/11.
      for (const date of ['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-11']) {
        await punch(client, date, '08:00', '17:00');
      }
      const makeup = randomUUID();
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
           leave_start_date, leave_end_date, leave_days_count)
         VALUES ($1, $2, 'Nghỉ có làm bù', 'LEAVE_WITH_MAKEUP', 'Thử', 'APPROVED', now(), now(), '2026-11-10', '2026-11-10', 1)`,
        [makeup, BINH]
      );
      await client.query(
        `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time,
           schedule_type, status, source_request_id)
         VALUES ($1, '2026-11-10', 'NORMAL', '08:00', '17:00', 'REGULAR', 'ON_LEAVE', $2)`,
        [BINH, makeup]
      );
      // Hai khung bù 18:00–22:00 (240 phút làm thực mỗi khung = 480 phút nợ): thứ Bảy 14/11 và thứ Hai 16/11.
      for (const date of ['2026-11-14', '2026-11-16']) {
        await client.query(
          `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes)
           VALUES ($1, $2, '18:00', '22:00', 240)`,
          [makeup, date]
        );
      }
      // Đơn nghỉ có bù chưa duyệt không được tính: một khung thứ ba của đơn đang chờ không làm đổi kết quả.
      const pending = randomUUID();
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
           leave_start_date, leave_end_date, leave_days_count)
         VALUES ($1, $2, 'Nghỉ có làm bù', 'LEAVE_WITH_MAKEUP', 'Thử', 'PENDING', now(), now(), '2026-11-20', '2026-11-20', 1)`,
        [pending, BINH]
      );
      await client.query(
        `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes)
         VALUES ($1, '2026-11-21', '18:00', '22:00', 240)`,
        [pending]
      );

      // Chuyên cần 25% x 6.000.000 x 6 ngày công ÷ 26 = 346.153,85. Ngày nghỉ cho chuyên cần = 2 vắng + số ngày bù thiếu; mất từ 3.
      // 12/11 10:00: cả hai khung còn ở phía trước -> thiếu = ⌈(480 − 0 − 480) ÷ 480⌉ = 0 -> 2 ngày < 3 -> giữ.
      const midMonth = await payrollAt(db, new Date('2026-11-12T03:00:00Z')).generateMonthlyPayslip(BINH, '2026-11');
      assert.equal(midMonth.actualWorkDays, 6);
      assert.equal(midMonth.attendanceAllowanceActual, 346_154);
      assert.equal(midMonth.makeupPay, 0); // khung dự kiến không trả tiền

      // 20/11: cả hai khung đã qua mà không ai làm (0 phút bù) -> thiếu = ⌈480 ÷ 480⌉ = 1 -> 2 + 1 = 3 -> mất.
      const afterWindows = await payrollAt(db, new Date('2026-11-20T03:00:00Z')).generateMonthlyPayslip(BINH, '2026-11');
      assert.equal(afterWindows.attendanceAllowanceActual, 0);

      // Chỉ còn một khung đã duyệt phía trước (240 phút): thiếu = ⌈(480 − 240) ÷ 480⌉ = 1 -> 3 ngày -> mất. Khung 21/11 của đơn
      // đang chờ (240 phút nữa) mà được tính thì đủ 480 và giữ: kết quả mất chứng tỏ đơn chưa duyệt không được tính.
      await client.query(`DELETE FROM makeup_slots WHERE work_date = '2026-11-16'`);
      const oneWindow = await payrollAt(db, new Date('2026-11-12T03:00:00Z')).generateMonthlyPayslip(BINH, '2026-11');
      assert.equal(oneWindow.attendanceAllowanceActual, 0);

      // 01/12 (hết tháng): không còn khung nào chưa kết thúc, kết quả thật là mất.
      const monthEnd = await payrollAt(db, new Date('2026-12-01T03:00:00Z')).generateMonthlyPayslip(BINH, '2026-11');
      assert.equal(monthEnd.attendanceAllowanceActual, 0);
    });
  });
});
