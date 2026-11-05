import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { DayConflictError, LEAVE_TYPES, SystemRequest } from '../../src/modules/requests/domain';
import {
  NV_UUID,
  TTS_UUID,
  leaveRequest,
  lwmRequest,
  makeService,
  otRequest,
  seed,
  staffContext
} from './helpers/requests-fakes';

describe('Đơn nghỉ (§6.1)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const leave = (over: Record<string, unknown> = {}) =>
    ctx.service.createLeaveRequest({
      employeeId: 'nv01',
      title: 'Nghỉ',
      reason: 'Việc nhà',
      leaveType: 'ANNUAL',
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      ...over
    } as any);

  it('old PAID code is refused', async () => {
    await assert.rejects(leave({ leaveType: 'PAID' }), /Loại nghỉ không hợp lệ: PAID/);
    await assert.rejects(leave({ leaveType: undefined }), /Loại nghỉ không hợp lệ: undefined/);
    assert.throws(
      () =>
        SystemRequest.createLeaveRequest({
          employeeId: NV_UUID, title: 't', reason: 'r', leaveType: 'PAID' as any,
          startDate: '2026-11-12', endDate: '2026-11-12', daysCount: 1
        }),
      /Loại nghỉ không hợp lệ: PAID/
    );
  });

  it('dates are checked with the domain messages before the staff lookup', async () => {
    await assert.rejects(leave({ startDate: '2026-11-31' }), /startDate must be a valid YYYY-MM-DD date string, got: 2026-11-31/);
    await assert.rejects(leave({ endDate: 20261112 }), /endDate must be a valid YYYY-MM-DD date string, got: 20261112/);
    await assert.rejects(leave({ startDate: '2026-11-13', endDate: '2026-11-12' }), /endDate \(2026-11-12\) cannot be earlier than startDate \(2026-11-13\)/);
    assert.deepEqual(ctx.repo.staffMonths, []);
  });

  it('unknown staff and an unconfigured staff type are refused', async () => {
    await assert.rejects(leave({ employeeId: 'ghost' }), /Không tìm thấy nhân sự: ghost/);
    ctx.repo.putStaff('nv01', staffContext({ regularDows: null }));
    await assert.rejects(leave(), /Thiếu cấu hình loại nhân sự nv/);
  });

  it('server counts working days and ignores daysCount', async () => {
    assert.equal((await leave({ startDate: '2026-11-13', endDate: '2026-11-16', daysCount: 9 })).leaveDaysCount, 3);
    assert.equal(
      (await leave({ employeeId: 'tts01', leaveType: 'UNPAID', startDate: '2026-11-13', endDate: '2026-11-16' })).leaveDaysCount,
      2
    );
    assert.deepEqual(ctx.repo.staffMonths, ['2026-11', '2026-11']);
  });

  it('a holiday inside the range is not counted', async () => {
    ctx.holidays.dates = [{ date: '2026-09-02', name: 'Quốc khánh' }];
    const dto = await leave({ leaveType: 'PERSONAL_PAID', startDate: '2026-09-01', endDate: '2026-09-03' });
    assert.deepEqual([dto.leaveType, dto.leaveStartDate, dto.leaveEndDate, dto.leaveDaysCount], ['PERSONAL_PAID', '2026-09-01', '2026-09-03', 2]);
  });

  it('a range with only Sunday or holidays is refused', async () => {
    await assert.rejects(leave({ startDate: '2026-11-15', endDate: '2026-11-15' }), /Khoảng nghỉ không có ngày làm việc/);
    ctx.holidays.dates = [{ date: '2026-09-02', name: 'Quốc khánh' }];
    await assert.rejects(leave({ startDate: '2026-09-02', endDate: '2026-09-02' }), /Khoảng nghỉ không có ngày làm việc/);
    await assert.rejects(leave({ employeeId: 'tts01', leaveType: 'UNPAID', startDate: '2026-11-14', endDate: '2026-11-15' }), /Khoảng nghỉ không có ngày làm việc/);
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('overlap with a pending leave is refused; a rejected one does not block', async () => {
    await seed(ctx, leaveRequest('2026-11-12', '2026-11-12', 'PENDING'));
    await assert.rejects(leave({ startDate: '2026-11-11', endDate: '2026-11-13' }), /Đã có đơn nghỉ trùng ngày \(12\/11 – 12\/11\)/);

    await seed(ctx, lwmRequest('2026-11-17', '2026-11-18', [{ date: '2026-11-20', startTime: '18:00', endTime: '22:00' }], 'APPROVED'));
    await assert.rejects(leave({ startDate: '2026-11-18', endDate: '2026-11-19' }), /Đã có đơn nghỉ trùng ngày \(17\/11 – 18\/11\)/);

    await ctx.repo.save(leaveRequest('2026-11-23', '2026-11-23', 'REJECTED'));
    await seed(ctx, leaveRequest('2026-11-24', '2026-11-24', 'PENDING', { employeeId: TTS_UUID }));
    const dto = await leave({ startDate: '2026-11-23', endDate: '2026-11-24' });
    assert.equal(dto.leaveDaysCount, 2);
  });

  it('leave on a day with an OT or makeup window is refused', async () => {
    await ctx.repo.save(otRequest('2026-11-12', '18:00', '22:00', 'APPROVED'));
    await assert.rejects(leave(), /Ngày 12\/11 đã có khung OT hoặc làm bù/);

    await ctx.repo.save(lwmRequest('2026-11-03', '2026-11-03', [{ date: '2026-11-19', startTime: '06:00', endTime: '07:00' }]));
    await assert.rejects(leave({ startDate: '2026-11-19', endDate: '2026-11-19' }), /Ngày 19\/11 đã có khung OT hoặc làm bù/);

    // Ngày nghỉ tính theo ngày lịch: khung OT ngày CN trong khoảng cũng chặn.
    await ctx.repo.save(otRequest('2026-11-29', '08:00', '12:00', 'PENDING'));
    await assert.rejects(leave({ startDate: '2026-11-27', endDate: '2026-11-30' }), /Ngày 29\/11 đã có khung OT hoặc làm bù/);

    await ctx.repo.save(otRequest('2026-11-13', '18:00', '22:00', 'REJECTED'));
    assert.equal((await leave({ startDate: '2026-11-13', endDate: '2026-11-13' })).status, 'PENDING');
  });

  it('annual leave balance', async () => {
    ctx.repo.putStaff('nv01', staffContext({ leaveBalance: 2 }));
    await assert.rejects(leave({ startDate: '2026-11-13', endDate: '2026-11-16' }), /Phép năm còn 2 ngày, xin 3 ngày/);

    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ leaveBalance: 3 }));
    await seed(ctx, leaveRequest('2026-11-20', '2026-11-20', 'PENDING', { leaveDaysCount: 1 }));
    await seed(ctx, leaveRequest('2026-11-25', '2026-11-27', 'PENDING', { leaveType: 'PERSONAL_PAID', leaveDaysCount: 3 }));
    await assert.rejects(leave({ startDate: '2026-11-13', endDate: '2026-11-16' }), /Phép năm còn 2 ngày, xin 3 ngày/);

    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ leaveBalance: 3, leaveBalanceOn: '2026-11-01' }));
    await seed(ctx, leaveRequest('2026-10-05', '2026-10-09', 'APPROVED', { leaveDaysCount: 5 }));
    assert.equal((await leave({ startDate: '2026-11-13', endDate: '2026-11-16' })).leaveDaysCount, 3);

    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ leaveBalance: 2.5 }));
    await assert.rejects(leave({ startDate: '2026-11-13', endDate: '2026-11-16' }), /Phép năm còn 2,5 ngày, xin 3 ngày/);
    assert.equal((await leave({ leaveType: 'UNPAID', startDate: '2026-11-13', endDate: '2026-11-16' })).leaveDaysCount, 3);
  });

  it('tts has no annual leave', async () =>
    assert.rejects(leave({ employeeId: 'tts01', leaveType: 'ANNUAL' }), /Loại nhân sự này không có Phép năm/));

  it('approval marks only working days; rejection writes nothing', async () => {
    const approved = await leave({ startDate: '2026-11-13', endDate: '2026-11-16' });
    await ctx.service.reviewRequest(approved.id, 'admin', 'APPROVE');
    assert.deepEqual([...ctx.att.schedules.keys()].sort(), [
      `${NV_UUID}:2026-11-13`,
      `${NV_UUID}:2026-11-14`,
      `${NV_UUID}:2026-11-16`
    ]);
    for (const s of ctx.att.schedules.values()) {
      assert.deepEqual([s.status, s.sourceRequestId], ['ON_LEAVE', approved.id]);
    }

    const rejected = await leave({ startDate: '2026-11-23', endDate: '2026-11-23' });
    await ctx.service.reviewRequest(rejected.id, 'admin', 'REJECT');
    assert.equal(ctx.att.schedules.has(`${NV_UUID}:2026-11-23`), false);
  });

  // Luật người dùng chốt 2026-11-05: ngày lễ thắng đơn nghỉ. Ngày đơn giữ mà thành ngày lễ trước lúc duyệt rời khỏi đơn
  // (như lúc nộp đã bỏ ngày lễ), đơn giảm số ngày và ngày đó không ghi ON_LEAVE.
  it('approval drops a held day made a holiday after filing and counts one day less', async () => {
    const dto = await leave({ leaveType: 'WELFARE', startDate: '2026-09-01', endDate: '2026-09-03' });
    ctx.holidays.dates = [{ date: '2026-09-02', name: 'Quốc khánh' }];
    const reviewed = await ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
    assert.equal(reviewed.leaveDaysCount, 2);
    assert.deepEqual([...ctx.att.schedules.keys()].sort(), [`${NV_UUID}:2026-09-01`, `${NV_UUID}:2026-09-03`]);
    assert.deepEqual([...ctx.days.rows.keys()].sort(), [`${NV_UUID}:2026-09-01`, `${NV_UUID}:2026-09-03`]);
  });

  it('a leave whose held days all became holidays cannot be approved', async () => {
    const dto = await leave({ startDate: '2026-11-18', endDate: '2026-11-18' });
    ctx.holidays.dates = [{ date: '2026-11-18', name: 'Lễ' }];
    await assert.rejects(
      ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE'),
      (err: unknown) =>
        err instanceof DayConflictError &&
        err.message === 'Các ngày nghỉ của đơn đều đã thành ngày lễ. Chỉ có thể từ chối đơn này.'
    );
    assert.equal((await ctx.service.getById(dto.id))?.status, 'PENDING');
    assert.equal(ctx.att.schedules.size, 0);
    assert.deepEqual([...ctx.days.rows.keys()], [`${NV_UUID}:2026-11-18`]);
  });

  it('a leave with makeup that has a held day made a holiday cannot be approved', async () => {
    const dto = await ctx.service.createLeaveWithMakeupRequest({
      employeeId: 'nv01',
      title: 'Nghỉ bù',
      reason: 'Việc nhà',
      startDate: '2026-11-17',
      endDate: '2026-11-18',
      slots: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(date => ({ date, startTime: '18:00', endTime: '22:00' }))
    } as any);
    ctx.holidays.dates = [{ date: '2026-11-18', name: 'Lễ' }];
    await assert.rejects(
      ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE'),
      (err: unknown) =>
        err instanceof DayConflictError &&
        err.message === 'Ngày 18/11 đã thành ngày lễ, đơn nghỉ có làm bù cần nộp lại. Chỉ có thể từ chối đơn này.'
    );
    assert.equal((await ctx.service.getById(dto.id))?.status, 'PENDING');
    assert.equal(ctx.att.schedules.size, 0);
  });

  it('filed under the employee lock and stored under the uuid', async () => {
    const dto = await leave();
    assert.equal(dto.employeeId, NV_UUID);
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
  });

  it('controller lists leave types', () =>
    assert.deepEqual(new RequestsController(ctx.service).listLeaveTypes(), { leaveTypes: LEAVE_TYPES }));
});
