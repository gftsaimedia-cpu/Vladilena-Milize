import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { DayConflictError } from '../../src/modules/requests/domain';
import {
  LOCK_TRX,
  NV_UUID,
  isatRequest,
  leaveRequest,
  lwmRequest,
  makeService,
  otRequest,
  seed,
  shiftChange,
  staffContext
} from './helpers/requests-fakes';

const C2 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn.';
const C3 = 'Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.';

describe('Đơn nghỉ giữ ngày trong day_status (§4)', () => {
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

  const lwm = (over: Record<string, unknown> = {}) =>
    ctx.service.createLeaveWithMakeupRequest({
      employeeId: 'nv01',
      title: 'Nghỉ bù',
      reason: 'Việc nhà',
      startDate: '2026-11-13',
      endDate: '2026-11-14',
      slots: [{ date: '2026-11-16', startTime: '18:00', endTime: '22:00' }, { date: '2026-11-17', startTime: '18:00', endTime: '22:00' }],
      ...over
    } as any);

  const rowOf = (employeeId: string, date: string) => ctx.days.rows.get(`${employeeId}:${date}`);

  it('V1 leave 12–16/11 over approved ISAT 14/11 counts 3 days and warns C2', async () => {
    const isat = await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    const dto = await leave({ startDate: '2026-11-12', endDate: '2026-11-16' });

    assert.equal(dto.leaveDaysCount, 3);
    assert.deepEqual(dto.warnings, [C2]);
    for (const date of ['2026-11-12', '2026-11-13', '2026-11-16']) {
      const row = rowOf(NV_UUID, date);
      assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['LEAVE', dto.id, null], date);
    }
    const saturday = rowOf(NV_UUID, '2026-11-14');
    assert.deepEqual([saturday?.status, saturday?.requestId], ['ISAT', isat.id]);
    assert.equal(rowOf(NV_UUID, '2026-11-15'), undefined);
  });

  it('V2 leave over pending ISAT 14/11 is refused with C3 and writes nothing', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'PENDING'));
    const requestsBefore = ctx.repo.requests.size;
    const rowsBefore = ctx.days.rows.size;

    await assert.rejects(
      leave({ startDate: '2026-11-12', endDate: '2026-11-16' }),
      (err: unknown) => err instanceof DayConflictError && err.message === C3
    );
    assert.equal(ctx.repo.requests.size, requestsBefore);
    assert.equal(ctx.days.rows.size, rowsBefore);
  });

  it('V3a leave 11/11 on a pending shift change replaces the day', async () => {
    const change = await seed(ctx, shiftChange('2026-11-10', '2026-11-12', 'NORMAL', '10:00', '19:00', 'PENDING'));
    const dto = await leave({ startDate: '2026-11-11', endDate: '2026-11-11' });

    assert.deepEqual(dto.warnings, []);
    const replaced = rowOf(NV_UUID, '2026-11-11');
    assert.deepEqual([replaced?.status, replaced?.requestId, replaced?.baseRequestId], ['LEAVE', dto.id, change.id]);
    for (const date of ['2026-11-10', '2026-11-12']) {
      const row = rowOf(NV_UUID, date);
      assert.deepEqual([row?.status, row?.requestId], ['SHIFT_CHANGE', change.id], date);
    }
  });

  it('leave with makeup over approved ISAT owes 8 hours per counted day', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    await assert.rejects(
      lwm({
        slots: [
          { date: '2026-11-15', startTime: '06:00', endTime: '20:00' },
          { date: '2026-11-16', startTime: '18:00', endTime: '22:00' }
        ]
      }),
      /Cần đúng 8 giờ bù, đang xếp 16 giờ/
    );

    const dto = await lwm();
    assert.deepEqual([dto.leaveDaysCount, dto.owedMinutes, dto.warnings], [1, 480, [C2]]);
    const row = rowOf(NV_UUID, '2026-11-13');
    assert.deepEqual([row?.status, row?.requestId], ['LEAVE_WITH_MAKEUP', dto.id]);
    assert.equal(rowOf(NV_UUID, '2026-11-14')?.status, 'ISAT');
  });

  it('annual leave balance ignores the skipped ISAT day', async () => {
    ctx.repo.putStaff('nv01', staffContext({ leaveBalance: 2 }));
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    const dto = await leave({ startDate: '2026-11-12', endDate: '2026-11-14' });
    assert.deepEqual([dto.leaveDaysCount, dto.warnings], [2, [C2]]);
  });

  it('leave on a shift-change day that has an OT window is still refused', async () => {
    await seed(ctx, shiftChange('2026-11-11', '2026-11-11', 'NORMAL', '10:00', '19:00', 'PENDING'));
    await ctx.repo.save(otRequest('2026-11-11', '20:00', '22:00', 'APPROVED'));
    const rowsBefore = ctx.days.rows.size;
    await assert.rejects(leave({ startDate: '2026-11-11', endDate: '2026-11-11' }), /Ngày 11\/11 đã có khung OT hoặc làm bù/);
    assert.equal(ctx.days.rows.size, rowsBefore);
  });

  it('range edges on an approved ISAT Saturday', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));

    const tail = await leave({ startDate: '2026-11-14', endDate: '2026-11-16' });
    assert.deepEqual([tail.leaveDaysCount, tail.warnings], [1, [C2]]);
    assert.equal(rowOf(NV_UUID, '2026-11-16')?.requestId, tail.id);
    assert.equal(rowOf(NV_UUID, '2026-11-14')?.status, 'ISAT');

    ctx = makeService();
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    const head = await leave({ startDate: '2026-11-09', endDate: '2026-11-14' });
    assert.deepEqual([head.leaveDaysCount, head.warnings], [5, [C2]]);
    assert.equal(rowOf(NV_UUID, '2026-11-14')?.status, 'ISAT');
  });

  it("another staff's ISAT does not block this leave", async () => {
    const other = randomUUID();
    ctx.repo.putStaff('nv02', staffContext({ employeeId: other }));
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED', { employeeId: other }));

    const dto = await leave({ startDate: '2026-11-14', endDate: '2026-11-14' });
    assert.deepEqual([dto.leaveDaysCount, dto.warnings], [1, []]);
    assert.equal(rowOf(NV_UUID, '2026-11-14')?.status, 'LEAVE');
    assert.equal(rowOf(other, '2026-11-14')?.status, 'ISAT');
  });

  it('a pending shift change is not an obstacle for leave with makeup either', async () => {
    const change = await seed(ctx, shiftChange('2026-11-13', '2026-11-13', 'NORMAL', '10:00', '19:00', 'PENDING'));
    const dto = await lwm({ startDate: '2026-11-13', endDate: '2026-11-13' });
    assert.equal(rowOf(NV_UUID, '2026-11-13')?.baseRequestId, change.id);
    assert.equal(rowOf(NV_UUID, '2026-11-13')?.status, 'LEAVE_WITH_MAKEUP');
    assert.deepEqual(dto.warnings, []);
  });

  it('only leave rows make a day count as on leave', async () => {
    await seed(ctx, lwmRequest('2026-11-13', '2026-11-13', [{ date: '2026-11-16', startTime: '06:00', endTime: '07:00' }]));
    await assert.rejects(
      ctx.service.createOvertimeRequest({ employeeId: 'nv01', title: 'OT', reason: 'r', otDate: '2026-11-13', startTime: '18:00', endTime: '20:00' }),
      /Ngày 13\/11 đang nghỉ, không đăng ký OT được/
    );
  });

  it('OT on a Sunday inside an active leave range is refused as before', async () => {
    await seed(ctx, leaveRequest('2026-11-12', '2026-11-16', 'PENDING'));
    await assert.rejects(
      ctx.service.createOvertimeRequest({ employeeId: 'nv01', title: 'OT', reason: 'r', otDate: '2026-11-15', startTime: '08:00', endTime: '12:00' }),
      /^Error: Ngày 15\/11 đang nghỉ, không đăng ký OT được$/
    );
  });

  it('every day_status write runs on the lock transaction', async () => {
    await leave({ startDate: '2026-11-12', endDate: '2026-11-13' });
    const upserts = ctx.days.calls.filter(([name]) => name === 'upsert');
    assert.equal(upserts.length, 1);
    for (const [name, trx] of ctx.days.calls) assert.equal(trx, LOCK_TRX, name);
    assert.equal(ctx.days.rows.size, 2);
  });
});
