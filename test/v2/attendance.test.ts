import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AttendanceController } from '../../src/modules/attendance/attendance.controller';
import { AttendanceRepository, type TimesheetFilter } from '../../src/modules/attendance/attendance.repository';
import { PeriodLockedError } from '../../src/modules/periods/periods.errors';
import { PunchEvent, DailyTimesheet, WorkSchedule } from '../../src/modules/attendance/domain';
import { BadRequestError } from '../../src/common';
import { FakeAttendanceDays } from './helpers/attendance-days-fake';

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

  override async savePunch(event: PunchEvent): Promise<void> {
    this.punches.push(event);
  }

  override async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    return this.punches
      .filter((p) => p.employeeId === employeeId && p.workDate === workDate)
      .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  }

  override async findTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheet | null> {
    return this.timesheets.get(`${employeeId}:${workDate}`) ?? null;
  }

  override async listTimesheets(filter: TimesheetFilter = {}): Promise<DailyTimesheet[]> {
    return [...this.timesheets.values()]
      .filter((t) => !filter.employeeId || t.employeeId === filter.employeeId)
      .filter((t) => !filter.startDate || t.workDate >= filter.startDate)
      .filter((t) => !filter.endDate || t.workDate <= filter.endDate)
      .sort((a, b) => a.workDate.localeCompare(b.workDate));
  }
}

function setup() {
  const repo = new FakeAttendanceRepository();
  const days = new FakeAttendanceDays(repo.timesheets);
  const service = new AttendanceService(repo, days.asService());
  return { repo, days, service };
}

/** Dòng ngày ca đêm 22:00-07:00 đã có lần vào mà chưa có lần ra (như sau khi chấm vào ca đêm). */
function nightRowWithInOnly(employeeId: string, workDate: string): DailyTimesheet {
  return DailyTimesheet.create({
    employeeId,
    workDate,
    shiftType: 'NIGHT',
    shiftStartTime: '22:00',
    shiftEndTime: '07:00',
    actualCheckIn: new Date(`${workDate}T21:55:00+07:00`)
  });
}

describe('AttendanceService.recordPunch - ghi lần chấm rồi để AttendanceDaysService dựng dòng ngày', () => {
  it('lưu lần chấm, gọi refreshDays đúng ngày không kèm giao dịch, trả dòng ngày đọc lại', async () => {
    const { repo, days, service } = setup();
    const emp = randomUUID();

    const result = await service.recordPunch({
      employeeId: emp,
      type: 'IN',
      workDate: '2026-11-04',
      punchedAt: new Date('2026-11-04T08:00:00+07:00')
    });

    assert.equal(repo.punches.length, 1);
    assert.equal(result.punch.type, 'IN');
    assert.equal(result.punch.workDate, '2026-11-04');
    assert.deepEqual(days.calls, [{ employeeId: emp, dates: ['2026-11-04'], opts: undefined }]);
    assert.equal(result.timesheet.employeeId, emp);
    assert.equal(result.timesheet.workDate, '2026-11-04');
  });

  it('không tạo lịch REGULAR trong work_schedules (P5)', async () => {
    const { repo, service } = setup();
    await service.recordPunch({
      employeeId: randomUUID(),
      type: 'IN',
      workDate: '2026-11-15',
      punchedAt: new Date('2026-11-15T09:00:00+07:00')
    });
    assert.equal(repo.schedules.size, 0);
  });

  it('ngày có lịch ON_LEAVE thì ném lỗi, không lưu lần chấm và không gọi refreshDays', async () => {
    const { repo, days, service } = setup();
    const emp = randomUUID();
    const leave = WorkSchedule.create({
      employeeId: emp,
      workDate: '2026-11-04',
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    }).withLeave(randomUUID());
    await repo.saveSchedule(leave);

    await assert.rejects(service.recordPunch({ employeeId: emp, type: 'IN', workDate: '2026-11-04' }), /nghỉ phép/);
    assert.equal(repo.punches.length, 0);
    assert.equal(days.calls.length, 0);
  });

  it('ngày đã khoá thì ném lỗi, không lưu lần chấm và giữ nguyên dòng', async () => {
    const { repo, days, service } = setup();
    const emp = randomUUID();
    const locked = DailyTimesheet.create({
      employeeId: emp,
      workDate: '2026-11-04',
      shiftType: 'NORMAL',
      shiftStartTime: '08:00',
      shiftEndTime: '17:00'
    }).lockForPayroll();
    repo.timesheets.set(`${emp}:2026-11-04`, locked);

    await assert.rejects(service.recordPunch({ employeeId: emp, type: 'IN', workDate: '2026-11-04' }), /khóa/);
    assert.equal(repo.punches.length, 0);
    assert.equal(days.calls.length, 0);
    assert.equal(repo.timesheets.get(`${emp}:2026-11-04`), locked);
  });

  it('không truyền workDate: lần ra sáng sớm sau ca đêm thuộc ngày bắt đầu ca (L21)', async () => {
    const { repo, days, service } = setup();
    const emp = randomUUID();
    repo.timesheets.set(`${emp}:2026-11-03`, nightRowWithInOnly(emp, '2026-11-03'));

    const result = await service.recordPunch({
      employeeId: emp,
      type: 'OUT',
      punchedAt: new Date('2026-11-04T07:05:00+07:00')
    });

    assert.equal(result.punch.workDate, '2026-11-03');
    assert.deepEqual(
      days.calls.map((c) => c.dates),
      [['2026-11-03']]
    );
  });

  it('có truyền workDate thì giữ nguyên ngày đó, không áp L21', async () => {
    const { repo, days, service } = setup();
    const emp = randomUUID();
    repo.timesheets.set(`${emp}:2026-11-03`, nightRowWithInOnly(emp, '2026-11-03'));

    const result = await service.recordPunch({
      employeeId: emp,
      type: 'OUT',
      workDate: '2026-11-04',
      punchedAt: new Date('2026-11-04T07:05:00+07:00')
    });

    assert.equal(result.punch.workDate, '2026-11-04');
    assert.deepEqual(
      days.calls.map((c) => c.dates),
      [['2026-11-04']]
    );
  });

  it('thiếu mã nhân viên hoặc loại chấm sai thì ném lỗi', async () => {
    const { service } = setup();
    await assert.rejects(service.recordPunch({ employeeId: '', type: 'IN' }), /employeeId/);
    await assert.rejects(service.recordPunch({ employeeId: randomUUID(), type: 'X' as any }), /IN/);
  });
});

describe('AttendanceService.recalculateTimesheet / recalculateMonth', () => {
  it('recalculateTimesheet gọi refreshDays cho ngày đó và trả DTO của ngày', async () => {
    const { days, service } = setup();
    const emp = randomUUID();

    const dto = await service.recalculateTimesheet(emp, '2026-11-03');

    assert.deepEqual(days.calls, [{ employeeId: emp, dates: ['2026-11-03'], opts: undefined }]);
    assert.equal(dto.workDate, '2026-11-03');
    assert.equal(dto.employeeId, emp);
  });

  it('recalculateMonth tính lại cả tháng và trả 30 DTO của tháng 11', async () => {
    const { days, service } = setup();
    const emp = randomUUID();

    const dtos = await service.recalculateMonth(emp, '2026-11');

    assert.deepEqual(days.monthCalls, [{ employeeId: emp, month: '2026-11' }]);
    assert.equal(dtos.length, 30);
    assert.equal(dtos[0].workDate, '2026-11-01');
    assert.equal(dtos[29].workDate, '2026-11-30');
  });
});

describe('AttendanceController.recalculateTimesheet (T7)', () => {
  function controllerWith(spy: { day: unknown[][]; month: unknown[][] }) {
    const fakeService = {
      async recalculateTimesheet(employeeId: string, workDate: string) {
        spy.day.push([employeeId, workDate]);
        return { workDate };
      },
      async recalculateMonth(employeeId: string, month: string) {
        spy.month.push([employeeId, month]);
        return [{ workDate: `${month}-01` }];
      }
    };
    return new AttendanceController(fakeService as unknown as AttendanceService);
  }

  async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
    } catch (err: any) {
      assert.ok(err instanceof BadRequestError);
      return err.details?.code;
    }
    return assert.fail('phải ném BadRequestError');
  }

  it('{employeeId, month} trả { timesheets }', async () => {
    const spy = { day: [], month: [] };
    const out = await controllerWith(spy).recalculateTimesheet({ employeeId: 'e1', month: '2026-11' });
    assert.deepEqual(out, { timesheets: [{ workDate: '2026-11-01' }] });
    assert.deepEqual(spy.month, [['e1', '2026-11']]);
    assert.deepEqual(spy.day, []);
  });

  it('{employeeId, workDate} trả { timesheet }', async () => {
    const spy = { day: [], month: [] };
    const out = await controllerWith(spy).recalculateTimesheet({ employeeId: 'e1', workDate: '2026-11-03' });
    assert.deepEqual(out, { timesheet: { workDate: '2026-11-03' } });
    assert.deepEqual(spy.day, [['e1', '2026-11-03']]);
  });

  it('thiếu cả workDate và month → MISSING_PARAMS', async () => {
    const spy = { day: [], month: [] };
    assert.equal(await codeOf(controllerWith(spy).recalculateTimesheet({ employeeId: 'e1' })), 'MISSING_PARAMS');
    assert.equal(
      await codeOf(controllerWith(spy).recalculateTimesheet({ month: '2026-11' } as any)),
      'MISSING_PARAMS'
    );
  });

  it("month '2026-13' → INVALID_MONTH", async () => {
    const spy = { day: [], month: [] };
    assert.equal(
      await codeOf(controllerWith(spy).recalculateTimesheet({ employeeId: 'e1', month: '2026-13' })),
      'INVALID_MONTH'
    );
    assert.deepEqual(spy.month, []);
  });

  it('workDate sai dạng → INVALID_DATE', async () => {
    const spy = { day: [], month: [] };
    assert.equal(
      await codeOf(controllerWith(spy).recalculateTimesheet({ employeeId: 'e1', workDate: '03/11/2026' })),
      'INVALID_DATE'
    );
  });
});

describe('Attendance V2 - workDate must be a real YYYY-MM-DD date', () => {
  // work_date là cột DATE: '20261020' hay ' 2026-10-20' vẫn được PG đọc thành 20/10, nhưng `slice(0, 7)` cho cổng kỳ
  // một tháng rác ('2026102', ' 2026-1') nên lọt qua cổng của tháng đã chốt.
  const BAD = ['20261020', ' 2026-10-20', '2026-10-20 ', '2026-02-30', '2026-13-01'];

  it('a punch with a malformed workDate is a 400 BAD_PUNCH_INPUT and writes nothing', async () => {
    const repo = new FakeAttendanceRepository();
    const ctrl = new AttendanceController(new AttendanceService(repo, new FakeAttendanceDays(repo.timesheets).asService()));
    for (const workDate of BAD) {
      await assert.rejects(ctrl.recordPunch({ employeeId: 'e', type: 'IN', workDate }), (e: any) => {
        assert.equal(e.status, 400, workDate);
        assert.equal(e.details.code, 'BAD_PUNCH_INPUT');
        assert.equal(e.message, `Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${workDate}`);
        return true;
      });
    }
    assert.equal(repo.punches.length, 0);
    assert.equal(repo.schedules.size, 0);
    assert.equal(repo.timesheets.size, 0);
  });

  it('recalculating a malformed workDate is a 400 INVALID_DATE and writes nothing', async () => {
    const repo = new FakeAttendanceRepository();
    const ctrl = new AttendanceController(new AttendanceService(repo, new FakeAttendanceDays(repo.timesheets).asService()));
    for (const workDate of BAD) {
      await assert.rejects(ctrl.recalculateTimesheet({ employeeId: 'e', workDate }), (e: any) => {
        assert.equal(e.status, 400, workDate);
        assert.equal(e.details.code, 'INVALID_DATE');
        assert.equal(e.message, `Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${workDate}`);
        return true;
      });
    }
    assert.equal(repo.timesheets.size, 0);
  });
});

describe('AttendanceController with a locked month', () => {
  it('lets PERIOD_LOCKED through as a 409 on punch and recalculate', async () => {
    const lock = new PeriodLockedError('2026-10', 'attendance_locked');
    const ctrl = new AttendanceController({
      recordPunch: async () => { throw lock; },
      recalculateTimesheet: async () => { throw lock; }
    } as any);
    const isLock = (e: any) => e === lock && e.status === 409 && e.details.code === 'PERIOD_LOCKED';
    await assert.rejects(ctrl.recordPunch({ employeeId: 'e', type: 'IN', workDate: '2026-10-20' }), isLock);
    await assert.rejects(ctrl.recalculateTimesheet({ employeeId: 'e', workDate: '2026-10-20' }), isLock);
  });
});
