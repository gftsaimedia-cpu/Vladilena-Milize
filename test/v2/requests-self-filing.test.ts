import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { makeService } from './helpers/requests-fakes';

const SELF = { filedBy: 'self' as const };
const WINDOW_MESSAGE = 'Chỉ chọn ngày từ 04/11 đến 31/12';

describe('Luật khi nhân viên tự nộp (filedBy: self)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const leave = (startDate: string, endDate = startDate) => ({
    employeeId: 'nv01',
    reason: 'Việc nhà',
    leaveType: 'ANNUAL',
    startDate,
    endDate
  });
  const overtime = (otDate: string, startTime = '18:00', endTime = '20:00') => ({
    employeeId: 'nv01',
    reason: 'Chạy dự án',
    otDate,
    startTime,
    endTime
  });

  it('self dates stay inside the window', async () => {
    await assert.rejects(ctx.service.createLeaveRequest(leave('2026-11-03'), SELF), { message: WINDOW_MESSAGE });
    await assert.rejects(ctx.service.createOvertimeRequest(overtime('2027-01-04'), SELF), { message: WINDOW_MESSAGE });
    await assert.rejects(
      ctx.service.createShiftChangeRequest(
        {
          employeeId: 'nv01',
          reason: 'Đổi ca',
          startDate: '2026-12-30',
          endDate: '2027-01-02',
          shiftType: 'NORMAL',
          startTime: '08:00'
        },
        SELF
      ),
      { message: WINDOW_MESSAGE }
    );
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('self makeup dates and slots stay inside the window', async () => {
    const body = (slotDate: string) => ({
      employeeId: 'nv01',
      reason: 'Việc nhà',
      startDate: '2026-11-13',
      endDate: '2026-11-13',
      slots: [{ date: slotDate, startTime: '18:00', endTime: '22:00' }]
    });
    await assert.rejects(ctx.service.createLeaveWithMakeupRequest(body('2027-01-04'), SELF), { message: WINDOW_MESSAGE });
  });

  it('preview runs the same self checks', async () => {
    const preview = await ctx.service.previewRequest('leave', leave('2026-11-03'), SELF);
    assert.deepEqual(preview, { ok: false, message: WINDOW_MESSAGE });
  });

  it('admin keeps past dates', async () => {
    const dto = await ctx.service.createLeaveRequest(leave('2026-11-02'));
    assert.equal(dto.leaveStartDate, '2026-11-02');
  });

  it('today is allowed', async () => {
    const dto = await ctx.service.createOvertimeRequest(overtime('2026-11-04'), SELF);
    assert.equal(dto.otDate, '2026-11-04');
  });

  it('self closed month', async () => {
    ctx.periods.statuses.set('2026-11', 'calculated');
    await assert.rejects(ctx.service.createOvertimeRequest(overtime('2026-11-12'), SELF), {
      message: 'Tháng 11 đã chốt công'
    });
    ctx.periods.statuses.set('2026-12', 'attendance_locked');
    await assert.rejects(ctx.service.createLeaveRequest(leave('2026-12-01'), SELF), {
      message: 'Tháng 12 đã chốt công'
    });
  });

  it('open period does not block, admin ignores closed months', async () => {
    ctx.periods.statuses.set('2026-11', 'open');
    await ctx.service.createOvertimeRequest(overtime('2026-11-12'), SELF);
    ctx.periods.statuses.set('2026-12', 'calculated');
    const dto = await ctx.service.createLeaveRequest(leave('2026-12-01'));
    assert.equal(dto.leaveStartDate, '2026-12-01');
  });

  it('self whole hours', async () => {
    await assert.rejects(ctx.service.createOvertimeRequest(overtime('2026-11-12', '18:30', '20:00'), SELF), {
      message: 'Chỉ chọn giờ tròn'
    });
    // Giờ tròn được kiểm trước windowError: khung bù lệch giờ không lộ lỗi khác.
    await assert.rejects(
      ctx.service.createLeaveWithMakeupRequest(
        {
          employeeId: 'nv01',
          reason: 'Việc nhà',
          startDate: '2026-11-13',
          endDate: '2026-11-13',
          slots: [{ date: '2026-11-18', startTime: '18:30', endTime: '21:30' }]
        },
        SELF
      ),
      { message: 'Chỉ chọn giờ tròn' }
    );
    const dto = await ctx.service.createOvertimeRequest(overtime('2026-11-12', '18:30', '20:00'));
    assert.equal(dto.otHours, 1.5);
  });
});
