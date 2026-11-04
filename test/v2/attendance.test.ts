import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { PunchEvent, DailyTimesheet, WorkSchedule } from '../../src/modules/attendance/domain';

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
    const existing = await this.findSchedule(employeeId, workDate);
    if (existing) return existing;
    const def = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00',
    });
    await this.saveSchedule(def);
    return def;
  }

  override async savePunch(event: PunchEvent): Promise<void> {
    this.punches.push(event);
  }

  override async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    return this.punches
      .filter((p) => p.employeeId === employeeId && p.workDate === workDate)
      .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  }

  override async saveTimesheet(timesheet: DailyTimesheet): Promise<void> {
    const key = `${timesheet.employeeId}:${timesheet.workDate}`;
    this.timesheets.set(key, timesheet);
  }

  override async findTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheet | null> {
    return this.timesheets.get(`${employeeId}:${workDate}`) ?? null;
  }
}

describe('Attendance V2 - Check In / Check Out & Timesheet Calculation', () => {
  const repo = new FakeAttendanceRepository();
  const service = new AttendanceService(repo);
  const emp1 = randomUUID();
  const emp2 = randomUUID();

  it('1. Check-in đúng giờ ghi nhận punch IN và khởi tạo bảng công', async () => {
    const result = await service.recordPunch({
      employeeId: emp1,
      type: 'IN',
      workDate: '2026-11-04',
      punchedAt: new Date('2026-11-04T08:00:00Z'),
    });

    assert.equal(result.punch.type, 'IN');
    assert.equal(result.timesheet.employeeId, emp1);
    assert.equal(result.timesheet.workDate, '2026-11-04');
    assert.equal(result.timesheet.checkInStatus, 'VALID');
    assert.equal(result.timesheet.status, 'ABSENT'); // Chưa có OUT -> chưa đủ cặp
    assert.equal(result.timesheet.metrics.workHours, 0);
  });

  it('2. Check-out đúng giờ ghi nhận punch OUT và tính đủ 8 giờ công', async () => {
    const result = await service.recordPunch({
      employeeId: emp1,
      type: 'OUT',
      workDate: '2026-11-04',
      punchedAt: new Date('2026-11-04T17:00:00Z'),
    });

    assert.equal(result.punch.type, 'OUT');
    assert.equal(result.timesheet.checkOutStatus, 'VALID');
    assert.equal(result.timesheet.status, 'PRESENT');
    assert.equal(result.timesheet.metrics.workHours, 9);
    assert.equal(result.timesheet.metrics.workUnits, 1);
  });

  it('3. Check-in trễ 30 phút và Check-out ghi nhận lateMinutes = 30 và PRESENT', async () => {
    await service.recordPunch({
      employeeId: emp2,
      type: 'IN',
      workDate: '2026-11-04',
      punchedAt: new Date('2026-11-04T08:30:00Z'),
    });
    const result = await service.recordPunch({
      employeeId: emp2,
      type: 'OUT',
      workDate: '2026-11-04',
      punchedAt: new Date('2026-11-04T17:00:00Z'),
    });

    assert.equal(result.timesheet.metrics.lateMinutes, 30);
    assert.equal(result.timesheet.status, 'PRESENT');
  });

  it('4. Recalculate timesheet tính lại chính xác', async () => {
    const recalculated = await service.recalculateTimesheet(emp1, '2026-11-04');
    assert.equal(recalculated.metrics.workHours, 9);
    assert.equal(recalculated.status, 'PRESENT');
  });
});
