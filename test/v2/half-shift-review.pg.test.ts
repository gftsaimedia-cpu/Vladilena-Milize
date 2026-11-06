import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository.js';
import { DayConflictError } from '../../src/modules/requests/domain/index.js';

test('half-shift review, reject, cancel, holiday collision, blockers, and reset slip on PostgreSQL', async t => {
  await withTempDb(t, 'half_shift_review', async (db, client) => {
    const adminId = '0a7c4e2e-1111-4a6b-9c1d-000000000000';
    const nvId = '0a7c4e2e-1111-4a6b-9c1d-000000000001';

    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, role)
       VALUES 
         ('admin', 'Quản trị', 'nv', 1, 'x', now(), $1, 'admin'),
         ('nv01', 'Nhân viên 01', 'nv', 1, 'x', now(), $2, 'staff')`,
      [adminId, nvId]
    );

    let resetDecisionCalls: Array<{ month: string; employeeId: string }> = [];
    const fakePayroll = {
      resetDecision: async (month: string, employeeId: string) => {
        resetDecisionCalls.push({ month, employeeId });
      },
      calculatePeriodPayslips: async () => ({ errors: [] })
    };

    let periodStatus = 'open';
    const fakePeriodGate = {
      statusOf: async () => periodStatus,
      hold: async () => {}
    };

    let refreshedDates: string[] = [];
    const fakeAttendanceDays = {
      refreshDays: async (_empId: string, dates: string[]) => {
        refreshedDates.push(...dates);
      }
    };

    const makeService = () =>
      new RequestsService(
        new RequestsRepository(db),
        new AttendanceRepository(db),
        new TransactionCoordinator(db),
        new HolidaysRepository(db),
        new DayStatusRepository(db),
        fakePeriodGate as any,
        fakePayroll as any,
        undefined,
        undefined,
        undefined,
        fakeAttendanceDays as any
      );

    const service = makeService();

    // 1. Nộp đơn nửa ca ngày 2026-11-12
    const req1 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Việc nhà'
    });
    assert.equal(req1.status, 'PENDING');

    // Blockers SQL: pendingRequests phải đếm đơn nửa ca này
    const periodsRepo = new PeriodsRepository(db);
    const blockersBefore = await periodsRepo.blockers(undefined, '2026-11');
    assert.equal(blockersBefore.pendingRequests, 1);

    // Duyệt đơn req1
    refreshedDates = [];
    const approved = await service.reviewRequest(req1.id, 'admin', 'APPROVE', 'Đồng ý');
    assert.equal(approved.status, 'APPROVED');
    assert.deepEqual(refreshedDates, ['2026-11-12']);

    // Kiểm tra day_status vẫn giữ 'HALF_SHIFT'
    const statusRow = (await client.query(
      `SELECT status, request_id FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-12'`,
      [nvId]
    )).rows[0];
    assert.equal(statusRow.status, 'HALF_SHIFT');
    assert.equal(statusRow.request_id, req1.id);

    // Kiểm tra work_schedules không bị đánh dấu nghỉ
    const scheduleRow = (await client.query(
      `SELECT * FROM work_schedules WHERE employee_id = $1 AND work_date = '2026-11-12'`,
      [nvId]
    )).rows[0];
    assert.equal(scheduleRow, undefined); // Không có dòng lịch nào bị ghi là nghỉ

    // Huỷ đơn đã duyệt bị từ chối
    await assert.rejects(
      service.cancelRequest(req1.id, 'nv01', 'Huỷ thử'),
      /Cannot cancel request with status 'APPROVED'/
    );

    // Blockers sau khi duyệt: pendingRequests về 0
    const blockersAfter = await periodsRepo.blockers(undefined, '2026-11');
    assert.equal(blockersAfter.pendingRequests, 0);

    // 2. Từ chối: nộp đơn req2 ngày 2026-11-13 rồi từ chối
    const req2 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-13',
      half: 'SECOND',
      reason: 'Việc riêng'
    });
    const rejected = await service.reviewRequest(req2.id, 'admin', 'REJECT', 'Không duyệt');
    assert.equal(rejected.status, 'REJECTED');

    // Ngày 13/11 được trả trong day_status
    const status13 = (await client.query(
      `SELECT * FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-13'`,
      [nvId]
    )).rows[0];
    assert.equal(status13, undefined);

    // Nộp lại cùng ngày 13/11 thành công
    const req2Retry = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-13',
      half: 'FIRST',
      reason: 'Nộp lại việc riêng'
    });
    assert.equal(req2Retry.status, 'PENDING');

    // Huỷ đơn req2Retry khi còn PENDING
    await service.cancelRequest(req2Retry.id, 'nv01', 'Tôi huỷ');
    const status13AfterCancel = (await client.query(
      `SELECT * FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-13'`,
      [nvId]
    )).rows[0];
    assert.equal(status13AfterCancel, undefined);

    // 3. Đè lên đơn đổi ca: nộp đổi ca ngày 2026-11-17, duyệt đổi ca
    const sc = await service.createShiftChangeRequest({
      employeeId: 'nv01',
      startDate: '2026-11-17',
      endDate: '2026-11-17',
      shiftType: 'NORMAL',
      startTime: '08:00',
      reason: 'Đổi ca'
    });
    await service.reviewRequest(sc.id, 'admin', 'APPROVE');

    // Nộp nửa ca ngày 2026-11-17 -> đè dòng đổi ca (baseRequestId = sc.id)
    const reqSc = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-17',
      half: 'FIRST',
      reason: 'Nửa ca đè đổi ca'
    });

    const status17Before = (await client.query(
      `SELECT status, request_id, base_request_id FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-17'`,
      [nvId]
    )).rows[0];
    assert.equal(status17Before.status, 'HALF_SHIFT');
    assert.equal(status17Before.request_id, reqSc.id);
    assert.equal(status17Before.base_request_id, sc.id);

    // Từ chối nửa ca -> trả lại dòng đổi ca
    await service.reviewRequest(reqSc.id, 'admin', 'REJECT');
    const status17After = (await client.query(
      `SELECT status, request_id, base_request_id FROM day_status WHERE employee_id = $1 AND work_date = '2026-11-17'`,
      [nvId]
    )).rows[0];
    assert.equal(status17After.status, 'SHIFT_CHANGE');
    assert.equal(status17After.request_id, sc.id);
    assert.equal(status17After.base_request_id, null);

    // 4. Ngày lễ: nộp nửa ca ngày 2026-11-19 (chờ)
    const reqHoliday = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-19',
      half: 'FIRST',
      reason: 'Trước ngày lễ'
    });

    // Thêm ngày lễ vào 2026-11-19
    await client.query(
      `INSERT INTO company_holidays (holiday_date, name, created_at)
       VALUES ('2026-11-19', 'Lễ bất ngờ', now())`
    );

    // Duyệt bị từ chối với lỗi xung đột
    await assert.rejects(
      service.reviewRequest(reqHoliday.id, 'admin', 'APPROVE'),
      (err: any) =>
        err instanceof DayConflictError &&
        err.message === 'Ngày 19/11 đã thành ngày lễ, đơn nghỉ giữa ca không duyệt được. Chỉ có thể từ chối đơn này.'
    );

    // Nhưng từ chối vẫn được
    const rejectedHoliday = await service.reviewRequest(reqHoliday.id, 'admin', 'REJECT');
    assert.equal(rejectedHoliday.status, 'REJECTED');

    // 5. Phiếu lương về nháp khi tháng ở trạng thái 'calculated'
    periodStatus = 'calculated';
    resetDecisionCalls = [];
    const reqCalc = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-24',
      half: 'FIRST',
      reason: 'Trong kỳ calculated'
    });

    await service.reviewRequest(reqCalc.id, 'admin', 'APPROVE');
    assert.equal(resetDecisionCalls.length, 1);
    assert.deepEqual(resetDecisionCalls[0], { month: '2026-11', employeeId: nvId });
  });
});
