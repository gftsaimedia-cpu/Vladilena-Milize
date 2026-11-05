import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { NV_UUID, leaveRequest, lwmRequest, makeService, otRequest, shiftChange } from './helpers/requests-fakes';

describe('Đơn OT (§6.3)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const ot = (over: Record<string, unknown> = {}) =>
    ctx.service.createOvertimeRequest({
      employeeId: 'nv01',
      title: 'OT',
      reason: 'Chạy deadline',
      otDate: '2026-11-12',
      startTime: '18:00',
      endTime: '22:00',
      ...over
    } as any);

  it('tts cannot file OT', async () => assert.rejects(ot({ employeeId: 'tts01' }), /Loại nhân sự này không có OT/));

  it('both times are required', async () => {
    await assert.rejects(ot({ endTime: undefined }), /endTime must be a valid HH:mm time string, got: undefined/);
    await assert.rejects(ot({ startTime: '6:00' }), /startTime must be a valid HH:mm time string, got: 6:00/);
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('the date is checked first; targetDate still works', async () => {
    await assert.rejects(ot({ otDate: '2026-02-30' }), /otDate must be a valid YYYY-MM-DD date string, got: 2026-02-30/);
    await assert.rejects(ot({ otDate: undefined }), /otDate must be a valid YYYY-MM-DD date string, got: undefined/);
    assert.deepEqual(ctx.repo.staffMonths, []);
    const dto = await ot({ otDate: undefined, targetDate: '2026-11-13' });
    assert.equal(dto.otDate, '2026-11-13');
  });

  it('otHours comes from the window; client hours are ignored', async () => {
    const dto = await ot({ hours: 9, otHours: 9, startTime: '18:00', endTime: '21:30' });
    assert.deepEqual([dto.otStartTime, dto.otEndTime, dto.otHours], ['18:00', '21:30', 3.5]);
  });

  it('windows around shift 08–17', async () => {
    assert.equal((await ot({ otDate: '2026-11-12', startTime: '18:00', endTime: '22:00' })).otHours, 4);
    assert.equal((await ot({ otDate: '2026-11-13', startTime: '06:00', endTime: '07:00' })).otHours, 1);
    await assert.rejects(ot({ otDate: '2026-11-13', startTime: '17:00', endTime: '19:00' }), /ít nhất 1 giờ/);
    await assert.rejects(ot({ otDate: '2026-11-13', startTime: '07:30', endTime: '08:00' }), /ít nhất 1 giờ/);
    await assert.rejects(ot({ otDate: '2026-11-13', startTime: '21:00', endTime: '23:00' }), /06:00–22:00/);
  });

  it('several windows a day up to 12 hours', async () => {
    await ot({ otDate: '2026-11-12', startTime: '06:00', endTime: '07:00' });
    await ot({ otDate: '2026-11-12', startTime: '18:00', endTime: '21:00' }); // 8 + 1 + 3 = 12
    await assert.rejects(ot({ otDate: '2026-11-12', startTime: '19:00', endTime: '20:00' }), /chồng lên khung 18:00–21:00/);
    await assert.rejects(
      ot({ otDate: '2026-11-12', startTime: '21:00', endTime: '22:00' }),
      /vượt 12 giờ \(ca \+ OT \+ làm bù = 13 giờ\)/
    );
  });

  it('a holiday and a Sunday have no shift', async () => {
    ctx.holidays.dates = [{ date: '2026-09-02', name: 'Quốc khánh' }];
    assert.equal((await ot({ otDate: '2026-09-02', startTime: '08:00', endTime: '20:00' })).otHours, 10);
    assert.equal((await ot({ otDate: '2026-11-15', startTime: '06:00', endTime: '20:00' })).otHours, 12);
    await assert.rejects(ot({ otDate: '2026-11-22', startTime: '06:00', endTime: '22:00' }), /Ngày 22\/11 vượt 12 giờ/);
  });

  it('a night shift the day before reaches the morning', async () => {
    ctx.repo.schedules = [{ date: '2026-11-11', startTime: '22:00', endTime: '07:00', onLeave: false }];
    ctx.repo.schedules.push({ date: '2026-11-12', startTime: '22:00', endTime: '07:00', onLeave: false });
    await assert.rejects(ot({ otDate: '2026-11-12', startTime: '07:30', endTime: '09:00' }), /cách ca 22:00–07:00 ít nhất 1 giờ/);
    assert.equal((await ot({ otDate: '2026-11-12', startTime: '08:00', endTime: '12:00' })).otHours, 4);
  });

  it('no OT on a leave day', async () => {
    await ctx.repo.save(leaveRequest('2026-11-12', '2026-11-12', 'APPROVED'));
    await assert.rejects(ot(), /Ngày 12\/11 đang nghỉ, không đăng ký OT được/);
    ctx.repo.schedules = [{ date: '2026-11-14', startTime: '08:00', endTime: '17:00', onLeave: true }];
    await assert.rejects(ot({ otDate: '2026-11-14' }), /Ngày 14\/11 đang nghỉ/);
  });

  it('monthly cap of 40 hours', async () => {
    await ctx.repo.save(otRequest('2026-11-02', '18:00', '22:00', 'APPROVED', { otHours: 38 }));
    await ctx.repo.save(otRequest('2026-10-30', '18:00', '22:00', 'APPROVED', { otHours: 30 }));
    await ctx.repo.save(otRequest('2026-11-03', '18:00', '22:00', 'REJECTED', { otHours: 30 }));
    await assert.rejects(
      ot(),
      /Tổng số giờ làm thêm trong tháng 2026-11 không được vượt quá 40 giờ theo Luật Lao động \(đã có 38h, đăng ký thêm 4h\)/
    );
    assert.equal((await ot({ startTime: '18:00', endTime: '20:00' })).otHours, 2);
  });

  it('a month with leave-with-makeup refuses OT', async () => {
    await ctx.repo.save(
      lwmRequest('2026-11-10', '2026-11-10', [
        { date: '2026-11-12', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-16', startTime: '18:00', endTime: '22:00' }
      ])
    );
    await assert.rejects(ot({ otDate: '2026-11-20' }), /Tháng 2026-11 đã có đơn nghỉ có làm bù, không đăng ký OT được/);
    assert.equal((await ot({ otDate: '2026-12-02' })).otDate, '2026-12-02');
  });

  it('a pending shift change moves the shift used for checks', async () => {
    await ctx.repo.save(shiftChange('2026-11-12', '2026-11-12', 'NORMAL', '10:00', '19:00', 'PENDING'));
    await assert.rejects(ot({ startTime: '18:00', endTime: '22:00' }), /cách ca 10:00–19:00 ít nhất 1 giờ/);
    assert.equal((await ot({ startTime: '20:00', endTime: '22:00' })).otHours, 2);
  });

  it('username is stored as uuid, under the employee lock', async () => {
    const dto = await ot();
    assert.deepEqual([dto.employeeId, dto.type, dto.status], [NV_UUID, 'OVERTIME', 'PENDING']);
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
  });

  it('approval writes no schedule', async () => {
    const dto = await ot();
    const reviewed = await ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
    assert.equal(ctx.att.schedules.size, 0);
  });

  it('the controller passes only the OT fields', async () => {
    const seen: unknown[] = [];
    const fake = { createOvertimeRequest: async (input: unknown) => (seen.push(input), { id: 'x' }) } as any;
    await new RequestsController(fake).createOvertime(
      { employeeId: 'nv01', title: 't', reason: 'r', targetDate: '2026-11-12', startTime: '18:00', endTime: '22:00', hours: 9, otRateMultiplier: 1.5 },
      { username: 'admin' } as any
    );
    assert.deepEqual(seen, [
      { employeeId: 'nv01', title: 't', reason: 'r', otDate: undefined, targetDate: '2026-11-12', startTime: '18:00', endTime: '22:00' }
    ]);
  });
});
