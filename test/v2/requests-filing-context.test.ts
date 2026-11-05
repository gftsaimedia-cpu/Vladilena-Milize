import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { SystemRequest } from '../../src/modules/requests/domain';
import { leaveRequest, lwmRequest, makeService, otRequest, seed, staffContext, timesheet } from './helpers/requests-fakes';

// Hôm nay 04/11/2026 (Thứ Tư). nv01 vào làm 04/11, làm T2–T7 ca 08–17.
describe('Ngữ cảnh form đơn của nhân viên (spec 2.1)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-04' }));
    ctx.repo.putStaff('tts01', staffContext({ employeeType: 'tts', startDate: '2026-11-04' }));
  });

  const kindOf = (context: Awaited<ReturnType<typeof ctx.service.requestContext>>, kind: string) =>
    context.kinds.find(k => k.kind === kind);

  it('window and days', async () => {
    const context = await ctx.service.requestContext('nv01');
    assert.equal(context.today, '2026-11-04');
    assert.deepEqual(context.window, { from: '2026-11-04', to: '2026-12-31' });
    assert.equal(context.days.length, 58);
    assert.deepEqual(context.days[0], {
      date: '2026-11-04',
      workday: true,
      shift: { start: '08:00', end: '17:00' },
      holiday: null,
      claim: null,
      hours: [
        { start: 6, ends: [{ end: 7, minutes: 60 }] },
        { start: 18, ends: [{ end: 19, minutes: 60 }, { end: 20, minutes: 120 }, { end: 21, minutes: 180 }, { end: 22, minutes: 240 }] },
        { start: 19, ends: [{ end: 20, minutes: 60 }, { end: 21, minutes: 120 }, { end: 22, minutes: 180 }] },
        { start: 20, ends: [{ end: 21, minutes: 60 }, { end: 22, minutes: 120 }] },
        { start: 21, ends: [{ end: 22, minutes: 60 }] }
      ]
    });
    const sunday = context.days.find(d => d.date === '2026-11-08')!;
    assert.equal(sunday.workday, false);
    assert.equal(sunday.shift, null);
    assert.equal(sunday.hours[0].start, 6);
    assert.deepEqual(context.shiftFrames[0], { shiftType: 'NORMAL', start: '08:00', end: '17:00' });
    assert.equal(context.shiftFrames.length, 6);
  });

  it('holiday days carry the holiday name', async () => {
    ctx.holidays.dates.push({ date: '2026-11-10', name: 'Giỗ Tổ thử' });
    const day = (await ctx.service.requestContext('nv01')).days.find(d => d.date === '2026-11-10')!;
    assert.equal(day.holiday, 'Giỗ Tổ thử');
    assert.equal(day.workday, false);
    assert.equal(day.shift, null);
  });

  it('loads the staff with the current month', async () => {
    await ctx.service.requestContext('nv01');
    assert.equal(ctx.repo.staffMonths.length > 0, true);
    assert.equal(ctx.repo.staffMonths.every(month => month === '2026-11'), true);
  });

  it('kinds follow benefits', async () => {
    const nv = await ctx.service.requestContext('nv01');
    assert.deepEqual(
      nv.kinds.map(k => k.kind),
      ['leave', 'leave-with-makeup', 'overtime', 'shift-change', 'explanation', 'advance']
    );
    assert.equal(nv.annualLeaveLeft, 12);
    assert.equal(nv.leaveTypes.some(t => t.code === 'ANNUAL'), true);
    assert.deepEqual(nv.leaveTypes[0], { code: 'ANNUAL', label: 'Phép năm' });

    const tts = await ctx.service.requestContext('tts01');
    assert.deepEqual(
      tts.kinds.map(k => k.kind),
      ['leave', 'leave-with-makeup', 'shift-change', 'explanation', 'advance']
    );
    assert.equal(tts.leaveTypes.some(t => t.code === 'ANNUAL'), false);
    assert.equal(tts.annualLeaveLeft, null);
  });

  it('annual leave left counts active annual leave and is shared with the context', async () => {
    await seed(ctx, leaveRequest('2026-11-13', '2026-11-13'));
    assert.equal(await ctx.service.annualLeaveLeft('nv01'), 11);
    assert.equal((await ctx.service.requestContext('nv01')).annualLeaveLeft, 11);
    assert.equal(await ctx.service.annualLeaveLeft('tts01'), null);
  });

  it('advance locked outside 16–17', async () => {
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'advance'), { kind: 'advance', enabled: false, reason: 'Chỉ nộp ngày 16 và 17' });
    assert.equal(context.advance, null);
    assert.deepEqual(ctx.payroll.calls, []);
  });

  it('advance open on the 16th', async () => {
    ctx.service.now = () => new Date('2026-11-16T03:00:00Z');
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'advance'), { kind: 'advance', enabled: true });
    assert.deepEqual(context.advance, {
      month: '2026-11',
      amount: 2_215_385,
      workDays: 12,
      from: '2026-11-01',
      to: '2026-11-15'
    });
  });

  it('advance locked when the month already has one', async () => {
    ctx.service.now = () => new Date('2026-11-16T03:00:00Z');
    const existing = SystemRequest.createAdvanceRequest({
      employeeId: staffContext().employeeId,
      title: 'Tạm ứng lương tháng 11',
      reason: 'Tạm ứng lương tháng 11',
      amount: 1,
      period: '2026-11'
    });
    await ctx.repo.save(existing);
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'advance'), { kind: 'advance', enabled: false, reason: 'Tháng 11 đã có đơn tạm ứng' });
    assert.equal(context.advance, null);
    assert.deepEqual(ctx.payroll.calls, []);
  });

  it('advance locked when there are no worked days yet', async () => {
    ctx.service.now = () => new Date('2026-11-16T03:00:00Z');
    ctx.payroll.quote = { amount: 0, workDays: 0, from: '2026-11-01', to: '2026-11-15' };
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'advance'), { kind: 'advance', enabled: false, reason: 'Chưa có ngày công 01–15/11' });
    assert.equal(context.advance, null);
  });

  it('advance quote failure only locks advance', async () => {
    ctx.service.now = () => new Date('2026-11-16T03:00:00Z');
    ctx.payroll.failWith = new Error('Thiếu bậc lương');
    ctx.att.timesheets.push(timesheet('2026-11-12', '08:40', '17:05'));
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'advance'), { kind: 'advance', enabled: false, reason: 'Chưa tính được số tiền tạm ứng' });
    assert.equal(context.advance, null);
    for (const kind of context.kinds.filter(k => k.kind !== 'advance')) {
      assert.equal(kind.enabled, true, kind.kind);
    }
  });

  it('explanation locked when nothing is due', async () => {
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'explanation'), {
      kind: 'explanation',
      enabled: false,
      reason: 'Không có ngày cần giải trình'
    });
    assert.deepEqual(context.explanationDays, []);
  });

  it('explanation days come from the explanations service', async () => {
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02' }));
    ctx.att.timesheets.push(timesheet('2026-11-03', '08:40', '17:05'));
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(kindOf(context, 'explanation'), { kind: 'explanation', enabled: true });
    assert.deepEqual(context.explanationDays, await ctx.explanations.dueDays('nv01'));
    assert.equal(context.explanationDays.length > 0, true);
  });

  it('months and held days', async () => {
    await seed(ctx, otRequest('2026-11-12', '18:00', '20:00', 'APPROVED'));
    await seed(ctx, leaveRequest('2026-11-13', '2026-11-13', 'PENDING'));
    const context = await ctx.service.requestContext('nv01');
    assert.deepEqual(context.months, [
      { month: '2026-11', closed: false, otMinutes: 120, otCapMinutes: 2400, hasOvertime: true, hasMakeupLeave: false },
      { month: '2026-12', closed: false, otMinutes: 0, otCapMinutes: 2400, hasOvertime: false, hasMakeupLeave: false }
    ]);
    // Tháng 11 đã có OT nhưng tháng 12 còn trống.
    assert.deepEqual(kindOf(context, 'leave-with-makeup'), { kind: 'leave-with-makeup', enabled: true });
    const day = context.days.find(d => d.date === '2026-11-13')!;
    assert.deepEqual(day.claim, { status: 'LEAVE', pending: true });
    assert.deepEqual(day.hours, []);
    // Ngày có đơn nghỉ đã duyệt: pending false.
    await seed(ctx, leaveRequest('2026-11-14', '2026-11-14', 'APPROVED'));
    const approved = (await ctx.service.requestContext('nv01')).days.find(d => d.date === '2026-11-14')!;
    assert.deepEqual(approved.claim, { status: 'LEAVE', pending: false });
  });

  it('closed month', async () => {
    ctx.periods.statuses.set('2026-11', 'attendance_locked');
    const context = await ctx.service.requestContext('nv01');
    assert.equal(context.months[0].closed, true);
    assert.equal(context.months[1].closed, false);
    for (const kind of ['leave-with-makeup', 'overtime', 'shift-change']) {
      assert.equal(kindOf(context, kind)?.enabled, true, kind);
    }
  });

  it('both months closed lock makeup, overtime and shift change', async () => {
    ctx.periods.statuses.set('2026-11', 'attendance_locked');
    ctx.periods.statuses.set('2026-12', 'paid');
    const context = await ctx.service.requestContext('nv01');
    for (const kind of ['leave-with-makeup', 'overtime', 'shift-change']) {
      assert.deepEqual(kindOf(context, kind), { kind, enabled: false, reason: 'Không còn ngày đăng ký được' }, kind);
    }
    assert.equal(kindOf(context, 'leave')?.enabled, true);
  });

  it('overtime locks when every open month has makeup leave or reached the cap', async () => {
    // Tháng 11 chạm trần 40 giờ (4 đơn x 10 giờ), tháng 12 có nghỉ có làm bù.
    for (const date of ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']) {
      await seed(ctx, otRequest(date, '06:00', '16:00', 'APPROVED', { otHours: 10 }));
    }
    await seed(
      ctx,
      lwmRequest('2026-12-01', '2026-12-01', [{ date: '2026-12-02', startTime: '18:00', endTime: '22:00' }])
    );
    const context = await ctx.service.requestContext('nv01');
    assert.equal(context.months[0].otMinutes, 2400);
    assert.equal(context.months[1].hasMakeupLeave, true);
    assert.deepEqual(kindOf(context, 'overtime'), {
      kind: 'overtime',
      enabled: false,
      reason: 'Không còn ngày đăng ký được'
    });
    // Tháng 12 chưa có OT nên nghỉ có làm bù vẫn bật.
    assert.equal(kindOf(context, 'leave-with-makeup')?.enabled, true);
  });

  it('cancelled and rejected requests do not count', async () => {
    await seed(ctx, otRequest('2026-11-12', '18:00', '20:00', 'REJECTED'));
    const context = await ctx.service.requestContext('nv01');
    assert.equal(context.months[0].otMinutes, 0);
    assert.equal(context.months[0].hasOvertime, false);
  });

  it('unknown staff is reported', async () => {
    await assert.rejects(ctx.service.requestContext('khong-co'), { message: 'Không tìm thấy nhân sự: khong-co' });
  });
});
