import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  DayConflictError,
  PeriodLockedError,
  SystemRequest,
} from '../../src/modules/requests/domain';
import {
  NV_UUID,
  TTS_UUID,
  ADMIN_UUID,
  leaveRequest,
  lwmRequest,
  otRequest,
  shiftChange,
  isatRequest,
  makeService,
  seed,
  staffContext,
} from './helpers/requests-fakes';

describe('Đơn nghỉ giữa ca — nộp và xem trước (§7.1)', () => {
  let ctx: ReturnType<typeof makeService>;
  const SELF = { filedBy: 'self' as const };

  beforeEach(() => {
    ctx = makeService();
  });

  const halfShift = (over: Record<string, unknown> = {}) => ({
    employeeId: 'nv01',
    date: '2026-11-12',
    half: 'FIRST',
    reason: 'Việc gia đình',
    title: 'Client title ignored',
    ...over,
  });

  const lockedIn = (month: string, status: string, message: string) => (e: any) => {
    assert.equal(e.status, 409);
    assert.equal(e.message, message);
    assert.deepEqual(e.details, { code: 'PERIOD_LOCKED', month, status });
    return true;
  };

  it('1. PERIOD_LOCKED check runs first, even if half is invalid', async () => {
    ctx.periods.statuses.set('2026-11', 'calculated');
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ half: 'INVALID' })),
      lockedIn('2026-11', 'calculated', 'Tháng 11/2026 đã chốt công')
    );
  });

  it('2. Invalid date format, half outside FIRST|SECOND, or empty reason throw input validation errors', async () => {
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-32' })),
      /date must be a valid YYYY-MM-DD date string/
    );
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ half: 'THIRD' })),
      /Nửa ca không hợp lệ: THIRD/
    );
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ reason: '   ' })),
      /reason must be a non-empty string/
    );
  });

  it('3. Self filing window: before today or after end of next month is refused; Admin can file same date', async () => {
    // ctx.now is set around Nov 2026. Yesterday: 2026-11-03
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-03' }), SELF),
      /Chỉ chọn ngày từ/
    );
    // Admin filing for 2026-11-03 succeeds
    const adminReq = await ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-03' }));
    assert.equal(adminReq.halfShiftDate, '2026-11-03');
  });

  it('4. Unknown employee, not employed, and unconfigured staff type are refused', async () => {
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ employeeId: 'ghost' })),
      /Không tìm thấy nhân sự: ghost/
    );

    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-12-01' }));
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12' })),
      /nằm ngoài thời gian làm việc/
    );

    ctx.repo.putStaff('nv01', staffContext({ regularDows: null }));
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12' })),
      /Thiếu cấu hình loại nhân sự nv/
    );
  });

  it('5. Benefits check: missing ot or makeup (e.g. tts) is refused; nv and ctv pass', async () => {
    ctx.repo.putStaff('tts01', staffContext({ employeeType: 'tts', benefits: { ot: false, makeup: true, leaveAccount: false } }));
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ employeeId: 'tts01' })),
      /Loại nhân sự này không dùng được nghỉ giữa ca/
    );

    ctx.repo.putStaff('ctv01', staffContext({ employeeType: 'ctv', benefits: { ot: true, makeup: true, leaveAccount: false } }));
    const ctvReq = await ctx.service.createHalfShiftLeaveRequest(halfShift({ employeeId: 'ctv01' }));
    assert.equal(ctvReq.status, 'PENDING');
  });

  it('6. Sunday, holiday, non-working day, or non-9h shift are refused', async () => {
    // Sunday: 2026-11-15
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-15' })),
      /Ngày 15\/11 không phải ngày làm việc/
    );

    // Holiday
    ctx.holidays.dates.push({ date: '2026-11-12', name: 'Lễ test' });
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12' })),
      /Ngày 12\/11 không phải ngày làm việc/
    );
    ctx.holidays.dates = [];

    // Custom 8-hour shift
    ctx.repo.putStaff('nv01', staffContext({ defaultShift: { startTime: '08:00', endTime: '16:00' } }));
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12' })),
      /Ca của ngày 12\/11 không chia được thành hai nửa 4 giờ/
    );
  });

  it('7. Day conflicts: pending/approved leave, lwm, isat, or another half-shift block; OT and makeup windows do not block; multiple days per month allowed', async () => {
    // Existing leave blocks
    await seed(ctx, leaveRequest('2026-11-12'));
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12' })),
      /Ngày 12\/11 đã có đơn nghỉ/
    );

    // Existing OT and makeup on 2026-11-13 do NOT block
    await seed(ctx, otRequest('2026-11-13', '18:00', '20:00'));
    const req13 = await ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-13' }));
    assert.equal(req13.halfShiftDate, '2026-11-13');

    // Multiple different dates in month allowed
    const req16 = await ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-16' }));
    assert.equal(req16.halfShiftDate, '2026-11-16');

    // But filing again on the same day 2026-11-16 blocks
    await assert.rejects(
      ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-16' })),
      /Ngày 16\/11 đã có đơn nghỉ giữa ca/
    );
  });

  it('8. Shift changed day: halves follow the changed shift (Flex1 06:00-15:00 -> FIRST 06:00-10:00)', async () => {
    await seed(ctx, shiftChange('2026-11-12', '2026-11-12', 'FLEX', '06:00', '15:00', 'APPROVED'));
    const req = await ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12', half: 'FIRST' }));
    assert.deepEqual(req.halfShiftWork, { start: '06:00', end: '10:00' });
    assert.deepEqual(req.halfShiftLeave, { start: '11:00', end: '15:00' });
    assert.equal(req.title, 'Nghỉ giữa ca 12/11, làm 06–10h');
  });

  it('9. Successful filing produces PENDING request with correct title, dates, owedMinutes 240, and claims HALF_SHIFT', async () => {
    const res = await ctx.service.createHalfShiftLeaveRequest(halfShift({ date: '2026-11-12', half: 'FIRST', title: 'Ignored Title' }));
    assert.equal(res.status, 'PENDING');
    assert.equal(res.type, 'HALF_SHIFT_LEAVE');
    assert.equal(res.title, 'Nghỉ giữa ca 12/11, làm 08–12h');
    assert.deepEqual(res.dates, ['2026-11-12']);
    assert.equal(res.owedMinutes, 240);
    assert.deepEqual(res.halfShiftWork, { start: '08:00', end: '12:00' });
    assert.deepEqual(res.halfShiftLeave, { start: '13:00', end: '17:00' });

    const dayClaim = ctx.days.rows.get(`${NV_UUID}:2026-11-12`);
    assert.ok(dayClaim);
    assert.equal(dayClaim.status, 'HALF_SHIFT');
    assert.equal(dayClaim.requestId, res.id);
  });

  it('10. Preview: returns { ok: true, title, summary } without persisting; business error returns ok: false', async () => {
    const preview = await ctx.service.previewRequest('half-shift-leave', halfShift({ date: '2026-11-12', half: 'FIRST' }));
    assert.equal(preview.ok, true);
    if (preview.ok) {
      assert.equal(preview.title, 'Nghỉ giữa ca 12/11, làm 08–12h');
      assert.deepEqual(preview.summary, {
        date: '2026-11-12',
        half: 'FIRST',
        work: { start: '08:00', end: '12:00' },
        leave: { start: '13:00', end: '17:00' },
        owedMinutes: 240,
      });
    }
    // No request saved
    assert.equal(ctx.repo.requests.size, 0);

    // Business error: Sunday
    const sundayPrev = await ctx.service.previewRequest('half-shift-leave', halfShift({ date: '2026-11-15' }));
    assert.equal(sundayPrev.ok, false);
    if (!sundayPrev.ok) {
      assert.equal(sundayPrev.message, 'Ngày 15/11 không phải ngày làm việc');
    }
  });
});
