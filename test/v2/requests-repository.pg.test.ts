import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { SystemRequest } from '../../src/modules/requests/domain';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy migration trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

test('RequestsRepository and HolidaysRepository on PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `requests_rules_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;

  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  const db = createKysely(createPgPool(tempUrl.toString()));
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

    // reviewed_by tham chiếu staff(uuid) nên người duyệt cũng phải có hồ sơ.
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'pg-uuid-1'),
              ('pg-admin', 'Quản trị PG', 'nv', 1, 'x', $1, 'pg-admin-uuid')`,
      [new Date().toISOString()]
    );
    const repo = new RequestsRepository(db);

    // Hồ sơ nhân sự: cờ quyền lợi và ngày làm việc lấy từ position_types của tháng.
    const staff = await repo.findStaffContext('pg-user', '2026-11');
    assert.deepEqual(staff?.benefits, { ot: true, makeup: true, leaveAccount: true });
    assert.deepEqual(
      [staff?.employeeId, staff?.employeeType, staff?.regularDows, staff?.defaultShift, staff?.leaveBalance, staff?.leaveBalanceOn],
      ['pg-uuid-1', 'nv', [1, 2, 3, 4, 5, 6], { startTime: '08:00', endTime: '17:00' }, 0, null]
    );
    assert.equal((await repo.findStaffContext('pg-uuid-1', '2026-11'))?.employeeId, 'pg-uuid-1');
    assert.equal(await repo.findStaffContext('khong-co', '2026-11'), null);

    // Đơn nghỉ có làm bù: đơn và khung bù ghi cùng nhau; lưu lại sau khi duyệt không nhân đôi khung.
    const lwm = SystemRequest.createLeaveWithMakeupRequest({
      employeeId: 'pg-uuid-1', title: 'Nghỉ bù', reason: 'Việc nhà', startDate: '2026-11-10', endDate: '2026-11-10', daysCount: 1,
      makeupSlots: [
        { date: '2026-11-16', startTime: '18:00', endTime: '22:00', workMinutes: 240 },
        { date: '2026-11-12', startTime: '18:00', endTime: '22:00', workMinutes: 240 }
      ]
    });
    await repo.save(lwm);
    const savedLwm = (await repo.findById(lwm.id))!;
    assert.equal(savedLwm.leaveStartDate, '2026-11-10');
    assert.deepEqual([savedLwm.makeupSlots[0].date, savedLwm.makeupSlots[0].workMinutes], ['2026-11-12', 240]);
    assert.equal(savedLwm.toJSON().owedMinutes, 480);
    savedLwm.approve('pg-admin-uuid');
    await repo.save(savedLwm);
    const approvedLwm = (await repo.findById(lwm.id))!;
    assert.equal(approvedLwm.status, 'APPROVED');
    assert.deepEqual(approvedLwm.makeupSlots.map(s => s.date), ['2026-11-12', '2026-11-16']);

    // Đơn giải trình: trường hợp đọc lại khớp.
    const explanation = SystemRequest.createExplanationRequest({
      employeeId: 'pg-uuid-1', title: 'Giải trình', reason: 'Kẹt xe', workDate: '2026-11-04',
      cases: ['LATE_CHECK_IN'], actualCheckIn: '08:20', actualCheckOut: null
    });
    await repo.save(explanation);
    const savedExplanation = (await repo.findById(explanation.id))!;
    assert.deepEqual(
      [savedExplanation.explanationDate, savedExplanation.explanationCases, savedExplanation.actualCheckIn, savedExplanation.actualCheckOut],
      ['2026-11-04', ['LATE_CHECK_IN'], '08:20', null]
    );

    // listActive: đơn đang chờ/đã duyệt của một người.
    assert.deepEqual((await repo.listActive('pg-uuid-1')).map(r => r.id).sort(), [lwm.id, explanation.id].sort());
    savedExplanation.reject('pg-admin-uuid', 'Thiếu chứng cứ');
    await repo.save(savedExplanation);
    assert.deepEqual((await repo.listActive('pg-uuid-1')).map(r => r.id), [lwm.id]);

    // CHECK của lược đồ chặn mã cũ.
    const insertRequest = (column: string, value: string, type = 'LEAVE') =>
      client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ${column}, created_at, updated_at)
         VALUES (gen_random_uuid(), 'pg-uuid-1', 't', $1, 'r', 'PENDING', $2, now(), now())`,
        [type, value]
      );
    await assert.rejects(insertRequest('leave_type', 'PAID'), /check constraint/);
    await assert.rejects(
      client.query(`INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at)
                    VALUES (gen_random_uuid(), 'pg-uuid-1', 't', 'TIME_CORRECTION', 'r', 'PENDING', now(), now())`),
      /check constraint/
    );
    await assert.rejects(
      client.query(`INSERT INTO explanation_cases (request_id, case_code) VALUES ($1, 'X')`, [explanation.id]),
      /check constraint/
    );

    // Lịch lễ công ty.
    const holidays = new HolidaysRepository(db);
    assert.equal(await holidays.insert({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin'), true);
    assert.equal(await holidays.insert({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin'), false);
    assert.deepEqual(await holidays.listBetween('2026-01-01', '2026-12-31'), [{ date: '2026-09-02', name: 'Quốc khánh' }]);
    assert.deepEqual(await holidays.listBetween('2026-09-03', '2026-12-31'), []);
    assert.deepEqual(await holidays.remove('2026-09-02'), { date: '2026-09-02', name: 'Quốc khánh' });
    assert.equal(await holidays.remove('2026-09-02'), null);

    // Lịch làm việc: DATE/TIME đọc thành chuỗi, ON_LEAVE thành onLeave.
    await client.query(
      `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time, status)
       VALUES ('pg-uuid-1', '2026-11-12', 'NORMAL', '10:00', '19:00', 'ON_LEAVE'),
              ('pg-uuid-1', '2026-11-13', 'NORMAL', '08:00', '17:00', 'PLANNED'),
              ('pg-uuid-1', '2026-12-01', 'NORMAL', '08:00', '17:00', 'PLANNED')`
    );
    assert.deepEqual(await repo.listScheduleDays('pg-uuid-1', '2026-11-12', '2026-11-12'), [
      { date: '2026-11-12', startTime: '10:00', endTime: '19:00', onLeave: true }
    ]);
    assert.deepEqual(await repo.listScheduleDays('pg-uuid-1', '2026-11-01', '2026-11-30'), [
      { date: '2026-11-12', startTime: '10:00', endTime: '19:00', onLeave: true },
      { date: '2026-11-13', startTime: '08:00', endTime: '17:00', onLeave: false }
    ]);
  } finally {
    await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});
