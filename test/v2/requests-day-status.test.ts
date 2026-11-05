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

const C1 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không chọn được ngày này.';
const C4 = 'Ngày 11/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.';

describe('Đổi ca, OT, khung bù và giải trình theo day_status (§4.4)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const rowOf = (employeeId: string, date: string) => ctx.days.rows.get(`${employeeId}:${date}`);
  const isConflict = (message: string) => (err: unknown) => err instanceof DayConflictError && err.message === message;

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

  const ot = (over: Record<string, unknown> = {}) =>
    ctx.service.createOvertimeRequest({
      employeeId: 'nv01',
      title: 'OT',
      reason: 'Gấp tiến độ',
      otDate: '2026-11-14',
      startTime: '08:00',
      endTime: '12:00',
      ...over
    } as any);

  const lwm = (over: Record<string, unknown> = {}) =>
    ctx.service.createLeaveWithMakeupRequest({
      employeeId: 'nv01',
      title: 'Nghỉ bù',
      reason: 'Việc nhà',
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      slots: [
        { date: '2026-11-14', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-16', startTime: '18:00', endTime: '22:00' }
      ],
      ...over
    } as any);

  const expl = (over: Record<string, unknown> = {}) =>
    ctx.service.createExplanationRequest({
      employeeId: 'nv01',
      title: 'Giải trình',
      reason: 'Kẹt xe',
      workDate: '2026-10-31',
      cases: ['LATE_CHECK_IN'],
      ...over
    } as any);

  it('V4 shift change 10–13/11 over pending leave 11/11 takes 10, 12, 13 and warns C4', async () => {
    const leaveReq = await seed(ctx, leaveRequest('2026-11-11', '2026-11-11', 'PENDING'));
    const dto = await sc({ startDate: '2026-11-10', endDate: '2026-11-13' });

    assert.deepEqual(dto.warnings, [C4]);
    for (const date of ['2026-11-10', '2026-11-12', '2026-11-13']) {
      const row = rowOf(NV_UUID, date);
      assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['SHIFT_CHANGE', dto.id, null], date);
    }
    const kept = rowOf(NV_UUID, '2026-11-11');
    assert.deepEqual([kept?.status, kept?.requestId], ['LEAVE', leaveReq.id]);
  });

  it('shift change over approved ISAT 14/11 skips it with C2', async () => {
    const isat = await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    const dto = await sc({ startDate: '2026-11-13', endDate: '2026-11-14' });

    assert.deepEqual(dto.warnings, [C2]);
    assert.equal(rowOf(NV_UUID, '2026-11-13')?.requestId, dto.id);
    const saturday = rowOf(NV_UUID, '2026-11-14');
    assert.deepEqual([saturday?.status, saturday?.requestId], ['ISAT', isat.id]);
  });

  it('shift change touching pending ISAT is refused with C3', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'PENDING'));
    const requestsBefore = ctx.repo.requests.size;
    const rowsBefore = ctx.days.rows.size;
    await assert.rejects(sc({ startDate: '2026-11-13', endDate: '2026-11-14' }), isConflict(C3));
    assert.equal(ctx.repo.requests.size, requestsBefore);
    assert.equal(ctx.days.rows.size, rowsBefore);
  });

  it('shift change whose days are all on leave is refused with the old empty-range message', async () => {
    await seed(ctx, leaveRequest('2026-11-12', '2026-11-12', 'APPROVED'));
    await assert.rejects(sc(), /^Error: Khoảng đổi ca không có ngày làm việc$/);
  });

  it('OT on approved ISAT 14/11 is refused with C1, and with pending ISAT with C3', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    await assert.rejects(ot(), isConflict(C1));

    ctx = makeService();
    await seed(ctx, isatRequest('2026-11-14', 'PENDING'));
    await assert.rejects(ot(), isConflict(C3));
    assert.equal(ctx.repo.requests.size, 1);
  });

  it('OT on a leave day keeps the old message', async () => {
    await seed(ctx, leaveRequest('2026-11-12', '2026-11-12', 'APPROVED'));
    await assert.rejects(ot({ otDate: '2026-11-12', startTime: '18:00', endTime: '20:00' }), /^Error: Ngày 12\/11 đang nghỉ, không đăng ký OT được$/);
  });

  it('OT writes no day_status row', async () => {
    await ot({ otDate: '2026-11-13', startTime: '18:00', endTime: '20:00' });
    assert.equal(ctx.days.rows.size, 0);
    assert.deepEqual(ctx.days.calls.filter(([name]) => name === 'upsert'), []);
  });

  it('makeup slot on approved ISAT is refused with C1', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    await assert.rejects(lwm(), isConflict(C1));
    assert.equal(ctx.repo.requests.size, 1);
  });

  it('makeup slots on free days only claim the leave day', async () => {
    const dto = await lwm();
    assert.deepEqual(dto.warnings, []);
    assert.deepEqual([...ctx.days.rows.keys()], [`${NV_UUID}:2026-11-12`]);
  });

  it('explanation for an approved ISAT Saturday is refused with C1, and a pending one with C3', async () => {
    await seed(ctx, isatRequest('2026-10-31', 'APPROVED'));
    await assert.rejects(
      expl(),
      isConflict('Thứ Bảy 31/10 đã có iSAT được duyệt, không chọn được ngày này.')
    );

    ctx = makeService();
    await seed(ctx, isatRequest('2026-10-31', 'PENDING'));
    await assert.rejects(
      expl(),
      isConflict('Thứ Bảy 31/10 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.')
    );
  });

  it('explanation for a free day writes no row, and runs the read under the employee lock', async () => {
    const dto = await expl({ workDate: '2026-11-03' });
    assert.deepEqual(dto.warnings, []);
    assert.equal(ctx.days.rows.size, 0);
    assert.ok(ctx.days.calls.length > 0);
    for (const [name, trx] of ctx.days.calls) assert.equal(trx, LOCK_TRX, name);
  });

  it('explanation for an unconfigured position type skips the day check', async () => {
    ctx.repo.putStaff('nv01', staffContext({ regularDows: null }));
    await seed(ctx, isatRequest('2026-10-31', 'APPROVED'));
    const dto = await expl();
    assert.equal(dto.status, 'PENDING');
    assert.deepEqual(ctx.days.calls, []);
  });
});

describe('iSAT giữ Thứ Bảy trong day_status (§4.1, V5, V6)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const rowOf = (employeeId: string, date: string) => ctx.days.rows.get(`${employeeId}:${date}`);
  const isConflict = (message: string) => (err: unknown) => err instanceof DayConflictError && err.message === message;

  const isat = (over: Record<string, unknown> = {}) =>
    ctx.service.createIsatRequest({
      employeeId: 'nv01',
      saturday: '2026-11-14',
      team: 'Nhóm thử',
      conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true },
      ...over
    } as any);

  it('a pending ISAT claims its Saturday', async () => {
    const dto = await isat();
    assert.deepEqual(dto.warnings, []);
    const row = rowOf(NV_UUID, '2026-11-14');
    assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['ISAT', dto.id, null]);
  });

  it('ISAT on a holiday Saturday is refused with C5', async () => {
    ctx.holidays.dates = [{ date: '2026-11-14', name: 'Lễ' }];
    await assert.rejects(isat(), isConflict('Thứ Bảy 14/11 là ngày lễ, không chọn được cho iSAT.'));
    assert.equal(ctx.repo.requests.size, 0);
    assert.equal(ctx.days.rows.size, 0);
  });

  it('ISAT on a Saturday with an approved leave is refused with C6; with a pending leave, C7', async () => {
    await seed(ctx, leaveRequest('2026-11-14', '2026-11-14', 'APPROVED'));
    await assert.rejects(isat(), isConflict('Thứ Bảy 14/11 đã nghỉ theo đơn đã duyệt, không chọn được cho iSAT.'));

    ctx = makeService();
    await seed(ctx, leaveRequest('2026-11-14', '2026-11-14', 'PENDING'));
    await assert.rejects(
      isat(),
      isConflict('Thứ Bảy 14/11 đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác.')
    );
    assert.equal(ctx.repo.requests.size, 1);
  });

  it('V6 ISAT on a Saturday with a pending OT window is refused with C9', async () => {
    await seed(ctx, otRequest('2026-11-14', '08:00', '12:00', 'PENDING'));
    await assert.rejects(
      isat(),
      isConflict('Thứ Bảy 14/11 đang có đơn OT chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.')
    );
    assert.equal(ctx.repo.requests.size, 1);
    assert.equal(ctx.days.rows.size, 0);
  });

  it('ISAT on a Saturday with an approved OT window is refused with C8', async () => {
    await seed(ctx, otRequest('2026-11-14', '08:00', '12:00', 'APPROVED'));
    await assert.rejects(
      isat(),
      isConflict('Thứ Bảy 14/11 đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT.')
    );
  });

  it('ISAT on a Saturday with a pending makeup window is refused with C9 naming the leave with makeup', async () => {
    await seed(ctx, lwmRequest('2026-11-12', '2026-11-12', [{ date: '2026-11-14', startTime: '18:00', endTime: '22:00' }]), [
      '2026-11-12'
    ]);
    await assert.rejects(
      isat(),
      isConflict('Thứ Bảy 14/11 đang có đơn nghỉ có làm bù chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.')
    );
  });

  it('ISAT on a shift-changed Saturday replaces the day', async () => {
    const sc = await seed(ctx, shiftChange('2026-11-14', '2026-11-14', 'NORMAL', '10:00', '19:00', 'PENDING'));
    const dto = await isat();
    const row = rowOf(NV_UUID, '2026-11-14');
    assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['ISAT', dto.id, sc.id]);
  });

  it('ISAT runs under the employee lock', async () => {
    await isat();
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
    assert.ok(ctx.days.calls.length > 0);
    for (const [name, trx] of ctx.days.calls) assert.equal(trx, LOCK_TRX, name);
    for (const [name, trx] of ctx.repo.calls.filter(([n]) => n === 'save' || n === 'list')) assert.equal(trx, LOCK_TRX, name);
  });

  it('auto-rejected ISAT writes no day', async () => {
    const dto = await isat({ conditions: { NO_VIOLATION: false, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true } });
    assert.equal(dto.status, 'REJECTED');
    assert.equal(ctx.repo.requests.size, 1);
    assert.equal(ctx.days.rows.size, 0);
    assert.deepEqual(ctx.days.calls, []);
  });

  it('the old duplicate message still wins for the same Saturday', async () => {
    await isat();
    await assert.rejects(isat(), /^Error: Đã có đơn iSAT cho Thứ Bảy 14\/11\/2026$/);
  });
});

describe('Duyệt, từ chối và huỷ giữ day_status và lịch (§4.2, §4.3)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const rowOf = (date: string) => ctx.days.rows.get(`${NV_UUID}:${date}`);
  const scheduleOf = (date: string) => ctx.att.schedules.get(`${NV_UUID}:${date}`);
  const scheduledDates = () => [...ctx.att.schedules.keys()].map(key => key.slice(NV_UUID.length + 1)).sort();
  const shiftOn = (date: string) => {
    const s = scheduleOf(date);
    return [s?.scheduleType, s?.shiftType, s?.plannedStartTime, s?.plannedEndTime, s?.sourceRequestId];
  };

  const approve = (id: string) => ctx.service.reviewRequest(id, 'admin', 'APPROVE');
  const reject = (id: string) => ctx.service.reviewRequest(id, 'admin', 'REJECT', 'Không đủ người');
  const cancel = (id: string) => ctx.service.cancelRequest(id, 'nv01', 'Đổi kế hoạch');

  const leave = (startDate: string, endDate = startDate) =>
    ctx.service.createLeaveRequest({ employeeId: 'nv01', title: 'Nghỉ', reason: 'Việc nhà', leaveType: 'ANNUAL', startDate, endDate });
  const isat = () =>
    ctx.service.createIsatRequest({
      employeeId: 'nv01',
      saturday: '2026-11-14',
      team: 'Nhóm thử',
      conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
    });
  const ot = () =>
    ctx.service.createOvertimeRequest({
      employeeId: 'nv01',
      title: 'OT',
      reason: 'Gấp tiến độ',
      otDate: '2026-11-14',
      startTime: '18:00',
      endTime: '20:00'
    });

  it('V1 approve writes ON_LEAVE only on the claimed days', async () => {
    const saturday = await isat();
    await approve(saturday.id);
    const dto = await leave('2026-11-12', '2026-11-16');
    await approve(dto.id);

    for (const date of ['2026-11-12', '2026-11-13', '2026-11-16']) {
      const s = scheduleOf(date);
      assert.deepEqual([s?.status, s?.sourceRequestId], ['ON_LEAVE', dto.id], date);
    }
    // Thứ Bảy iSAT không bị đơn nghỉ đụng tới.
    const s14 = scheduleOf('2026-11-14');
    assert.deepEqual([s14?.scheduleType, s14?.status, s14?.sourceRequestId], ['ISAT', 'ON_LEAVE', saturday.id]);
    assert.deepEqual(scheduledDates(), ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16']);
  });

  it('V3b rejecting the leave hands 11/11 back to the pending shift change', async () => {
    const change = await seed(ctx, shiftChange('2026-11-10', '2026-11-12', 'NIGHT', '22:00', '07:00', 'PENDING'));
    const dto = await leave('2026-11-11');
    assert.equal(rowOf('2026-11-11')?.baseRequestId, change.id);

    await reject(dto.id);

    const row = rowOf('2026-11-11');
    assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['SHIFT_CHANGE', change.id, null]);
    // Đơn đổi ca còn chờ duyệt: chưa có lịch nào.
    assert.equal(ctx.att.schedules.size, 0);
  });

  it("rejecting a leave over an approved shift change rewrites that day's schedule", async () => {
    const change = await seed(ctx, shiftChange('2026-11-10', '2026-11-12', 'NIGHT', '22:00', '07:00', 'APPROVED'));
    const dto = await leave('2026-11-11');

    await reject(dto.id);

    const row = rowOf('2026-11-11');
    assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['SHIFT_CHANGE', change.id, null]);
    assert.deepEqual(shiftOn('2026-11-11'), ['SHIFT_CHANGE', 'NIGHT', '22:00', '07:00', change.id]);
    assert.deepEqual(scheduledDates(), ['2026-11-11']);
  });

  it('V4b rejecting the leave frees 11/11 to the regular shift', async () => {
    const leaveReq = await seed(ctx, leaveRequest('2026-11-11', '2026-11-11', 'PENDING'));
    const change = await ctx.service.createShiftChangeRequest({
      employeeId: 'nv01',
      title: 'Đổi ca',
      reason: 'Lịch học',
      startDate: '2026-11-10',
      endDate: '2026-11-13',
      shiftType: 'NIGHT',
      startTime: '22:00'
    });

    await reject(leaveReq.id);
    assert.equal(rowOf('2026-11-11'), undefined);

    // Ngày đã về ca thường: duyệt đơn đổi ca không ghi ngày đó.
    await approve(change.id);
    assert.deepEqual(scheduledDates(), ['2026-11-10', '2026-11-12', '2026-11-13']);
    assert.equal(rowOf('2026-11-11'), undefined);
  });

  it('V5 approving ISAT on a shift-changed Saturday writes withIsat, and approving the shift change later leaves the Saturday alone', async () => {
    const change = await seed(ctx, shiftChange('2026-11-09', '2026-11-14', 'NIGHT', '22:00', '07:00', 'PENDING'));
    const saturday = await isat();
    assert.equal(rowOf('2026-11-14')?.baseRequestId, change.id);

    await approve(saturday.id);
    const isatDay = scheduleOf('2026-11-14');
    assert.deepEqual([isatDay?.scheduleType, isatDay?.status, isatDay?.sourceRequestId], ['ISAT', 'ON_LEAVE', saturday.id]);

    await approve(change.id);
    for (const date of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) {
      assert.deepEqual(shiftOn(date), ['SHIFT_CHANGE', 'NIGHT', '22:00', '07:00', change.id], date);
    }
    const after = scheduleOf('2026-11-14');
    assert.deepEqual([after?.scheduleType, after?.status, after?.sourceRequestId], ['ISAT', 'ON_LEAVE', saturday.id]);
  });

  it('cancelling a shift change clears the base on replaced days', async () => {
    const change = await seed(ctx, shiftChange('2026-11-10', '2026-11-12', 'NORMAL', '10:00', '19:00', 'PENDING'));
    const dto = await leave('2026-11-11');

    const cancelled = await cancel(change.id);

    assert.equal(cancelled.status, 'CANCELLED');
    const kept = rowOf('2026-11-11');
    assert.deepEqual([kept?.status, kept?.requestId, kept?.baseRequestId], ['LEAVE', dto.id, null]);
    assert.equal(rowOf('2026-11-10'), undefined);
    assert.equal(rowOf('2026-11-12'), undefined);
  });

  it('cancelling a pending ISAT frees the Saturday', async () => {
    const saturday = await isat();
    await cancel(saturday.id);
    assert.equal(rowOf('2026-11-14'), undefined);
    const dto = await leave('2026-11-14');
    assert.deepEqual([dto.leaveDaysCount, dto.warnings], [1, []]);
    assert.equal(rowOf('2026-11-14')?.requestId, dto.id);

    ctx = makeService();
    const again = await isat();
    await cancel(again.id);
    const overtime = await ot();
    assert.deepEqual([overtime.status, overtime.otHours], ['PENDING', 2]);
  });

  it('approving a shift change after an approved leave took a day keeps ON_LEAVE', async () => {
    const change = await seed(ctx, shiftChange('2026-11-10', '2026-11-12', 'NIGHT', '22:00', '07:00', 'PENDING'));
    const dto = await leave('2026-11-11');
    await approve(dto.id);

    await approve(change.id);

    const s11 = scheduleOf('2026-11-11');
    assert.deepEqual(
      [s11?.status, s11?.scheduleType, s11?.plannedStartTime, s11?.plannedEndTime, s11?.sourceRequestId],
      ['ON_LEAVE', 'REGULAR', '08:00', '17:00', dto.id]
    );
    for (const date of ['2026-11-10', '2026-11-12']) {
      assert.deepEqual(shiftOn(date), ['SHIFT_CHANGE', 'NIGHT', '22:00', '07:00', change.id], date);
    }
  });

  it('approval recheck refuses a conflicting request and writes nothing', async () => {
    // Dữ liệu sai dựng bằng tay: OT 14/11 đang chờ trên Thứ Bảy đã có iSAT được duyệt.
    const saturday = await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    const overtime = otRequest('2026-11-14', '08:00', '12:00', 'PENDING');
    await ctx.repo.save(overtime);
    const rowsBefore = [...ctx.days.rows.entries()];

    await assert.rejects(approve(overtime.id), (err: unknown) => {
      assert.ok(err instanceof DayConflictError);
      assert.equal(err.message, `${C1} Chỉ có thể từ chối đơn này.`);
      assert.deepEqual(err.info, { date: '2026-11-14', requestId: saturday.id, requestType: 'ISAT', requestStatus: 'APPROVED' });
      return true;
    });
    assert.equal(ctx.repo.requests.get(overtime.id)?.status, 'PENDING');
    assert.equal(ctx.att.schedules.size, 0);
    assert.equal(ctx.att.dayStatuses.size, 0);
    assert.deepEqual([...ctx.days.rows.entries()], rowsBefore);

    // Admin vẫn từ chối được.
    assert.equal((await reject(overtime.id)).status, 'REJECTED');
  });

  it('review takes the request lock then the employee lock', async () => {
    const approved = await seed(ctx, leaveRequest('2026-11-12', '2026-11-12'));
    const rejected = await seed(ctx, leaveRequest('2026-11-13', '2026-11-13'));

    await approve(approved.id);
    await reject(rejected.id);

    assert.deepEqual(ctx.lock.keys, [
      `request_${approved.id}`,
      `requests_${NV_UUID}`,
      `request_${rejected.id}`,
      `requests_${NV_UUID}`
    ]);
  });

  it('cancel takes the same two locks and writes on the lock transaction', async () => {
    const req = await seed(ctx, leaveRequest('2026-11-12', '2026-11-13'));
    ctx.repo.calls.length = 0;

    await cancel(req.id);

    assert.deepEqual(ctx.lock.keys, [`request_${req.id}`, `requests_${NV_UUID}`]);
    assert.deepEqual(ctx.repo.calls, [
      ['findById', LOCK_TRX],
      ['resolveStaffUuid', LOCK_TRX],
      ['save', LOCK_TRX]
    ]);
    assert.ok(ctx.days.calls.some(([name]) => name === 'remove'));
    for (const [name, trx] of ctx.days.calls) assert.equal(trx, LOCK_TRX, name);
    assert.equal(rowOf('2026-11-12'), undefined);
    assert.equal(rowOf('2026-11-13'), undefined);
  });

  // Ruling (Task 6): ngày đơn khác đã thay của đơn đổi ca (T3) hoặc ngày đơn đổi ca đã bỏ không phải xung đột lúc duyệt.
  it('a pending ISAT that took a Saturday of a pending shift change does not block approving the shift change', async () => {
    const change = await seed(ctx, shiftChange('2026-11-09', '2026-11-14', 'NIGHT', '22:00', '07:00', 'PENDING'));
    const saturday = await isat();

    const reviewed = await approve(change.id);

    assert.equal(reviewed.status, 'APPROVED');
    assert.deepEqual(scheduledDates(), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    assert.equal(rowOf('2026-11-14')?.requestId, saturday.id);
  });

  it('a shift change whose only day a leave took can be approved, and gets the day back when the leave is rejected', async () => {
    const change = await seed(ctx, shiftChange('2026-11-11', '2026-11-11', 'NIGHT', '22:00', '07:00', 'PENDING'));
    const dto = await leave('2026-11-11');

    assert.equal((await approve(change.id)).status, 'APPROVED');
    assert.equal(ctx.att.schedules.size, 0);

    await reject(dto.id);
    assert.deepEqual(shiftOn('2026-11-11'), ['SHIFT_CHANGE', 'NIGHT', '22:00', '07:00', change.id]);
  });
});

// Ruling F1: ca đổi chỉ áp lên ngày mà đơn đổi ca đang giữ trong day_status, không lên mọi ngày trong khoảng của đơn.
describe('Ca của ngày theo dòng day_status của đơn đổi ca (T4, C2)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const rowOf = (date: string) => ctx.days.rows.get(`${NV_UUID}:${date}`);
  const hasMessage = (message: string) => (err: unknown) => err instanceof Error && err.message === message;

  const leave = (date: string) =>
    ctx.service.createLeaveRequest({ employeeId: 'nv01', title: 'Nghỉ', reason: 'Việc nhà', leaveType: 'ANNUAL', startDate: date, endDate: date });
  const sc = (startDate: string, endDate: string, shiftType = 'NIGHT', startTime = '22:00') =>
    ctx.service.createShiftChangeRequest({ employeeId: 'nv01', title: 'Đổi ca', reason: 'Lịch học', startDate, endDate, shiftType, startTime });
  const ot = (otDate: string, startTime: string, endTime: string) =>
    ctx.service.createOvertimeRequest({ employeeId: 'nv01', title: 'OT', reason: 'Gấp tiến độ', otDate, startTime, endTime });

  it('probe A: a day freed by rejecting its leave (T4) takes a new shift change', async () => {
    const leaveReq = await leave('2026-11-11');
    const night = await sc('2026-11-10', '2026-11-13');
    assert.deepEqual(night.warnings, [C4]);
    await ctx.service.reviewRequest(leaveReq.id, 'admin', 'REJECT');
    assert.equal(rowOf('2026-11-11'), undefined);

    const dto = await sc('2026-11-11', '2026-11-11', 'NORMAL', '10:00');

    assert.deepEqual([dto.status, dto.warnings], ['PENDING', []]);
    const row = rowOf('2026-11-11');
    assert.deepEqual([row?.status, row?.requestId, row?.baseRequestId], ['SHIFT_CHANGE', dto.id, null]);
    assert.equal(rowOf('2026-11-12')?.requestId, night.id);
  });

  it('probe B: OT on a freed day of an approved night shift change is checked against the regular shift', async () => {
    const leaveReq = await leave('2026-11-11');
    const night = await sc('2026-11-10', '2026-11-13');
    await ctx.service.reviewRequest(night.id, 'admin', 'APPROVE');
    await ctx.service.reviewRequest(leaveReq.id, 'admin', 'REJECT');
    assert.equal(ctx.att.schedules.has(`${NV_UUID}:2026-11-11`), false); // ngày 11 giữ ca mặc định 08–17

    // Cùng câu như trên một ngày thường ca 08:00–17:00.
    await assert.rejects(ot('2026-11-18', '09:00', '11:00'), hasMessage('Khung 09:00–11:00 ngày 18/11 phải cách ca 08:00–17:00 ít nhất 1 giờ'));
    await assert.rejects(ot('2026-11-11', '09:00', '11:00'), hasMessage('Khung 09:00–11:00 ngày 11/11 phải cách ca 08:00–17:00 ít nhất 1 giờ'));
    assert.equal([...ctx.repo.requests.values()].filter(r => r.type === 'OVERTIME').length, 0);
  });

  it('probe F: Sunday OT after a night shift change skipped the approved iSAT Saturday (C2) sees no Saturday night shift', async () => {
    const isat = await ctx.service.createIsatRequest({
      employeeId: 'nv01',
      saturday: '2026-11-14',
      team: 'Nhóm thử',
      conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
    });
    await ctx.service.reviewRequest(isat.id, 'admin', 'APPROVE');
    const night = await sc('2026-11-13', '2026-11-14');
    assert.deepEqual(night.warnings, [C2]);

    const dto = await ot('2026-11-15', '06:00', '09:00');

    assert.deepEqual([dto.status, dto.otDate, dto.otHours], ['PENDING', '2026-11-15', 3]);
  });
});
