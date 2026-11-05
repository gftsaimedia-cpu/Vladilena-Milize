import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { beforeEach, describe, it } from 'node:test';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { PunchRefusedError } from '../../src/modules/attendance/attendance.errors';
import { DailyTimesheet, PunchEvent, WorkSchedule } from '../../src/modules/attendance/domain';
import type { Zone } from '../../src/modules/settings/domain/attendance-zone';
import { checkPunchLocation, isWorkday, payDateOf, SettingsReader } from '../../src/modules/settings';
import { TypeWeekMissingError } from '../../src/modules/settings/settings.errors';

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
  override async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const existing = await this.findSchedule(employeeId, workDate);
    if (existing) return existing;
    const def = WorkSchedule.create({ employeeId, workDate, shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00' });
    await this.saveSchedule(def);
    return def;
  }
  override async savePunch(e: PunchEvent): Promise<void> {
    this.punches.push(e);
  }
  override async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    return this.punches.filter(p => p.employeeId === employeeId && p.workDate === workDate).sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  }
  override async saveTimesheet(t: DailyTimesheet): Promise<void> {
    this.timesheets.set(`${t.employeeId}:${t.workDate}`, t);
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
  let svc: AttendanceService;

  beforeEach(() => {
    zone = null;
    weekdays = [1, 2, 3, 4, 5, 6]; // 04/11/2026 là thứ Tư
    repo = new FakeRepo();
    const settings = { workWeekOf: async () => ({ weekdays }), zone: async () => zone } as any;
    svc = new AttendanceService(repo, undefined, settings);
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
    const ok = await svc.recordPunch({ employeeId: u('e3'), type: 'IN', workDate: '2026-11-04', latitude: 10.7769, longitude: 106.7009 }, { checkZone: true });
    assert.equal(ok.punch.isWithinOffice, true);
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
    assert.equal(await svc.workdayOf(u('binh'), '2026-12-12'), false);
    repo.approved.add(`${u('binh')}:2026-12-12`);
    assert.equal(await svc.workdayOf(u('binh'), '2026-12-12'), true);
    await svc.recordPunch({ employeeId: u('binh'), type: 'IN', workDate: '2026-12-12', latitude: 10.7769, longitude: 106.7009 }, { checkZone: true });
  });

  it('an existing schedule or a shiftConfig makes the day a workday', async () => {
    weekdays = [1, 2, 3, 4, 5];
    await repo.saveSchedule(WorkSchedule.create({ employeeId: u('lich'), workDate: '2026-12-12', shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00' }));
    assert.equal(await svc.workdayOf(u('lich'), '2026-12-12'), true);
    await svc.recordPunch({ employeeId: u('lich'), type: 'IN', workDate: '2026-12-12' });
    await svc.recordPunch({
      employeeId: u('cfg'),
      type: 'IN',
      workDate: '2026-12-12',
      shiftConfig: { shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00' }
    });
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
  });

  it('a type without a work week counts Monday to Saturday', async () => {
    const missing = new AttendanceService(
      repo,
      undefined,
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
    const broken = new AttendanceService(repo, undefined, { workWeekOf: async () => Promise.reject(boom), zone: async () => null } as any);
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
    const plain = new AttendanceService(repo);
    await plain.recordPunch({ employeeId: u('old'), type: 'IN', workDate: '2026-12-13' }, { checkZone: true });
    assert.equal(await plain.workdayOf(u('old'), '2026-12-13'), true);
  });
});
