import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Client } from 'pg';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts.
// Ruling P-1: nhân sự "nv" của brief có type 'nv-test' = mã của hai phiên bản position_types được thêm bên dưới.
const NV = '11111111-1111-4111-8111-111111111111';
const LEAVE_REQ = '22222222-2222-4222-8222-222222222222';
const OT_OK = '33333333-3333-4333-8333-333333333333';
const OT_PENDING = '44444444-4444-4444-8444-444444444444';
const MK_OK = '55555555-5555-4555-8555-555555555555';
const EX_REJECTED = '66666666-6666-4666-8666-666666666666';
const EX_PENDING = '77777777-7777-4777-8777-777777777777';
const EX_CANCELLED = '88888888-8888-4888-8888-888888888888';

async function seed(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ('nv', 'Nhân viên', 'nv-test', 1, 'x', '2026-01-01', $1, '2026-01-05')`,
    [NV]
  );
  const v1 = (
    await client.query(
      `INSERT INTO position_types (code, effective_month, name, workdays, flex_pct, night_pct, travel_pct,
         attendance_pct, regular_dows, makeup_dows, updated_by, updated_at)
       VALUES ('nv-test', '2000-01', 'NV', 26, 10, 30, 0, 0, '[1,2,3,4,5,6]', '[]', 'x', 'x') RETURNING id`
    )
  ).rows[0].id;
  const v2 = (
    await client.query(
      `INSERT INTO position_types (code, effective_month, name, workdays, flex_pct, night_pct, travel_pct,
         attendance_pct, regular_dows, makeup_dows, updated_by, updated_at)
       VALUES ('nv-test', '2026-11', 'NV', 22, 10, 30, 0, 0, '[1,2,3,4,5]', '[]', 'x', 'x') RETURNING id`
    )
  ).rows[0].id;
  for (const [id, isat] of [
    [v1, 1],
    [v2, 0]
  ]) {
    await client.query(
      `INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES
         ($1, 'paidLeave', 1), ($1, 'paidHoliday', 1), ($1, 'isat', $2)`,
      [id, isat]
    );
  }
}

async function request(
  client: Client,
  id: string,
  type: string,
  status: string,
  createdAt: string,
  extra: Record<string, string> = {}
): Promise<void> {
  const cols = ['id', 'employee_id', 'title', 'type', 'reason', 'status', 'created_at', 'updated_at', ...Object.keys(extra)];
  const vals = [id, NV, 't', type, 'r', status, createdAt, createdAt, ...Object.values(extra)];
  await client.query(
    `INSERT INTO system_requests (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')})`,
    vals
  );
}

describe('AttendanceDaysRepository.loadSources trên PostgreSQL', () => {
  it('returns employee facts, benefits per month and defaults', async t => {
    await withTempDb(t, 'att_src_emp', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-10-30', '2026-11-02']);
      // `shiftOn` là hàm tra ca theo ngày: kiểm riêng, ở đây so các trường dữ liệu.
      const { shiftOn, ...employeeData } = out.employee;
      assert.equal(shiftOn('2026-11-02').start, '08:00');
      assert.deepEqual(employeeData, {
        employeeId: NV,
        type: 'nv-test',
        startDate: '2026-01-05',
        resignedOn: null,
        defaultShift: { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 }
      });
      assert.equal(out.benefitsByMonth.size, 2);
      assert.deepEqual(out.benefitsByMonth.get('2026-10'), { paidLeave: true, paidHoliday: true, isat: true });
      assert.deepEqual(out.benefitsByMonth.get('2026-11'), { paidLeave: true, paidHoliday: true, isat: false });
      assert.deepEqual(
        out.days.map(d => d.date),
        ['2026-10-30', '2026-11-02']
      );
      const empty = out.days[0];
      assert.equal(empty.schedule, null);
      assert.deepEqual(empty.punches, []);
      assert.deepEqual(empty.otWindows, []);
      assert.deepEqual(empty.makeupWindows, []);
      assert.equal(empty.explanation, null);
      assert.equal(empty.isHoliday, false);
    });
  });

  it('default shift follows the staff row and allowance follows the shift type', async t => {
    await withTempDb(t, 'att_src_shift', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      const shiftOf = async (type: string) => {
        await client.query(
          `UPDATE staff SET shift_type = $1, shift_start_time = '22:00', shift_end_time = '06:00'`,
          [type]
        );
        return (await repo.loadSources(NV, ['2026-11-02'])).employee.defaultShift;
      };
      assert.deepEqual(await shiftOf('NIGHT'), { type: 'NIGHT', start: '22:00', end: '06:00', allowancePct: 30 });
      assert.deepEqual(await shiftOf('FLEX'), { type: 'FLEX', start: '22:00', end: '06:00', allowancePct: 10 });
      assert.deepEqual(await shiftOf('CUSTOM'), { type: 'NORMAL', start: '22:00', end: '06:00', allowancePct: 0 });
    });
  });

  it('a type with no version gives all benefits false', async t => {
    await withTempDb(t, 'att_src_nover', async (db, client) => {
      await seed(client);
      await client.query(`UPDATE staff SET type = 'khong-co-loai'`);
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-11-02']);
      assert.deepEqual(out.benefitsByMonth.get('2026-11'), { paidLeave: false, paidHoliday: false, isat: false });
    });
  });

  it('loads the schedule of a leave day with its request type and HH:mm times', async t => {
    await withTempDb(t, 'att_src_sched', async (db, client) => {
      await seed(client);
      await request(client, LEAVE_REQ, 'LEAVE', 'APPROVED', '2026-10-01T00:00:00Z', { leave_type: 'ANNUAL' });
      await client.query(
        `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time,
           schedule_type, status, source_request_id)
         VALUES ($1, '2026-11-03', 'NORMAL', '08:00', '17:00', 'REGULAR', 'ON_LEAVE', $2),
                ($1, '2026-11-04', 'FLEX', '09:30:00', '18:30:00', 'SHIFT_CHANGE', 'PLANNED', NULL)`,
        [NV, LEAVE_REQ]
      );
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-11-03', '2026-11-04', '2026-11-05']);
      assert.deepEqual(out.days[0].schedule, {
        scheduleType: 'REGULAR',
        status: 'ON_LEAVE',
        shiftType: 'NORMAL',
        start: '08:00',
        end: '17:00',
        sourceRequestId: LEAVE_REQ,
        requestType: 'LEAVE',
        leaveType: 'ANNUAL'
      });
      assert.deepEqual(out.days[1].schedule, {
        scheduleType: 'SHIFT_CHANGE',
        status: 'PLANNED',
        shiftType: 'FLEX',
        start: '09:30',
        end: '18:30',
        sourceRequestId: null,
        requestType: null,
        leaveType: null
      });
      assert.equal(out.days[2].schedule, null);
    });
  });

  it('orders punches by time and keeps them per day', async t => {
    await withTempDb(t, 'att_src_punch', async (db, client) => {
      await seed(client);
      // Chèn lộn thứ tự: OUT trước IN.
      for (const [id, at, type, date] of [
        ['aaaaaaaa-0000-4000-8000-000000000001', '2026-11-03T10:00:00Z', 'OUT', '2026-11-03'],
        ['aaaaaaaa-0000-4000-8000-000000000002', '2026-11-03T01:05:00Z', 'IN', '2026-11-03'],
        ['aaaaaaaa-0000-4000-8000-000000000003', '2026-11-04T01:00:00Z', 'IN', '2026-11-04']
      ]) {
        await client.query(
          `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
             accuracy_meters, distance_meters, is_within_office, created_at)
           VALUES ($1, $2, $3, $4, $5, 0, 0, 1, 1, true, now())`,
          [id, NV, at, date, type]
        );
      }
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-11-03', '2026-11-04']);
      assert.deepEqual(out.days[0].punches, [
        { type: 'IN', at: new Date('2026-11-03T01:05:00Z') },
        { type: 'OUT', at: new Date('2026-11-03T10:00:00Z') }
      ]);
      assert.deepEqual(out.days[1].punches, [{ type: 'IN', at: new Date('2026-11-04T01:00:00Z') }]);
    });
  });

  it('loads OT windows of approved requests only', async t => {
    await withTempDb(t, 'att_src_ot', async (db, client) => {
      await seed(client);
      await request(client, OT_OK, 'OVERTIME', 'APPROVED', '2026-11-01T00:00:00Z', {
        ot_date: '2026-11-03',
        ot_start_time: '18:00',
        ot_end_time: '20:00'
      });
      await request(client, OT_PENDING, 'OVERTIME', 'PENDING', '2026-11-01T01:00:00Z', {
        ot_date: '2026-11-03',
        ot_start_time: '20:00',
        ot_end_time: '22:00'
      });
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-11-03']);
      assert.deepEqual(out.days[0].otWindows, [{ start: '18:00', end: '20:00' }]);
    });
  });

  it('loads makeup windows of approved leave-with-makeup requests only', async t => {
    await withTempDb(t, 'att_src_mk', async (db, client) => {
      await seed(client);
      await request(client, MK_OK, 'LEAVE_WITH_MAKEUP', 'APPROVED', '2026-11-01T00:00:00Z', {
        leave_type: 'ANNUAL'
      });
      await request(client, OT_PENDING, 'LEAVE_WITH_MAKEUP', 'PENDING', '2026-11-01T01:00:00Z', {
        leave_type: 'ANNUAL'
      });
      await client.query(
        `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes) VALUES
           ($1, '2026-11-03', '18:00', '22:00', 240),
           ($2, '2026-11-03', '06:00', '07:00', 60)`,
        [MK_OK, OT_PENDING]
      );
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-11-03']);
      assert.deepEqual(out.days[0].makeupWindows, [{ start: '18:00', end: '22:00' }]);
    });
  });

  it('picks the newest non-cancelled explanation of the day', async t => {
    await withTempDb(t, 'att_src_exp', async (db, client) => {
      await seed(client);
      await request(client, EX_REJECTED, 'EXPLANATION', 'REJECTED', '2026-11-04T00:00:00Z', {
        explanation_date: '2026-11-03',
        actual_check_in: '08:00',
        actual_check_out: '17:00'
      });
      await request(client, EX_PENDING, 'EXPLANATION', 'PENDING', '2026-11-05T00:00:00Z', {
        explanation_date: '2026-11-03'
      });
      await request(client, EX_CANCELLED, 'EXPLANATION', 'CANCELLED', '2026-11-06T00:00:00Z', {
        explanation_date: '2026-11-03'
      });
      const repo = new AttendanceDaysRepository(db);
      let out = await repo.loadSources(NV, ['2026-11-03']);
      assert.deepEqual(out.days[0].explanation, {
        requestId: EX_PENDING,
        status: 'PENDING',
        checkIn: null,
        checkOut: null
      });

      await client.query(`UPDATE system_requests SET status = 'CANCELLED' WHERE id = $1`, [EX_PENDING]);
      out = await repo.loadSources(NV, ['2026-11-03']);
      assert.deepEqual(out.days[0].explanation, {
        requestId: EX_REJECTED,
        status: 'REJECTED',
        checkIn: '08:00',
        checkOut: '17:00'
      });
    });
  });

  it('flags company holidays', async t => {
    await withTempDb(t, 'att_src_hol', async (db, client) => {
      await seed(client);
      await client.query(`INSERT INTO company_holidays (holiday_date, name) VALUES ('2026-11-04', 'Lễ')`);
      const repo = new AttendanceDaysRepository(db);
      const out = await repo.loadSources(NV, ['2026-11-03', '2026-11-04']);
      assert.equal(out.days[0].isHoliday, false);
      assert.equal(out.days[1].isHoliday, true);
    });
  });

  it('throws for an unknown employee', async t => {
    await withTempDb(t, 'att_src_none', async db => {
      const repo = new AttendanceDaysRepository(db);
      await assert.rejects(() => repo.loadSources('khong-co', ['2026-11-03']), /Không tìm thấy nhân sự/);
    });
  });

  it('withTransaction reads inside the caller transaction', async t => {
    await withTempDb(t, 'att_src_tx', async (db, client) => {
      await seed(client);
      const repo = new AttendanceDaysRepository(db);
      await db.transaction().execute(async trx => {
        await trx.insertInto('company_holidays').values({ holiday_date: '2026-11-03', name: 'Lễ' }).execute();
        const inside = await repo.withTransaction(trx).loadSources(NV, ['2026-11-03']);
        assert.equal(inside.days[0].isHoliday, true);
        const outside = await repo.loadSources(NV, ['2026-11-03']);
        assert.equal(outside.days[0].isHoliday, false);
      });
    });
  });
});
