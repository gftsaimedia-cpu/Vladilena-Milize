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
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Ví dụ đầu–cuối của spec 13 đi hết luồng thật:
// RequestsService (nộp, duyệt) -> AttendanceService.recordPunch -> PayrollService.generateMonthlyPayslip.
// Loại `nv` có sẵn trong schema.sql: tuần T2–T7, công chuẩn 26, bậc 1 lương 6.000.000, ân hạn 15, mất chuyên cần từ 3.
const BINH = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';

/** Giờ Việt Nam (+07:00) của một thời điểm, để đọc `now` cho dễ. */
const vn = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

async function seed(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date, leave_balance)
     VALUES ('binh', 'Bình', 'staff', 'nv', 1, 'x', '2026-01-01', $1, '2026-11-02', 12),
            ('admin', 'admin', 'admin', 'nv', 1, 'x', '2026-01-01', $2, '2026-01-05', 12)`,
    [BINH, ADMIN]
  );
}

function build(db: Kysely<DB>) {
  const coordinator = new TransactionCoordinator(db);
  const reader = new SettingsReader(new SettingsRepository(db));
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(reader),
    coordinator
  );
  const attendanceRepo = new AttendanceRepository(db);
  const holidays = new HolidaysRepository(db);
  const dayStatus = new DayStatusRepository(db);
  const requestsRepo = new RequestsRepository(db);
  const explanations = new ExplanationsService(
    requestsRepo,
    attendanceRepo,
    holidays,
    dayStatus,
    new ExplanationRemindersRepository(db)
  );
  const requests = new RequestsService(
    requestsRepo,
    attendanceRepo,
    coordinator,
    holidays,
    dayStatus,
    undefined,
    undefined,
    explanations,
    reader,
    days
  );
  const attendance = new AttendanceService(attendanceRepo, days, reader, coordinator);
  const payroll = new PayrollService(new PayrollRepository(db), reader, days, coordinator);

  /** Đặt đồng hồ của mọi service đọc "bây giờ" cho bước kế tiếp. */
  const setNow = (now: Date) => {
    requests.now = () => now;
    explanations.now = () => now;
    payroll.now = () => now;
  };
  return { requests, attendance, payroll, setNow };
}

const self = { filedBy: 'self' } as const;
const approve = (requests: RequestsService, id: string) => requests.reviewRequest(id, 'admin', 'APPROVE');

describe('Ví dụ đầu–cuối tháng 11/2026 của Bình (spec 13) trên PostgreSQL', () => {
  it('đơn nộp và duyệt, chấm công, rồi phiếu lương tháng 11', async t => {
    await withTempDb(t, 'att_november', async (db, client) => {
      await seed(client);
      const { requests, attendance, payroll, setNow } = build(db);

      const punch = async (date: string, inTime: string, outTime: string) => {
        await attendance.recordPunch({ employeeId: BINH, type: 'IN', punchedAt: vn(date, inTime) });
        await attendance.recordPunch({ employeeId: BINH, type: 'OUT', punchedAt: vn(date, outTime) });
      };

      // Chủ nhật 01/11 sáng: Bình tự nộp đơn nghỉ có bù 10/11 (bù 18:00–22:00 ngày 12/11 và 16/11) và phép năm 18/11.
      // Nhân viên tự nộp thì ngày phải từ hôm nay tới hết tháng sau, giờ phải tròn.
      setNow(vn('2026-11-01', '09:00'));
      const makeup = await requests.createLeaveWithMakeupRequest(
        {
          employeeId: 'binh',
          reason: 'Việc nhà',
          startDate: '2026-11-10',
          endDate: '2026-11-10',
          slots: [
            { date: '2026-11-12', startTime: '18:00', endTime: '22:00' },
            { date: '2026-11-16', startTime: '18:00', endTime: '22:00' }
          ]
        },
        self
      );
      const annual = await requests.createLeaveRequest(
        { employeeId: 'binh', reason: 'Việc nhà', leaveType: 'ANNUAL', startDate: '2026-11-18', endDate: '2026-11-18' },
        self
      );

      // Thứ Hai 02/11 sáng: Admin duyệt cả hai đơn.
      setNow(vn('2026-11-02', '08:00'));
      await approve(requests, makeup.id);
      await approve(requests, annual.id);

      // Ruling: đơn OT Chủ nhật 15/11 do Admin ghi thẳng vào bảng đơn, vì luật nộp đơn (planOvertime và planMakeup) không
      // cho một tháng vừa có đơn nghỉ có làm bù vừa có đơn OT, trong khi ví dụ spec 13 cần cả hai. Đơn có đủ cột như đơn
      // đã duyệt qua dịch vụ; dòng ngày công vẫn do refreshDays dựng từ đơn này.
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
           ot_date, ot_start_time, ot_end_time, ot_hours, reviewed_by, reviewed_at)
         VALUES ($1, $2, 'OT Chủ nhật 15/11', 'OVERTIME', 'Chốt số', 'APPROVED', now(), now(),
           '2026-11-15', '08:00', '12:00', 4, $3, now())`,
        [randomUUID(), BINH, ADMIN]
      );

      // Thứ Hai 02/11 và Thứ Ba 03/11: chấm công.
      await punch('2026-11-02', '08:02', '17:05');
      await punch('2026-11-03', '08:40', '17:00');

      // Thứ Tư 04/11 sáng: Bình giải trình ngày 03/11 (ngày đã qua), Admin duyệt.
      setNow(vn('2026-11-04', '09:00'));
      const explanation = await requests.createExplanationRequest(
        { employeeId: 'binh', reason: 'Kẹt xe', workDate: '2026-11-03' },
        self
      );
      await approve(requests, explanation.id);

      // 04/11 trễ như 03/11 nhưng không giải trình; 05/11 không chấm.
      await punch('2026-11-04', '08:40', '17:00');

      // Các ngày làm sau đó: 12/11 và 16/11 làm tới hết khung bù, 15/11 làm hết khung OT, còn lại 08:00–17:00.
      const special: Record<string, [string, string]> = {
        '2026-11-12': ['08:00', '22:00'],
        '2026-11-15': ['08:00', '12:00'],
        '2026-11-16': ['08:00', '22:00']
      };
      const skipped = new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-10', '2026-11-18']);
      for (let d = 6; d <= 30; d++) {
        const date = `2026-11-${String(d).padStart(2, '0')}`;
        if (skipped.has(date)) continue;
        const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
        if (special[date]) await punch(date, ...special[date]);
        else if (!sunday) await punch(date, '08:00', '17:00');
      }

      // 01/12 10:00: tính phiếu lương tháng 11; mọi ngày tháng 11 đã tới mốc xét.
      setNow(vn('2026-12-01', '10:00'));
      const slip = await payroll.generateMonthlyPayslip(BINH, '2026-11');
      const line = (date: string) => slip.dailyLines.find(l => l.date === date);
      const summary = (date: string) => {
        const l = line(date);
        return l && { kind: l.kind, payUnits: l.payUnits, daySalary: l.daySalary };
      };

      assert.equal(slip.dayRate, 230_769);

      // T2 02/11: 08:02–17:05 -> đủ ngày.
      assert.deepEqual(summary('2026-11-02'), { kind: 'PRESENT', payUnits: 1, daySalary: 230_769 });
      assert.equal(line('2026-11-02')?.deductionAmount, 0);

      // T3 03/11: 08:40–17:00, giải trình đã duyệt -> trừ một khối 30 phút (14.423), không theo 40 phút thật.
      assert.deepEqual(summary('2026-11-03'), { kind: 'PRESENT', payUnits: 1, daySalary: 230_769 });
      assert.deepEqual([line('2026-11-03')?.deductionHours, line('2026-11-03')?.deductionAmount], [0.5, 14_423]);
      assert.equal(line('2026-11-03')?.dailyTotal, 216_346);

      // T4 04/11: trễ không giải trình -> 0 đ, có cảnh báo, không vào số ngày đi làm (L17).
      assert.deepEqual(summary('2026-11-04'), { kind: 'PRESENT', payUnits: 0, daySalary: 0 });
      assert.equal(line('2026-11-04')?.countsAsWorkday, false);
      assert.equal(line('2026-11-04')?.countsAsDayOff, false);

      // T5 05/11: không chấm -> vắng, ngày nghỉ.
      assert.deepEqual(summary('2026-11-05'), { kind: 'ABSENT', payUnits: 0, daySalary: 0 });
      assert.equal(line('2026-11-05')?.countsAsDayOff, true);

      const explanationWarnings = slip.warnings.filter(w => w.code.startsWith('EXPLANATION_'));
      assert.deepEqual(explanationWarnings, [
        { code: 'EXPLANATION_MISSING', message: '04/11 chưa giải trình', fields: ['2026-11-04'] },
        { code: 'EXPLANATION_MISSING', message: '05/11 chưa giải trình', fields: ['2026-11-05'] }
      ]);

      // T3 10/11: nghỉ có bù -> 0 đ, không phải ngày nghỉ cho chuyên cần.
      assert.deepEqual(summary('2026-11-10'), { kind: 'LEAVE_MAKEUP', payUnits: 0, daySalary: 0 });
      assert.equal(line('2026-11-10')?.countsAsDayOff, false);

      // T5 12/11 và T2 16/11: đi làm đủ ngày, thêm 240 phút bù trả x1 lương giờ, làm tròn từng dòng.
      for (const date of ['2026-11-12', '2026-11-16']) {
        assert.deepEqual(summary(date), { kind: 'PRESENT', payUnits: 1, daySalary: 230_769 }, date);
        assert.deepEqual([line(date)?.makeupMinutes, line(date)?.makeupPay], [240, 115_385], date);
        assert.equal(line(date)?.dailyTotal, 346_154, date);
      }
      assert.equal(slip.makeupPay, 230_770);

      // CN 15/11: OT 08–12 đã duyệt -> dòng EXTRA, không lương ngày, chỉ tiền OT x2 (4 x 28.846 x 2).
      assert.deepEqual(summary('2026-11-15'), { kind: 'EXTRA', payUnits: 0, daySalary: 0 });
      assert.equal(line('2026-11-15')?.otPay, 230_769);
      assert.equal(line('2026-11-15')?.countsAsWorkday, false);

      // T4 18/11: phép năm đã duyệt -> một lương ngày, ngày nghỉ.
      assert.deepEqual(summary('2026-11-18'), { kind: 'LEAVE_PAID', payUnits: 1, daySalary: 230_769 });
      assert.equal(line('2026-11-18')?.countsAsDayOff, true);
      assert.equal(slip.paidLeavePay, 230_769);

      // Ngày nghỉ cho chuyên cần: chỉ 05/11 và 18/11 = 2. Bù đủ 2 x 240 = 480 phút cho 1 ngày nghỉ nên không có ngày bù
      // thiếu; 04/11 không đếm. Ngưỡng mất là 3 ngày nên Bình giữ chuyên cần.
      const dayOffDates = slip.dailyLines.filter(l => l.countsAsDayOff).map(l => l.date);
      assert.deepEqual(dayOffDates, ['2026-11-05', '2026-11-18']);
      assert.equal(slip.dailyLines.reduce((sum, l) => sum + l.makeupMinutes, 0), 480);
      assert.equal(slip.dailyLines.filter(l => l.kind === 'LEAVE_MAKEUP').length, 1);
      // 21 ngày đi làm trên 26 công chuẩn, phụ cấp chuyên cần 1.500.000 giữ nguyên tỉ lệ ngày đi làm.
      assert.equal(slip.actualWorkDays, 21);
      assert.equal(slip.attendanceAllowanceActual, 1_211_538);
    });
  });
});
