import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SystemRequest } from '../../src/modules/requests/domain/system-request.js';

describe('SystemRequest half-shift leave', () => {
  it('creates a half-shift leave request with status PENDING and type HALF_SHIFT_LEAVE', () => {
    const req = SystemRequest.createHalfShiftLeave({
      employeeId: 'emp-1',
      title: 'Nghỉ giữa ca 12/11, làm 08–12h',
      reason: 'Việc gia đình',
      halfShiftDate: '2026-11-12',
      halfShift: 'FIRST',
      halfStart: '08:00',
      halfEnd: '12:00',
    });

    assert.equal(req.type, 'HALF_SHIFT_LEAVE');
    assert.equal(req.status, 'PENDING');
    assert.equal(req.halfShiftDate, '2026-11-12');
    assert.equal(req.halfShift, 'FIRST');
    assert.equal(req.halfStartTime, '08:00');
    assert.equal(req.halfEndTime, '12:00');

    const dto = req.toJSON();
    assert.equal(dto.type, 'HALF_SHIFT_LEAVE');
    assert.equal(dto.halfShiftDate, '2026-11-12');
    assert.equal(dto.halfShift, 'FIRST');
    assert.deepEqual(dto.halfShiftWork, { start: '08:00', end: '12:00' });
    assert.deepEqual(dto.halfShiftLeave, { start: '13:00', end: '17:00' });
    assert.equal(dto.owedMinutes, 240);
    assert.deepEqual(dto.dates, ['2026-11-12']);
  });

  it('sets halfShift fields to null for other request types', () => {
    const leave = SystemRequest.createLeaveRequest({
      employeeId: 'emp-1',
      title: 'Nghỉ phép',
      reason: 'Nghỉ ngơi',
      leaveType: 'ANNUAL',
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      daysCount: 1,
    });

    const dto = leave.toJSON();
    assert.equal(dto.halfShiftDate, null);
    assert.equal(dto.halfShift, null);
    assert.equal(dto.halfShiftWork, null);
    assert.equal(dto.halfShiftLeave, null);
    assert.equal(dto.owedMinutes, null);
  });

  it('throws an error if half is outside FIRST | SECOND', () => {
    assert.throws(
      () => {
        SystemRequest.createHalfShiftLeave({
          employeeId: 'emp-1',
          title: 'Nghỉ giữa ca',
          reason: 'Lý do',
          halfShiftDate: '2026-11-12',
          halfShift: 'MIDDLE' as any,
          halfStart: '08:00',
          halfEnd: '12:00',
        });
      },
      {
        message: 'Nửa ca không hợp lệ: MIDDLE',
      }
    );
  });
});
