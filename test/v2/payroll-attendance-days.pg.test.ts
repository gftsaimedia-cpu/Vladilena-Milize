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
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { SettingsChanges } from '../../src/modules/settings/settings-changes';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Loại `nv` có sẵn trong schema.sql: tuần T2–T7, công
// chuẩn 26, cờ paidLeave / paidHoliday / isat bật; bậc 1 lương 6.000.000. Cài đặt mặc định: ân hạn 15, mất chuyên cần từ 3.
const BINH = '11111111-1111-4111-8111-111111111111';
const AN = '22222222-2222-4222-8222-222222222222';

async function addStaff(client: Client, username: string, uuid: string, startDate: string | null = null) {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
     VALUES ($1, $1, 'nv', 1, 'x', '2026-01-01', 'long', $2, $3)`,
    [username, uuid, startDate]
  );
}

/** Chấm vào / ra theo giờ Việt Nam. */
async function punch(client: Client, employeeId: string, date: string, inTime: string, outTime: string) {
  for (const [time, type] of [
    [inTime, 'IN'],
    [outTime, 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [employeeId, `${date}T${time}:00+07:00`, date, type]
    );
  }
}

/** Một đơn đã duyệt; `columns` là các cột riêng của loại đơn. */
async function approved(client: Client, type: string, columns: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  const names = Object.keys(columns);
  await client.query(
    `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
       ${names.join(', ')})
     VALUES ($1, $2, $3, $3, 'Thử', 'APPROVED', now(), now(), ${names.map((_, i) => `$${i + 4}`).join(', ')})`,
    [id, BINH, type, ...Object.values(columns)]
  );
  return id;
}

/** Lịch nghỉ đã duyệt của một ngày, như `markLeaveDays` ghi khi duyệt đơn. */
async function onLeave(client: Client, date: string, requestId: string) {
  await client.query(
    `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time,
       schedule_type, status, source_request_id)
     VALUES ($1, $2, 'NORMAL', '08:00', '17:00', 'REGULAR', 'ON_LEAVE', $3)`,
    [BINH, date, requestId]
  );
}

function build(db: Kysely<DB>, now: Date) {
  const coordinator = new TransactionCoordinator(db);
  const settingsRepo = new SettingsRepository(db);
  const reader = new SettingsReader(settingsRepo);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(reader),
    coordinator
  );
  const repo = new PayrollRepository(db);
  const payroll = new PayrollService(repo, reader, days, coordinator);
  payroll.now = () => now;
  const settings = new SettingsService(settingsRepo, reader, coordinator, new SettingsChanges(), new AuditLog(new AuditRepository(), coordinator));
  return { payroll, repo, settings };
}

describe('Phiếu lương đọc dòng ngày dùng chung trên PostgreSQL (T6, spec 8.1)', () => {
  // Ví dụ đầu–cuối của spec 13: Bình, nv bậc 1, vào làm 02/11/2026. Tính ngày 01/12, nên mọi ngày tháng 11 đã tới mốc xét.
  it('tháng 11 của Bình: giải trình, vắng, nghỉ có bù, OT Chủ nhật, phép năm và chuyên cần', async t => {
    await withTempDb(t, 'payroll_days', async (db, client) => {
      await addStaff(client, 'nv-binh', BINH, '2026-11-02');

      await punch(client, BINH, '2026-11-02', '08:02', '17:05');
      await punch(client, BINH, '2026-11-03', '08:40', '17:00');
      await approved(client, 'EXPLANATION', { explanation_date: '2026-11-03' });
      await punch(client, BINH, '2026-11-04', '08:40', '17:00'); // chưa giải trình
      // 05/11: không chấm.

      // Nghỉ có bù 10/11, bù 18:00–22:00 ngày 12/11 và 16/11, làm đủ.
      const makeup = await approved(client, 'LEAVE_WITH_MAKEUP', {
        leave_start_date: '2026-11-10',
        leave_end_date: '2026-11-10',
        leave_days_count: 1
      });
      await onLeave(client, '2026-11-10', makeup);
      for (const date of ['2026-11-12', '2026-11-16']) {
        await client.query(
          `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes)
           VALUES ($1, $2, '18:00', '22:00', 240)`,
          [makeup, date]
        );
        await punch(client, BINH, date, '08:00', '22:00');
      }

      // Chủ nhật 15/11: OT 08:00–12:00 đã duyệt, làm đủ.
      await approved(client, 'OVERTIME', {
        ot_date: '2026-11-15',
        ot_start_time: '08:00',
        ot_end_time: '12:00',
        ot_hours: 4
      });
      await punch(client, BINH, '2026-11-15', '08:00', '12:00');

      // Phép năm 18/11.
      const leave = await approved(client, 'LEAVE', {
        leave_type: 'ANNUAL',
        leave_start_date: '2026-11-18',
        leave_end_date: '2026-11-18',
        leave_days_count: 1
      });
      await onLeave(client, '2026-11-18', leave);

      // Các ngày làm còn lại (T2–T7): 08:00–17:00.
      const special = new Set(['02', '03', '04', '05', '10', '12', '16', '18']);
      for (let d = 2; d <= 30; d++) {
        const dd = String(d).padStart(2, '0');
        const date = `2026-11-${dd}`;
        if (special.has(dd) || new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;
        await punch(client, BINH, date, '08:00', '17:00');
      }

      const { payroll } = build(db, new Date('2026-12-01T03:00:00Z'));
      const slip = await payroll.generateMonthlyPayslip(BINH, '2026-11');
      const line = (date: string) => slip.dailyLines.find(l => l.date === date);

      assert.equal(slip.dayRate, 230_769);
      assert.deepEqual([line('2026-11-02')?.daySalary, line('2026-11-02')?.dailyTotal], [230_769, 230_769]);

      // BUG-4: giải trình đã duyệt trừ theo khối 30 phút, không theo 40 phút thật.
      const explained = line('2026-11-03');
      assert.deepEqual(
        [explained?.daySalary, explained?.deductionAmount, explained?.dailyTotal],
        [230_769, 14_423, 216_346]
      );
      // BUG-3: trễ chưa giải trình thì 0 đ; ngày vắng 0 đ.
      assert.equal(line('2026-11-04')?.daySalary, 0);
      assert.equal(line('2026-11-05')?.daySalary, 0);
      assert.equal(line('2026-11-05')?.kind, 'ABSENT');

      const explanationWarnings = slip.warnings.filter(w => w.code.startsWith('EXPLANATION_'));
      assert.deepEqual(explanationWarnings, [
        { code: 'EXPLANATION_MISSING', message: '04/11 chưa giải trình', fields: ['2026-11-04'] },
        { code: 'EXPLANATION_MISSING', message: '05/11 chưa giải trình', fields: ['2026-11-05'] }
      ]);
      assert.ok(slip.warnings.every(w => !(w.fields ?? []).includes('2026-11-03')));

      // Không có dòng cho ngày ngoài thời gian làm (01/11, trước ngày vào làm) hay Chủ nhật không làm.
      const stored = await client.query(
        `SELECT to_char(work_date, 'YYYY-MM-DD') AS d, status FROM timesheet_entries WHERE employee_id = $1`,
        [BINH]
      );
      const statusOf = new Map(stored.rows.map(r => [r.d, r.status]));
      assert.equal(statusOf.get('2026-11-01'), 'OUTSIDE');
      assert.equal(statusOf.get('2026-11-08'), 'REST');
      for (const date of ['2026-11-01', '2026-11-08', '2026-11-22', '2026-11-29']) {
        assert.equal(line(date), undefined, date);
      }
      // 30/11 đã xét theo đồng hồ của service, dù hôm nay thật còn trước đó.
      assert.deepEqual([line('2026-11-30')?.kind, line('2026-11-30')?.daySalary], ['PRESENT', 230_769]);

      // Nghỉ có bù: ngày nghỉ 0 đ, tiền bù ở ngày bù (L14).
      assert.deepEqual([line('2026-11-10')?.shiftCode, line('2026-11-10')?.daySalary], ['MAKEUP_LEAVE', 0]);
      for (const date of ['2026-11-12', '2026-11-16']) {
        assert.deepEqual(
          [line(date)?.daySalary, line(date)?.makeupMinutes, line(date)?.makeupPay, line(date)?.dailyTotal],
          [230_769, 240, 115_385, 346_154],
          date
        );
      }
      // D1: 480 phút bù của tháng tính một lần: 6.000.000 x 8 / 208 = 230.769 (mỗi dòng vẫn hiện 115.385).
      assert.equal(slip.makeupPay, 230_769);

      // Chủ nhật có OT: dòng EXTRA, không lương ngày, chỉ tiền OT x2 (L12).
      assert.deepEqual(
        [line('2026-11-15')?.kind, line('2026-11-15')?.daySalary, line('2026-11-15')?.otPay],
        ['EXTRA', 0, 230_769]
      );

      // BUG-2: phép năm đã duyệt trả một ngày lương.
      assert.deepEqual([line('2026-11-18')?.shiftCode, line('2026-11-18')?.daySalary], ['LEAVE', 230_769]);
      assert.equal(slip.paidLeavePay, 230_769);

      // 25 ngày làm từ 02/11; không tính 04 (chưa giải trình), 05 (vắng), 10 (nghỉ có bù), 18 (phép).
      assert.equal(slip.actualWorkDays, 21);
      // Ngày nghỉ cho chuyên cần: 05/11 và 18/11 = 2 < 3, bù đủ nên 10/11 không đếm; 04/11 không đếm (L17).
      assert.equal(slip.attendanceAllowanceActual, 1_211_538);
    });
  });

  it('lễ rơi vào ngày nghỉ tuần của người đó không có dòng lễ được trả (lần tính kỳ)', async t => {
    await withTempDb(t, 'payroll_days_holiday', async (db, client) => {
      await addStaff(client, 'nv-binh', BINH);
      await addStaff(client, 'nv-an', AN);
      await client.query(
        `INSERT INTO company_holidays (holiday_date, name) VALUES ('2026-12-12', 'Lễ thứ Bảy'), ('2026-12-25', 'Lễ thứ Sáu')`
      );
      const { payroll, repo, settings } = build(db, new Date('2027-01-01T03:00:00Z'));
      // Bình làm T2–T6 từ 12/2026 (công chuẩn 22); An giữ tuần T2–T7 của loại.
      const savedAt = new Date('2026-11-05T03:00:00Z');
      await settings.saveWorkWeek('nv-binh', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-12', stamp: 0 }, 'admin', savedAt);

      const result = await payroll.calculatePeriodPayslips('2026-12', [BINH, AN], 'tester');
      assert.deepEqual(result.errors, []);

      const binh = (await repo.getPayslip('2026-12', BINH))!.details;
      const binhHolidays = binh.dailyLines.filter(l => l.kind === 'HOLIDAY').map(l => [l.date, l.daySalary]);
      assert.deepEqual(binhHolidays, [['2026-12-25', 272_727]]);
      assert.equal(binh.dailyLines.find(l => l.date === '2026-12-12'), undefined);
      assert.equal(binh.holidayPaidDays, 1);

      const an = (await repo.getPayslip('2026-12', AN))!.details;
      const anHolidays = an.dailyLines.filter(l => l.kind === 'HOLIDAY').map(l => [l.date, l.daySalary]);
      assert.deepEqual(anHolidays, [
        ['2026-12-12', 230_769],
        ['2026-12-25', 230_769]
      ]);
      assert.equal(an.holidayPaidDays, 2);
    });
  });
});
