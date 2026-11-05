import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { SystemRequest } from '../../src/modules/requests/domain';
import { NV_UUID, leaveRequest, makeService, otRequest, seed, staffContext } from './helpers/requests-fakes';

const s = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });

describe('Đơn nghỉ có làm bù (§6.2)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const lwm = (over: Record<string, unknown> = {}) =>
    ctx.service.createLeaveWithMakeupRequest({
      employeeId: 'nv01',
      title: 'Nghỉ bù',
      reason: 'Việc nhà',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-16', '18:00', '22:00')],
      ...over
    } as any);

  it('one day off needs exactly 8 hours', async () => {
    const dto = await lwm({
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-16', '18:00', '22:00')]
    });
    assert.equal(dto.owedMinutes, 480);
    assert.deepEqual(dto.makeupSlots.map(x => x.workMinutes), [240, 240]);
    assert.equal(dto.leaveType, null);
    assert.deepEqual([dto.type, dto.leaveStartDate, dto.leaveEndDate, dto.leaveDaysCount], ['LEAVE_WITH_MAKEUP', '2026-11-10', '2026-11-10', 1]);
  });

  it('two days need 16 hours and a Sunday slot is allowed', async () => {
    const dto = await lwm({
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      slots: [s('2026-11-15', '06:00', '20:00'), s('2026-11-16', '18:00', '22:00')]
    });
    assert.deepEqual([dto.leaveDaysCount, dto.owedMinutes], [2, 960]);
    assert.deepEqual(dto.makeupSlots.map(x => x.workMinutes), [720, 240]);
  });

  it('too few or too many hours', async () => {
    await assert.rejects(lwm({ slots: [s('2026-11-12', '18:00', '22:00')] }), /Còn thiếu 4 giờ bù/);
    await assert.rejects(
      lwm({ slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-13', '18:00', '22:00'), s('2026-11-16', '06:00', '07:00')] }),
      /đang xếp 9 giờ/
    );
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('slots are stored by date, then start time', async () => {
    const dto = await lwm({
      slots: [s('2026-11-16', '18:00', '20:00'), s('2026-11-12', '18:00', '22:00'), s('2026-11-16', '06:00', '07:00'), s('2026-11-16', '20:00', '21:00')]
    });
    assert.deepEqual(
      dto.makeupSlots.map(x => `${x.date} ${x.startTime}`),
      ['2026-11-12 18:00', '2026-11-16 06:00', '2026-11-16 18:00', '2026-11-16 20:00']
    );
    const direct = SystemRequest.createLeaveWithMakeupRequest({
      employeeId: NV_UUID, title: 't', reason: 'r', startDate: '2026-11-10', endDate: '2026-11-10', daysCount: 1,
      makeupSlots: [
        { date: '2026-11-16', startTime: '18:00', endTime: '22:00', workMinutes: 240 },
        { date: '2026-11-12', startTime: '18:00', endTime: '22:00', workMinutes: 240 }
      ]
    });
    assert.deepEqual(direct.makeupSlots.map(x => x.date), ['2026-11-12', '2026-11-16']);
  });

  it('slots must come after the last leave day', async () => {
    await assert.rejects(
      lwm({ slots: [s('2026-11-09', '18:00', '22:00'), s('2026-11-12', '18:00', '22:00')] }),
      /Khung bù ngày 09\/11 phải sau ngày nghỉ cuối 10\/11/
    );
    await assert.rejects(
      lwm({ slots: [s('2026-11-10', '18:00', '22:00'), s('2026-11-12', '18:00', '22:00')] }),
      /Khung bù ngày 10\/11 phải sau ngày nghỉ cuối 10\/11/
    );
  });

  it('slots must stay in the month', async () => {
    await assert.rejects(
      lwm({ startDate: '2026-11-27', endDate: '2026-11-27', slots: [s('2026-11-28', '18:00', '22:00'), s('2026-12-01', '18:00', '22:00')] }),
      /Ngày nghỉ và khung bù phải nằm trong cùng một tháng/
    );
    await assert.rejects(lwm({ startDate: '2026-11-30', endDate: '2026-12-01' }), /cùng một tháng/);
  });

  it('a leave on the last day of the month has no room', async () => {
    await assert.rejects(
      lwm({ startDate: '2026-11-30', endDate: '2026-11-30', slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-16', '18:00', '22:00')] }),
      /Không còn ngày trong tháng để xếp đủ giờ bù/
    );
  });

  it('a range without working days is refused', async () =>
    assert.rejects(lwm({ startDate: '2026-11-15', endDate: '2026-11-15' }), /Khoảng nghỉ không có ngày làm việc/));

  it('the leave days must be free', async () => {
    await seed(ctx, leaveRequest('2026-11-10', '2026-11-10', 'APPROVED'));
    await assert.rejects(lwm(), /Đã có đơn nghỉ trùng ngày/);
  });

  it('filed under the employee lock and stored under the uuid', async () => {
    const dto = await lwm();
    assert.equal(dto.employeeId, NV_UUID);
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
    assert.deepEqual(ctx.repo.staffMonths, ['2026-11']);
  });

  it('a month with OT refuses the request', async () => {
    await ctx.repo.save(otRequest('2026-11-03', '18:00', '22:00', 'REJECTED'));
    await ctx.repo.save(otRequest('2026-12-02', '18:00', '22:00', 'APPROVED'));
    assert.equal((await lwm()).owedMinutes, 480);
    await ctx.repo.save(otRequest('2026-11-05', '18:00', '22:00', 'APPROVED'));
    await assert.rejects(
      lwm({ startDate: '2026-11-11', endDate: '2026-11-11' }),
      /Tháng 2026-11 đã có đơn OT, không nộp đơn nghỉ có làm bù được/
    );
  });

  it('slots follow the window rules', async () => {
    await assert.rejects(
      lwm({ slots: [s('2026-11-12', '17:00', '21:00'), s('2026-11-16', '18:00', '22:00')] }),
      /ít nhất 1 giờ/
    );
    await assert.rejects(
      lwm({ slots: [s('2026-11-12', '06:00', '07:00'), s('2026-11-12', '18:00', '22:00'), s('2026-11-13', '18:00', '21:00')] }),
      /Ngày 12\/11 vượt 12 giờ/
    );
    await assert.rejects(
      lwm({ slots: [s('2026-11-12', '18:00', '20:00'), s('2026-11-12', '19:00', '21:00'), s('2026-11-16', '18:00', '22:00')] }),
      /chồng lên khung/
    );
  });

  it('no slot on a leave day', async () => {
    await seed(ctx, leaveRequest('2026-11-13', '2026-11-13', 'APPROVED'));
    await assert.rejects(
      lwm({ slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-13', '18:00', '22:00')] }),
      /Ngày 13\/11 đang nghỉ, không xếp khung bù được/
    );
  });

  it('malformed slots give a clear error', async () => {
    await assert.rejects(lwm({ slots: 'abc' }), /slots phải là danh sách khung bù/);
    await assert.rejects(lwm({ slots: [{ date: '2026-11-12', startTime: '18:00' }] }), /Khung bù thứ 1 không hợp lệ/);
    await assert.rejects(lwm({ slots: [s('2026-11-12', '18:00', '22:00'), null] }), /Khung bù thứ 2 không hợp lệ/);
    await assert.rejects(lwm({ slots: [s('2026-02-30', '18:00', '22:00')] }), /Khung bù thứ 1 không hợp lệ/);
    await assert.rejects(lwm({ slots: [s('2026-11-12', '6:00', '22:00')] }), /Khung bù thứ 1 không hợp lệ/);
    await assert.rejects(lwm({ endDate: '2026-11-31' }), /endDate must be a valid YYYY-MM-DD date string, got: 2026-11-31/);
    assert.deepEqual(ctx.repo.staffMonths, []);
  });

  it('the makeup flag is required', async () => {
    ctx.repo.putStaff('nv01', staffContext({ benefits: { ot: true, makeup: false, leaveAccount: true } }));
    await assert.rejects(lwm(), /Loại nhân sự này không có làm bù/);
    assert.equal((await lwm({ employeeId: 'tts01' })).owedMinutes, 480);
  });

  it('approval marks the leave day only and getById returns the slots', async () => {
    const dto = await lwm();
    const reviewed = await ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
    assert.deepEqual([...ctx.att.schedules.keys()], [`${NV_UUID}:2026-11-10`]);
    const day = ctx.att.schedules.get(`${NV_UUID}:2026-11-10`)!;
    assert.deepEqual([day.status, day.sourceRequestId], ['ON_LEAVE', dto.id]);
    const found = await ctx.service.getById(dto.id);
    assert.equal(found!.makeupSlots.length, 2);
  });

  it('the controller passes only the makeup fields', async () => {
    const seen: unknown[] = [];
    const fake = { createLeaveWithMakeupRequest: async (input: unknown) => (seen.push(input), { id: 'x' }) } as any;
    const slots = [s('2026-11-12', '18:00', '22:00')];
    const res = await new RequestsController(fake).createLeaveWithMakeup(
      { employeeId: 'nv01', title: 't', reason: 'r', startDate: '2026-11-10', endDate: '2026-11-10', slots, daysCount: 9, leaveType: 'ANNUAL' },
      { username: 'admin' } as any
    );
    assert.deepEqual(res, { created: true, request: { id: 'x' }, warnings: [] });
    assert.deepEqual(seen, [{ employeeId: 'nv01', title: 't', reason: 'r', startDate: '2026-11-10', endDate: '2026-11-10', slots }]);
  });
});
