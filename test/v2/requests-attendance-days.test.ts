import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { requestDates } from '../../src/modules/requests/domain';
import {
  LOCK_TRX,
  NV_UUID,
  explanationRequest,
  isatRequest,
  leaveRequest,
  lwmRequest,
  makeService,
  otRequest,
  seed,
  shiftChange,
  staffContext,
  timesheet
} from './helpers/requests-fakes';

describe('requestDates: các ngày một đơn làm đổi dòng ngày công', () => {
  it('LEAVE: cả khoảng nghỉ', () => {
    assert.deepEqual(requestDates(leaveRequest('2026-11-10', '2026-11-12')), ['2026-11-10', '2026-11-11', '2026-11-12']);
  });

  it('LEAVE_WITH_MAKEUP: khoảng nghỉ cộng ngày của khung bù, không trùng và tăng dần', () => {
    const req = lwmRequest('2026-11-10', '2026-11-11', [
      { date: '2026-11-16', startTime: '18:00', endTime: '22:00' },
      { date: '2026-11-11', startTime: '18:00', endTime: '20:00' },
      { date: '2026-11-12', startTime: '18:00', endTime: '22:00' },
      { date: '2026-11-12', startTime: '07:00', endTime: '08:00' }
    ]);
    assert.deepEqual(requestDates(req), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-16']);
  });

  it('SHIFT_CHANGE: cả khoảng đổi ca', () => {
    assert.deepEqual(requestDates(shiftChange('2026-11-10', '2026-11-11', 'NIGHT', '22:00', '07:00')), [
      '2026-11-10',
      '2026-11-11'
    ]);
  });

  it('OVERTIME: ngày OT', () => {
    assert.deepEqual(requestDates(otRequest('2026-11-15', '08:00', '12:00')), ['2026-11-15']);
  });

  it('ISAT: Thứ Bảy đăng ký', () => {
    assert.deepEqual(requestDates(isatRequest('2026-11-14')), ['2026-11-14']);
  });

  it('EXPLANATION: ngày giải trình', () => {
    assert.deepEqual(requestDates(explanationRequest('2026-11-03')), ['2026-11-03']);
  });
});

describe('Đơn từ gọi AttendanceDaysService.refreshDays sau khi lưu (T2)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02' }));
    ctx.att.timesheets.push(timesheet('2026-11-03', '08:40', '17:05'));
  });

  it('nộp giải trình ngày 03/11 ghi lại đúng ngày đó trên giao dịch của khoá', async () => {
    await ctx.service.createExplanationRequest({
      employeeId: 'nv01',
      reason: 'Kẹt xe',
      workDate: '2026-11-03'
    } as any);
    assert.deepEqual(ctx.attendanceDays.calls, [{ employeeId: NV_UUID, dates: ['2026-11-03'], trx: LOCK_TRX }]);
    assert.equal(ctx.repo.calls.filter(([name]) => name === 'save').length, 1);
  });

  it('nộp đơn nghỉ ghi lại các ngày của khoảng nghỉ', async () => {
    await ctx.service.createLeaveRequest({
      employeeId: 'nv01',
      title: 'Nghỉ',
      reason: 'Việc nhà',
      leaveType: 'ANNUAL',
      startDate: '2026-11-10',
      endDate: '2026-11-11'
    });
    assert.deepEqual(ctx.attendanceDays.calls, [
      { employeeId: NV_UUID, dates: ['2026-11-10', '2026-11-11'], trx: LOCK_TRX }
    ]);
  });

  it('nộp iSAT ghi lại Thứ Bảy đăng ký', async () => {
    await ctx.service.createIsatRequest({
      employeeId: 'nv01',
      saturday: '2026-11-14',
      team: 'Nhóm thử',
      conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
    });
    assert.deepEqual(ctx.attendanceDays.calls, [{ employeeId: NV_UUID, dates: ['2026-11-14'], trx: LOCK_TRX }]);
  });

  it('duyệt đơn nghỉ 10–11/11 gọi một lần với đúng hai ngày, sau khi lưu', async () => {
    const req = await seed(ctx, leaveRequest('2026-11-10', '2026-11-11'));
    ctx.repo.calls.length = 0;

    await ctx.service.reviewRequest(req.id, 'admin', 'APPROVE');

    assert.deepEqual(ctx.attendanceDays.calls, [
      { employeeId: NV_UUID, dates: ['2026-11-10', '2026-11-11'], trx: LOCK_TRX }
    ]);
    assert.deepEqual(ctx.repo.calls.at(-1), ['save', LOCK_TRX]);
  });

  it('từ chối cũng gọi', async () => {
    const req = await seed(ctx, leaveRequest('2026-11-10', '2026-11-11'));
    await ctx.service.reviewRequest(req.id, 'admin', 'REJECT', 'Không đủ người');
    assert.deepEqual(ctx.attendanceDays.calls, [
      { employeeId: NV_UUID, dates: ['2026-11-10', '2026-11-11'], trx: LOCK_TRX }
    ]);
  });

  it('huỷ cũng gọi', async () => {
    const req = await seed(ctx, leaveRequest('2026-11-10', '2026-11-11'));
    await ctx.service.cancelRequest(req.id, NV_UUID, 'Đổi kế hoạch');
    assert.deepEqual(ctx.attendanceDays.calls, [
      { employeeId: NV_UUID, dates: ['2026-11-10', '2026-11-11'], trx: LOCK_TRX }
    ]);
  });

  it('đơn tạm ứng không gọi', async () => {
    await ctx.service.createAdvanceRequest({ employeeId: 'nv01' } as any);
    assert.deepEqual(ctx.attendanceDays.calls, []);
  });

  it('duyệt giải trình ghi lại dòng ngày thay vì đánh dấu ngày VALID', async () => {
    const req = await seed(ctx, explanationRequest('2026-11-03'));
    await ctx.service.reviewRequest(req.id, 'admin', 'APPROVE');
    assert.deepEqual(ctx.attendanceDays.calls, [{ employeeId: NV_UUID, dates: ['2026-11-03'], trx: LOCK_TRX }]);
    assert.equal('updateDayStatus' in ctx.att, false);
  });

  it('duyệt lỗi (ném trước khi lưu) thì không gọi', async () => {
    await assert.rejects(ctx.service.reviewRequest('khong-co', 'admin', 'APPROVE'), /not found/);
    assert.deepEqual(ctx.attendanceDays.calls, []);
  });
});
