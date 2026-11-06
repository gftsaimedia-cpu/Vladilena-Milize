import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service.js';
import { DayConflictError, SystemRequest } from '../../src/modules/requests/domain';

test('half-shift filing on PostgreSQL', async t => {
  await withTempDb(t, 'half_shift_filing', async (db, client) => {
    const empId = '0a7c4e2e-1111-4a6b-9c1d-000000000001';
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES ('nv01', 'Nhân viên 01', 'nv', 1, 'x', now(), $1)`,
      [empId]
    );

    const service = new RequestsService(
      new RequestsRepository(db),
      new AttendanceRepository(db),
      new TransactionCoordinator(db),
      new HolidaysRepository(db),
      new DayStatusRepository(db)
    );

    // 1. Filing first time on 2026-11-12 succeeds
    const req1 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Việc nhà',
    });
    assert.equal(req1.status, 'PENDING');
    assert.equal(req1.halfShiftDate, '2026-11-12');

    // 2. Filing second time on same date throws DayConflictError
    await assert.rejects(
      service.createHalfShiftLeaveRequest({
        employeeId: 'nv01',
        date: '2026-11-12',
        half: 'SECOND',
        reason: 'Việc nhà 2',
      }),
      (err: any) => err instanceof DayConflictError && err.message === 'Ngày 12/11 đã có đơn nghỉ giữa ca'
    );

    // 3. Shift change on 2026-11-13 -> filing half-shift replaces shift change claim with base_request_id
    const sc = await service.createShiftChangeRequest({
      employeeId: 'nv01',
      startDate: '2026-11-13',
      endDate: '2026-11-13',
      shiftType: 'NORMAL',
      startTime: '08:00',
      reason: 'Đổi ca test',
    });

    const req3 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-13',
      half: 'FIRST',
      reason: 'Nghỉ nửa ca trên ngày đổi ca',
    });

    const dayRow = await client.query(
      `SELECT status, request_id, base_request_id FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-13'`,
      [empId]
    );
    assert.equal(dayRow.rows[0].status, 'HALF_SHIFT');
    assert.equal(dayRow.rows[0].request_id, req3.id);
    assert.equal(dayRow.rows[0].base_request_id, sc.id);
  });
});
