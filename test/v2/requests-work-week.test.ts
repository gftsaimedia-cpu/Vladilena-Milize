import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SHIFT, SHIFT_CATALOG } from '../../src/common/shift-catalog';
import { SHIFT_FRAMES, findShiftFrame } from '../../src/modules/requests/domain/shift-frames';
import { withPersonWeek } from '../../src/modules/requests/staff-week';
import type { SettingsReader } from '../../src/modules/settings';
import { NV_UUID, makeService, staffContext, timesheet } from './helpers/requests-fakes';

type Settings = Pick<SettingsReader, 'workWeekOf'>;

/** Đọc cài đặt giả: người trong `own` có tuần riêng, còn lại theo tuần của loại (T2–T7). Ghi lại mọi lần gọi. */
function fakeSettings(own: Record<string, number[]> = {}) {
  const calls: Array<[string, string]> = [];
  const settings: Settings = {
    async workWeekOf(employeeUuid, month) {
      calls.push([employeeUuid, month]);
      const typeWeekdays = [1, 2, 3, 4, 5, 6];
      const weekdays = own[employeeUuid] ?? typeWeekdays;
      return {
        weekdays,
        source: own[employeeUuid] ? 'own' : 'type',
        standardWorkdays: weekdays.length * 4,
        from: null,
        typeWeekdays,
        typeStandardWorkdays: 24
      };
    }
  };
  return { settings, calls };
}

const BINH_WEEK = [1, 2, 3, 4, 5];
const leave = (service: ReturnType<typeof makeService>['service']) =>
  service.createLeaveRequest({
    employeeId: 'nv01',
    title: 'Nghỉ',
    reason: 'Việc nhà',
    leaveType: 'ANNUAL',
    startDate: '2026-12-07',
    endDate: '2026-12-13'
  } as any);

describe('Đơn nghỉ theo tuần làm của từng người', () => {
  it('counts 5 days when the person works Monday to Friday (Saturday 12/12 is off)', async () => {
    const { settings, calls } = fakeSettings({ [NV_UUID]: BINH_WEEK });
    const ctx = makeService(settings);
    const dto = await leave(ctx.service);
    assert.equal(dto.leaveDaysCount, 5);
    assert.deepEqual(calls, [[NV_UUID, '2026-12']]);
  });

  it('counts 6 days when the person has no own week (type week Monday to Saturday)', async () => {
    const { settings } = fakeSettings();
    const ctx = makeService(settings);
    assert.equal((await leave(ctx.service)).leaveDaysCount, 6);
  });

  it('counts 6 days when no settings reader is wired (hand-built service)', async () => {
    const ctx = makeService();
    assert.equal((await leave(ctx.service)).leaveDaysCount, 6);
  });

  it('a holiday on the off-Saturday adds no leave day', async () => {
    const { settings } = fakeSettings({ [NV_UUID]: BINH_WEEK });
    const ctx = makeService(settings);
    ctx.holidays.dates.push({ date: '2026-12-12', name: 'Ngày lễ thử' });
    assert.equal((await leave(ctx.service)).leaveDaysCount, 5);
  });

  it('a holiday on a worked Saturday removes that day for a Monday-to-Saturday person', async () => {
    const { settings } = fakeSettings();
    const ctx = makeService(settings);
    ctx.holidays.dates.push({ date: '2026-12-12', name: 'Ngày lễ thử' });
    assert.equal((await leave(ctx.service)).leaveDaysCount, 5);
  });
});

describe('Ngày cần giải trình theo tuần làm của từng người', () => {
  // Thứ Bảy 31/10/2026 có vào 08:00 mà không có giờ ra; hôm nay là 04/11. Chỉ xét ngày thứ Bảy đó có nằm trong danh sách không.
  const saturdayDue = async (settings?: Settings) => {
    const ctx = makeService(settings);
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-10-01' }));
    ctx.att.timesheets.push(timesheet('2026-10-31', '08:00', null));
    return (await ctx.explanations.dueDays('nv01')).some(d => d.date === '2026-10-31');
  };

  it('Saturday is due for a Monday-to-Saturday person, not for a Monday-to-Friday one', async () => {
    assert.equal(await saturdayDue(fakeSettings().settings), true);
    assert.equal(await saturdayDue(fakeSettings({ [NV_UUID]: BINH_WEEK }).settings), false);
  });
});

describe('withPersonWeek', () => {
  it('replaces regularDows with the person week of the same month', async () => {
    const { settings, calls } = fakeSettings({ [NV_UUID]: BINH_WEEK });
    const staff = staffContext();
    const out = await withPersonWeek(staff, '2026-12', settings);
    assert.deepEqual(out.regularDows, BINH_WEEK);
    assert.deepEqual(staff.regularDows, [1, 2, 3, 4, 5, 6], 'the input context is not mutated');
    assert.deepEqual(calls, [[NV_UUID, '2026-12']]);
  });

  it('leaves an unconfigured type (regularDows null) alone and does not read settings', async () => {
    const { settings, calls } = fakeSettings({ [NV_UUID]: BINH_WEEK });
    const staff = staffContext({ regularDows: null });
    const out = await withPersonWeek(staff, '2026-12', settings);
    assert.equal(out, staff);
    assert.equal(out.regularDows, null);
    assert.deepEqual(calls, []);
  });

  it('returns the context unchanged without a settings reader', async () => {
    const staff = staffContext();
    assert.equal(await withPersonWeek(staff, '2026-12'), staff);
  });
});

describe('Khung ca của đơn đổi ca', () => {
  it('SHIFT_FRAMES are the six catalog shifts, in order', () => {
    assert.equal(SHIFT_FRAMES.length, 6);
    assert.deepEqual(
      SHIFT_FRAMES,
      SHIFT_CATALOG.map(({ shiftType, startTime, endTime }) => ({ shiftType, startTime, endTime }))
    );
    assert.deepEqual(findShiftFrame('NIGHT', '21:00'), { shiftType: 'NIGHT', startTime: '21:00', endTime: '06:00' });
    assert.equal(findShiftFrame('NIGHT', '08:00'), null);
  });

  it('the default shift is the first catalog shift', () => {
    assert.deepEqual({ startTime: DEFAULT_SHIFT.startTime, endTime: DEFAULT_SHIFT.endTime }, { startTime: '08:00', endTime: '17:00' });
  });
});
