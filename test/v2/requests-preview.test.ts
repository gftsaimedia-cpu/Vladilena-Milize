import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { DayConflictError } from '../../src/modules/requests/domain';
import { isatRequest, leaveRequest, makeService, otRequest, seed } from './helpers/requests-fakes';

describe('Xem trước đơn và tiêu đề do server đặt (spec 2.2, 2.4)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const leaveBody = (over: Record<string, unknown> = {}) => ({
    employeeId: 'nv01',
    title: 'Nghỉ',
    reason: 'Việc nhà',
    leaveType: 'ANNUAL',
    startDate: '2026-11-13',
    endDate: '2026-11-16',
    ...over
  });

  it('preview equals create without saving', async () => {
    const preview = await ctx.service.previewRequest('leave', leaveBody());
    assert.deepEqual(preview, {
      ok: true,
      title: 'Phép năm 13–16/11',
      summary: { dates: ['2026-11-13', '2026-11-14', '2026-11-16'], daysCount: 3, annualLeaveLeftAfter: 9 },
      warnings: []
    });
    assert.equal(ctx.repo.requests.size, 0);
    assert.equal(ctx.days.rows.size, 0);

    const dto = await ctx.service.createLeaveRequest(leaveBody() as any);
    assert.equal(dto.title, 'Phép năm 13–16/11');
    assert.equal(dto.leaveDaysCount, 3);
  });

  it('client title is ignored', async () => {
    const dto = await ctx.service.createOvertimeRequest({
      employeeId: 'nv01',
      title: 'X',
      reason: 'Gấp tiến độ',
      otDate: '2026-11-12',
      startTime: '18:00',
      endTime: '20:00'
    });
    assert.equal(dto.title, 'Làm thêm 12/11 18–20h');
  });

  it('preview returns the create error', async () => {
    const preview = await ctx.service.previewRequest('overtime', {
      employeeId: 'tts01',
      reason: 'Gấp tiến độ',
      otDate: '2026-11-12',
      startTime: '18:00',
      endTime: '20:00'
    });
    assert.deepEqual(preview, { ok: false, message: 'Loại nhân sự này không có OT' });
  });

  it('makeup short of hours', async () => {
    const preview = await ctx.service.previewRequest('leave-with-makeup', {
      employeeId: 'nv01',
      reason: 'Việc nhà',
      startDate: '2026-11-13',
      endDate: '2026-11-13',
      slots: [{ date: '2026-11-16', startTime: '18:00', endTime: '22:00' }]
    });
    assert.deepEqual(preview, { ok: false, message: 'Còn thiếu 4 giờ bù' });
  });

  it('stale preview then conflict', async () => {
    const body = leaveBody({ startDate: '2026-11-14', endDate: '2026-11-14' });
    const first = await ctx.service.previewRequest('leave', body);
    assert.equal(first.ok, true);

    await seed(ctx, isatRequest('2026-11-14', 'PENDING'));
    await assert.rejects(ctx.service.createLeaveRequest(body as any), (err: unknown) => err instanceof DayConflictError);

    const again = await ctx.service.previewRequest('leave', body);
    assert.equal(again.ok, false);
    if (again.ok) return;
    assert.equal(again.code, 'DAY_CONFLICT');
    assert.match(again.message, /đang có đơn iSAT chờ duyệt/);
  });

  it('summary per kind', async () => {
    await seed(ctx, otRequest('2026-11-10', '18:00', '20:00'));
    await seed(ctx, leaveRequest('2026-11-18', '2026-11-18'));
    const requestsBefore = ctx.repo.requests.size;
    const rowsBefore = ctx.days.rows.size;
    const base = { employeeId: 'nv01', reason: 'r' };

    assert.deepEqual(await ctx.service.previewRequest('leave', { ...base, leaveType: 'PERSONAL_PAID', startDate: '2026-11-12', endDate: '2026-11-12' }), {
      ok: true,
      title: 'Việc riêng có lương 12/11',
      summary: { dates: ['2026-11-12'], daysCount: 1, annualLeaveLeftAfter: null },
      warnings: []
    });
    const ttsLeave = await ctx.service.previewRequest('leave', { ...base, employeeId: 'tts01', leaveType: 'UNPAID', startDate: '2026-11-12', endDate: '2026-11-12' });
    assert.deepEqual(ttsLeave.ok && ttsLeave.summary, { dates: ['2026-11-12'], daysCount: 1, annualLeaveLeftAfter: null });

    assert.deepEqual(await ctx.service.previewRequest('overtime', { ...base, otDate: '2026-11-12', startTime: '18:00', endTime: '20:00' }), {
      ok: true,
      title: 'Làm thêm 12/11 18–20h',
      summary: { minutes: 120, monthMinutesAfter: 240 },
      warnings: []
    });
    assert.deepEqual(await ctx.service.previewRequest('shift-change', { ...base, startDate: '2026-11-17', endDate: '2026-11-19', shiftType: 'FLEX', startTime: '06:00' }), {
      ok: true,
      title: 'Đổi ca Flex 06–15, 17–19/11',
      summary: { dates: ['2026-11-17', '2026-11-19'], keptDates: ['2026-11-18'] },
      warnings: ['Ngày 18/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.']
    });
    assert.deepEqual(await ctx.service.previewRequest('explanation', { ...base, workDate: '2026-11-03', cases: ['MISSING_CHECK_IN'] }), {
      ok: true,
      title: 'Giải trình 03/11',
      summary: { cases: ['MISSING_CHECK_IN'] },
      warnings: []
    });
    assert.deepEqual(await ctx.service.previewRequest('advance', { ...base, period: '2026-11' }), {
      ok: true,
      title: 'Tạm ứng lương tháng 11',
      summary: { month: '2026-11', amount: 2_215_385, workDays: 12 },
      warnings: []
    });
    assert.equal(ctx.repo.requests.size, requestsBefore);
    assert.equal(ctx.days.rows.size, rowsBefore);
  });

  it('makeup preview reports required and planned minutes', async () => {
    const preview = await ctx.service.previewRequest('leave-with-makeup', {
      employeeId: 'nv01',
      reason: 'Việc nhà',
      startDate: '2026-11-13',
      endDate: '2026-11-13',
      slots: [
        { date: '2026-11-16', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-17', startTime: '18:00', endTime: '22:00' }
      ]
    });
    assert.deepEqual(preview, {
      ok: true,
      title: 'Nghỉ có làm bù 13/11',
      summary: { dates: ['2026-11-13'], daysCount: 1, makeupMinutesRequired: 480, makeupMinutesPlanned: 480 },
      warnings: []
    });
  });

  it('preview rethrows errors that carry a code (database errors)', async () => {
    ctx.repo.findStaffContext = async () => {
      throw Object.assign(new Error('terminating connection'), { code: '57P01' });
    };
    await assert.rejects(ctx.service.previewRequest('leave', leaveBody()), /terminating connection/);
  });
});
