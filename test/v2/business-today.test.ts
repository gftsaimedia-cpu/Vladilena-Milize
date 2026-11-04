import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { DailyTimesheet, PunchEvent, WorkSchedule } from '../../src/modules/attendance/domain';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { IsatProfile, RequestsRepository } from '../../src/modules/requests/requests.repository';
import { SystemRequest } from '../../src/modules/requests/domain';
import { businessDateText, businessMonthText } from '../../src/common/business-date';

// "Hôm nay" / "tháng này" luôn theo giờ Việt Nam, máy chủ đặt TZ gì cũng vậy (Docker chạy UTC).
// 06:30 sáng 07/11 giờ Việt Nam = 23:30 ngày 06/11 theo UTC.
const EARLY_MORNING_VN = Date.parse('2026-11-06T23:30:00.000Z');
// 05:00 sáng 01/12 giờ Việt Nam = 22:00 ngày 30/11 theo UTC.
const FIRST_OF_MONTH_VN = Date.parse('2026-11-30T22:00:00.000Z');
const SERVER_ZONES = ['Asia/Ho_Chi_Minh', 'UTC'];
const EMPLOYEE_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

const originalTz = process.env.TZ;

function runAt(zone: string, now: number): void {
  process.env.TZ = zone;
  mock.timers.enable({ apis: ['Date'], now });
}

afterEach(() => {
  mock.timers.reset();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

class FakeAttendanceRepository extends AttendanceRepository {
  punches: PunchEvent[] = [];
  timesheets: Map<string, DailyTimesheet> = new Map();
  schedules: Map<string, WorkSchedule> = new Map();

  constructor() {
    super({} as any);
  }

  override async saveSchedule(schedule: WorkSchedule): Promise<void> {
    this.schedules.set(`${schedule.employeeId}:${schedule.workDate}`, schedule);
  }

  override async findSchedule(employeeId: string, workDate: string): Promise<WorkSchedule | null> {
    return this.schedules.get(`${employeeId}:${workDate}`) ?? null;
  }

  override async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const def = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });
    await this.saveSchedule(def);
    return def;
  }

  override async savePunch(event: PunchEvent): Promise<void> {
    this.punches.push(event);
  }

  override async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    return this.punches.filter((p) => p.employeeId === employeeId && p.workDate === workDate);
  }

  override async saveTimesheet(timesheet: DailyTimesheet): Promise<void> {
    this.timesheets.set(`${timesheet.employeeId}:${timesheet.workDate}`, timesheet);
  }

  override async findTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheet | null> {
    return this.timesheets.get(`${employeeId}:${workDate}`) ?? null;
  }
}

class FakeRequestsRepository extends RequestsRepository {
  requests: Map<string, SystemRequest> = new Map();
  profileMonths: string[] = [];

  constructor() {
    super({} as any);
  }

  override async save(request: SystemRequest): Promise<void> {
    this.requests.set(request.id, request);
  }

  override async findIsatProfile(_id: string, month: string): Promise<IsatProfile | null> {
    this.profileMonths.push(month);
    return null;
  }
}

describe('Hôm nay / tháng này theo giờ Việt Nam', () => {
  for (const zone of SERVER_ZONES) {
    it(`chấm công không gửi workDate lúc 06:30 sáng 07/11 thì ghi vào 07/11 (TZ=${zone})`, async () => {
      runAt(zone, EARLY_MORNING_VN);
      const repo = new FakeAttendanceRepository();
      const service = new AttendanceService(repo);

      const result = await service.recordPunch({ employeeId: EMPLOYEE_ID, type: 'IN' });

      assert.equal(result.punch.workDate, '2026-11-07');
      assert.equal(result.timesheet.workDate, '2026-11-07');
    });

    it(`đơn tạm ứng không gửi kỳ lúc 05:00 sáng 01/12 thì lấy kỳ 2026-12 (TZ=${zone})`, async () => {
      runAt(zone, FIRST_OF_MONTH_VN);
      const service = new RequestsService(new FakeRequestsRepository(), new FakeAttendanceRepository());

      const dto = await service.createAdvanceRequest({
        employeeId: 'emp-1',
        title: 'Tạm ứng',
        reason: 'Chi tiêu đột xuất',
        amount: 1000000
      });

      assert.equal(dto.advancePeriod, '2026-12');
    });

    it(`đơn iSAT nộp lúc 05:00 sáng 01/12 thì tra hồ sơ tháng 2026-12 (TZ=${zone})`, async () => {
      runAt(zone, FIRST_OF_MONTH_VN);
      const reqRepo = new FakeRequestsRepository();
      const service = new RequestsService(reqRepo, new FakeAttendanceRepository());

      await assert.rejects(service.createIsatRequest({ employeeId: 'emp-1' }), /Không tìm thấy nhân sự/);

      assert.deepEqual(reqRepo.profileMonths, ['2026-12']);
    });
  }
});

describe('businessDateText / businessMonthText', () => {
  for (const zone of SERVER_ZONES) {
    it(`sang ngày mới đúng lúc 00:00 giờ Việt Nam (TZ=${zone})`, () => {
      process.env.TZ = zone;
      // 23:59:59 ngày 30/11 giờ Việt Nam, rồi 00:00 ngày 01/12.
      assert.equal(businessDateText(new Date('2026-11-30T16:59:59.999Z')), '2026-11-30');
      assert.equal(businessDateText(new Date('2026-11-30T17:00:00.000Z')), '2026-12-01');
      assert.equal(businessMonthText(new Date('2026-11-30T16:59:59.999Z')), '2026-11');
      assert.equal(businessMonthText(new Date('2026-11-30T17:00:00.000Z')), '2026-12');
    });
  }

  it('mặc định lấy thời điểm hiện tại', () => {
    runAt('UTC', FIRST_OF_MONTH_VN);
    assert.equal(businessDateText(), '2026-12-01');
    assert.equal(businessMonthText(), '2026-12');
  });
});
