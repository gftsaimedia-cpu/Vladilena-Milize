import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { SystemRequest } from '../../src/modules/requests/domain/system-request.js';

test('half-shift schema and repository on PostgreSQL', async t => {
  await withTempDb(t, 'half_shift_repo', async (db, client) => {
    const empId = 'pg-emp-half-shift';
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES ('half-shift-user', 'Nhân viên Nửa ca', 'nv', 1, 'x', now(), $1)`,
      [empId]
    );

    const repo = new RequestsRepository(db);

    // 1. Lưu đơn rồi đọc lại bằng repository ra đúng 4 cột
    const req = SystemRequest.createHalfShiftLeave({
      employeeId: empId,
      title: 'Nghỉ giữa ca 12/11, làm 08–12h',
      reason: 'Việc gia đình',
      halfShiftDate: '2026-11-12',
      halfShift: 'FIRST',
      halfStart: '08:00',
      halfEnd: '12:00',
    });

    await repo.save(req);

    const found = await repo.findById(req.id);
    assert.ok(found);
    assert.equal(found.type, 'HALF_SHIFT_LEAVE');
    assert.equal(found.halfShiftDate, '2026-11-12');
    assert.equal(found.halfShift, 'FIRST');
    assert.equal(found.halfStartTime, '08:00');
    assert.equal(found.halfEndTime, '12:00');

    // 2. INSERT thẳng day_status.status = 'HALF_SHIFT' được
    await client.query(
      `INSERT INTO day_status (employee_id, work_date, status, request_id)
       VALUES ($1, '2026-11-12', 'HALF_SHIFT', $2)`,
      [empId, req.id]
    );
    const dayStatusRes = await client.query(
      `SELECT status FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-12'`,
      [empId]
    );
    assert.equal(dayStatusRes.rows[0].status, 'HALF_SHIFT');

    // 3. half_shift_half = 'MIDDLE' bị CHECK từ chối
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO system_requests (
             id, employee_id, title, type, reason, status, created_at, updated_at,
             half_shift_date, half_shift_half, half_start_time, half_end_time
           ) VALUES (
             gen_random_uuid(), $1, 'Nghỉ giữa ca test', 'HALF_SHIFT_LEAVE', 'Test', 'PENDING', now(), now(),
             '2026-11-13', 'MIDDLE', '08:00', '12:00'
           )`,
          [empId]
        );
      },
      /check constraint/i
    );

    // 4. timesheet_entries.pay_units = 0.5 ghi được, half_shift = 'FIRST' ghi được
    const timesheetId = 'a0000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO timesheet_entries (
         id, employee_id, work_date, status, pay_units, half_shift, created_at, updated_at
       ) VALUES (
         $1, $2, '2026-11-12', 'PRESENT', 0.5, 'FIRST', now(), now()
       )`,
      [timesheetId, empId]
    );
    const tsRes = await client.query(
      `SELECT pay_units, half_shift FROM timesheet_entries WHERE id = $1`,
      [timesheetId]
    );
    assert.equal(Number(tsRes.rows[0].pay_units), 0.5);
    assert.equal(tsRes.rows[0].half_shift, 'FIRST');

    // 5. timesheet_entries.pay_units = 0.7 bị CHECK từ chối
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO timesheet_entries (
             id, employee_id, work_date, status, pay_units, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, '2026-11-13', 'PRESENT', 0.7, now(), now()
           )`,
          [empId]
        );
      },
      /check constraint/i
    );
  });
});
