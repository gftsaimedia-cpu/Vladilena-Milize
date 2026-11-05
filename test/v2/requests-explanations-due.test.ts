import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { DailyTimesheet } from '../../src/modules/attendance/domain';
import {
  ADMIN_UUID,
  NV_UUID,
  explanationRequest,
  isatRequest,
  leaveRequest,
  makeService,
  otRequest,
  seed,
  staffContext,
  timesheet
} from './helpers/requests-fakes';

// Hôm nay 04/11/2026 (Thứ Tư). nv01 vào làm 02/11, làm T2–T7 ca 08–17.
// 02/11: vào 08:00, không có giờ ra → thiếu giờ ra. 03/11: vào 08:40, ra 17:05 → vào muộn. 04/11: chưa chấm.
describe('Ngày cần giải trình (spec 3.1–3.2)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02' }));
    ctx.att.timesheets.push(timesheet('2026-11-03', '08:40', '17:05'), timesheet('2026-11-02', '08:00', null));
  });

  const DUE_03 = { date: '2026-11-03', cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false }, remindedAt: null };
  const DUE_02 = { date: '2026-11-02', cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, remindedAt: null };
  const dueDates = async () => (await ctx.explanations.dueDays('nv01')).map(d => d.date);

  it('due days come from punches, newest first', async () => {
    assert.deepEqual(await ctx.explanations.dueDays('nv01'), [DUE_03, DUE_02]);
    // Tra theo uuid cũng như theo username.
    assert.deepEqual(await ctx.explanations.dueDays(NV_UUID), [DUE_03, DUE_02]);
  });

  it('explained days drop out, cancelled ones come back', async () => {
    const req = await seed(ctx, explanationRequest('2026-11-03', ['LATE_CHECK_IN'], 'REJECTED'));
    assert.deepEqual(await dueDates(), ['2026-11-02']);
    for (const status of ['PENDING', 'APPROVED'] as const) {
      req.status = status;
      await ctx.repo.save(req);
      assert.deepEqual(await dueDates(), ['2026-11-02'], status);
    }
    req.status = 'CANCELLED';
    await ctx.repo.save(req);
    assert.deepEqual(await dueDates(), ['2026-11-03', '2026-11-02']);
  });

  it('holiday, leave and closed months are skipped', async () => {
    ctx.holidays.dates.push({ date: '2026-11-02', name: 'Lễ thử' });
    assert.deepEqual(await dueDates(), ['2026-11-03']);
    ctx.holidays.dates.length = 0;

    await seed(ctx, leaveRequest('2026-11-03', '2026-11-03', 'APPROVED'));
    assert.deepEqual(await dueDates(), ['2026-11-02']);

    ctx.periods.statuses.set('2026-11', 'attendance_locked');
    assert.deepEqual(await ctx.explanations.dueDays('nv01'), []);
  });

  it('range starts the first day of last month', async () => {
    ctx.repo.putStaff('nv01', staffContext());
    ctx.att.timesheets.length = 0;
    const due = await ctx.explanations.dueDays('nv01');
    // T2–T7 từ 01/10 tới 03/11 (hôm nay chưa chấm thì chưa thiếu): 27 ngày tháng 10, 02 và 03/11.
    assert.equal(due.length, 29);
    assert.equal(due[0].date, '2026-11-03');
    assert.deepEqual(due.at(-1), {
      date: '2026-10-01',
      cases: ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT'],
      needs: { checkIn: true, checkOut: true },
      remindedAt: null
    });
    assert.equal(due.some(d => d.date === '2026-10-04'), false); // Chủ nhật

    // Tháng trước đã chốt: chỉ còn tháng này.
    ctx.periods.statuses.set('2026-10', 'calculated');
    assert.deepEqual((await ctx.explanations.dueDays('nv01')).map(d => d.date), ['2026-11-03', '2026-11-02']);
  });

  it('iSAT Saturdays are not workdays', async () => {
    ctx.repo.putStaff('nv01', staffContext());
    await seed(ctx, isatRequest('2026-10-31', 'APPROVED'));
    await seed(ctx, isatRequest('2026-10-24', 'PENDING'));
    const dates = await dueDates();
    assert.equal(dates.includes('2026-10-31'), false);
    assert.equal(dates.includes('2026-10-24'), false);
    assert.equal(dates.includes('2026-10-17'), true);
  });

  it('pending or approved OT hides a late check-out (R-P2)', async () => {
    ctx.att.timesheets = [timesheet('2026-11-03', '08:00', '18:00')];
    assert.deepEqual((await ctx.explanations.dueDays('nv01'))[0], {
      date: '2026-11-03',
      cases: ['FORGOT_CHECK_OUT'],
      needs: { checkIn: false, checkOut: false },
      remindedAt: null
    });
    const ot = await seed(ctx, otRequest('2026-11-03', '17:00', '18:00', 'PENDING'));
    assert.deepEqual(await dueDates(), ['2026-11-02']);
    ot.status = 'APPROVED';
    await ctx.repo.save(ot);
    assert.deepEqual(await dueDates(), ['2026-11-02']);
    ot.status = 'REJECTED';
    await ctx.repo.save(ot);
    assert.deepEqual(await dueDates(), ['2026-11-03', '2026-11-02']);
  });

  it('a night shift reads the check-out of the next morning', async () => {
    ctx.repo.schedules.push({ date: '2026-11-03', startTime: '22:00', endTime: '07:00', onLeave: false });
    ctx.att.timesheets = [
      DailyTimesheet.create({
        employeeId: NV_UUID,
        workDate: '2026-11-03',
        shiftType: 'NIGHT',
        shiftStartTime: '22:00',
        shiftEndTime: '07:00',
        actualCheckIn: new Date('2026-11-03T22:00:00+07:00'),
        actualCheckOut: new Date('2026-11-04T07:05:00+07:00')
      }),
      timesheet('2026-11-02', '08:00', null)
    ];
    assert.deepEqual(await dueDates(), ['2026-11-02']);
  });

  it('shift times with seconds are read as HH:MM', async () => {
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02', defaultShift: { startTime: '08:00:00', endTime: '17:00:00' } }));
    assert.deepEqual(await ctx.explanations.dueDays('nv01'), [DUE_03, DUE_02]);
  });

  it('a reminder shows on its day', async () => {
    await ctx.reminders.upsert({
      employeeId: NV_UUID,
      date: '2026-11-02',
      remindedBy: ADMIN_UUID,
      remindedAt: new Date('2026-11-04T02:40:00Z')
    });
    assert.deepEqual(await ctx.explanations.dueDays('nv01'), [DUE_03, { ...DUE_02, remindedAt: '2026-11-04T02:40:00.000Z' }]);
  });

  it('an unknown person is refused', async () => {
    await assert.rejects(ctx.explanations.dueDays('khong-co'), { message: 'Không tìm thấy nhân sự: khong-co' });
  });

  describe('checkDay', () => {
    const message = async (date: string) => {
      const check = await ctx.explanations.checkDay('nv01', date);
      return check.ok ? null : check.message;
    };

    it('check messages', async () => {
      assert.equal(await message('2026-11-05'), 'Không giải trình cho ngày trong tương lai');

      ctx.att.timesheets.push(timesheet('2026-11-04', '08:00', null));
      assert.equal(await message('2026-11-04'), 'Ngày 04/11 không có gì cần giải trình');

      // Trước ngày vào làm thì không phải ngày làm, dù Thứ Bảy 31/10 là ngày làm của nv.
      assert.equal(await message('2026-10-31'), 'Ngày 31/10 không phải ngày làm');

      await seed(ctx, explanationRequest('2026-11-03', ['LATE_CHECK_IN'], 'PENDING'));
      assert.equal(await message('2026-11-03'), 'Ngày 03/11 đã có đơn giải trình');

      ctx.periods.statuses.set('2026-11', 'attendance_locked');
      assert.equal(await message('2026-11-02'), 'Tháng 11 đã chốt công');

      ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-01' }));
      ctx.periods.statuses.clear();
      assert.equal(await message('2026-11-01'), 'Ngày 01/11 không phải ngày làm');
    });

    it('a due day returns its cases and needs', async () => {
      assert.deepEqual(await ctx.explanations.checkDay('nv01', '2026-11-02'), {
        ok: true,
        cases: ['MISSING_CHECK_OUT'],
        needs: { checkIn: false, checkOut: true }
      });
    });

    it('checks run in order: future, closed month, not a workday, explained, no case (R-P4)', async () => {
      ctx.periods.statuses.set('2026-11', 'attendance_locked');
      assert.equal(await message('2026-11-05'), 'Không giải trình cho ngày trong tương lai');
      assert.equal(await message('2026-11-01'), 'Tháng 11 đã chốt công');
      ctx.periods.statuses.clear();

      ctx.holidays.dates.push({ date: '2026-11-03', name: 'Lễ thử' });
      await seed(ctx, explanationRequest('2026-11-03', ['LATE_CHECK_IN'], 'APPROVED'));
      assert.equal(await message('2026-11-03'), 'Ngày 03/11 không phải ngày làm');

      await seed(ctx, explanationRequest('2026-11-04', ['LATE_CHECK_IN'], 'APPROVED'));
      assert.equal(await message('2026-11-04'), 'Ngày 04/11 đã có đơn giải trình');
    });

    it('leave days and iSAT days are not workdays', async () => {
      await seed(ctx, leaveRequest('2026-11-03', '2026-11-03', 'PENDING'));
      assert.equal(await message('2026-11-03'), 'Ngày 03/11 không phải ngày làm');

      ctx.repo.putStaff('nv01', staffContext());
      await seed(ctx, isatRequest('2026-10-31', 'APPROVED'));
      assert.equal(await message('2026-10-31'), 'Ngày 31/10 không phải ngày làm');
    });

    it('a type config is needed once the day is not in the future', async () => {
      ctx.repo.putStaff('nv01', staffContext({ regularDows: null }));
      assert.equal(await message('2026-11-05'), 'Không giải trình cho ngày trong tương lai');
      await assert.rejects(ctx.explanations.checkDay('nv01', '2026-11-03'), { message: 'Thiếu cấu hình loại nhân sự nv' });
    });
  });

  describe('dayView', () => {
    it('shows the due cases until an explanation is sent', async () => {
      assert.deepEqual(await ctx.explanations.dayView('nv01', '2026-11-02'), {
        explanation: null,
        due: { cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, remindedAt: null }
      });

      const dto = await ctx.service.createExplanationRequest({
        employeeId: 'nv01',
        reason: 'Quên quẹt thẻ',
        workDate: '2026-11-02',
        cases: [],
        actualCheckOut: '17:30'
      });
      const view = await ctx.explanations.dayView('nv01', '2026-11-02');
      assert.equal(view.due, null);
      assert.equal(view.explanation?.status, 'PENDING');
      assert.deepEqual(view.explanation, {
        id: dto.id,
        status: 'PENDING',
        sentAt: ctx.repo.requests.get(dto.id)!.createdAt.toISOString(),
        cases: ['MISSING_CHECK_OUT'],
        actualCheckIn: null,
        actualCheckOut: '17:30'
      });
    });

    it('a cancelled explanation is not shown and the day is due again, with its reminder', async () => {
      await ctx.reminders.upsert({
        employeeId: NV_UUID,
        date: '2026-11-03',
        remindedBy: ADMIN_UUID,
        remindedAt: new Date('2026-11-04T03:10:00Z')
      });
      await seed(ctx, explanationRequest('2026-11-03', ['LATE_CHECK_IN'], 'CANCELLED'));
      assert.deepEqual(await ctx.explanations.dayView('nv01', '2026-11-03'), {
        explanation: null,
        due: { cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false }, remindedAt: '2026-11-04T03:10:00.000Z' }
      });
    });

    it('a day that is not due has no due part', async () => {
      assert.deepEqual(await ctx.explanations.dayView('nv01', '2026-11-01'), { explanation: null, due: null });
      assert.deepEqual(await ctx.explanations.dayView('nv01', '2026-11-05'), { explanation: null, due: null });
    });
  });
});
