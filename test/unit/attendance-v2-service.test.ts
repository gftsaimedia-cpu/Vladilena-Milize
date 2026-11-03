import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AttendanceV2Service } from '../../src/modules/attendance-v2/attendance-v2.service';
import { AttendanceV2Controller } from '../../src/modules/attendance-v2/attendance-v2.controller';
import { AttendanceV2Repository } from '../../src/data/attendance-v2.repository';
import { PunchEvent, DailyTimesheet, GeoLocation } from '../../src/domain/attendance-v2';

/**
 * In-memory repository fake for high-speed unit testing of domain service flows
 */
class InMemoryAttendanceV2Repository extends AttendanceV2Repository {
  punches: PunchEvent[] = [];
  timesheets: Map<string, DailyTimesheet> = new Map();

  constructor() {
    super({} as any);
  }

  override async savePunch(event: PunchEvent): Promise<void> {
    this.punches.push(event);
  }

  override async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    return this.punches
      .filter(p => p.employeeId === employeeId && p.workDate === workDate)
      .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  }

  override async saveTimesheet(timesheet: DailyTimesheet): Promise<void> {
    const key = `${timesheet.employeeId}:${timesheet.workDate}`;
    this.timesheets.set(key, timesheet);
  }

  override async findTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheet | null> {
    const key = `${employeeId}:${workDate}`;
    return this.timesheets.get(key) || null;
  }

  override async findTimesheetById(id: string): Promise<DailyTimesheet | null> {
    for (const ts of this.timesheets.values()) {
      if (ts.id === id) return ts;
    }
    return null;
  }

  override async listTimesheets(
    filter: {
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    } = {}
  ): Promise<DailyTimesheet[]> {
    let list = Array.from(this.timesheets.values());
    if (filter.employeeId) list = list.filter(t => t.employeeId === filter.employeeId);
    if (filter.startDate) list = list.filter(t => t.workDate >= filter.startDate!);
    if (filter.endDate) list = list.filter(t => t.workDate <= filter.endDate!);
    if (filter.status) list = list.filter(t => t.status === filter.status);
    return list.sort((a, b) => a.workDate.localeCompare(b.workDate));
  }

  override async lockTimesheets(employeeId: string, startDate: string, endDate: string): Promise<number> {
    let count = 0;
    for (const [key, ts] of this.timesheets.entries()) {
      if (ts.employeeId === employeeId && ts.workDate >= startDate && ts.workDate <= endDate && !ts.isLocked) {
        this.timesheets.set(key, ts.lockForPayroll());
        count++;
      }
    }
    return count;
  }
}

describe('AttendanceV2Service', () => {
  const employeeId = randomUUID();
  const workDate = '2026-11-03';
  const officeCoords = { latitude: 10.7725, longitude: 106.698, maxDistanceMeters: 100 };

  it('luồng chấm công đúng giờ (08:00 - 17:00 ca chuẩn)', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);

    // Punch IN lúc 08:00
    const inResult = await service.recordPunch({
      employeeId,
      type: 'IN',
      workDate,
      punchedAt: new Date(`${workDate}T08:00:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      note: 'Vào ca đúng giờ',
      officeLocation: officeCoords,
      shiftConfig: {
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        shiftAllowancePct: 0
      }
    });

    assert.equal(inResult.punch.type, 'IN');
    assert.equal(inResult.punch.isWithinOffice, true);
    assert.equal(inResult.timesheet.status, 'ABSENT'); // Chưa có OUT -> chưa đủ cặp punch
    assert.equal(inResult.timesheet.metrics.workHours, 0);

    // Punch OUT lúc 17:00
    const outResult = await service.recordPunch({
      employeeId,
      type: 'OUT',
      workDate,
      punchedAt: new Date(`${workDate}T17:00:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      note: 'Hết ca đúng giờ',
      officeLocation: officeCoords
    });

    assert.equal(outResult.punch.type, 'OUT');
    assert.equal(outResult.timesheet.status, 'PRESENT');
    assert.equal(outResult.timesheet.metrics.workUnits, 1.0);
    assert.equal(outResult.timesheet.metrics.lateMinutes, 0);
    assert.equal(outResult.timesheet.metrics.earlyMinutes, 0);
    assert.equal(outResult.timesheet.metrics.otHours, 0);

    const finalTimesheet = await service.getTimesheet(employeeId, workDate);
    assert.ok(finalTimesheet);
    assert.equal(finalTimesheet.status, 'PRESENT');
    assert.equal(finalTimesheet.metrics.workUnits, 1.0);
  });

  it('luồng đi trễ: ghi nhận số phút đi trễ (lateMinutes)', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);

    // IN lúc 08:35 (trễ 35 phút)
    await service.recordPunch({
      employeeId,
      workDate,
      type: 'IN',
      punchedAt: new Date(`${workDate}T08:35:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      officeLocation: officeCoords,
      shiftConfig: {
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      }
    });

    // OUT lúc 17:00
    const outResult = await service.recordPunch({
      employeeId,
      workDate,
      type: 'OUT',
      punchedAt: new Date(`${workDate}T17:00:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      officeLocation: officeCoords
    });

    assert.equal(outResult.timesheet.metrics.lateMinutes, 35);
    assert.equal(outResult.timesheet.metrics.earlyMinutes, 0);
    assert.equal(outResult.timesheet.status, 'PRESENT');
  });

  it('luồng về trễ tăng ca (OT): tính đúng otHours', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);

    // IN lúc 08:00
    await service.recordPunch({
      employeeId,
      workDate,
      type: 'IN',
      punchedAt: new Date(`${workDate}T08:00:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      officeLocation: officeCoords,
      shiftConfig: {
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      }
    });

    // OUT lúc 19:30 (ca kết thúc 17:00 -> OT 2.5 giờ)
    const outResult = await service.recordPunch({
      employeeId,
      workDate,
      type: 'OUT',
      punchedAt: new Date(`${workDate}T19:30:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      officeLocation: officeCoords
    });

    assert.equal(outResult.timesheet.metrics.otHours, 2.5);
    assert.equal(outResult.timesheet.metrics.workHours, 11.5);
    assert.equal(outResult.timesheet.metrics.workUnits, 1.0);
  });

  it('luồng ca đêm overnight: tính toán xuyên ngày từ 21:00 đến 06:00 sáng hôm sau', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);

    // IN lúc 21:00 ca đêm
    await service.recordPunch({
      employeeId,
      workDate,
      type: 'IN',
      punchedAt: new Date(`${workDate}T21:00:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      officeLocation: officeCoords,
      shiftConfig: {
        shiftType: 'NIGHT',
        shiftStartTime: '21:00',
        shiftEndTime: '06:00',
        shiftAllowancePct: 40
      }
    });

    // OUT lúc 06:00 sáng hôm sau (2026-11-04)
    const outResult = await service.recordPunch({
      employeeId,
      workDate,
      type: 'OUT',
      punchedAt: new Date(`2026-11-04T06:00:00.000Z`),
      latitude: 10.7725,
      longitude: 106.698,
      officeLocation: officeCoords
    });

    assert.equal(outResult.timesheet.shiftType, 'NIGHT');
    assert.equal(outResult.timesheet.shiftAllowancePct, 40);
    assert.equal(outResult.timesheet.metrics.workHours, 9.0);
    assert.equal(outResult.timesheet.metrics.workUnits, 1.0);
    assert.equal(outResult.timesheet.metrics.lateMinutes, 0);
    assert.equal(outResult.timesheet.metrics.earlyMinutes, 0);
  });

  it('khóa công không cho sửa: chặn tính lại hoặc điều chỉnh sau khi đã lock', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);

    const ts = DailyTimesheet.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      shiftStartTime: '08:00',
      shiftEndTime: '17:00'
    });
    await repo.saveTimesheet(ts);

    // Khóa bảng công của tháng 11
    const lockedCount = await service.lockTimesheets(employeeId, '2026-11-01', '2026-11-30');
    assert.equal(lockedCount, 1);

    const lockedTs = await service.getTimesheet(employeeId, workDate);
    assert.ok(lockedTs);
    assert.equal(lockedTs.isLocked, true);

    // Ghi nhận punch mới khi đã khóa phải báo lỗi
    await assert.rejects(
      async () => {
        await service.recordPunch({
          employeeId,
          type: 'IN',
          workDate,
          latitude: 10.7725,
          longitude: 106.698
        });
      },
      { message: /khóa/ }
    );

    // Điều chỉnh bảng công khi đã khóa phải báo lỗi
    await assert.rejects(
      async () => {
        await service.adjustTimesheet(lockedTs.id, {
          reason: 'Bổ sung giờ công',
          adjustedBy: 'admin',
          checkIn: new Date(`${workDate}T08:00:00.000Z`),
          checkOut: new Date(`${workDate}T17:00:00.000Z`)
        });
      },
      { message: /khóa/ }
    );
  });

  it('điều chỉnh bảng công (adjustTimesheet) cập nhật giờ công và phép hợp lệ', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);

    const ts = DailyTimesheet.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      shiftStartTime: '08:00',
      shiftEndTime: '17:00'
    });
    await repo.saveTimesheet(ts);

    // Điều chỉnh bổ sung giờ check-in và check-out
    const adjusted = await service.adjustTimesheet(ts.id, {
      checkIn: new Date(`${workDate}T08:00:00.000Z`),
      checkOut: new Date(`${workDate}T17:00:00.000Z`),
      reason: 'Quên chấm công sáng và chiều',
      adjustedBy: 'hr_manager'
    });

    assert.equal(adjusted.status, 'PRESENT');
    assert.equal(adjusted.metrics.workHours, 9.0);
    assert.equal(adjusted.metrics.workUnits, 1.0);

    // Điều chỉnh sang nghỉ phép có hưởng lương LEAVE_PAID
    const leaveAdjusted = await service.adjustTimesheet(ts.id, {
      status: 'LEAVE_PAID',
      reason: 'Nghỉ phép năm đã phê duyệt',
      adjustedBy: 'hr_manager'
    });

    assert.equal(leaveAdjusted.status, 'LEAVE_PAID');
    assert.equal(leaveAdjusted.metrics.workHours, 0);
    assert.equal(leaveAdjusted.metrics.workUnits, 1.0);
  });
});

describe('AttendanceV2Controller', () => {
  const employeeId = randomUUID();
  const workDate = '2026-11-03';

  it('controller thực hiện đủ các API punches, get, list và adjust', async () => {
    const repo = new InMemoryAttendanceV2Repository();
    const service = new AttendanceV2Service(repo);
    const controller = new AttendanceV2Controller(service);

    // 1. POST punches
    const punchRes = (await controller.recordPunch(undefined, {
      employeeId,
      workDate,
      type: 'IN',
      latitude: 10.7725,
      longitude: 106.698,
      note: 'API test checkin'
    })) as any;

    assert.ok(punchRes.punch);
    assert.equal(punchRes.punch.type, 'IN');
    assert.ok(punchRes.timesheet);

    // 2. GET punches
    const listPunchesRes = (await controller.getPunches(undefined, employeeId, workDate)) as any;
    assert.equal(listPunchesRes.punches.length, 1);
    assert.equal(listPunchesRes.punches[0].employeeId, employeeId);

    // 3. GET timesheet cụ thể
    const getTsRes = (await controller.getTimesheet(undefined, employeeId, workDate)) as any;
    assert.ok(getTsRes.timesheet);
    assert.equal(getTsRes.timesheet.workDate, workDate);

    // 4. GET list timesheets
    const listTsRes = (await controller.listTimesheets(undefined, employeeId, '2026-11-01', '2026-11-30')) as any;
    assert.equal(listTsRes.timesheets.length, 1);

    // 5. PATCH adjust timesheet
    const adjustRes = (await controller.adjustTimesheet(undefined, getTsRes.timesheet.id, {
      status: 'HOLIDAY',
      reason: 'Nghỉ lễ theo quy định',
      adjustedBy: 'admin'
    })) as any;

    assert.equal(adjustRes.adjusted, true);
    assert.equal(adjustRes.timesheet.status, 'HOLIDAY');
  });
});
