import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client, Pool } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { DayConflictError } from '../../src/modules/requests/domain';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy lược đồ trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

/** "Hôm nay" của mọi service trong file: Thứ Tư 04/11/2026. */
const NOW = new Date('2026-11-04T10:00:00Z');

// Nam và Lan thuộc nhóm nv (làm Thứ Hai đến Thứ Bảy), mỗi người 12 ngày Phép năm.
const NAM = 'ds-nam-uuid';
const LAN = 'ds-lan-uuid';
const ADMIN = 'ds-admin';
/** Bốn người của test pool nhỏ. */
const POOL_STAFF = ['ds-p1', 'ds-p2', 'ds-p3', 'ds-p4'];
const uuidOf = (username: string) => `${username}-uuid`;

const C2 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn.';
const C3 = 'Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.';
const C4 = 'Ngày 11/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.';
const C7 = 'Thứ Bảy 14/11 đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác.';
const C8 = 'Thứ Bảy 14/11 đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT.';
const C9 = 'Thứ Bảy 14/11 đang có đơn OT chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.';

/** Service đầy đủ trên một Kysely: khoá chạy bằng advisory lock thật; "hôm nay" cố định. */
function serviceOn(db: Kysely<DB>): RequestsService {
  const service = new RequestsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    new TransactionCoordinator(db),
    new HolidaysRepository(db),
    new DayStatusRepository(db)
  );
  service.now = () => NOW;
  return service;
}

/**
 * Bất biến của `day_status` (§3.1) cho một nhân viên. Mỗi câu SQL liệt kê các dòng vi phạm và phải trả 0 dòng.
 * I1 do khoá chính bảo đảm (test của Task 1).
 */
async function assertInvariants(client: Client, employeeId: string): Promise<void> {
  const checks: Array<[name: string, sql: string]> = [
    [
      // I2: dòng trỏ tới đơn đang chờ hoặc đã duyệt của chính nhân viên, và status đúng loại đơn.
      'I2',
      `SELECT to_char(ds.work_date, 'YYYY-MM-DD') AS work_date, ds.status, r.type, r.status AS request_status, r.employee_id
         FROM day_status ds
         JOIN system_requests r ON r.id = ds.request_id
        WHERE ds.employee_id = $1
          AND (r.status NOT IN ('PENDING', 'APPROVED') OR r.type <> ds.status OR r.employee_id <> ds.employee_id)`
    ],
    [
      // I3: đơn gốc là đơn đổi ca đang chờ hoặc đã duyệt của cùng người, và khoảng đổi ca chứa ngày đó.
      'I3',
      `SELECT to_char(ds.work_date, 'YYYY-MM-DD') AS work_date, ds.base_request_id, b.type, b.status AS base_status,
              to_char(b.change_start_date, 'YYYY-MM-DD') AS change_start, to_char(b.change_end_date, 'YYYY-MM-DD') AS change_end
         FROM day_status ds
         LEFT JOIN system_requests b ON b.id = ds.base_request_id
        WHERE ds.employee_id = $1
          AND ds.base_request_id IS NOT NULL
          AND (b.type IS DISTINCT FROM 'SHIFT_CHANGE'
               OR b.status NOT IN ('PENDING', 'APPROVED')
               OR b.employee_id <> ds.employee_id
               OR (ds.work_date BETWEEN b.change_start_date AND b.change_end_date) IS NOT TRUE)`
    ],
    [
      // I4: ngày của đơn đã duyệt đã được ghi lịch đúng loại.
      'I4',
      `SELECT to_char(ds.work_date, 'YYYY-MM-DD') AS work_date, r.type, ws.schedule_type, ws.status AS schedule_status,
              to_char(ws.planned_start_time, 'HH24:MI') AS planned_start, r.new_start_time
         FROM day_status ds
         JOIN system_requests r ON r.id = ds.request_id
         LEFT JOIN work_schedules ws ON ws.employee_id = ds.employee_id AND ws.work_date = ds.work_date
        WHERE ds.employee_id = $1
          AND r.status = 'APPROVED'
          AND (CASE r.type
                 WHEN 'LEAVE' THEN ws.status = 'ON_LEAVE'
                 WHEN 'LEAVE_WITH_MAKEUP' THEN ws.status = 'ON_LEAVE'
                 WHEN 'ISAT' THEN ws.schedule_type = 'ISAT'
                 WHEN 'SHIFT_CHANGE' THEN ws.schedule_type = 'SHIFT_CHANGE'
                                          AND to_char(ws.planned_start_time, 'HH24:MI') = r.new_start_time
               END) IS NOT TRUE`
    ],
    [
      // I5: ngày nghỉ, nghỉ có làm bù hoặc iSAT không có khung OT hay khung bù của đơn đang chờ hoặc đã duyệt.
      'I5',
      `SELECT to_char(ds.work_date, 'YYYY-MM-DD') AS work_date, ds.status
         FROM day_status ds
        WHERE ds.employee_id = $1
          AND ds.status IN ('LEAVE', 'LEAVE_WITH_MAKEUP', 'ISAT')
          AND (EXISTS (SELECT 1 FROM system_requests o
                        WHERE o.employee_id = ds.employee_id AND o.type = 'OVERTIME'
                          AND o.status IN ('PENDING', 'APPROVED') AND o.ot_date = ds.work_date)
               OR EXISTS (SELECT 1 FROM makeup_slots m
                            JOIN system_requests l ON l.id = m.request_id
                           WHERE l.employee_id = ds.employee_id AND l.type = 'LEAVE_WITH_MAKEUP'
                             AND l.status IN ('PENDING', 'APPROVED') AND m.work_date = ds.work_date))`
    ]
  ];
  for (const [name, sql] of checks) {
    const { rows } = await client.query(sql, [employeeId]);
    assert.deepEqual(rows, [], `${name} vi phạm cho ${employeeId}`);
  }
}

test('day_status trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `day_status_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;

  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  let db: Kysely<DB> | null = null;
  let controlConnected = false;
  let clientConnected = false;

  try {
    await control.connect();
    controlConnected = true;
    await control.query(`CREATE DATABASE ${dbName}`);
    await client.connect();
    clientConnected = true;
    for (const file of MIGRATIONS) {
      await client.query(readFileSync(file, 'utf8'));
    }
    const createdAt = new Date().toISOString();
    const addStaff = (username: string, uuid: string, role = 'staff') =>
      client.query(
        `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, leave_balance)
         VALUES ($1, $1, $2, 'nv', 1, 'x', $3, $4, 12)`,
        [username, role, createdAt, uuid]
      );
    await addStaff('ds-nam', NAM);
    await addStaff('ds-lan', LAN);
    await addStaff(ADMIN, uuidOf(ADMIN), 'admin');
    for (const username of POOL_STAFF) {
      await addStaff(username, uuidOf(username));
    }
    await client.query(`INSERT INTO company_holidays (holiday_date, name) VALUES ('2026-11-21', 'Lễ thử (Thứ Bảy)')`);

    db = createKysely(createPgPool(tempUrl.toString()));
    const service = serviceOn(db);

    /** Mỗi kịch bản bắt đầu từ bảng trống: không đơn, không lịch, không dòng ngày. */
    const reset = () =>
      client.query(
        `TRUNCATE day_status, work_schedules, makeup_slots, isat_registration_conditions, isat_registrations,
                  explanation_cases, timesheet_entries, system_requests`
      );

    /** Các dòng `day_status` của một người: [ngày, trạng thái, đơn, đơn gốc]. */
    const daysOf = async (employeeId: string) =>
      (
        await client.query(
          `SELECT to_char(work_date, 'YYYY-MM-DD') AS d, status, request_id, base_request_id
             FROM day_status WHERE employee_id = $1 ORDER BY work_date`,
          [employeeId]
        )
      ).rows.map(r => [r.d, r.status, r.request_id, r.base_request_id]);

    /** Lịch của một người: [ngày, loại lịch, trạng thái, giờ vào, đơn nguồn]. */
    const schedulesOf = async (employeeId: string) =>
      (
        await client.query(
          `SELECT to_char(work_date, 'YYYY-MM-DD') AS d, schedule_type, status,
                  to_char(planned_start_time, 'HH24:MI') AS start, source_request_id
             FROM work_schedules WHERE employee_id = $1 ORDER BY work_date`,
          [employeeId]
        )
      ).rows.map(r => [r.d, r.schedule_type, r.status, r.start, r.source_request_id]);

    const requestOf = async (id: string) =>
      (await client.query(`SELECT status, reviewed_by FROM system_requests WHERE id = $1`, [id])).rows[0];

    const isConflict = (message: string) => (err: unknown) => err instanceof DayConflictError && err.message === message;

    const annual = (employeeId: string, startDate: string, endDate = startDate, svc = service) =>
      svc.createLeaveRequest({ employeeId, title: 'Phép năm', reason: 'Việc nhà', leaveType: 'ANNUAL', startDate, endDate });
    const nightShift = (startDate: string, endDate: string, svc = service) =>
      svc.createShiftChangeRequest({
        employeeId: NAM,
        title: 'Đổi ca',
        reason: 'Lịch học',
        startDate,
        endDate,
        shiftType: 'NIGHT',
        startTime: '22:00'
      });
    const isat = (saturday = '2026-11-14', employeeId = NAM, svc = service) =>
      svc.createIsatRequest({
        employeeId,
        saturday,
        team: 'Nhóm thử',
        conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
      });
    const approve = (id: string, svc = service) => svc.reviewRequest(id, ADMIN, 'APPROVE');
    const reject = (id: string, svc = service) => svc.reviewRequest(id, ADMIN, 'REJECT', 'Không đủ người');

    await t.test('assertInvariants reports each broken invariant', async () => {
      // Mỗi lần: dựng trạng thái đúng bằng service, phá đúng một bất biến bằng SQL, rồi kiểm hàm kiểm báo đúng tên.
      const broken = async (name: string, setup: () => Promise<void>) => {
        await reset();
        await setup();
        await assert.rejects(
          assertInvariants(client, NAM),
          (err: unknown) => err instanceof assert.AssertionError && err.message.startsWith(`${name} vi phạm`),
          name
        );
      };

      await broken('I2', async () => {
        const leave = await annual(NAM, '2026-11-12');
        await client.query(`UPDATE system_requests SET status = 'REJECTED' WHERE id = $1`, [leave.id]);
      });
      await broken('I3', async () => {
        const change = await nightShift('2026-11-10', '2026-11-12');
        await annual(NAM, '2026-11-11');
        await client.query(`UPDATE system_requests SET change_end_date = '2026-11-10' WHERE id = $1`, [change.id]);
      });
      await broken('I4', async () => {
        const leave = await annual(NAM, '2026-11-12');
        await approve(leave.id);
        await client.query(`DELETE FROM work_schedules`);
      });
      await broken('I5', async () => {
        await annual(NAM, '2026-11-12');
        await client.query(
          `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_start_time, ot_end_time, ot_hours, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'OT', 'OVERTIME', 'Dữ liệu sai', 'PENDING', '2026-11-12', '18:00', '20:00', 2, now(), now())`,
          [NAM]
        );
      });
    });

    await t.test('V1 leave 12–16/11 over approved ISAT 14/11 takes 12, 13, 16 and warns C2', async () => {
      await reset();
      const saturday = await isat();
      await approve(saturday.id);

      const leave = await annual(NAM, '2026-11-12', '2026-11-16');
      assert.deepEqual([leave.leaveDaysCount, leave.warnings], [3, [C2]]);
      assert.deepEqual(await daysOf(NAM), [
        ['2026-11-12', 'LEAVE', leave.id, null],
        ['2026-11-13', 'LEAVE', leave.id, null],
        ['2026-11-14', 'ISAT', saturday.id, null],
        ['2026-11-16', 'LEAVE', leave.id, null]
      ]);

      await approve(leave.id);
      assert.deepEqual(await schedulesOf(NAM), [
        ['2026-11-12', 'REGULAR', 'ON_LEAVE', '08:00', leave.id],
        ['2026-11-13', 'REGULAR', 'ON_LEAVE', '08:00', leave.id],
        ['2026-11-14', 'ISAT', 'ON_LEAVE', '08:00', saturday.id],
        ['2026-11-16', 'REGULAR', 'ON_LEAVE', '08:00', leave.id]
      ]);
      await assertInvariants(client, NAM);
    });

    await t.test('V2 leave 12–16/11 over pending ISAT 14/11 is refused with C3 and changes nothing', async () => {
      await reset();
      const saturday = await isat();
      const before = await daysOf(NAM);

      await assert.rejects(annual(NAM, '2026-11-12', '2026-11-16'), isConflict(C3));
      assert.deepEqual(await daysOf(NAM), before);
      assert.deepEqual(before, [['2026-11-14', 'ISAT', saturday.id, null]]);
      const leaves = await client.query(`SELECT count(*)::int AS n FROM system_requests WHERE type = 'LEAVE'`);
      assert.equal(leaves.rows[0].n, 0);

      await approve(saturday.id);
      await assertInvariants(client, NAM);
    });

    await t.test('V3 leave 11/11 replaces a day of a pending night shift change, and rejecting it hands the day back', async () => {
      await reset();
      const change = await nightShift('2026-11-10', '2026-11-12');
      const leave = await annual(NAM, '2026-11-11');
      assert.deepEqual(leave.warnings, []);
      assert.deepEqual(await daysOf(NAM), [
        ['2026-11-10', 'SHIFT_CHANGE', change.id, null],
        ['2026-11-11', 'LEAVE', leave.id, change.id],
        ['2026-11-12', 'SHIFT_CHANGE', change.id, null]
      ]);
      await assertInvariants(client, NAM);

      await reject(leave.id);
      assert.deepEqual(await daysOf(NAM), [
        ['2026-11-10', 'SHIFT_CHANGE', change.id, null],
        ['2026-11-11', 'SHIFT_CHANGE', change.id, null],
        ['2026-11-12', 'SHIFT_CHANGE', change.id, null]
      ]);

      await approve(change.id);
      assert.deepEqual(await schedulesOf(NAM), [
        ['2026-11-10', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id],
        ['2026-11-11', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id],
        ['2026-11-12', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id]
      ]);
      await assertInvariants(client, NAM);
    });

    await t.test('V4 shift change 10–13/11 skips pending leave 11/11 with C4, and the day returns to the regular shift', async () => {
      await reset();
      const leave = await annual(NAM, '2026-11-11');
      const change = await nightShift('2026-11-10', '2026-11-13');
      assert.deepEqual(change.warnings, [C4]);
      assert.deepEqual(await daysOf(NAM), [
        ['2026-11-10', 'SHIFT_CHANGE', change.id, null],
        ['2026-11-11', 'LEAVE', leave.id, null],
        ['2026-11-12', 'SHIFT_CHANGE', change.id, null],
        ['2026-11-13', 'SHIFT_CHANGE', change.id, null]
      ]);
      await assertInvariants(client, NAM);

      await reject(leave.id);
      assert.deepEqual(
        (await daysOf(NAM)).map(([date]) => date),
        ['2026-11-10', '2026-11-12', '2026-11-13']
      );

      await approve(change.id);
      assert.deepEqual(await schedulesOf(NAM), [
        ['2026-11-10', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id],
        ['2026-11-12', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id],
        ['2026-11-13', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id]
      ]);
      await assertInvariants(client, NAM);
    });

    await t.test('V5 ISAT 14/11 replaces a day of an approved shift change and its approval writes the ISAT day', async () => {
      await reset();
      const change = await nightShift('2026-11-09', '2026-11-14');
      await approve(change.id);

      const saturday = await isat();
      assert.deepEqual(saturday.warnings, []);
      const rows = await daysOf(NAM);
      assert.deepEqual(rows.at(-1), ['2026-11-14', 'ISAT', saturday.id, change.id]);
      assert.deepEqual(
        rows.slice(0, -1).map(([date, status, requestId]) => [date, status, requestId]),
        ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map(d => [d, 'SHIFT_CHANGE', change.id])
      );

      await approve(saturday.id);
      const schedules = await schedulesOf(NAM);
      assert.deepEqual(schedules.at(-1), ['2026-11-14', 'ISAT', 'ON_LEAVE', '22:00', saturday.id]);
      assert.equal(schedules.length, 6);
      await assertInvariants(client, NAM);
    });

    await t.test('V6 ISAT 14/11 is refused with C9 over a pending OT window, and with C8 once it is approved', async () => {
      await reset();
      const overtime = await service.createOvertimeRequest({
        employeeId: NAM,
        title: 'OT',
        reason: 'Gấp tiến độ',
        otDate: '2026-11-14',
        startTime: '18:00',
        endTime: '20:00'
      });

      await assert.rejects(isat(), isConflict(C9));
      await approve(overtime.id);
      await assert.rejects(isat(), isConflict(C8));

      const isats = await client.query(`SELECT count(*)::int AS n FROM system_requests WHERE type = 'ISAT'`);
      assert.equal(isats.rows[0].n, 0);
      assert.deepEqual(await daysOf(NAM), []);
      await assertInvariants(client, NAM);
    });

    await t.test('a day of a pending leave 17–19/11 made a holiday leaves the leave at approval', async () => {
      await reset();
      const leave = await annual(NAM, '2026-11-17', '2026-11-19');
      await client.query(`INSERT INTO company_holidays (holiday_date, name) VALUES ('2026-11-18', 'Lễ sau khi nộp')`);
      try {
        await approve(leave.id);
        const row = await client.query(`SELECT status, leave_days_count FROM system_requests WHERE id = $1`, [leave.id]);
        assert.deepEqual(row.rows[0], { status: 'APPROVED', leave_days_count: 2 });
        assert.deepEqual(await daysOf(NAM), [
          ['2026-11-17', 'LEAVE', leave.id, null],
          ['2026-11-19', 'LEAVE', leave.id, null]
        ]);
        assert.deepEqual(await schedulesOf(NAM), [
          ['2026-11-17', 'REGULAR', 'ON_LEAVE', '08:00', leave.id],
          ['2026-11-19', 'REGULAR', 'ON_LEAVE', '08:00', leave.id]
        ]);
        await assertInvariants(client, NAM);
      } finally {
        await client.query(`DELETE FROM company_holidays WHERE holiday_date = '2026-11-18'`);
      }
    });

    await t.test("Lan's leave is not blocked by Nam's ISAT on the same Saturday", async () => {
      await reset();
      // iSAT của Nam đang chờ: Lan vẫn nghỉ được đúng Thứ Bảy đó, không lỗi C3.
      const pending = await isat('2026-11-14');
      const lanSaturday = await annual(LAN, '2026-11-14');
      assert.deepEqual([lanSaturday.leaveDaysCount, lanSaturday.warnings], [1, []]);

      // iSAT của Nam đã duyệt: khoảng nghỉ của Lan không bỏ Thứ Bảy đó, không cảnh báo C2.
      const approved = await isat('2026-11-28');
      await approve(approved.id);
      const lanRange = await annual(LAN, '2026-11-26', '2026-11-30');
      assert.deepEqual([lanRange.leaveDaysCount, lanRange.warnings], [4, []]);

      await approve(pending.id);
      await approve(lanSaturday.id);
      await approve(lanRange.id);
      assert.deepEqual(await daysOf(NAM), [
        ['2026-11-14', 'ISAT', pending.id, null],
        ['2026-11-28', 'ISAT', approved.id, null]
      ]);
      assert.deepEqual(
        (await daysOf(LAN)).map(([date, status, requestId]) => [date, status, requestId]),
        [
          ['2026-11-14', 'LEAVE', lanSaturday.id],
          ['2026-11-26', 'LEAVE', lanRange.id],
          ['2026-11-27', 'LEAVE', lanRange.id],
          ['2026-11-28', 'LEAVE', lanRange.id],
          ['2026-11-30', 'LEAVE', lanRange.id]
        ]
      );
      await assertInvariants(client, NAM);
      await assertInvariants(client, LAN);
    });

    await t.test('filing ISAT 14/11 and leave 12–16/11 at the same time lets exactly one in', async () => {
      // Hai service dùng chung một pool, như hai request HTTP cùng lúc; vài vòng để thứ tự thắng có thể khác nhau.
      const first = serviceOn(db!);
      const second = serviceOn(db!);
      for (let round = 0; round < 3; round++) {
        await reset();
        const results = await Promise.allSettled([isat('2026-11-14', NAM, first), annual(NAM, '2026-11-12', '2026-11-16', second)]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        assert.equal(fulfilled.length, 1, `vòng ${round}`);
        const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')!;
        assert.ok(failed.reason instanceof DayConflictError, String(failed.reason));
        assert.ok([C3, C7].includes(failed.reason.message), failed.reason.message);

        const active = await client.query(
          `SELECT id, type FROM system_requests WHERE employee_id = $1 AND status = 'PENDING'`,
          [NAM]
        );
        assert.equal(active.rows.length, 1);
        const [winner] = active.rows;
        const rows = await daysOf(NAM);
        if (winner.type === 'ISAT') {
          assert.equal(failed.reason.message, C3);
          assert.deepEqual(rows, [['2026-11-14', 'ISAT', winner.id, null]]);
        } else {
          assert.equal(failed.reason.message, C7);
          assert.deepEqual(
            rows.map(([date, status, requestId]) => [date, status, requestId]),
            ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16'].map(d => [d, 'LEAVE', winner.id])
          );
        }
        await assertInvariants(client, NAM);
      }
    });

    await t.test('rejecting one request while filing another for the same staff keeps the table consistent', async () => {
      await reset();
      const change = await nightShift('2026-11-10', '2026-11-12');
      await approve(change.id);
      const leave = await annual(NAM, '2026-11-11');

      // Từ chối đơn nghỉ 11/11 (trả ngày cho đơn đổi ca đã duyệt) cùng lúc nộp đơn nghỉ 11–12/11.
      const filer = serviceOn(db!);
      const [rejected, filed] = await Promise.allSettled([reject(leave.id), annual(NAM, '2026-11-11', '2026-11-12', filer)]);

      assert.equal(rejected.status, 'fulfilled');
      assert.equal((await requestOf(leave.id)).status, 'REJECTED');
      if (filed.status === 'fulfilled') {
        // Từ chối chạy trước: đơn mới thay cả 11 và 12 của đơn đổi ca.
        assert.equal(filed.value.leaveDaysCount, 2);
        assert.deepEqual(await daysOf(NAM), [
          ['2026-11-10', 'SHIFT_CHANGE', change.id, null],
          ['2026-11-11', 'LEAVE', filed.value.id, change.id],
          ['2026-11-12', 'LEAVE', filed.value.id, change.id]
        ]);
        await assertInvariants(client, NAM);
        await approve(filed.value.id);
      } else {
        // Nộp chạy trước: đơn nghỉ 11/11 còn chờ nên đơn mới bị chặn như v2; sau đó 11 về đơn đổi ca.
        assert.match(String(filed.reason), /Đã có đơn nghỉ trùng ngày \(11\/11 – 11\/11\)/);
        assert.deepEqual(await daysOf(NAM), [
          ['2026-11-10', 'SHIFT_CHANGE', change.id, null],
          ['2026-11-11', 'SHIFT_CHANGE', change.id, null],
          ['2026-11-12', 'SHIFT_CHANGE', change.id, null]
        ]);
      }
      await assertInvariants(client, NAM);
    });

    await t.test('a failing day_status insert rolls back the request', async () => {
      await reset();
      await client.query(`
        CREATE FUNCTION fail_day_status() RETURNS trigger AS $$
        BEGIN
          IF NEW.work_date = DATE '2026-11-20' THEN RAISE EXCEPTION 'ghi day_status lỗi (test)'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_day_status BEFORE INSERT ON day_status FOR EACH ROW EXECUTE FUNCTION fail_day_status();
      `);
      try {
        await assert.rejects(annual(NAM, '2026-11-19', '2026-11-20'), /ghi day_status lỗi \(test\)/);

        const requests = await client.query(`SELECT count(*)::int AS n FROM system_requests WHERE employee_id = $1`, [NAM]);
        assert.equal(requests.rows[0].n, 0);
        assert.deepEqual(await daysOf(NAM), []);
        await assertInvariants(client, NAM);
      } finally {
        await client.query(`DROP TRIGGER IF EXISTS fail_day_status ON day_status; DROP FUNCTION IF EXISTS fail_day_status();`);
      }
    });

    await t.test('a failing schedule write during release rolls back the hand-back', async () => {
      await reset();
      const change = await nightShift('2026-11-10', '2026-11-12');
      await approve(change.id);
      const leave = await annual(NAM, '2026-11-11');
      const daysBefore = await daysOf(NAM);
      const schedulesBefore = await schedulesOf(NAM);

      // Trả 11/11 cho đơn đổi ca đã duyệt phải ghi lại lịch ngày đó: chặn đúng lần ghi này.
      await client.query(`
        CREATE FUNCTION fail_schedule() RETURNS trigger AS $$
        BEGIN
          IF NEW.work_date = DATE '2026-11-11' THEN RAISE EXCEPTION 'ghi lịch lỗi (test)'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_schedule BEFORE INSERT OR UPDATE ON work_schedules FOR EACH ROW EXECUTE FUNCTION fail_schedule();
      `);
      try {
        await assert.rejects(reject(leave.id), /ghi lịch lỗi \(test\)/);
      } finally {
        await client.query(`DROP TRIGGER IF EXISTS fail_schedule ON work_schedules; DROP FUNCTION IF EXISTS fail_schedule();`);
      }

      assert.deepEqual(await requestOf(leave.id), { status: 'PENDING', reviewed_by: null });
      assert.deepEqual(daysBefore[1], ['2026-11-11', 'LEAVE', leave.id, change.id]);
      assert.deepEqual(await daysOf(NAM), daysBefore);
      assert.deepEqual(await schedulesOf(NAM), schedulesBefore);
      await assertInvariants(client, NAM);

      // Bỏ trigger thì từ chối được: ngày về đơn đổi ca, lịch ghi ca đêm của đơn đó.
      await reject(leave.id);
      assert.deepEqual((await daysOf(NAM))[1], ['2026-11-11', 'SHIFT_CHANGE', change.id, null]);
      assert.deepEqual((await schedulesOf(NAM))[1], ['2026-11-11', 'SHIFT_CHANGE', 'PLANNED', '22:00', change.id]);
      await assertInvariants(client, NAM);
    });

    await t.test('review with two locks does not starve a two-connection pool', async () => {
      await reset();
      const [p1, p2, p3, p4] = POOL_STAFF.map(uuidOf);
      const toApprove = await annual(p1, '2026-11-16');
      const toReject = await annual(p2, '2026-11-17');

      // Pool nhỏ, chờ kết nối tối đa 3 giây: duyệt giữ khoá đơn rồi khoá nhân viên trên cùng giao dịch, nên không xin thêm
      // kết nối. Nếu có bước nào xin thêm thì cạn pool và báo timeout.
      const small = createKysely(new Pool({ connectionString: tempUrl.toString(), max: 2, connectionTimeoutMillis: 3000 }));
      try {
        const smallService = serviceOn(small);
        const started = Date.now();
        const results = await Promise.allSettled([
          approve(toApprove.id, smallService),
          reject(toReject.id, smallService),
          // 20–23/11: Thứ Bảy 21 là ngày lễ, 22 là Chủ nhật, nên đơn tính 2 ngày.
          annual(p3, '2026-11-20', '2026-11-23', smallService),
          annual(p4, '2026-11-20', '2026-11-23', smallService)
        ]);
        const elapsed = Date.now() - started;

        assert.deepEqual(
          results.map(r => (r.status === 'fulfilled' ? r.value.status : String(r.reason?.message ?? r.reason))),
          ['APPROVED', 'REJECTED', 'PENDING', 'PENDING']
        );
        assert.ok(elapsed < 15000, `mất ${elapsed} ms`);
      } finally {
        await small.destroy();
      }

      assert.deepEqual(await daysOf(p1), [['2026-11-16', 'LEAVE', toApprove.id, null]]);
      assert.deepEqual(await schedulesOf(p1), [['2026-11-16', 'REGULAR', 'ON_LEAVE', '08:00', toApprove.id]]);
      assert.deepEqual(await daysOf(p2), []);
      for (const filer of [p3, p4]) {
        assert.deepEqual(
          (await daysOf(filer)).map(([date, status]) => [date, status]),
          [
            ['2026-11-20', 'LEAVE'],
            ['2026-11-23', 'LEAVE']
          ]
        );
      }
      for (const id of [p1, p2, p3, p4]) {
        await assertInvariants(client, id);
      }
    });
  } finally {
    if (db) await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});
