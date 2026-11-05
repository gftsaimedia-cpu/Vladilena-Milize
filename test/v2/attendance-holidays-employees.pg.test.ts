import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { PositionTypeAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { HolidaysService } from '../../src/modules/holidays/holidays.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Loại `nv` có sẵn trong schema.sql (Thứ Hai đến Thứ Bảy).
// "Hôm nay" cố định là Thứ Năm 05/11/2026 17:00 giờ Việt Nam: 03/11 đã qua, 10/11 còn tới.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-05T10:00:00Z');

async function seed(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date, resigned_on)
     VALUES ('a', 'a', 'staff', 'nv', 1, 'x', '2026-01-01', $1, '2025-12-01', NULL),
            ('b', 'b', 'staff', 'nv', 1, 'x', '2026-01-01', $2, '2025-12-01', NULL),
            ('gone', 'gone', 'staff', 'nv', 1, 'x', '2026-01-01', $3, '2025-12-01', '2026-10-01')`,
    [A, B, GONE]
  );
}

function build(db: Kysely<DB>) {
  const kit = auditKit(db);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new PositionTypeAttendanceSettings(db),
    new TransactionCoordinator(db)
  );
  const holidays = new HolidaysService(new HolidaysRepository(db), kit.tx, kit.log, days);
  const employees = new EmployeesService(new EmployeesRepository(db), kit.tx, kit.log, days);
  holidays.now = () => NOW;
  employees.now = () => NOW;
  return { holidays, employees };
}

async function status(client: Client, employeeId: string, date: string): Promise<string | undefined> {
  const { rows } = await client.query(
    `SELECT status FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`,
    [employeeId, date]
  );
  return rows[0]?.status;
}

/** Trạng thái của người `employeeId` ở các ngày `dates` (undefined = chưa có dòng). */
async function statuses(client: Client, employeeId: string, dates: string[]): Promise<Array<string | undefined>> {
  const out: Array<string | undefined> = [];
  for (const d of dates) out.push(await status(client, employeeId, d));
  return out;
}

async function punch(client: Client, employeeId: string, date: string): Promise<void> {
  for (const [time, type] of [
    ['08:00', 'IN'],
    ['17:00', 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [employeeId, `${date}T${time}:00+07:00`, date, type]
    );
  }
}

const range = (from: number, to: number, month = '2026-11') =>
  Array.from({ length: to - from + 1 }, (_, i) => `${month}-${String(from + i).padStart(2, '0')}`);

describe('Ngày lễ ghi lại dòng ngày công (T3)', () => {
  it('thêm ngày lễ: dòng của hai người đang làm thành HOLIDAY, người đã nghỉ không có dòng', async t => {
    await withTempDb(t, 'att_hol_add', async (db, client) => {
      await seed(client);
      const { holidays } = build(db);
      await holidays.add({ date: '2026-11-03', name: 'Lễ thử' }, 'admin');
      assert.equal(await status(client, A, '2026-11-03'), 'HOLIDAY');
      assert.equal(await status(client, B, '2026-11-03'), 'HOLIDAY');
      assert.equal(await status(client, GONE, '2026-11-03'), undefined);
    });
  });

  it('xoá ngày lễ: có chấm công thì PRESENT, không thì ABSENT', async t => {
    await withTempDb(t, 'att_hol_remove', async (db, client) => {
      await seed(client);
      const { holidays } = build(db);
      await punch(client, A, '2026-11-03');
      await holidays.add({ date: '2026-11-03', name: 'Lễ thử' }, 'admin');
      assert.equal(await status(client, A, '2026-11-03'), 'HOLIDAY');

      await holidays.remove('2026-11-03', 'admin');
      assert.equal(await status(client, A, '2026-11-03'), 'PRESENT');
      assert.equal(await status(client, B, '2026-11-03'), 'ABSENT');
    });
  });

  it('thêm nhanh cả năm: mọi ngày lễ vừa thêm đều thành HOLIDAY', async t => {
    await withTempDb(t, 'att_hol_quick', async (db, client) => {
      await seed(client);
      const { holidays } = build(db);
      const added = await holidays.quickAdd(2026, 'admin');
      assert.deepEqual(added, ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02']);
      for (const id of [A, B]) {
        assert.deepEqual(await statuses(client, id, added), ['HOLIDAY', 'HOLIDAY', 'HOLIDAY', 'HOLIDAY']);
      }
    });
  });

  it('ngày lễ thêm rồi lỗi ghi lại thì lễ vẫn còn, lỗi trả về cho người gọi (P4)', async t => {
    await withTempDb(t, 'att_hol_p4', async (db, client) => {
      await seed(client);
      const { holidays } = build(db);
      const kit = auditKit(db);
      const failing = new HolidaysService(
        new HolidaysRepository(db),
        kit.tx,
        kit.log,
        { refreshDateForAll: async () => Promise.reject(new Error('refresh boom')) } as unknown as AttendanceDaysService
      );
      await assert.rejects(failing.add({ date: '2026-11-03', name: 'Lễ thử' }, 'admin'), /refresh boom/);
      assert.equal((await holidays.list(2026)).length, 1);
    });
  });
});

describe('Hồ sơ nhân sự ghi lại dòng ngày công (T4)', () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    username: 'c',
    name: 'Trần Văn C',
    type: 'nv',
    level: 1,
    shiftType: 'NORMAL',
    ...extra
  });

  it('đổi start_date từ 01/11 sang 11/11: các ngày 01–10/11 thành OUTSIDE, 11/11 trở đi giữ nguyên', async t => {
    await withTempDb(t, 'att_emp_start', async (db, client) => {
      const { employees } = build(db);
      const created = await employees.create(body({ effectiveFrom: '2026-11-01' }), 'admin');
      const uuid = created.profile.uuid;
      assert.notEqual(await status(client, uuid, '2026-11-04'), 'OUTSIDE');

      await employees.update('c', { effectiveFrom: '2026-11-11' }, 'admin');
      const before = await statuses(client, uuid, range(1, 10));
      assert.deepEqual(before, Array(10).fill('OUTSIDE'));
      assert.notEqual(await status(client, uuid, '2026-11-11'), 'OUTSIDE');
      assert.notEqual(await status(client, uuid, '2026-11-12'), 'OUTSIDE');
    });
  });

  it('lùi start_date về tháng trước: các tháng từ tháng mới tới tháng hiện tại được ghi lại', async t => {
    await withTempDb(t, 'att_emp_back', async (db, client) => {
      const { employees } = build(db);
      const created = await employees.create(body({ effectiveFrom: '2026-11-11' }), 'admin');
      const uuid = created.profile.uuid;
      assert.equal(await status(client, uuid, '2026-10-20'), undefined);

      await employees.update('c', { effectiveFrom: '2026-10-20' }, 'admin');
      assert.equal(await status(client, uuid, '2026-10-19'), 'OUTSIDE');
      assert.equal(await status(client, uuid, '2026-10-21'), 'ABSENT');
      assert.notEqual(await status(client, uuid, '2026-11-02'), 'OUTSIDE');
    });
  });

  it('deactivate đặt ngày nghỉ việc: các ngày sau đó trong tháng hiện tại thành OUTSIDE', async t => {
    await withTempDb(t, 'att_emp_resign', async (db, client) => {
      const { employees } = build(db);
      const created = await employees.create(body({ effectiveFrom: '2026-11-01' }), 'admin');
      const uuid = created.profile.uuid;
      assert.notEqual(await status(client, uuid, '2026-11-10'), 'OUTSIDE');

      assert.equal(await employees.deactivate('c', 'admin'), true);
      const { rows } = await client.query(`SELECT resigned_on FROM staff WHERE username = 'c'`);
      assert.equal(rows[0].resigned_on, '2026-11-05');
      assert.deepEqual(await statuses(client, uuid, range(6, 30)), Array(25).fill('OUTSIDE'));
      assert.equal(await status(client, uuid, '2026-11-05'), 'PENDING', 'hôm nay chưa hết ngày');
      assert.equal(await status(client, uuid, '2026-11-04'), 'ABSENT');
    });
  });

  it('dòng đã khoá kỳ giữ nguyên khi đổi start_date', async t => {
    await withTempDb(t, 'att_emp_locked', async (db, client) => {
      const { employees } = build(db);
      const created = await employees.create(body({ effectiveFrom: '2026-10-01' }), 'admin');
      const uuid = created.profile.uuid;
      assert.equal(await status(client, uuid, '2026-10-26'), 'ABSENT');
      await client.query(
        `UPDATE timesheet_entries SET is_locked = true WHERE employee_id = $1 AND work_date = '2026-10-26'`,
        [uuid]
      );

      await employees.update('c', { effectiveFrom: '2026-11-11' }, 'admin');
      assert.equal(await status(client, uuid, '2026-10-26'), 'ABSENT', 'dòng khoá không đổi');
      assert.equal(await status(client, uuid, '2026-10-27'), 'OUTSIDE', 'dòng không khoá đổi');
      assert.equal(await status(client, uuid, '2026-11-05'), 'OUTSIDE');
    });
  });

  it('lỗi ghi lại sau khi lưu hồ sơ: hồ sơ vẫn được lưu, lỗi trả về cho người gọi (P4)', async t => {
    await withTempDb(t, 'att_emp_p4', async (db, client) => {
      const kit = auditKit(db);
      const failing = new EmployeesService(new EmployeesRepository(db), kit.tx, kit.log, {
        refreshMonth: async () => Promise.reject(new Error('refresh boom'))
      } as unknown as AttendanceDaysService);
      failing.now = () => NOW;
      await assert.rejects(failing.create(body({ effectiveFrom: '2026-11-01' }), 'admin'), /refresh boom/);
      const { rows } = await client.query(`SELECT start_date FROM staff WHERE username = 'c'`);
      assert.equal(rows[0].start_date, '2026-11-01');
    });
  });
});
