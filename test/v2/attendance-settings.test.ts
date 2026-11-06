import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { beforeEach, describe, it } from 'node:test';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { PunchRefusedError } from '../../src/modules/attendance/attendance.errors';
import { DailyTimesheet, PunchEvent, WorkSchedule } from '../../src/modules/attendance/domain';
import { employeeLockKey } from '../../src/modules/attendance/attendance-days.service';
import type { DatabaseTransaction, TransactionCoordinator } from '../../src/database';
import type { Zone } from '../../src/modules/settings/domain/attendance-zone';
import { checkPunchLocation, isWorkday, payDateOf, SettingsReader } from '../../src/modules/settings';
import { TypeWeekMissingError } from '../../src/modules/settings/settings.errors';
import { FakeAttendanceDays } from './helpers/attendance-days-fake';

class FakeRepo extends AttendanceRepository {
  punches: PunchEvent[] = [];
  timesheets = new Map<string, DailyTimesheet>();
  schedules = new Map<string, WorkSchedule>();
  approved = new Set<string>();

  constructor() {
    super({} as any);
  }
  override async hasApprovedWorkOn(employeeId: string, date: string): Promise<boolean> {
    return this.approved.has(`${employeeId}:${date}`);
  }
  override async saveSchedule(s: WorkSchedule): Promise<void> {
    this.schedules.set(`${s.employeeId}:${s.workDate}`, s);
  }
  override async findSchedule(employeeId: string, workDate: string): Promise<WorkSchedule | null> {
    return this.schedules.get(`${employeeId}:${workDate}`) ?? null;
  }
  override async findEmployment(): Promise<{ startDate: string | null; resignedOn: string | null } | null> {
    return null; // fake không có hồ sơ vào làm/nghỉ việc
  }

  override async savePunch(e: PunchEvent): Promise<void> {
    this.punches.push(e);
  }
  override async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    return this.punches.filter(p => p.employeeId === employeeId && p.workDate === workDate).sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  }
  override async findTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheet | null> {
    return this.timesheets.get(`${employeeId}:${workDate}`) ?? null;
  }
}

// PunchEvent wants UUID ids: one stable UUID per short name.
const ids = new Map<string, string>();
const u = (name: string): string => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};

async function refused(p: Promise<unknown>, code: string, message?: string, details?: Record<string, number>) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof PunchRefusedError, String(e));
    assert.equal(e.code, code);
    if (message !== undefined) assert.equal(e.message, message);
    if (details !== undefined) assert.deepEqual(e.details, details);
    return true;
  });
}

describe('Attendance punches against settings', () => {
  let zone: Zone | null;
  let weekdays: number[];
  let repo: FakeRepo;
  let days: FakeAttendanceDays;
  let svc: AttendanceService;

  beforeEach(() => {
    zone = null;
    weekdays = [1, 2, 3, 4, 5, 6]; // 04/11/2026 là thứ Tư
    repo = new FakeRepo();
    days = new FakeAttendanceDays(repo.timesheets);
    const settings = { workWeekOf: async () => ({ weekdays }), zone: async () => zone } as any;
    svc = new AttendanceService(repo, days.asService(), settings);
  });

  it('staff punches outside the zone or without a position are refused and leave nothing behind', async () => {
    zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
    await refused(
      svc.recordPunch({ employeeId: u('e3'), type: 'IN', workDate: '2026-11-04', latitude: 10.78229593, longitude: 106.7009 }, { checkZone: true }),
      'OUTSIDE_ZONE',
      'Bạn đang cách văn phòng 600 m',
      { distanceM: 600, radiusM: 150 }
    );
    await refused(svc.recordPunch({ employeeId: u('e3'), type: 'IN', workDate: '2026-11-04' }, { checkZone: true }), 'NO_LOCATION', 'Không lấy được vị trí', {});
    await refused(svc.recordPunch({ employeeId: u('e3'), type: 'IN', workDate: '2026-11-04', latitude: 0, longitude: 0 }, { checkZone: true }), 'OUTSIDE_ZONE');
    assert.equal(repo.schedules.size, 0);
    assert.equal(repo.punches.length, 0);
    assert.equal(days.calls.length, 0); // bị từ chối thì không dựng lại dòng ngày nào
    const ok = await svc.recordPunch({ employeeId: u('e3'), type: 'IN', workDate: '2026-11-04', latitude: 10.7769, longitude: 106.7009 }, { checkZone: true });
    assert.equal(ok.punch.isWithinOffice, true);
    assert.deepEqual(days.calls.map(c => [c.employeeId, c.dates]), [[u('e3'), ['2026-11-04']]]);
    assert.equal(ok.timesheet.workDate, '2026-11-04');
    await svc.recordPunch({ employeeId: u('e4'), type: 'IN', workDate: '2026-11-04', latitude: 10.78229593, longitude: 106.7009 }); // Admin chấm thay: không kiểm vùng
    zone = null;
    await svc.recordPunch({ employeeId: u('e5'), type: 'IN', workDate: '2026-11-04' }, { checkZone: true });
  });

  it('check-in on a day outside the week needs an approved request or a schedule', async () => {
    weekdays = [1, 2, 3, 4, 5];
    zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
    await refused(
      svc.recordPunch({ employeeId: u('binh'), type: 'IN', workDate: '2026-12-12', latitude: 10.78229593, longitude: 106.7009 }, { checkZone: true }),
      'NOT_A_WORKDAY',
      'Hôm nay không phải ngày làm của bạn',
      {}
    ); // NOT_A_WORKDAY đứng trước OUTSIDE_ZONE
    await refused(svc.recordPunch({ employeeId: u('binh'), type: 'IN', workDate: '2026-12-12' }), 'NOT_A_WORKDAY'); // Admin chấm thay vẫn bị chặn
    assert.equal(repo.schedules.size, 0);
    assert.equal(repo.punches.length, 0);
    assert.equal(days.calls.length, 0);
    assert.equal(await svc.workdayOf(u('binh'), '2026-12-12'), false);
    repo.approved.add(`${u('binh')}:2026-12-12`);
    assert.equal(await svc.workdayOf(u('binh'), '2026-12-12'), true);
    await svc.recordPunch({ employeeId: u('binh'), type: 'IN', workDate: '2026-12-12', latitude: 10.7769, longitude: 106.7009 }, { checkZone: true });
  });

  it('an approved non-REGULAR schedule (shift change, makeup, OT) makes the day a workday; a shiftConfig does not (P5)', async () => {
    weekdays = [1, 2, 3, 4, 5];
    const types = ['SHIFT_CHANGE', 'MAKE_UP', 'OVERTIME'] as const;
    for (const scheduleType of types) {
      const id = u(`lich-${scheduleType}`);
      await repo.saveSchedule(
        WorkSchedule.create({ employeeId: id, workDate: '2026-12-12', shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00', scheduleType })
      );
      assert.equal(await svc.workdayOf(id, '2026-12-12'), true, scheduleType); // thứ Bảy ngoài tuần T2–T6
      await svc.recordPunch({ employeeId: id, type: 'IN', workDate: '2026-12-12' });
    }
    assert.equal(repo.punches.length, types.length);
    // `shiftConfig` đã bỏ khỏi RecordPunchInput (P5): gửi kèm cũng không mở ngày nghỉ và không tạo lịch.
    await refused(
      svc.recordPunch({
        employeeId: u('cfg'),
        type: 'IN',
        workDate: '2026-12-12',
        shiftConfig: { shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00' }
      } as any),
      'NOT_A_WORKDAY'
    );
    assert.equal(repo.schedules.size, types.length);
  });

  it('a legacy REGULAR schedule row is not a workday: the week comes from the settings only (FP4)', async () => {
    weekdays = [1, 2, 3, 4, 5];
    const sunday = '2026-12-13';
    const saturday = '2026-12-12';
    for (const date of [saturday, sunday]) {
      await repo.saveSchedule(WorkSchedule.create({ employeeId: u('cu'), workDate: date, shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00' })); // REGULAR, PLANNED
    }
    assert.equal(await svc.workdayOf(u('cu'), sunday), false);
    assert.equal(await svc.workdayOf(u('cu'), saturday), false); // ngoài tuần T2–T6 của cài đặt
    await refused(svc.recordPunch({ employeeId: u('cu'), type: 'IN', workDate: sunday }), 'NOT_A_WORKDAY');
    assert.equal(repo.punches.length, 0);
    // Trong tuần làm thì vẫn là ngày làm, do cài đặt.
    await repo.saveSchedule(WorkSchedule.create({ employeeId: u('cu'), workDate: '2026-12-11', shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00' }));
    assert.equal(await svc.workdayOf(u('cu'), '2026-12-11'), true);
    // Đơn đã duyệt vẫn mở ngày ngoài tuần dù có dòng REGULAR.
    repo.approved.add(`${u('cu')}:${sunday}`);
    assert.equal(await svc.workdayOf(u('cu'), sunday), true);
    await svc.recordPunch({ employeeId: u('cu'), type: 'IN', workDate: sunday });
    assert.equal(repo.punches.length, 1);
  });

  it('a day with approved leave (ON_LEAVE schedule) is not a workday', async () => {
    weekdays = [1, 2, 3, 4, 5];
    await repo.saveSchedule(
      WorkSchedule.create({ employeeId: u('nghi'), workDate: '2026-12-09', shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00', status: 'ON_LEAVE' })
    );
    assert.equal(await svc.workdayOf(u('nghi'), '2026-12-09'), false); // thứ Tư trong tuần làm
    await repo.saveSchedule(WorkSchedule.create({ employeeId: u('nghi'), workDate: '2026-12-10', shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00' }));
    assert.equal(await svc.workdayOf(u('nghi'), '2026-12-10'), true);
  });

  it('a night-shift check-out on an off day is not refused (Review Focus 2)', async () => {
    weekdays = [1, 2, 3, 4, 5];
    zone = null;
    await svc.recordPunch({ employeeId: u('dem'), type: 'OUT', workDate: '2026-12-12', punchedAt: new Date('2026-12-12T06:30:00Z') }, { checkZone: true });
    assert.equal(repo.schedules.size, 0); // lần ra không tạo lịch nên không mở ngày nghỉ cho lần vào sau (P5)
    await refused(svc.recordPunch({ employeeId: u('dem'), type: 'IN', workDate: '2026-12-12' }), 'NOT_A_WORKDAY');
  });

  it('settings checks run inside the employee lock, on its transaction, before the punch is saved', async () => {
    weekdays = [1, 2, 3, 4, 5];
    const seen: Array<[string, unknown]> = [];
    const TRX = { trx: 'lock' } as unknown as DatabaseTransaction;
    const base = new FakeRepo();
    // Bản repo trên giao dịch: dùng chung dữ liệu với `base`, ghi lại giao dịch mà hasApprovedWorkOn chạy trên.
    (base as any).withTransaction = (trx: unknown) => {
      const bound = Object.create(base) as FakeRepo;
      bound.hasApprovedWorkOn = async (employeeId: string, date: string) => {
        seen.push(['hasApprovedWorkOn', trx]);
        return base.hasApprovedWorkOn(employeeId, date);
      };
      return bound;
    };
    const keys: string[] = [];
    const coordinator = {
      withLock: async (key: string, fn: (trx: DatabaseTransaction) => Promise<unknown>) => {
        keys.push(key);
        return await fn(TRX);
      }
    } as unknown as TransactionCoordinator;
    const settings = {
      workWeekOf: async (_id: string, month: string, q?: unknown) => {
        seen.push([`workWeekOf ${month}`, q]);
        return { weekdays };
      },
      zone: async (q?: unknown) => {
        seen.push(['zone', q]);
        return null;
      }
    } as any;
    const lockedDays = new FakeAttendanceDays(base.timesheets);
    const locked = new AttendanceService(base, lockedDays.asService(), settings, coordinator);
    const saturday = new Date('2026-12-12T09:00:00+07:00'); // không truyền workDate: ngày công theo giờ VN của lần chấm

    await refused(locked.recordPunch({ employeeId: u('khoa'), type: 'IN', punchedAt: saturday }, { checkZone: true }), 'NOT_A_WORKDAY');
    assert.deepEqual(keys, [employeeLockKey(u('khoa'))]);
    assert.deepEqual(seen, [
      ['workWeekOf 2026-12', TRX],
      ['hasApprovedWorkOn', TRX]
    ]);
    assert.equal(base.punches.length, 0);
    assert.equal(lockedDays.calls.length, 0);

    seen.length = 0;
    base.approved.add(`${u('khoa')}:2026-12-12`);
    const ok = await locked.recordPunch({ employeeId: u('khoa'), type: 'IN', punchedAt: saturday }, { checkZone: true });
    assert.deepEqual(seen, [
      ['workWeekOf 2026-12', TRX],
      ['hasApprovedWorkOn', TRX],
      ['zone', TRX]
    ]);
    assert.equal(base.punches.length, 1);
    assert.equal(ok.punch.workDate, '2026-12-12');
    assert.deepEqual(lockedDays.calls.map(c => [c.dates, c.opts]), [[['2026-12-12'], { trx: TRX }]]);
  });

  it('a type without a work week counts Monday to Saturday', async () => {
    const missing = new AttendanceService(
      repo,
      days.asService(),
      {
        workWeekOf: async () => {
          throw new TypeWeekMissingError('ql', '2026-12');
        },
        zone: async () => null
      } as any
    );
    assert.equal(await missing.workdayOf(u('ql'), '2026-12-13'), false); // Chủ nhật
    assert.equal(await missing.workdayOf(u('ql'), '2026-12-14'), true); // thứ Hai
    await refused(missing.recordPunch({ employeeId: u('ql'), type: 'IN', workDate: '2026-12-13' }), 'NOT_A_WORKDAY');
    await missing.recordPunch({ employeeId: u('ql'), type: 'IN', workDate: '2026-12-14' });
  });

  it('any other work week failure is not swallowed', async () => {
    const boom = new Error('db');
    const broken = new AttendanceService(repo, days.asService(), { workWeekOf: async () => Promise.reject(boom), zone: async () => null } as any);
    await assert.rejects(broken.workdayOf(u('x'), '2026-12-14'), (e: any) => e === boom);
  });

  it('the settings reader is a required dependency: Nest fails at boot instead of skipping the checks', () => {
    const optional: number[] = Reflect.getMetadata('optional:paramtypes', AttendanceService) ?? [];
    const injected: Array<{ index: number; param: unknown }> = Reflect.getMetadata('self:paramtypes', AttendanceService);
    assert.equal(injected.find(i => i.index === 2)?.param, SettingsReader);
    assert.equal(optional.includes(2), false);
  });

  it('the settings module index exports the pure helpers other modules use', () => {
    assert.equal(typeof payDateOf, 'function');
    assert.equal(typeof checkPunchLocation, 'function');
    assert.equal(typeof isWorkday, 'function');
    assert.equal(typeof SettingsReader, 'function');
  });

  it('without settings the service keeps the old behaviour', async () => {
    const plain = new AttendanceService(repo, days.asService());
    await plain.recordPunch({ employeeId: u('old'), type: 'IN', workDate: '2026-12-13' }, { checkZone: true });
    assert.equal(await plain.workdayOf(u('old'), '2026-12-13'), true);
  });
});
