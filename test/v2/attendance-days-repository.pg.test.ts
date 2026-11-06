import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import {
  buildDay,
  type AttendanceDay,
  type DaySources
} from '../../src/modules/attendance/domain/attendance-day';
import { vnInstant } from '../../src/modules/attendance/domain/calendar';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts.
const NV = '11111111-1111-4111-8111-111111111111';
const REQ = '22222222-2222-4222-8222-222222222222';
const DATE = '2026-11-03'; // thứ Ba
const NOW = new Date('2026-11-30T12:00:00Z');

function sources(over: Partial<DaySources> = {}): DaySources {
  return {
    date: DATE,
    schedule: null,
    punches: [],
    otWindows: [],
    makeupWindows: [],
    explanation: null,
    isHoliday: false,
    now: NOW,
    employment: { startDate: '2026-01-01', resignedOn: null },
    benefits: { paidLeave: true, paidHoliday: true, isat: true },
    workWeek: [1, 2, 3, 4, 5, 6],
    graceMinutes: 15,
    defaultShift: { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 },
    ...over
  };
}

/** 08:40–17:00, giải trình đã duyệt: đi muộn 40 phút, trừ 30 phút, đủ công. */
function presentDay(): AttendanceDay {
  return buildDay(
    NV,
    sources({
      punches: [
        { type: 'IN', at: vnInstant(DATE, '08:40') },
        { type: 'OUT', at: vnInstant(DATE, '17:00') }
      ],
      explanation: { requestId: REQ, status: 'APPROVED', checkIn: null, checkOut: null }
    })
  );
}

function absentDay(): AttendanceDay {
  return buildDay(NV, sources());
}

async function seed(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
     VALUES ('nv', 'Nhân viên', 'nv', 1, 'x', '2026-01-01', $1)`,
    [NV]
  );
  await client.query(
    `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at)
     VALUES ($1, $2, 't', 'EXPLANATION', 'r', 'APPROVED', now(), now())`,
    [REQ, NV]
  );
}

const rowCount = async (client: Client): Promise<number> =>
  Number((await client.query(`SELECT count(*) AS n FROM timesheet_entries`)).rows[0].n);

describe('AttendanceDaysRepository trên PostgreSQL', () => {
  it('upsert writes every new column', async t => {
    await withTempDb(t, 'att_days_all', async (db: Kysely<DB>, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      const day = presentDay();
      assert.equal(day.status, 'PRESENT');
      assert.equal(day.deductionMinutes, 30);
      await repo.upsertDays([day], NOW);

      const list = await repo.listDays(NV, DATE, DATE);
      assert.equal(list.length, 1);
      assert.deepEqual(list[0], { ...day, isLocked: false });
      assert.ok(Array.isArray(list[0].cases));
      assert.ok(list[0].cases.length > 0);
      assert.ok(list[0].checkIn instanceof Date);
      assert.equal(list[0].payUnits, 1);
      assert.equal(list[0].deductionMinutes, 30);
      assert.equal(list[0].isLocked, false);

      const raw = (await client.query(`SELECT work_units, ot_hours, day_status FROM timesheet_entries`)).rows[0];
      assert.equal(raw.work_units, 1);
      assert.equal(raw.ot_hours, 0);
      assert.equal(raw.day_status, day.dayStatus);
    });
  });

  it('second upsert updates in place', async t => {
    await withTempDb(t, 'att_days_upd', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      await repo.upsertDays([presentDay()], NOW);
      const before = (await client.query(`SELECT id, created_at FROM timesheet_entries`)).rows[0];
      const later = new Date('2026-12-01T00:00:00Z');
      await repo.upsertDays([absentDay()], later);

      assert.equal(await rowCount(client), 1);
      const list = await repo.listDays(NV, DATE, DATE);
      assert.equal(list[0].status, 'ABSENT');
      assert.equal(list[0].payUnits, 0);
      assert.equal(list[0].checkIn, null);
      const after = (await client.query(`SELECT id, created_at, updated_at FROM timesheet_entries`)).rows[0];
      assert.equal(after.id, before.id);
      assert.equal(after.created_at.getTime(), before.created_at.getTime());
      assert.equal(after.updated_at.getTime(), later.getTime());
    });
  });

  it('locked row is never rewritten', async t => {
    await withTempDb(t, 'att_days_lock', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      await repo.upsertDays([presentDay()], NOW);
      await client.query(`UPDATE timesheet_entries SET is_locked = true`);
      await repo.upsertDays([absentDay()], new Date('2026-12-01T00:00:00Z'));

      const list = await repo.listDays(NV, DATE, DATE);
      assert.equal(list[0].status, 'PRESENT');
      assert.equal(list[0].isLocked, true);
      assert.equal(list[0].deductionMinutes, 30);
    });
  });

  it('rest row has null shift', async t => {
    await withTempDb(t, 'att_days_rest', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      const sunday = '2026-11-08';
      const rest = buildDay(NV, sources({ date: sunday }));
      assert.equal(rest.status, 'REST');
      await repo.upsertDays([rest], NOW);

      const raw = (await client.query(`SELECT shift_type, shift_start_time, shift_end_time, shift_allowance_pct FROM timesheet_entries`)).rows[0];
      assert.equal(raw.shift_type, null);
      assert.equal(raw.shift_start_time, null);
      assert.equal(raw.shift_end_time, null);
      assert.equal(raw.shift_allowance_pct, null);
      const list = await repo.listDays(NV, sunday, sunday);
      assert.equal(list[0].shift, null);
      assert.deepEqual(list[0], { ...rest, isLocked: false });
    });
  });

  it('listDays is inclusive and ordered by work_date', async t => {
    await withTempDb(t, 'att_days_list', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      const dates = ['2026-11-05', '2026-11-03', '2026-11-04', '2026-11-06'];
      await repo.upsertDays(
        dates.map(date => buildDay(NV, sources({ date }))),
        NOW
      );
      const list = await repo.listDays(NV, '2026-11-03', '2026-11-05');
      assert.deepEqual(
        list.map(d => d.workDate),
        ['2026-11-03', '2026-11-04', '2026-11-05']
      );
    });
  });

  it('check constraints', async t => {
    await withTempDb(t, 'att_days_chk', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      await repo.upsertDays([presentDay()], NOW);
      await assert.rejects(client.query(`UPDATE timesheet_entries SET status = 'FOO'`), /check constraint/);
      await assert.rejects(client.query(`UPDATE timesheet_entries SET pay_units = 0.5`), /check constraint/);
    });
  });

  it('makeup_credit_minutes round-trips through upsert, update and the admin DTO (FP6)', async t => {
    await withTempDb(t, 'att_days_credit', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      const sunday = '2026-11-08';
      const lateAtWindow = (status: 'APPROVED' | 'NONE') =>
        buildDay(
          NV,
          sources({
            date: sunday,
            punches: [
              { type: 'IN', at: vnInstant(sunday, '18:30') },
              { type: 'OUT', at: vnInstant(sunday, '22:00') }
            ],
            makeupWindows: [{ start: '18:00', end: '22:00' }],
            explanation: status === 'APPROVED' ? { requestId: REQ, status, checkIn: null, checkOut: null } : null
          })
        );
      const approvedRow = lateAtWindow('APPROVED');
      assert.deepEqual([approvedRow.makeupMinutes, approvedRow.makeupCreditMinutes], [210, 240]);

      await repo.upsertDays([approvedRow], NOW);
      const raw = await client.query(`SELECT makeup_minutes, makeup_credit_minutes FROM timesheet_entries`);
      assert.deepEqual([raw.rows[0].makeup_minutes, raw.rows[0].makeup_credit_minutes], [210, 240]);
      const listed = await repo.listDays(NV, sunday, sunday);
      assert.deepEqual([listed[0].makeupMinutes, listed[0].makeupCreditMinutes], [210, 240]);
      const dto = (await new AttendanceRepository(db).findTimesheet(NV, sunday))?.toJSON();
      assert.deepEqual([dto?.makeupMinutes, dto?.makeupCreditMinutes], [210, 240]);

      // The conflict update rewrites the credit too (the explanation is withdrawn: 210 / 210).
      await repo.upsertDays([lateAtWindow('NONE')], NOW);
      const again = await repo.listDays(NV, sunday, sunday);
      assert.deepEqual([again[0].makeupMinutes, again[0].makeupCreditMinutes], [210, 210]);
    });
  });

  it('admin DTO', async t => {
    await withTempDb(t, 'att_days_dto', async (db, client) => {
      await seed(client);
      await new AttendanceDaysRepository(db).upsertDays([presentDay()], NOW);
      const ts = await new AttendanceRepository(db).findTimesheet(NV, DATE);
      assert.ok(ts);
      const dto = ts.toJSON();
      assert.equal(dto.status, 'PRESENT');
      assert.equal(dto.payUnits, 1);
      assert.ok(Array.isArray(dto.cases));
      assert.equal(dto.explanationStatus, 'APPROVED');
      assert.equal(dto.explanationRequestId, REQ);
      assert.equal(dto.deductionMinutes, 30);
      assert.equal(dto.countsAsWorkday, true);
      assert.equal(dto.countsAsDayOff, false);
      assert.equal(dto.makeupMinutes, 0);
      assert.equal(dto.leaveType, null);
      assert.equal(dto.shiftType, 'NORMAL');
    });
  });
});
