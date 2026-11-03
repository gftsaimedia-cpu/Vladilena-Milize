import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemRequest, RequestType, RequestStatus, LeaveType, CorrectionPunchType } from '../../src/domain/request-v2';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('SystemRequest: createLeaveRequest creates a valid LEAVE request', () => {
  const req = SystemRequest.createLeaveRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Xin nghỉ phép thường niên',
    reason: 'Về quê thăm gia đình',
    leaveType: 'PAID',
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    daysCount: 3.0
  });

  assert.match(req.id, UUID_REGEX);
  assert.equal(req.employeeId, 'a0000000-0000-0000-0000-000000000001');
  assert.equal(req.title, 'Xin nghỉ phép thường niên');
  assert.equal(req.reason, 'Về quê thăm gia đình');
  assert.equal(req.type, 'LEAVE');
  assert.equal(req.status, 'PENDING');
  assert.equal(req.leaveType, 'PAID');
  assert.equal(req.leaveStartDate, '2026-11-10');
  assert.equal(req.leaveEndDate, '2026-11-12');
  assert.equal(req.leaveDaysCount, 3.0);
  assert.equal(req.reviewedBy, null);
  assert.equal(req.reviewedAt, null);
  assert.equal(req.reviewNote, null);
  assert.ok(req.createdAt instanceof Date);
  assert.ok(req.updatedAt instanceof Date);
});

test('SystemRequest: createLeaveRequest throws on invalid input', () => {
  const valid = {
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Xin nghỉ phép',
    reason: 'Việc bận',
    leaveType: 'PAID' as LeaveType,
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    daysCount: 3.0
  };

  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, title: '' }), /title/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, reason: '   ' }), /reason/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, employeeId: '' }), /employeeId/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, leaveType: 'INVALID' as any }), /leaveType/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, startDate: 'invalid-date' }), /startDate/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, startDate: '2026-02-31' }), /startDate/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, endDate: 'invalid-date' }), /endDate/i);
  assert.throws(
    () => SystemRequest.createLeaveRequest({ ...valid, startDate: '2026-11-15', endDate: '2026-11-10' }),
    /endDate.*startDate/i
  );
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, daysCount: 0 }), /daysCount/i);
  assert.throws(() => SystemRequest.createLeaveRequest({ ...valid, daysCount: -1 }), /daysCount/i);
});

test('SystemRequest: createCorrectionRequest creates a valid TIME_CORRECTION request', () => {
  const req = SystemRequest.createCorrectionRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Giải trình quên chấm công sáng',
    reason: 'Máy chấm công lỗi nhận diện vân tay',
    correctionDate: '2026-11-03',
    punchType: 'IN',
    actualTime: '08:00'
  });

  assert.match(req.id, UUID_REGEX);
  assert.equal(req.type, 'TIME_CORRECTION');
  assert.equal(req.status, 'PENDING');
  assert.equal(req.correctionDate, '2026-11-03');
  assert.equal(req.correctionPunchType, 'IN');
  assert.equal(req.correctionActualTime, '08:00');
});

test('SystemRequest: createCorrectionRequest throws on invalid input', () => {
  const valid = {
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Giải trình',
    reason: 'Quên chấm',
    correctionDate: '2026-11-03',
    punchType: 'OUT' as CorrectionPunchType,
    actualTime: '17:30'
  };

  assert.throws(() => SystemRequest.createCorrectionRequest({ ...valid, title: '' }), /title/i);
  assert.throws(() => SystemRequest.createCorrectionRequest({ ...valid, reason: '' }), /reason/i);
  assert.throws(
    () => SystemRequest.createCorrectionRequest({ ...valid, correctionDate: '2026-13-01' }),
    /correctionDate/i
  );
  assert.throws(() => SystemRequest.createCorrectionRequest({ ...valid, punchType: 'INVALID' as any }), /punchType/i);
  assert.throws(() => SystemRequest.createCorrectionRequest({ ...valid, actualTime: '25:00' }), /actualTime/i);
  assert.throws(() => SystemRequest.createCorrectionRequest({ ...valid, actualTime: '8:00' }), /actualTime/i);
});

test('SystemRequest: createOvertimeRequest creates a valid OVERTIME request', () => {
  const req = SystemRequest.createOvertimeRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Đăng ký tăng ca hoàn thiện báo cáo',
    reason: 'Kịp tiến độ bàn giao dự án cho khách hàng',
    otDate: '2026-11-05',
    startTime: '18:00',
    endTime: '21:00',
    hours: 3.0
  });

  assert.match(req.id, UUID_REGEX);
  assert.equal(req.type, 'OVERTIME');
  assert.equal(req.status, 'PENDING');
  assert.equal(req.otDate, '2026-11-05');
  assert.equal(req.otStartTime, '18:00');
  assert.equal(req.otEndTime, '21:00');
  assert.equal(req.otHours, 3.0);
});

test('SystemRequest: createOvertimeRequest throws on invalid input', () => {
  const valid = {
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Đăng ký OT',
    reason: 'Gấp',
    otDate: '2026-11-05',
    startTime: '18:00',
    endTime: '21:00',
    hours: 3.0
  };

  assert.throws(() => SystemRequest.createOvertimeRequest({ ...valid, title: '' }), /title/i);
  assert.throws(() => SystemRequest.createOvertimeRequest({ ...valid, otDate: 'invalid' }), /otDate/i);
  assert.throws(() => SystemRequest.createOvertimeRequest({ ...valid, startTime: '99:00' }), /startTime/i);
  assert.throws(() => SystemRequest.createOvertimeRequest({ ...valid, endTime: 'invalid' }), /endTime/i);
  assert.throws(() => SystemRequest.createOvertimeRequest({ ...valid, hours: 0 }), /hours/i);
  assert.throws(() => SystemRequest.createOvertimeRequest({ ...valid, hours: -2 }), /hours/i);
});

test('SystemRequest: createAdvanceRequest creates a valid ADVANCE request', () => {
  const req = SystemRequest.createAdvanceRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Đề nghị tạm ứng lương tháng 11',
    reason: 'Chi phí sửa nhà đột xuất',
    amount: 3000000n,
    period: '2026-11'
  });

  assert.match(req.id, UUID_REGEX);
  assert.equal(req.type, 'ADVANCE');
  assert.equal(req.status, 'PENDING');
  assert.equal(req.advanceAmount, 3000000n);
  assert.equal(req.advancePeriod, '2026-11');
});

test('SystemRequest: createAdvanceRequest throws on invalid input', () => {
  const valid = {
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Tạm ứng',
    reason: 'Việc nhà',
    amount: 2000000,
    period: '2026-11'
  };

  assert.throws(() => SystemRequest.createAdvanceRequest({ ...valid, title: '' }), /title/i);
  assert.throws(() => SystemRequest.createAdvanceRequest({ ...valid, amount: 0 }), /amount/i);
  assert.throws(() => SystemRequest.createAdvanceRequest({ ...valid, amount: -1000 }), /amount/i);
  assert.throws(() => SystemRequest.createAdvanceRequest({ ...valid, period: '2026-13' }), /period/i);
  assert.throws(() => SystemRequest.createAdvanceRequest({ ...valid, period: 'invalid' }), /period/i);
});

test('SystemRequest: approval flow transitions to APPROVED and records reviewer details', () => {
  const req = SystemRequest.createLeaveRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Nghỉ phép',
    reason: 'Nghỉ ngơi',
    leaveType: 'PAID',
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    daysCount: 1.0
  });

  const reviewerId = 'b0000000-0000-0000-0000-000000000002';
  const approved = req.approve(reviewerId, 'Đồng ý duyệt phép');

  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.reviewedBy, reviewerId);
  assert.ok(approved.reviewedAt instanceof Date);
  assert.equal(approved.reviewNote, 'Đồng ý duyệt phép');

  // Cannot approve again
  assert.throws(() => approved.approve(reviewerId), /status/i);
  // Cannot reject once approved
  assert.throws(() => approved.reject(reviewerId), /status/i);
  // Cannot cancel once approved
  assert.throws(() => approved.cancel('a0000000-0000-0000-0000-000000000001'), /status/i);
});

test('SystemRequest: rejection flow transitions to REJECTED and records reviewer details', () => {
  const req = SystemRequest.createCorrectionRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Quên chấm công',
    reason: 'Vội vào ca',
    correctionDate: '2026-11-01',
    punchType: 'IN',
    actualTime: '08:05'
  });

  const reviewerId = 'b0000000-0000-0000-0000-000000000002';
  const rejected = req.reject(reviewerId, 'Không có minh chứng camera');

  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.reviewedBy, reviewerId);
  assert.ok(rejected.reviewedAt instanceof Date);
  assert.equal(rejected.reviewNote, 'Không có minh chứng camera');

  // Cannot reject again
  assert.throws(() => rejected.reject(reviewerId), /status/i);
  // Cannot approve once rejected
  assert.throws(() => rejected.approve(reviewerId), /status/i);
  // Cannot cancel once rejected
  assert.throws(() => rejected.cancel('a0000000-0000-0000-0000-000000000001'), /status/i);
});

test('SystemRequest: cancellation flow allows author to cancel and blocks non-author', () => {
  const authorId = 'a0000000-0000-0000-0000-000000000001';
  const otherId = 'c0000000-0000-0000-0000-000000000003';

  const req = SystemRequest.createOvertimeRequest({
    employeeId: authorId,
    title: 'OT cuối tuần',
    reason: 'Xử lý tồn đọng',
    otDate: '2026-11-07',
    startTime: '09:00',
    endTime: '12:00',
    hours: 3.0
  });

  // Non-author cannot cancel
  assert.throws(() => req.cancel(otherId), /author|employee/i);

  // Author cancels successfully
  const cancelled = req.cancel(authorId);
  assert.equal(cancelled.status, 'CANCELLED');

  // Cannot cancel again
  assert.throws(() => cancelled.cancel(authorId), /status/i);
  // Cannot approve or reject cancelled request
  assert.throws(() => cancelled.approve('reviewer-id'), /status/i);
  assert.throws(() => cancelled.reject('reviewer-id'), /status/i);
});

test('SystemRequest: toRow and fromRow fidelity across all request types', () => {
  const leaveReq = SystemRequest.createLeaveRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Xin nghỉ phép ốm',
    reason: 'Cảm cúm theo mùa',
    leaveType: 'PAID',
    startDate: '2026-11-02',
    endDate: '2026-11-03',
    daysCount: 2.0
  });
  leaveReq.approve('b0000000-0000-0000-0000-000000000002', 'Đã duyệt kèm đơn thuốc');

  const leaveRow = leaveReq.toRow();
  assert.equal(leaveRow.title, 'Xin nghỉ phép ốm');
  assert.equal(leaveRow.leave_type, 'PAID');
  assert.equal(leaveRow.leave_start_date, '2026-11-02');
  assert.equal(leaveRow.leave_end_date, '2026-11-03');
  assert.equal(leaveRow.leave_days_count, 2.0);
  assert.equal(leaveRow.status, 'APPROVED');
  assert.equal(leaveRow.reviewed_by, 'b0000000-0000-0000-0000-000000000002');
  assert.equal(leaveRow.review_note, 'Đã duyệt kèm đơn thuốc');

  const restoredLeave = SystemRequest.fromRow(leaveRow);
  assert.equal(restoredLeave.id, leaveReq.id);
  assert.equal(restoredLeave.employeeId, leaveReq.employeeId);
  assert.equal(restoredLeave.title, leaveReq.title);
  assert.equal(restoredLeave.type, 'LEAVE');
  assert.equal(restoredLeave.status, 'APPROVED');
  assert.equal(restoredLeave.leaveType, 'PAID');
  assert.equal(restoredLeave.leaveStartDate, '2026-11-02');
  assert.equal(restoredLeave.leaveEndDate, '2026-11-03');
  assert.equal(restoredLeave.leaveDaysCount, 2.0);
  assert.equal(restoredLeave.reviewedBy, 'b0000000-0000-0000-0000-000000000002');
  assert.equal(restoredLeave.reviewNote, 'Đã duyệt kèm đơn thuốc');

  // Advance with BigInt
  const advReq = SystemRequest.createAdvanceRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Tạm ứng giữa tháng',
    reason: 'Đóng học phí con',
    amount: 5000000n,
    period: '2026-11'
  });
  const advRow = advReq.toRow();
  assert.equal(advRow.type, 'ADVANCE');
  assert.equal(advRow.advance_period, '2026-11');

  const restoredAdv = SystemRequest.fromRow(advRow);
  assert.equal(restoredAdv.id, advReq.id);
  assert.equal(restoredAdv.type, 'ADVANCE');
  assert.equal(restoredAdv.advancePeriod, '2026-11');
  assert.equal(String(restoredAdv.advanceAmount), '5000000');
});

test('SystemRequest: toJSON provides clean DTO', () => {
  const req = SystemRequest.createCorrectionRequest({
    employeeId: 'a0000000-0000-0000-0000-000000000001',
    title: 'Quên chấm công chiều',
    reason: 'Họp khẩn cấp',
    correctionDate: '2026-11-03',
    punchType: 'OUT',
    actualTime: '18:15'
  });

  const json = req.toJSON();
  assert.equal(json.id, req.id);
  assert.equal(json.employeeId, req.employeeId);
  assert.equal(json.title, req.title);
  assert.equal(json.type, 'TIME_CORRECTION');
  assert.equal(json.correctionDate, '2026-11-03');
  assert.equal(json.correctionPunchType, 'OUT');
  assert.equal(json.correctionActualTime, '18:15');
  assert.equal(typeof json.createdAt, 'string');
});
