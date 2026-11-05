import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { SystemRequest } from '../../src/modules/requests/domain';
import { NV_UUID, leaveRequest, lwmRequest, makeService, otRequest, seed, shiftChange } from './helpers/requests-fakes';

describe('Đơn đổi ca (§6.4)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const sc = (over: Record<string, unknown> = {}) =>
    ctx.service.createShiftChangeRequest({
      employeeId: 'nv01',
      title: 'Đổi ca',
      reason: 'Lịch học',
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      shiftType: 'NORMAL',
      startTime: '10:00',
      ...over
    } as any);

  it('only the six frames', async () => {
    await assert.rejects(sc({ shiftType: 'NORMAL', startTime: '09:00' }), /Khung ca không hợp lệ: NORMAL 09:00/);
    await assert.rejects(sc({ shiftType: 'CUSTOM', startTime: '08:00' }), /Khung ca không hợp lệ: CUSTOM 08:00/);
    await assert.rejects(sc({ shiftType: 'CUSTOM', startDate: 'abc' }), /Khung ca không hợp lệ: CUSTOM 10:00/);
    assert.deepEqual(ctx.repo.staffMonths, []);
    assert.equal((await sc({ shiftType: 'FLEX', startTime: '13:00' })).newEndTime, '22:00');
  });

  it('the dates are checked after the frame', async () => {
    await assert.rejects(sc({ startDate: '2026-02-30' }), /startDate must be a valid YYYY-MM-DD date string, got: 2026-02-30/);
    await assert.rejects(sc({ endDate: '2026-11-11' }), /endDate \(2026-11-11\) cannot be earlier than startDate \(2026-11-12\)/);
    assert.deepEqual(ctx.repo.staffMonths, []);
  });

  it('a range keeps both dates and the whole frame', async () => {
    const dto = await sc({ startDate: '2026-11-13', endDate: '2026-11-16', shiftType: 'NIGHT', startTime: '22:00' });
    assert.deepEqual(
      [dto.type, dto.changeStartDate, dto.changeEndDate, dto.newShiftType, dto.newStartTime, dto.newEndTime],
      ['SHIFT_CHANGE', '2026-11-13', '2026-11-16', 'NIGHT', '22:00', '07:00']
    );
    assert.deepEqual(ctx.repo.staffMonths, ['2026-11']);
  });

  it('approval changes only working days', async () => {
    const dto = await sc({ startDate: '2026-11-13', endDate: '2026-11-16', shiftType: 'NIGHT', startTime: '22:00' });
    await ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE');
    assert.deepEqual([...ctx.att.schedules.keys()].sort(), [
      `${NV_UUID}:2026-11-13`,
      `${NV_UUID}:2026-11-14`,
      `${NV_UUID}:2026-11-16`
    ]);
    for (const s of ctx.att.schedules.values()) {
      assert.deepEqual(
        [s.shiftType, s.plannedStartTime, s.plannedEndTime, s.scheduleType, s.sourceRequestId],
        ['NIGHT', '22:00', '07:00', 'SHIFT_CHANGE', dto.id]
      );
    }
  });

  it('a makeup slot that the new shift touches blocks the change', async () => {
    await seed(
      ctx,
      lwmRequest('2026-11-10', '2026-11-10', [
        { date: '2026-11-12', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-16', startTime: '18:00', endTime: '22:00' }
      ], 'APPROVED')
    );
    await assert.rejects(sc(), /12\/11: khung bù 18:00–22:00 chạm ca mới 10:00–19:00/);
  });

  it('a night shift reaches next morning OT', async () => {
    await ctx.repo.save(otRequest('2026-11-13', '06:00', '07:00', 'APPROVED'));
    await assert.rejects(
      sc({ shiftType: 'NIGHT', startTime: '22:00' }),
      /13\/11: khung OT 06:00–07:00 chạm ca mới 22:00–07:00/
    );
  });

  it('the day cap is checked with the new shift', async () => {
    // Dữ liệu cũ: hai khung OT đã duyệt cùng ngày, cộng ca 8 giờ là 13 giờ.
    await ctx.repo.save(otRequest('2026-11-12', '06:00', '07:00', 'APPROVED'));
    await ctx.repo.save(otRequest('2026-11-12', '18:00', '22:00', 'APPROVED'));
    await assert.rejects(sc({ startTime: '08:00' }), /Ngày 12\/11 vượt 12 giờ \(ca \+ OT \+ làm bù = 13 giờ\)/);
  });

  it('another shift change on the same day is refused', async () => {
    await seed(ctx, shiftChange('2026-11-12', '2026-11-12', 'NORMAL', '10:00', '19:00', 'PENDING'));
    await assert.rejects(sc({ startDate: '2026-11-11', endDate: '2026-11-13' }), /Ngày 12\/11 đã có đơn đổi ca khác/);
  });

  it('only changed working days count as the same day', async () => {
    await seed(ctx, shiftChange('2026-11-12', '2026-11-12', 'NORMAL', '10:00', '19:00', 'REJECTED'));
    await seed(ctx, shiftChange('2026-11-15', '2026-11-15', 'NORMAL', '10:00', '19:00', 'APPROVED'));
    const dto = await sc({ startDate: '2026-11-12', endDate: '2026-11-16' });
    assert.equal(dto.changeEndDate, '2026-11-16');
  });

  it('a range made only of leave days and a Sunday-only range are refused', async () => {
    await seed(ctx, leaveRequest('2026-11-12', '2026-11-12', 'APPROVED'));
    await assert.rejects(sc(), /Khoảng đổi ca không có ngày làm việc/);
    await assert.rejects(sc({ startDate: '2026-11-15', endDate: '2026-11-15' }), /Khoảng đổi ca không có ngày làm việc/);
  });

  it('filed under the employee lock', async () => {
    const dto = await sc();
    assert.equal(dto.employeeId, NV_UUID);
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
  });

  it('the factory takes a frame', () => {
    const req = SystemRequest.createShiftChangeRequest({
      employeeId: NV_UUID, title: 't', reason: 'r', startDate: '2026-11-13', endDate: '2026-11-14',
      frame: { shiftType: 'FLEX', startTime: '06:00', endTime: '15:00' }
    }).toJSON();
    assert.deepEqual(
      [req.changeStartDate, req.changeEndDate, req.newShiftType, req.newStartTime, req.newEndTime],
      ['2026-11-13', '2026-11-14', 'FLEX', '06:00', '15:00']
    );
  });

  it('the controller passes only the shift-change fields', async () => {
    const seen: unknown[] = [];
    const fake = { createShiftChangeRequest: async (input: unknown) => (seen.push(input), { id: 'x' }) } as any;
    const res = await new RequestsController(fake).createShiftChange(
      { employeeId: 'nv01', title: 't', reason: 'r', startDate: '2026-11-12', endDate: '2026-11-13', shiftType: 'NORMAL', startTime: '10:00', endTime: '23:00', changeDate: '2026-11-20' },
      { username: 'admin' } as any
    );
    assert.deepEqual(res, { created: true, request: { id: 'x' } });
    assert.deepEqual(seen, [
      { employeeId: 'nv01', title: 't', reason: 'r', startDate: '2026-11-12', endDate: '2026-11-13', shiftType: 'NORMAL', startTime: '10:00' }
    ]);
  });
});
