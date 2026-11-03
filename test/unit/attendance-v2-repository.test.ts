import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Kysely } from 'kysely';
import { AppDialect, AppDatabase } from '../../src/data/db-dialect';
import type { Schema } from '../../src/data/schema.generated';
import { AttendanceV2Repository } from '../../src/data/attendance-v2.repository';
import { GeoLocation, PunchEvent, DailyTimesheet } from '../../src/domain/attendance-v2';

class MockDb implements AppDatabase {
  executedQueries: { sql: string; params: unknown[] }[] = [];
  handler: (sql: string, params: unknown[]) => { rows?: unknown[]; changes?: number; numUpdatedRows?: bigint } =
    () => ({
      rows: []
    });

  native(sql: string) {
    return {
      all: async (...params: unknown[]) => {
        this.executedQueries.push({ sql, params });
        const res = this.handler(sql, params);
        return (res.rows || []) as unknown[];
      },
      run: async (...params: unknown[]) => {
        this.executedQueries.push({ sql, params });
        const res = this.handler(sql, params);
        return { changes: res.changes ?? 1 };
      }
    };
  }
}

describe('AttendanceV2Repository', () => {
  const employeeId = randomUUID();
  const workDate = '2026-11-03';

  it('savePunch inserts punch event with all flat columns', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    const punch = PunchEvent.create({
      employeeId,
      workDate,
      type: 'IN',
      userLocation: new GeoLocation({ latitude: 10.7725, longitude: 106.698, accuracyMeters: 5 }),
      officeLocation: new GeoLocation({ latitude: 10.7725, longitude: 106.698 }),
      allowedRadiusMeters: 100,
      note: 'Ca sáng đúng giờ'
    });

    await repo.savePunch(punch);

    assert.equal(mock.executedQueries.length, 1);
    const query = mock.executedQueries[0];
    assert.ok(query.sql.includes('insert into "punch_events"'));
    assert.ok(query.params.includes(punch.id));
    assert.ok(query.params.includes(employeeId));
    assert.ok(query.params.includes(workDate));
    assert.ok(query.params.includes('IN'));
    assert.ok(query.params.includes(10.7725));
    assert.ok(query.params.includes('Ca sáng đúng giờ'));
  });

  it('findPunches returns ordered list of PunchEvent domain entities', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    const punchId1 = randomUUID();
    const punchId2 = randomUUID();

    mock.handler = (sql, params) => {
      if (sql.includes('from "punch_events"')) {
        return {
          rows: [
            {
              id: punchId1,
              employee_id: employeeId,
              punched_at: new Date('2026-11-03T08:00:00Z'),
              work_date: workDate,
              type: 'IN',
              latitude: 10.7725,
              longitude: 106.698,
              accuracy_meters: 5,
              distance_meters: 10,
              is_within_office: true,
              note: 'Check-in sáng'
            },
            {
              id: punchId2,
              employee_id: employeeId,
              punched_at: new Date('2026-11-03T17:05:00Z'),
              work_date: workDate,
              type: 'OUT',
              latitude: 10.7725,
              longitude: 106.698,
              accuracy_meters: 5,
              distance_meters: 12,
              is_within_office: true,
              note: null
            }
          ]
        };
      }
      return { rows: [] };
    };

    const punches = await repo.findPunches(employeeId, workDate);
    assert.equal(punches.length, 2);
    assert.equal(punches[0].id, punchId1);
    assert.equal(punches[0].type, 'IN');
    assert.equal(punches[0].isWithinOffice, true);
    assert.equal(punches[1].id, punchId2);
    assert.equal(punches[1].type, 'OUT');

    const lastQuery = mock.executedQueries[0];
    assert.ok(lastQuery.sql.includes('order by "punched_at" asc'));
    assert.ok(lastQuery.params.includes(employeeId));
    assert.ok(lastQuery.params.includes(workDate));
  });

  it('saveTimesheet upserts DailyTimesheet on conflict employee_id and work_date', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    const timesheet = DailyTimesheet.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      shiftStartTime: '08:00',
      shiftEndTime: '17:00'
    });

    await repo.saveTimesheet(timesheet);

    assert.equal(mock.executedQueries.length, 1);
    const query = mock.executedQueries[0];
    assert.ok(query.sql.includes('insert into "timesheet_entries"'));
    assert.ok(query.sql.includes('on conflict ("employee_id", "work_date") do update set'));
    assert.ok(query.params.includes(timesheet.id));
    assert.ok(query.params.includes(employeeId));
    assert.ok(query.params.includes(workDate));
    assert.ok(query.params.includes('NORMAL'));
  });

  it('findTimesheet retrieves and maps DailyTimesheet or returns null', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);
    const timesheetId = randomUUID();

    mock.handler = (sql, params) => {
      if (sql.includes('from "timesheet_entries"') && params.includes(employeeId)) {
        return {
          rows: [
            {
              id: timesheetId,
              employee_id: employeeId,
              work_date: workDate,
              shift_type: 'NORMAL',
              shift_start_time: '08:00',
              shift_end_time: '17:00',
              shift_allowance_pct: 0,
              actual_check_in: new Date('2026-11-03T08:00:00Z'),
              actual_check_out: new Date('2026-11-03T17:00:00Z'),
              work_hours: 8,
              work_units: 1.0,
              ot_hours: 0,
              late_minutes: 0,
              early_minutes: 0,
              status: 'PRESENT',
              is_locked: false
            }
          ]
        };
      }
      return { rows: [] };
    };

    const found = await repo.findTimesheet(employeeId, workDate);
    assert.ok(found);
    assert.equal(found.id, timesheetId);
    assert.equal(found.shiftType, 'NORMAL');
    assert.equal(found.metrics.workHours, 8);
    assert.equal(found.metrics.workUnits, 1.0);
    assert.equal(found.status, 'PRESENT');

    const notFound = await repo.findTimesheet(randomUUID(), '2026-11-04');
    assert.equal(notFound, null);
  });

  it('findTimesheetById retrieves timesheet by primary key', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);
    const timesheetId = randomUUID();

    mock.handler = (sql, params) => {
      if (params.includes(timesheetId)) {
        return {
          rows: [
            {
              id: timesheetId,
              employee_id: employeeId,
              work_date: workDate,
              shift_type: 'FLEX',
              shift_start_time: '09:00',
              shift_end_time: '18:00',
              shift_allowance_pct: 10,
              actual_check_in: null,
              actual_check_out: null,
              work_hours: 0,
              work_units: 0,
              ot_hours: 0,
              late_minutes: 0,
              early_minutes: 0,
              status: 'ABSENT',
              is_locked: false
            }
          ]
        };
      }
      return { rows: [] };
    };

    const found = await repo.findTimesheetById(timesheetId);
    assert.ok(found);
    assert.equal(found.id, timesheetId);
    assert.equal(found.shiftType, 'FLEX');
    assert.equal(found.shiftAllowancePct, 10);
  });

  it('listTimesheets applies filters correctly', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    mock.handler = () => ({
      rows: [
        {
          id: randomUUID(),
          employee_id: employeeId,
          work_date: '2026-11-01',
          shift_type: 'NORMAL',
          shift_start_time: '08:00',
          shift_end_time: '17:00',
          shift_allowance_pct: 0,
          actual_check_in: null,
          actual_check_out: null,
          work_hours: 0,
          work_units: 0,
          ot_hours: 0,
          late_minutes: 0,
          early_minutes: 0,
          status: 'ABSENT',
          is_locked: false
        }
      ]
    });

    const list = await repo.listTimesheets({
      employeeId,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      status: 'ABSENT'
    });

    assert.equal(list.length, 1);
    const query = mock.executedQueries[0];
    assert.ok(query.sql.includes('from "timesheet_entries"'));
    assert.ok(query.sql.includes('"employee_id" ='));
    assert.ok(query.sql.includes('"work_date" >='));
    assert.ok(query.sql.includes('"work_date" <='));
    assert.ok(query.sql.includes('"status" ='));
  });

  it('lockTimesheets updates is_locked to true in date range', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    mock.handler = () => ({ changes: 5 });

    const lockedCount = await repo.lockTimesheets(employeeId, '2026-11-01', '2026-11-30');
    assert.equal(lockedCount, 5);

    const query = mock.executedQueries[0];
    assert.ok(query.sql.includes('update "timesheet_entries"'));
    assert.ok(query.sql.includes('"is_locked" ='));
  });

  it('saveSchedule inserts into work_schedules on conflict update', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    const { WorkSchedule } = await import('../../src/domain/attendance-v2');
    const schedule = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });

    await repo.saveSchedule(schedule);

    assert.equal(mock.executedQueries.length, 1);
    const query = mock.executedQueries[0];
    assert.ok(query.sql.includes('insert into "work_schedules"'));
    assert.ok(query.params.includes(schedule.id));
    assert.ok(query.params.includes('NORMAL'));
    assert.ok(query.params.includes('08:00'));
  });

  it('findSchedule returns WorkSchedule entity when found', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    mock.handler = () => ({
      rows: [
        {
          id: randomUUID(),
          employee_id: employeeId,
          work_date: workDate,
          shift_type: 'FLEX',
          planned_start_time: '06:00:00',
          planned_end_time: '15:00:00',
          approved_ot_hours: 0,
          schedule_type: 'SHIFT_CHANGE',
          status: 'PLANNED',
          source_request_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });

    const found = await repo.findSchedule(employeeId, workDate);
    assert.ok(found);
    assert.equal(found.shiftType, 'FLEX');
    assert.equal(found.plannedStartTime, '06:00');
    assert.equal(found.scheduleType, 'SHIFT_CHANGE');
  });

  it('ensureDefaultSchedule creates default schedule from staff profile if none exists', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new AttendanceV2Repository(qb);

    mock.handler = (sql) => {
      if (sql.includes('from "work_schedules"')) {
        return { rows: [] };
      }
      if (sql.includes('from "staff"')) {
        return {
          rows: [
            {
              uuid: employeeId,
              shift_type: 'NIGHT',
              shift_start_time: '21:00',
              shift_end_time: '06:00'
            }
          ]
        };
      }
      return { rows: [] };
    };

    const schedule = await repo.ensureDefaultSchedule(employeeId, workDate);
    assert.ok(schedule);
    assert.equal(schedule.shiftType, 'NIGHT');
    assert.equal(schedule.plannedStartTime, '21:00');
    assert.equal(schedule.plannedEndTime, '06:00');
  });
});
