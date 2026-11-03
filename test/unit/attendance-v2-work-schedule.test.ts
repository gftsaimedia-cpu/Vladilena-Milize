import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  WorkSchedule,
  ShiftType,
  ScheduleType,
  ScheduleStatus,
  CheckInStatus,
  CheckOutStatus,
  DayStatus
} from '../../src/domain/attendance-v2/work-schedule';

describe('WorkSchedule Domain Entity', () => {
  const employeeId = randomUUID();
  const workDate = '2026-11-03';

  it('khởi tạo thành công WorkSchedule hợp lệ', () => {
    const schedule = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });

    assert.ok(schedule.id);
    assert.equal(schedule.employeeId, employeeId);
    assert.equal(schedule.workDate, workDate);
    assert.equal(schedule.shiftType, 'NORMAL');
    assert.equal(schedule.plannedStartTime, '08:00');
    assert.equal(schedule.plannedEndTime, '17:00');
    assert.equal(schedule.scheduleType, 'REGULAR');
    assert.equal(schedule.status, 'PLANNED');
    assert.equal(schedule.approvedOtHours, 0);
  });

  it('áp dụng đơn đổi ca thành công (withShiftChange)', () => {
    const original = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });

    const requestId = randomUUID();
    const modified = original.withShiftChange('FLEX', '06:00', '15:00', requestId);

    assert.equal(modified.shiftType, 'FLEX');
    assert.equal(modified.plannedStartTime, '06:00');
    assert.equal(modified.plannedEndTime, '15:00');
    assert.equal(modified.scheduleType, 'SHIFT_CHANGE');
    assert.equal(modified.sourceRequestId, requestId);
  });

  it('áp dụng đơn làm bù thành công (withMakeUp)', () => {
    const original = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });

    const requestId = randomUUID();
    const modified = original.withMakeUp('08:00', '22:00', requestId);

    assert.equal(modified.plannedStartTime, '08:00');
    assert.equal(modified.plannedEndTime, '22:00');
    assert.equal(modified.scheduleType, 'MAKE_UP');
    assert.equal(modified.sourceRequestId, requestId);
  });

  it('áp dụng đơn tăng ca thành công (withOvertime)', () => {
    const original = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });

    const requestId = randomUUID();
    const modified = original.withOvertime('21:00', 4.0, requestId);

    assert.equal(modified.plannedStartTime, '08:00');
    assert.equal(modified.plannedEndTime, '21:00');
    assert.equal(modified.approvedOtHours, 4.0);
    assert.equal(modified.scheduleType, 'OVERTIME');
    assert.equal(modified.sourceRequestId, requestId);
  });

  it('chuyển trạng thái nghỉ phép thành công (withLeave)', () => {
    const original = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });

    const requestId = randomUUID();
    const modified = original.withLeave(requestId);

    assert.equal(modified.status, 'ON_LEAVE');
    assert.equal(modified.sourceRequestId, requestId);
  });

  it('chuyển đổi toRow, fromRow, toJSON chính xác', () => {
    const schedule = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NIGHT',
      plannedStartTime: '21:00',
      plannedEndTime: '06:00',
      approvedOtHours: 2.0
    });

    const row = schedule.toRow();
    assert.equal(row.shift_type, 'NIGHT');
    assert.equal(row.approved_ot_hours, 2.0);

    const from = WorkSchedule.fromRow(row);
    assert.equal(from.id, schedule.id);
    assert.equal(from.shiftType, 'NIGHT');
    assert.equal(from.approvedOtHours, 2.0);

    const json = schedule.toJSON();
    assert.equal(json.shiftType, 'NIGHT');
    assert.equal(json.approvedOtHours, 2.0);
  });

  it('báo lỗi khi định dạng giờ không hợp lệ', () => {
    assert.throws(() => {
      WorkSchedule.create({
        employeeId,
        workDate,
        shiftType: 'NORMAL',
        plannedStartTime: '8h sáng',
        plannedEndTime: '17:00'
      });
    }, /định dạng giờ/i);
  });
});
