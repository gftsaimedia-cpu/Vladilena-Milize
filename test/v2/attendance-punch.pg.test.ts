import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { PunchRefusedError } from '../../src/modules/attendance/attendance.errors';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Giờ trong test là giờ Việt Nam (+07:00).
const NV = '11111111-1111-4111-8111-111111111111';
const NIGHT = '22222222-2222-4222-8222-222222222222';

async function seed(client: Client): Promise<void> {
  const typeId = (
    await client.query(
      `INSERT INTO position_types (code, effective_month, name, workdays, flex_pct, night_pct, travel_pct,
         attendance_pct, regular_dows, makeup_dows, updated_by, updated_at)
       VALUES ('nv-test', '2000-01', 'NV', 26, 10, 30, 0, 0, '[1,2,3,4,5,6]', '[]', 'x', 'x') RETURNING id`
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES
       ($1, 'paidLeave', 1), ($1, 'paidHoliday', 1), ($1, 'isat', 0)`,
    [typeId]
  );
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ('nv', 'nv', 'nv-test', 1, 'x', '2026-01-01', $1, '2026-01-05')`,
    [NV]
  );
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date,
       shift_type, shift_start_time, shift_end_time, shift_allowance_pct)
     VALUES ('dem', 'dem', 'nv-test', 1, 'x', '2026-01-01', $1, '2026-01-05', 'NIGHT', '22:00', '07:00', 30)`,
    [NIGHT]
  );
}

/** `withSettings`: dùng SettingsReader thật (như DI) để có các chặn theo cài đặt; mặc định không có, chỉ đo dòng ngày. */
function build(db: Kysely<DB>, withSettings = false) {
  const coordinator = new TransactionCoordinator(db);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
    coordinator
  );
  const settings = withSettings ? new SettingsReader(new SettingsRepository(db)) : undefined;
  const service = new AttendanceService(new AttendanceRepository(db), days, settings, coordinator);
  return { service, days };
}

async function dayRow(client: Client, employeeId: string, date: string) {
  const { rows } = await client.query(
    `SELECT status, pay_units, day_status, cases_json, is_locked, actual_check_in, actual_check_out,
            shift_type, shift_start_time, shift_end_time
       FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`,
    [employeeId, date]
  );
  return rows[0];
}

async function punchCount(client: Client, employeeId: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*) AS n FROM punch_events WHERE employee_id = $1`, [employeeId]);
  return Number(rows[0].n);
}

describe('AttendanceService.recordPunch trên PostgreSQL (T1)', () => {
  it('đi trễ 08:40 và ra 17:00: dòng PRESENT, payUnits 0, dayStatus NEEDS_EXPLANATION', async t => {
    await withTempDb(t, 'att_punch_late', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-03T08:40:00+07:00') });
      const result = await service.recordPunch({
        employeeId: NV,
        type: 'OUT',
        punchedAt: new Date('2026-11-03T17:00:00+07:00')
      });

      assert.equal(result.timesheet.workDate, '2026-11-03');
      assert.equal(result.timesheet.payUnits, 0);
      assert.equal(result.timesheet.dayStatus, 'NEEDS_EXPLANATION');
      const row = await dayRow(client, NV, '2026-11-03');
      assert.equal(row.status, 'PRESENT');
      assert.equal(Number(row.pay_units), 0);
      assert.equal(JSON.parse(row.cases_json)[0].code, 'LATE_CHECK_IN');
    });
  });

  it('đúng giờ 08:00–17:00: payUnits 1, cases rỗng', async t => {
    await withTempDb(t, 'att_punch_ok', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-03T08:00:00+07:00') });
      const result = await service.recordPunch({
        employeeId: NV,
        type: 'OUT',
        punchedAt: new Date('2026-11-03T17:00:00+07:00')
      });
      assert.equal(result.timesheet.payUnits, 1);
      assert.deepEqual(result.timesheet.cases, []);
      assert.equal(result.timesheet.status, 'PRESENT');
    });
  });

  it('chấm Chủ nhật 15/11 không có OT: dòng REST, work_schedules không có dòng ngày đó (P5)', async t => {
    await withTempDb(t, 'att_punch_sun', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      const result = await service.recordPunch({
        employeeId: NV,
        type: 'IN',
        punchedAt: new Date('2026-11-15T09:00:00+07:00')
      });

      assert.equal(result.timesheet.workDate, '2026-11-15');
      assert.equal((await dayRow(client, NV, '2026-11-15')).status, 'REST');
      const schedules = await client.query(`SELECT 1 FROM work_schedules WHERE employee_id = $1`, [NV]);
      assert.equal(schedules.rows.length, 0);
    });
  });

  it('ngày có lịch ON_LEAVE: ném lỗi, không lưu lần chấm', async t => {
    await withTempDb(t, 'att_punch_leave', async (db, client) => {
      await seed(client);
      await client.query(
        `INSERT INTO work_schedules (id, employee_id, work_date, shift_type, planned_start_time, planned_end_time,
           approved_ot_hours, schedule_type, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '2026-11-04', 'NORMAL', '08:00', '17:00', 0, 'REGULAR', 'ON_LEAVE', now(), now())`,
        [NV]
      );
      const { service } = build(db);
      await assert.rejects(
        service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-04T08:00:00+07:00') }),
        /nghỉ phép/
      );
      assert.equal(await punchCount(client, NV), 0);
    });
  });

  it('ngày đã khoá: ném lỗi, không lưu lần chấm, dòng giữ nguyên', async t => {
    await withTempDb(t, 'att_punch_locked', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-03T08:00:00+07:00') });
      await client.query(`UPDATE timesheet_entries SET is_locked = true WHERE employee_id = $1`, [NV]);
      const before = await dayRow(client, NV, '2026-11-03');

      await assert.rejects(
        service.recordPunch({ employeeId: NV, type: 'OUT', punchedAt: new Date('2026-11-03T17:00:00+07:00') }),
        /khóa/
      );
      assert.equal(await punchCount(client, NV), 1);
      assert.deepEqual(await dayRow(client, NV, '2026-11-03'), before);
    });
  });

  it('ca đêm 22:00–07:00 (L21): vào 03/11 21:55, ra 04/11 07:05 không truyền workDate → cả hai thuộc 03/11', async t => {
    await withTempDb(t, 'att_punch_night', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await service.recordPunch({ employeeId: NIGHT, type: 'IN', punchedAt: new Date('2026-11-03T21:55:00+07:00') });
      const out = await service.recordPunch({
        employeeId: NIGHT,
        type: 'OUT',
        punchedAt: new Date('2026-11-04T07:05:00+07:00')
      });

      const { rows } = await client.query(
        `SELECT type, to_char(work_date, 'YYYY-MM-DD') AS work_date FROM punch_events
          WHERE employee_id = $1 ORDER BY punched_at`,
        [NIGHT]
      );
      assert.deepEqual(rows, [
        { type: 'IN', work_date: '2026-11-03' },
        { type: 'OUT', work_date: '2026-11-03' }
      ]);
      assert.equal(out.timesheet.workDate, '2026-11-03');
      const row = await dayRow(client, NIGHT, '2026-11-03');
      assert.equal(row.status, 'PRESENT');
      assert.equal(Number(row.pay_units), 1);
      assert.deepEqual(JSON.parse(row.cases_json), []);
      assert.equal(out.timesheet.payUnits, 1);
      // Ngày 04/11 không có lần chấm nào.
      assert.equal(await dayRow(client, NIGHT, '2026-11-04'), undefined);
    });
  });

  it('có truyền workDate thì giữ nguyên ngày đó', async t => {
    await withTempDb(t, 'att_punch_explicit', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await service.recordPunch({ employeeId: NIGHT, type: 'IN', punchedAt: new Date('2026-11-03T21:55:00+07:00') });
      const out = await service.recordPunch({
        employeeId: NIGHT,
        type: 'OUT',
        workDate: '2026-11-04',
        punchedAt: new Date('2026-11-04T07:05:00+07:00')
      });

      assert.equal(out.punch.workDate, '2026-11-04');
      const { rows } = await client.query(
        `SELECT to_char(work_date, 'YYYY-MM-DD') AS work_date FROM punch_events
          WHERE employee_id = $1 AND type = 'OUT'`,
        [NIGHT]
      );
      assert.deepEqual(rows, [{ work_date: '2026-11-04' }]);
    });
  });
});

describe('AttendanceService.recordPunch với SettingsReader thật trên PostgreSQL', () => {
  it('chấm vào Chủ nhật 15/11 không có đơn: NOT_A_WORKDAY, không lưu lần chấm, không có dòng ngày', async t => {
    await withTempDb(t, 'att_punch_set_sun', async (db, client) => {
      await seed(client);
      const { service } = build(db, true);
      await assert.rejects(
        service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-15T09:00:00+07:00') }),
        (e: any) => e instanceof PunchRefusedError && e.code === 'NOT_A_WORKDAY'
      );
      assert.equal(await punchCount(client, NV), 0);
      assert.equal(await dayRow(client, NV, '2026-11-15'), undefined);
    });
  });

  it('lần ra Chủ nhật không bị chặn và không tạo lịch, nên lần vào sau vẫn bị chặn (P5)', async t => {
    await withTempDb(t, 'att_punch_set_out', async (db, client) => {
      await seed(client);
      const { service } = build(db, true);
      const out = await service.recordPunch({ employeeId: NV, type: 'OUT', punchedAt: new Date('2026-11-15T17:00:00+07:00') });
      assert.equal(out.timesheet.status, 'REST');
      const schedules = await client.query(`SELECT 1 FROM work_schedules WHERE employee_id = $1`, [NV]);
      assert.equal(schedules.rows.length, 0);
      await assert.rejects(
        service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-15T18:00:00+07:00') }),
        (e: any) => e instanceof PunchRefusedError && e.code === 'NOT_A_WORKDAY'
      );
      assert.equal(await punchCount(client, NV), 1);
    });
  });

  it('dòng REGULAR cũ của Chủ nhật 15/11 không biến nó thành ngày làm: NOT_A_WORKDAY, không xoá dòng (FP4)', async t => {
    await withTempDb(t, 'att_punch_set_regular', async (db, client) => {
      await seed(client);
      await client.query(
        `INSERT INTO work_schedules (id, employee_id, work_date, shift_type, planned_start_time, planned_end_time, approved_ot_hours, schedule_type, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '2026-11-15', 'NORMAL', '08:00', '17:00', 0, 'REGULAR', 'PLANNED', now(), now())`,
        [NV]
      );
      const { service } = build(db, true);
      assert.equal(await service.workdayOf(NV, '2026-11-15'), false);
      await assert.rejects(
        service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-15T09:00:00+07:00') }),
        (e: any) => e instanceof PunchRefusedError && e.code === 'NOT_A_WORKDAY'
      );
      assert.equal(await punchCount(client, NV), 0);
      // Không xoá dòng cũ trong DB.
      const rows = await client.query(`SELECT schedule_type FROM work_schedules WHERE employee_id = $1`, [NV]);
      assert.deepEqual(rows.rows.map(r => r.schedule_type), ['REGULAR']);
    });
  });

  it('Chủ nhật có tăng ca đã duyệt: lần vào qua được (hasApprovedWorkOn) và dòng ngày là EXTRA', async t => {
    await withTempDb(t, 'att_punch_set_ot', async (db, client) => {
      await seed(client);
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
           ot_date, ot_start_time, ot_end_time)
         VALUES (gen_random_uuid(), $1, 't', 'OVERTIME', 'r', 'APPROVED', now(), now(), '2026-11-15', '08:00', '12:00')`,
        [NV]
      );
      const { service } = build(db, true);
      const result = await service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-15T08:00:00+07:00') });
      assert.equal(result.timesheet.workDate, '2026-11-15');
      assert.equal((await dayRow(client, NV, '2026-11-15')).status, 'EXTRA');
      assert.equal(await punchCount(client, NV), 1);
    });
  });

  it('ngày làm trong tuần: chấm như thường, dòng PRESENT', async t => {
    await withTempDb(t, 'att_punch_set_ok', async (db, client) => {
      await seed(client);
      const { service } = build(db, true);
      await service.recordPunch({ employeeId: NV, type: 'IN', punchedAt: new Date('2026-11-03T08:00:00+07:00') });
      const out = await service.recordPunch({ employeeId: NV, type: 'OUT', punchedAt: new Date('2026-11-03T17:00:00+07:00') });
      assert.equal(out.timesheet.status, 'PRESENT');
      assert.equal(out.timesheet.payUnits, 1);
    });
  });
});

describe('AttendanceService.recalculateTimesheet / recalculateMonth trên PostgreSQL (T7)', () => {
  it('recalculateTimesheet trả DTO của ngày và ghi lại dòng', async t => {
    await withTempDb(t, 'att_recalc_day', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      await client.query(
        `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
           accuracy_meters, distance_meters, is_within_office, created_at)
         VALUES (gen_random_uuid(), $1, '2026-11-03T08:00:00+07:00', '2026-11-03', 'IN', 0, 0, 1, 1, true, now()),
                (gen_random_uuid(), $1, '2026-11-03T17:00:00+07:00', '2026-11-03', 'OUT', 0, 0, 1, 1, true, now())`,
        [NV]
      );

      const dto = await service.recalculateTimesheet(NV, '2026-11-03');
      assert.equal(dto.workDate, '2026-11-03');
      assert.equal(dto.employeeId, NV);
      assert.equal(dto.status, 'PRESENT');
      assert.equal(dto.payUnits, 1);
      assert.equal((await dayRow(client, NV, '2026-11-03')).status, 'PRESENT');
    });
  });

  it('recalculateMonth trả 30 DTO của tháng 11 theo ngày tăng', async t => {
    await withTempDb(t, 'att_recalc_month', async (db, client) => {
      await seed(client);
      const { service } = build(db);

      const dtos = await service.recalculateMonth(NV, '2026-11');
      assert.equal(dtos.length, 30);
      assert.equal(dtos[0].workDate, '2026-11-01');
      assert.equal(dtos[29].workDate, '2026-11-30');
      assert.equal(dtos.find(d => d.workDate === '2026-11-15')?.status, 'REST');
    });
  });
});
