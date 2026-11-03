import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RequestV2Service } from '../../src/modules/request-v2/request-v2.service';
import { RequestV2Repository, RequestListFilter } from '../../src/data/request-v2.repository';
import { AttendanceV2Repository } from '../../src/data/attendance-v2.repository';
import { WorkSchedule } from '../../src/domain/attendance-v2';
import { SystemRequest } from '../../src/domain/request-v2';

class InMemoryAttendanceV2Repository extends AttendanceV2Repository {
  private schedules: Map<string, WorkSchedule> = new Map();

  constructor() {
    super(null as any);
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
      plannedEndTime: '17:00'
    });
    await this.saveSchedule(def);
    return def;
  }
}

class InMemoryRequestV2Repository extends RequestV2Repository {
  private requests: Map<string, SystemRequest> = new Map();

  constructor() {
    super(null as any);
  }

  override async save(request: SystemRequest): Promise<void> {
    // Clone via row round-trip to guarantee independent state
    const clone = SystemRequest.fromRow(request.toRow());
    this.requests.set(clone.id, clone);
  }

  override async findById(id: string): Promise<SystemRequest | null> {
    const found = this.requests.get(id);
    if (!found) return null;
    return SystemRequest.fromRow(found.toRow());
  }

  override async list(filter: RequestListFilter = {}): Promise<SystemRequest[]> {
    let list = Array.from(this.requests.values());
    if (filter.employeeId) {
      list = list.filter(r => r.employeeId === filter.employeeId);
    }
    if (filter.type) {
      list = list.filter(r => r.type === filter.type);
    }
    if (filter.status) {
      list = list.filter(r => r.status === filter.status);
    }
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = filter.offset || 0;
    const limit = filter.limit !== undefined ? filter.limit : list.length;
    return list.slice(offset, offset + limit).map(r => SystemRequest.fromRow(r.toRow()));
  }

  override async count(filter: Omit<RequestListFilter, 'limit' | 'offset'> = {}): Promise<number> {
    let list = Array.from(this.requests.values());
    if (filter.employeeId) {
      list = list.filter(r => r.employeeId === filter.employeeId);
    }
    if (filter.type) {
      list = list.filter(r => r.type === filter.type);
    }
    if (filter.status) {
      list = list.filter(r => r.status === filter.status);
    }
    return list.length;
  }
}

describe('RequestV2Service', () => {
  const EMP_ID = 'a0000000-0000-0000-0000-000000000001';
  const REVIEWER_ID = 'b0000000-0000-0000-0000-000000000002';

  describe('Creation of 4 request types', () => {
    test('createLeaveRequest validates and persists flat LEAVE request', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const dto = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép thường niên',
        reason: 'Đi du lịch',
        leaveType: 'PAID',
        startDate: '2026-11-15',
        endDate: '2026-11-18',
        daysCount: 4
      });

      assert.ok(dto.id);
      assert.equal(dto.employeeId, EMP_ID);
      assert.equal(dto.title, 'Nghỉ phép thường niên');
      assert.equal(dto.type, 'LEAVE');
      assert.equal(dto.status, 'PENDING');
      assert.equal(dto.leaveType, 'PAID');
      assert.equal(dto.leaveStartDate, '2026-11-15');
      assert.equal(dto.leaveEndDate, '2026-11-18');
      assert.equal(dto.leaveDaysCount, 4);

      const saved = await repo.findById(dto.id);
      assert.ok(saved);
      assert.equal(saved.id, dto.id);
    });

    test('createLeaveRequest throws on missing or invalid fields', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      await assert.rejects(
        () =>
          service.createLeaveRequest({
            employeeId: '',
            title: 'Nghỉ phép',
            reason: 'Việc',
            leaveType: 'PAID',
            startDate: '2026-11-15',
            endDate: '2026-11-18',
            daysCount: 4
          }),
        /employeeId/i
      );

      await assert.rejects(
        () =>
          service.createLeaveRequest({
            employeeId: EMP_ID,
            title: '   ',
            reason: 'Việc',
            leaveType: 'PAID',
            startDate: '2026-11-15',
            endDate: '2026-11-18',
            daysCount: 4
          }),
        /title/i
      );

      await assert.rejects(
        () =>
          service.createLeaveRequest({
            employeeId: EMP_ID,
            title: 'Nghỉ phép',
            reason: 'Việc',
            leaveType: 'PAID',
            startDate: '2026-11-20',
            endDate: '2026-11-18',
            daysCount: 4
          }),
        /endDate.*startDate/i
      );
    });

    test('createCorrectionRequest creates and persists flat TIME_CORRECTION request', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      // Direct punchType and actualTime
      const dto1 = await service.createCorrectionRequest({
        employeeId: EMP_ID,
        title: 'Giải trình quên check in',
        reason: 'Quên thẻ chấm công',
        correctionDate: '2026-11-03',
        punchType: 'IN',
        actualTime: '08:02'
      });

      assert.equal(dto1.type, 'TIME_CORRECTION');
      assert.equal(dto1.status, 'PENDING');
      assert.equal(dto1.correctionDate, '2026-11-03');
      assert.equal(dto1.correctionPunchType, 'IN');
      assert.equal(dto1.correctionActualTime, '08:02');

      // Adapted targetDate and correctedCheckIn
      const dto2 = await service.createCorrectionRequest({
        employeeId: EMP_ID,
        title: 'Giải trình quên check out',
        reason: 'Họp đột xuất',
        targetDate: '2026-11-03',
        correctedCheckOut: '17:45'
      });

      assert.equal(dto2.type, 'TIME_CORRECTION');
      assert.equal(dto2.correctionDate, '2026-11-03');
      assert.equal(dto2.correctionPunchType, 'OUT');
      assert.equal(dto2.correctionActualTime, '17:45');
    });

    test('createOvertimeRequest creates and persists flat OVERTIME request', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const dto = await service.createOvertimeRequest({
        employeeId: EMP_ID,
        title: 'Đăng ký tăng ca',
        reason: 'Làm bù việc tồn đọng',
        otDate: '2026-11-05',
        startTime: '18:00',
        endTime: '21:30',
        hours: 3.5
      });

      assert.equal(dto.type, 'OVERTIME');
      assert.equal(dto.status, 'PENDING');
      assert.equal(dto.otDate, '2026-11-05');
      assert.equal(dto.otStartTime, '18:00');
      assert.equal(dto.otEndTime, '21:30');
      assert.equal(dto.otHours, 3.5);

      // Adapted targetDate & otHours
      const dtoAdapted = await service.createOvertimeRequest({
        employeeId: EMP_ID,
        title: 'Tăng ca khẩn cấp',
        reason: 'Deploy hệ thống',
        targetDate: '2026-11-06',
        otHours: 2.0
      });

      assert.equal(dtoAdapted.otDate, '2026-11-06');
      assert.equal(dtoAdapted.otHours, 2.0);
      assert.ok(dtoAdapted.otStartTime);
      assert.ok(dtoAdapted.otEndTime);
    });

    test('createAdvanceRequest creates and persists flat ADVANCE request', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const dto = await service.createAdvanceRequest({
        employeeId: EMP_ID,
        title: 'Tạm ứng lương tháng 11',
        reason: 'Mua sắm thiết bị',
        amount: 2500000,
        period: '2026-11'
      });

      assert.equal(dto.type, 'ADVANCE');
      assert.equal(dto.status, 'PENDING');
      assert.equal(dto.advanceAmount, 2500000);
      assert.equal(dto.advancePeriod, '2026-11');
    });

    test('createAdvanceRequest throws on invalid amount or period', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      await assert.rejects(
        () =>
          service.createAdvanceRequest({
            employeeId: EMP_ID,
            title: 'Tạm ứng',
            reason: 'Lý do',
            amount: 0,
            period: '2026-11'
          }),
        /amount/i
      );

      await assert.rejects(
        () =>
          service.createAdvanceRequest({
            employeeId: EMP_ID,
            title: 'Tạm ứng',
            reason: 'Lý do',
            amount: 1000000,
            period: 'invalid-period'
          }),
        /period/i
      );
    });
  });

  describe('Review flow (Approve & Reject)', () => {
    test('reviewRequest APPROVE transitions status and records reviewer', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const created = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép',
        reason: 'Nghỉ ốm',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        daysCount: 1
      });

      const reviewed = await service.reviewRequest(created.id, REVIEWER_ID, 'APPROVE', 'Đã duyệt qua');

      assert.equal(reviewed.status, 'APPROVED');
      assert.equal(reviewed.reviewedBy, REVIEWER_ID);
      assert.equal(reviewed.reviewNote, 'Đã duyệt qua');
      assert.ok(reviewed.reviewedAt);

      const reloaded = await repo.findById(created.id);
      assert.equal(reloaded?.status, 'APPROVED');
      assert.equal(reloaded?.reviewedBy, REVIEWER_ID);
    });

    test('reviewRequest REJECT transitions status and records note', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const created = await service.createAdvanceRequest({
        employeeId: EMP_ID,
        title: 'Tạm ứng',
        reason: 'Cá nhân',
        amount: 5000000,
        period: '2026-11'
      });

      const rejected = await service.reviewRequest(created.id, REVIEWER_ID, 'REJECT', 'Vượt định mức');

      assert.equal(rejected.status, 'REJECTED');
      assert.equal(rejected.reviewedBy, REVIEWER_ID);
      assert.equal(rejected.reviewNote, 'Vượt định mức');

      const reloaded = await repo.findById(created.id);
      assert.equal(reloaded?.status, 'REJECTED');
    });

    test('reviewRequest throws when request not found or invalid action', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      await assert.rejects(() => service.reviewRequest('not-exists-id', REVIEWER_ID, 'APPROVE'), /not found/i);

      const created = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép',
        reason: 'Nghỉ',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        daysCount: 1
      });

      await assert.rejects(
        () => service.reviewRequest(created.id, REVIEWER_ID, 'INVALID' as any),
        /Invalid review action/i
      );
    });

    test('reviewRequest cannot approve or reject non-pending request', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const created = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép',
        reason: 'Nghỉ',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        daysCount: 1
      });

      await service.reviewRequest(created.id, REVIEWER_ID, 'APPROVE');

      await assert.rejects(
        () => service.reviewRequest(created.id, REVIEWER_ID, 'APPROVE'),
        /Cannot approve request with status 'APPROVED'/i
      );

      await assert.rejects(
        () => service.reviewRequest(created.id, REVIEWER_ID, 'REJECT'),
        /Cannot reject request with status 'APPROVED'/i
      );
    });
  });

  describe('Cancel flow', () => {
    test('cancelRequest allows author to cancel pending request with reason', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const created = await service.createOvertimeRequest({
        employeeId: EMP_ID,
        title: 'Đăng ký OT',
        reason: 'Làm việc',
        otDate: '2026-11-05',
        startTime: '18:00',
        endTime: '20:00',
        hours: 2
      });

      const cancelled = await service.cancelRequest(created.id, EMP_ID, 'Thay đổi kế hoạch');

      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.reviewNote, 'Thay đổi kế hoạch');

      const reloaded = await repo.findById(created.id);
      assert.equal(reloaded?.status, 'CANCELLED');
    });

    test('cancelRequest throws if request is not found', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      await assert.rejects(() => service.cancelRequest('not-exists-id', EMP_ID, 'Lý do'), /not found/i);
    });

    test('cancelRequest throws if non-author attempts cancellation', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const created = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép',
        reason: 'Nghỉ',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        daysCount: 1
      });

      const impostorId = 'c0000000-0000-0000-0000-000000000003';
      await assert.rejects(
        () => service.cancelRequest(created.id, impostorId, 'Tôi muốn hủy giùm'),
        /Only the request author/i
      );
    });

    test('cancelRequest throws if request is already approved or rejected', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const created = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép',
        reason: 'Nghỉ',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        daysCount: 1
      });

      await service.reviewRequest(created.id, REVIEWER_ID, 'APPROVE');

      await assert.rejects(
        () => service.cancelRequest(created.id, EMP_ID, 'Hủy sau khi duyệt'),
        /Cannot cancel request with status 'APPROVED'/i
      );
    });
  });

  describe('Lookup and Listing', () => {
    test('getById returns DTO when found or null when not found', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const notFound = await service.getById('non-existent');
      assert.equal(notFound, null);

      const created = await service.createAdvanceRequest({
        employeeId: EMP_ID,
        title: 'Tạm ứng',
        reason: 'Việc',
        amount: 1000000,
        period: '2026-11'
      });

      const found = await service.getById(created.id);
      assert.ok(found);
      assert.equal(found.id, created.id);
      assert.equal(found.advanceAmount, 1000000);
    });

    test('listRequests filters by employeeId, type, status and returns total', async () => {
      const repo = new InMemoryRequestV2Repository();
      const service = new RequestV2Service(repo);

      const otherEmp = 'z0000000-0000-0000-0000-000000000099';

      await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Leave 1',
        reason: 'R',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-11',
        daysCount: 2
      });

      const ot = await service.createOvertimeRequest({
        employeeId: EMP_ID,
        title: 'OT 1',
        reason: 'R',
        otDate: '2026-11-12',
        startTime: '18:00',
        endTime: '20:00',
        hours: 2
      });

      await service.createLeaveRequest({
        employeeId: otherEmp,
        title: 'Leave 2',
        reason: 'R',
        leaveType: 'UNPAID',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        daysCount: 1
      });

      // Filter by employeeId
      const empList = await service.listRequests({ employeeId: EMP_ID });
      assert.equal(empList.total, 2);
      assert.equal(empList.items.length, 2);

      // Filter by type
      const otList = await service.listRequests({ type: 'OVERTIME' });
      assert.equal(otList.total, 1);
      assert.equal(otList.items[0].id, ot.id);

      // Review and filter by status
      await service.reviewRequest(ot.id, REVIEWER_ID, 'APPROVE');
      const approvedList = await service.listRequests({ status: 'APPROVED' });
      assert.equal(approvedList.total, 1);
      assert.equal(approvedList.items[0].id, ot.id);

      // Pagination
      const page = await service.listRequests({ limit: 1, offset: 0 });
      assert.equal(page.items.length, 1);
      assert.equal(page.total, 3);
    });
  });

  describe('Schedule Synchronization on Review Approval', () => {
    test('SHIFT_CHANGE request approval synchronizes new shift hours to work_schedules', async () => {
      const requestRepo = new InMemoryRequestV2Repository();
      const attendanceRepo = new InMemoryAttendanceV2Repository();
      const service = new RequestV2Service(requestRepo, attendanceRepo);

      const req = await service.createShiftChangeRequest({
        employeeId: EMP_ID,
        title: 'Đổi sang ca FLEX',
        reason: 'Có việc gia đình',
        changeDate: '2026-11-03',
        newShiftType: 'FLEX',
        newStartTime: '06:00',
        newEndTime: '15:00'
      });

      await service.reviewRequest(req.id, REVIEWER_ID, 'APPROVE');

      const schedule = await attendanceRepo.findSchedule(EMP_ID, '2026-11-03');
      assert.ok(schedule);
      assert.equal(schedule.shiftType, 'FLEX');
      assert.equal(schedule.plannedStartTime, '06:00');
      assert.equal(schedule.plannedEndTime, '15:00');
      assert.equal(schedule.scheduleType, 'SHIFT_CHANGE');
      assert.equal(schedule.sourceRequestId, req.id);
    });

    test('LEAVE_WITH_MAKEUP request approval marks leave date ON_LEAVE and makeup date MAKE_UP', async () => {
      const requestRepo = new InMemoryRequestV2Repository();
      const attendanceRepo = new InMemoryAttendanceV2Repository();
      const service = new RequestV2Service(requestRepo, attendanceRepo);

      const req = await service.createLeaveWithMakeupRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ làm bù',
        reason: 'Bận việc riêng',
        leaveDate: '2026-11-03',
        makeupDate: '2026-11-05',
        makeupStartTime: '08:00',
        makeupEndTime: '22:00'
      });

      await service.reviewRequest(req.id, REVIEWER_ID, 'APPROVE');

      const leaveSched = await attendanceRepo.findSchedule(EMP_ID, '2026-11-03');
      assert.ok(leaveSched);
      assert.equal(leaveSched.status, 'ON_LEAVE');
      assert.equal(leaveSched.sourceRequestId, req.id);

      const makeupSched = await attendanceRepo.findSchedule(EMP_ID, '2026-11-05');
      assert.ok(makeupSched);
      assert.equal(makeupSched.scheduleType, 'MAKE_UP');
      assert.equal(makeupSched.plannedStartTime, '08:00');
      assert.equal(makeupSched.plannedEndTime, '22:00');
      assert.equal(makeupSched.sourceRequestId, req.id);
    });

    test('OVERTIME request approval extends planned_end_time and sets approved_ot_hours', async () => {
      const requestRepo = new InMemoryRequestV2Repository();
      const attendanceRepo = new InMemoryAttendanceV2Repository();
      const service = new RequestV2Service(requestRepo, attendanceRepo);

      const req = await service.createOvertimeRequest({
        employeeId: EMP_ID,
        title: 'Làm thêm cuối quý',
        reason: 'Chạy sprint',
        otDate: '2026-11-03',
        startTime: '17:00',
        endTime: '20:00',
        hours: 3.0
      });

      await service.reviewRequest(req.id, REVIEWER_ID, 'APPROVE');

      const schedule = await attendanceRepo.findSchedule(EMP_ID, '2026-11-03');
      assert.ok(schedule);
      assert.equal(schedule.plannedEndTime, '20:00');
      assert.equal(schedule.approvedOtHours, 3.0);
      assert.equal(schedule.scheduleType, 'OVERTIME');
    });

    test('LEAVE request approval sets date range to ON_LEAVE', async () => {
      const requestRepo = new InMemoryRequestV2Repository();
      const attendanceRepo = new InMemoryAttendanceV2Repository();
      const service = new RequestV2Service(requestRepo, attendanceRepo);

      const req = await service.createLeaveRequest({
        employeeId: EMP_ID,
        title: 'Nghỉ phép',
        reason: 'Du lịch',
        leaveType: 'PAID',
        startDate: '2026-11-10',
        endDate: '2026-11-11',
        daysCount: 2
      });

      await service.reviewRequest(req.id, REVIEWER_ID, 'APPROVE');

      const sched1 = await attendanceRepo.findSchedule(EMP_ID, '2026-11-10');
      assert.ok(sched1);
      assert.equal(sched1.status, 'ON_LEAVE');

      const sched2 = await attendanceRepo.findSchedule(EMP_ID, '2026-11-11');
      assert.ok(sched2);
      assert.equal(sched2.status, 'ON_LEAVE');
    });
  });
});
