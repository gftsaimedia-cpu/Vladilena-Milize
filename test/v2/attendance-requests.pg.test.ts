import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { PositionTypeAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Loại `nv` có sẵn trong schema.sql (Thứ Hai đến Thứ Bảy,
// cờ paidLeave và isat bật). "Hôm nay" cố định là Thứ Tư 04/11/2026 17:00 giờ Việt Nam: 03/11 đã qua, 10/11 còn tới.
const NV = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-11-04T10:00:00Z');

async function seed(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date, leave_balance)
     VALUES ('nv', 'nv', 'staff', 'nv', 1, 'x', '2026-01-01', $1, '2026-01-05', 12),
            ('admin', 'admin', 'admin', 'nv', 1, 'x', '2026-01-01', $2, '2026-01-05', 12)`,
    [NV, ADMIN]
  );
}

function build(db: Kysely<DB>) {
  const coordinator = new TransactionCoordinator(db);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new PositionTypeAttendanceSettings(db),
    coordinator
  );
  const requests = new RequestsRepository(db);
  const attendance = new AttendanceRepository(db);
  const holidays = new HolidaysRepository(db);
  const dayStatus = new DayStatusRepository(db);
  const explanations = new ExplanationsService(
    requests,
    attendance,
    holidays,
    dayStatus,
    new ExplanationRemindersRepository(db)
  );
  const service = new RequestsService(
    requests,
    attendance,
    coordinator,
    holidays,
    dayStatus,
    undefined,
    undefined,
    explanations,
    days
  );
  service.now = () => NOW;
  explanations.now = () => NOW;
  return { service, days };
}

/** Chấm vào / ra bằng giờ Việt Nam; dòng ngày chỉ đổi khi gọi `refreshDays` (hoặc một thao tác đơn từ). */
async function punch(client: Client, date: string, inTime: string, outTime: string): Promise<void> {
  for (const [time, type] of [
    [inTime, 'IN'],
    [outTime, 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [NV, `${date}T${time}:00+07:00`, date, type]
    );
  }
}

async function row(client: Client, date: string) {
  const { rows } = await client.query(
    `SELECT status, pay_units, explanation_status, deduction_minutes, makeup_minutes, is_locked, leave_type
       FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`,
    [NV, date]
  );
  const r = rows[0];
  return r && { ...r, pay_units: Number(r.pay_units) };
}

const annual = (service: RequestsService, startDate: string, endDate = startDate) =>
  service.createLeaveRequest({
    employeeId: 'nv',
    title: 'Phép năm',
    reason: 'Việc nhà',
    leaveType: 'ANNUAL',
    startDate,
    endDate
  });
const explain = (service: RequestsService, workDate: string) =>
  service.createExplanationRequest({ employeeId: 'nv', reason: 'Kẹt xe', workDate });
const approve = (service: RequestsService, id: string) => service.reviewRequest(id, 'admin', 'APPROVE');
const reject = (service: RequestsService, id: string) => service.reviewRequest(id, 'admin', 'REJECT', 'Không đủ người');

describe('Đơn từ ghi lại dòng ngày công trên PostgreSQL (T2)', () => {
  it('duyệt Phép năm một ngày làm: LEAVE_PAID, payUnits 1', async t => {
    await withTempDb(t, 'att_req_leave', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      const leave = await annual(service, '2026-11-10');
      const pending = await row(client, '2026-11-10');
      assert.deepEqual([pending.status, pending.pay_units], ['PENDING', 0]);

      await approve(service, leave.id);
      const after = await row(client, '2026-11-10');
      assert.equal(after.status, 'LEAVE_PAID');
      assert.equal(after.pay_units, 1);
      assert.equal(after.leave_type, 'ANNUAL');
    });
  });

  it('nộp rồi từ chối: dòng ngày về ABSENT (ngày đã qua) hoặc PENDING (ngày tới), dù dòng đang sai', async t => {
    await withTempDb(t, 'att_req_reject', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      const past = await annual(service, '2026-11-03');
      const future = await annual(service, '2026-11-10');
      // Làm hỏng cả hai dòng: chỉ lần ghi lại lúc từ chối mới sửa được.
      await client.query(`UPDATE timesheet_entries SET status = 'LEAVE_PAID', pay_units = 1 WHERE employee_id = $1`, [NV]);

      await reject(service, past.id);
      await reject(service, future.id);

      assert.equal((await row(client, '2026-11-03')).status, 'ABSENT');
      assert.equal((await row(client, '2026-11-03')).pay_units, 0);
      assert.equal((await row(client, '2026-11-10')).status, 'PENDING');
      assert.equal((await row(client, '2026-11-10')).pay_units, 0);
    });
  });

  it('ngày đã ABSENT rồi được duyệt phép: LEAVE_PAID', async t => {
    await withTempDb(t, 'att_req_absent', async (db, client) => {
      await seed(client);
      const { service, days } = build(db);
      await days.refreshDays(NV, ['2026-11-03'], { now: NOW });
      assert.equal((await row(client, '2026-11-03')).status, 'ABSENT');

      const leave = await annual(service, '2026-11-03');
      await approve(service, leave.id);
      const after = await row(client, '2026-11-03');
      assert.deepEqual([after.status, after.pay_units], ['LEAVE_PAID', 1]);
    });
  });

  it('nghỉ có làm bù duyệt: ngày nghỉ LEAVE_MAKEUP; ngày bù chấm 18:00–22:00 có makeupMinutes 240', async t => {
    await withTempDb(t, 'att_req_makeup', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await punch(client, '2026-11-12', '18:00', '22:00');
      await punch(client, '2026-11-16', '18:00', '22:00');
      const lwm = await service.createLeaveWithMakeupRequest({
        employeeId: 'nv',
        title: 'Nghỉ có bù',
        reason: 'Việc nhà',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        slots: [
          { date: '2026-11-12', startTime: '18:00', endTime: '22:00' },
          { date: '2026-11-16', startTime: '18:00', endTime: '22:00' }
        ]
      } as any);
      await approve(service, lwm.id);

      const off = await row(client, '2026-11-10');
      assert.deepEqual([off.status, off.pay_units], ['LEAVE_MAKEUP', 0]);
      assert.equal((await row(client, '2026-11-12')).makeup_minutes, 240);
      assert.equal((await row(client, '2026-11-16')).makeup_minutes, 240);
    });
  });

  it('iSAT duyệt: Thứ Bảy thành ISAT', async t => {
    await withTempDb(t, 'att_req_isat', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      const isat = await service.createIsatRequest({
        employeeId: 'nv',
        saturday: '2026-11-14',
        team: 'Nhóm thử',
        conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
      });
      assert.equal((await row(client, '2026-11-14')).status, 'PENDING');

      await approve(service, isat.id);
      const after = await row(client, '2026-11-14');
      assert.deepEqual([after.status, after.pay_units], ['ISAT', 1]);
    });
  });

  it('OT Chủ nhật 08–12 duyệt rồi chấm 08:00–12:00: EXTRA', async t => {
    await withTempDb(t, 'att_req_ot', async (db, client) => {
      await seed(client);
      const { service, days } = build(db);
      const ot = await service.createOvertimeRequest({
        employeeId: 'nv',
        title: 'OT',
        reason: 'Chốt số',
        otDate: '2026-11-15',
        startTime: '08:00',
        endTime: '12:00'
      } as any);
      assert.equal((await row(client, '2026-11-15')).status, 'REST');

      await approve(service, ot.id);
      assert.equal((await row(client, '2026-11-15')).status, 'EXTRA');

      await punch(client, '2026-11-15', '08:00', '12:00');
      await days.refreshDays(NV, ['2026-11-15'], { now: NOW });
      assert.equal((await row(client, '2026-11-15')).status, 'EXTRA');
    });
  });

  it('giải trình ngày trễ 40 phút: nộp PENDING và payUnits 0; duyệt payUnits 1, trừ 30; từ chối payUnits 0', async t => {
    await withTempDb(t, 'att_req_explain', async (db, client) => {
      await seed(client);
      const { service, days } = build(db);
      await punch(client, '2026-11-03', '08:40', '17:00');
      await punch(client, '2026-11-02', '08:40', '17:00');
      await days.refreshDays(NV, ['2026-11-02', '2026-11-03'], { now: NOW });
      assert.equal((await row(client, '2026-11-03')).explanation_status, 'NONE');

      const first = await explain(service, '2026-11-03');
      const filed = await row(client, '2026-11-03');
      assert.deepEqual([filed.status, filed.explanation_status, filed.pay_units], ['PRESENT', 'PENDING', 0]);

      await approve(service, first.id);
      const approved = await row(client, '2026-11-03');
      assert.deepEqual(
        [approved.explanation_status, approved.pay_units, approved.deduction_minutes],
        ['APPROVED', 1, 30]
      );

      const second = await explain(service, '2026-11-02');
      await reject(service, second.id);
      const rejected = await row(client, '2026-11-02');
      assert.deepEqual([rejected.explanation_status, rejected.pay_units], ['REJECTED', 0]);
    });
  });

  it('nộp giải trình rồi huỷ: explanationStatus về NONE', async t => {
    await withTempDb(t, 'att_req_cancel', async (db, client) => {
      await seed(client);
      const { service, days } = build(db);
      await punch(client, '2026-11-03', '08:40', '17:00');
      await days.refreshDays(NV, ['2026-11-03'], { now: NOW });

      const req = await explain(service, '2026-11-03');
      assert.equal((await row(client, '2026-11-03')).explanation_status, 'PENDING');

      await service.cancelRequest(req.id, NV, 'Nhầm ngày');
      const after = await row(client, '2026-11-03');
      assert.deepEqual([after.explanation_status, after.pay_units], ['NONE', 0]);
    });
  });

  it('ngày đã khoá: duyệt phép vẫn thành công, dòng giữ nguyên', async t => {
    await withTempDb(t, 'att_req_locked', async (db, client) => {
      await seed(client);
      const { service, days } = build(db);
      await days.refreshDays(NV, ['2026-11-03'], { now: NOW });
      await client.query(`UPDATE timesheet_entries SET is_locked = true WHERE employee_id = $1`, [NV]);
      const before = await row(client, '2026-11-03');

      const leave = await annual(service, '2026-11-03');
      const reviewed = await approve(service, leave.id);

      assert.equal(reviewed.status, 'APPROVED');
      assert.deepEqual(await row(client, '2026-11-03'), before);
    });
  });
});
