import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { SystemRequest } from '../../src/modules/requests/domain';
import { WorkSchedule } from '../../src/modules/attendance/domain';

class FakeRequestsRepository extends RequestsRepository {
  requests: Map<string, SystemRequest> = new Map();

  constructor() {
    super({} as any);
  }

  override async save(request: SystemRequest): Promise<void> {
    this.requests.set(request.id, request);
  }

  override async findById(id: string): Promise<SystemRequest | null> {
    return this.requests.get(id) || null;
  }

  override async list(filter: any = {}): Promise<SystemRequest[]> {
    let result = Array.from(this.requests.values());
    if (filter.employeeId) result = result.filter((r) => r.employeeId === filter.employeeId);
    if (filter.type) result = result.filter((r) => r.type === filter.type);
    if (filter.status) result = result.filter((r) => r.status === filter.status);
    return result;
  }

  override async count(filter: any = {}): Promise<number> {
    const items = await this.list(filter);
    return items.length;
  }
}

class FakeAttendanceRepository extends AttendanceRepository {
  schedules: Map<string, WorkSchedule> = new Map();
  dayStatuses: Map<string, string> = new Map();

  constructor() {
    super({} as any);
  }

  override async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const key = `${employeeId}:${workDate}`;
    const existing = this.schedules.get(key);
    if (existing) return existing;
    const def = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00',
    });
    this.schedules.set(key, def);
    return def;
  }

  override async saveSchedule(schedule: WorkSchedule): Promise<void> {
    this.schedules.set(`${schedule.employeeId}:${schedule.workDate}`, schedule);
  }

  override async updateDayStatus(employeeId: string, workDate: string, status: string): Promise<void> {
    this.dayStatuses.set(`${employeeId}:${workDate}`, status);
  }
}

describe('Requests V2 - Đơn từ & Giải trình', () => {
  const reqRepo = new FakeRequestsRepository();
  const attRepo = new FakeAttendanceRepository();
  const service = new RequestsService(reqRepo, attRepo);
  const empId = randomUUID();

  it('1. Nộp đơn giải trình (EXPLANATION) & Duyệt giải trình cập nhật trạng thái ngày công sang VALID', async () => {
    const req = await service.createExplanationRequest({
      employeeId: empId,
      title: 'Giải trình quên quẹt thẻ vào',
      reason: 'Bảo vệ mở cửa muộn',
      workDate: '2026-11-04',
      actualCheckIn: '08:05',
    });

    assert.equal(req.type, 'EXPLANATION');
    assert.equal(req.status, 'PENDING');

    const reviewed = await service.reviewRequest(req.id, 'admin', 'APPROVE', 'Đã xác minh');
    assert.equal(reviewed.status, 'APPROVED');
    assert.equal(reviewed.reviewedBy, 'admin');
    assert.equal(attRepo.dayStatuses.get(`${empId}:2026-11-04`), 'VALID');
  });

  it('2. Nộp đơn nghỉ phép (LEAVE) & Duyệt nghỉ phép cập nhật lịch làm việc sang ON_LEAVE', async () => {
    const req = await service.createLeaveRequest({
      employeeId: empId,
      title: 'Xin nghỉ phép thường niên',
      reason: 'Việc gia đình',
      leaveType: 'PAID',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      daysCount: 1,
    });

    assert.equal(req.type, 'LEAVE');
    assert.equal(req.status, 'PENDING');

    const reviewed = await service.reviewRequest(req.id, 'manager', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');

    const sched = attRepo.schedules.get(`${empId}:2026-11-10`);
    assert.ok(sched);
    assert.equal(sched.status, 'ON_LEAVE');
  });

  it('3. Nộp đơn làm thêm (OVERTIME) kiểm tra trần OT 4h/ngày', async () => {
    await assert.rejects(
      async () => {
        await service.createOvertimeRequest({
          employeeId: empId,
          title: 'OT dự án gấp',
          reason: 'Chạy deadline',
          otDate: '2026-11-05',
          hours: 5, // Vượt quá 4h/ngày
        });
      },
      {
        message: /không được vượt quá 4 giờ/,
      }
    );

    const validReq = await service.createOvertimeRequest({
      employeeId: empId,
      title: 'OT dự án gấp',
      reason: 'Chạy deadline',
      otDate: '2026-11-05',
      hours: 3,
    });
    assert.equal(validReq.type, 'OVERTIME');
    assert.equal(validReq.status, 'PENDING');

    const reviewed = await service.reviewRequest(validReq.id, 'manager', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
  });

  it('4. Nộp đơn tạm ứng (ADVANCE) & Duyệt tạm ứng', async () => {
    const req = await service.createAdvanceRequest({
      employeeId: empId,
      title: 'Tạm ứng lương giữa tháng',
      reason: 'Chi tiêu đột xuất',
      amount: 2000000,
      period: '2026-11',
    });

    assert.equal(req.type, 'ADVANCE');
    assert.equal(req.status, 'PENDING');
    assert.equal(req.advanceAmount, 2000000);

    const reviewed = await service.reviewRequest(req.id, 'admin', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
  });
});
