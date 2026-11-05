import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { BadRequestError } from '../../src/common';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { IsatProfile, RequestsRepository } from '../../src/modules/requests/requests.repository';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { ISAT_CONDITIONS, SystemRequest } from '../../src/modules/requests/domain';
import { WorkSchedule } from '../../src/modules/attendance/domain';
import { businessMonthText } from '../../src/common/business-date';

const profile = {
  fullName: 'Nguyễn Văn A', positionType: 'nv', positionLevel: 2, levelName: 'Chuyên viên',
  shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00'
};
const allPassed = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };
const threeOfFour = { ...allPassed, NO_VIOLATION: false };

const nvProfile: IsatProfile = { employeeId: 'emp-uuid-1', isatEnabled: true, snapshot: profile };
const ctvProfile: IsatProfile = {
  employeeId: 'ctv-uuid',
  isatEnabled: false,
  snapshot: { ...profile, fullName: 'Trần Thị C', positionType: 'ctv', levelName: null }
};
const otherNvProfile: IsatProfile = {
  employeeId: 'emp-uuid-2',
  isatEnabled: true,
  snapshot: { ...profile, fullName: 'Trần Văn B' }
};

class FakeRequestsRepository extends RequestsRepository {
  requests: Map<string, SystemRequest> = new Map();
  profiles: Map<string, IsatProfile> = new Map([
    ['emp-uuid-1', nvProfile],
    ['nguyen-van-a', nvProfile],
    ['emp-uuid-2', otherNvProfile],
    ['tran-van-b', otherNvProfile],
    ['ctv-user', ctvProfile]
  ]);
  profileMonths: string[] = [];
  resolveCalls: string[] = [];

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
    if (filter.employeeIds?.length) result = result.filter((r) => filter.employeeIds.includes(r.employeeId));
    else if (filter.employeeId) result = result.filter((r) => r.employeeId === filter.employeeId);
    if (filter.type) result = result.filter((r) => r.type === filter.type);
    if (filter.status) result = result.filter((r) => r.status === filter.status);
    return result;
  }

  override async count(filter: any = {}): Promise<number> {
    const items = await this.list(filter);
    return items.length;
  }

  override async findIsatProfile(id: string, month: string): Promise<IsatProfile | null> {
    this.profileMonths.push(month);
    return this.profiles.get(id) ?? null;
  }

  override async resolveStaffUuid(id: string): Promise<string | null> {
    this.resolveCalls.push(id);
    return this.profiles.get(id)?.employeeId ?? null;
  }
}

class FakeAttendanceRepository extends AttendanceRepository {
  schedules: Map<string, WorkSchedule> = new Map();

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
      plannedEndTime: '17:00'
    });
    this.schedules.set(key, def);
    return def;
  }

  override async saveSchedule(schedule: WorkSchedule): Promise<void> {
    this.schedules.set(`${schedule.employeeId}:${schedule.workDate}`, schedule);
  }
}

describe('Đơn iSAT - service', () => {
  let reqRepo: FakeRequestsRepository;
  let attRepo: FakeAttendanceRepository;
  let service: RequestsService;

  beforeEach(() => {
    reqRepo = new FakeRequestsRepository();
    attRepo = new FakeAttendanceRepository();
    service = new RequestsService(reqRepo, attRepo);
  });

  it('creates a PENDING request under the uuid with the profile snapshot', async () => {
    const dto = await service.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-07',
      team: ' VN Pod — Vận hành ',
      conditions: allPassed
    });
    assert.equal(dto.employeeId, 'emp-uuid-1');
    assert.equal(dto.status, 'PENDING');
    assert.equal(dto.isat!.team, 'VN Pod — Vận hành');
    assert.equal(dto.isat!.levelName, 'Chuyên viên');
    assert.equal(reqRepo.profileMonths.at(-1), businessMonthText());
    assert.equal(reqRepo.requests.get(dto.id)!.employeeId, 'emp-uuid-1');
  });

  it('saves a self-assessment below 4/4 as REJECTED', async () => {
    const dto = await service.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-07',
      team: 'T',
      conditions: threeOfFour
    });
    assert.equal(dto.status, 'REJECTED');
    assert.equal(dto.reviewNote, 'Tự đánh giá chưa đạt 4/4 (đạt 3/4)');
    assert.equal(reqRepo.requests.size, 1);
  });

  it('refuses unknown staff and types without the isat benefit', async () => {
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'ghost', saturday: '2026-11-07', team: 'T', conditions: allPassed }),
      /Không tìm thấy nhân sự: ghost/
    );
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'ctv-user', saturday: '2026-11-07', team: 'T', conditions: allPassed }),
      /iSAT chỉ áp dụng cho nhóm Nhân viên/
    );
    assert.equal(reqRepo.requests.size, 0);
  });

  it('lets the domain validate the form after the profile checks', async () => {
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'nguyen-van-a', saturday: '2026-11-06', team: 'T', conditions: allPassed }),
      /saturday phải là ngày Thứ Bảy dạng YYYY-MM-DD, nhận: 2026-11-06/
    );
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'nguyen-van-a', saturday: '2026-11-07', conditions: allPassed }),
      /team \(Bộ phận \/ Team\) không được để trống/
    );
    assert.equal(reqRepo.requests.size, 0);
  });

  it('blocks a second PENDING/APPROVED request for the same Saturday, not after a self-rejected one', async () => {
    const form = { saturday: '2026-11-07', team: 'T' };
    const failing = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form, conditions: threeOfFour });
    assert.equal(failing.status, 'REJECTED');

    const first = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form, conditions: allPassed });
    assert.equal(first.status, 'PENDING');

    // Gửi lại bằng uuid thay vì username vẫn trùng, kể cả khi lần này tự đánh giá chưa đạt.
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'emp-uuid-1', ...form, conditions: allPassed }),
      /Đã có đơn iSAT cho Thứ Bảy 07\/11\/2026/
    );
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'emp-uuid-1', ...form, conditions: threeOfFour }),
      /Đã có đơn iSAT cho Thứ Bảy 07\/11\/2026/
    );

    // Đơn đã duyệt vẫn chặn.
    await service.reviewRequest(first.id, 'admin', 'APPROVE');
    await assert.rejects(
      service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form, conditions: allPassed }),
      /Đã có đơn iSAT cho Thứ Bảy 07\/11\/2026/
    );

    const nextWeek = await service.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-14',
      team: 'T',
      conditions: allPassed
    });
    assert.equal(nextWeek.status, 'PENDING');
  });

  it('allows a new request after the earlier one was rejected by the reviewer', async () => {
    const form = { employeeId: 'nguyen-van-a', saturday: '2026-11-07', team: 'T', conditions: allPassed };
    const first = await service.createIsatRequest(form);
    await service.reviewRequest(first.id, 'admin', 'REJECT', 'Không đủ điều kiện');
    const second = await service.createIsatRequest(form);
    assert.equal(second.status, 'PENDING');
  });

  it('approving marks the Saturday ISAT / ON_LEAVE; rejecting writes no schedule', async () => {
    const approved = await service.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-07',
      team: 'T',
      conditions: allPassed
    });
    const rejected = await service.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-14',
      team: 'T',
      conditions: allPassed
    });

    const reviewed = await service.reviewRequest(approved.id, 'admin', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
    await service.reviewRequest(rejected.id, 'admin', 'REJECT', 'Không đủ điều kiện');

    const sched = attRepo.schedules.get('emp-uuid-1:2026-11-07')!;
    assert.equal(sched.scheduleType, 'ISAT');
    assert.equal(sched.status, 'ON_LEAVE');
    assert.equal(sched.sourceRequestId, approved.id);
    assert.equal(attRepo.schedules.has('emp-uuid-1:2026-11-14'), false); // đơn bị REJECT
  });

  it('approves without an attendance repository', async () => {
    const bare = new RequestsService(reqRepo);
    const created = await bare.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-07',
      team: 'T',
      conditions: allPassed
    });
    const reviewed = await bare.reviewRequest(created.id, 'admin', 'APPROVE');
    assert.equal(reviewed.status, 'APPROVED');
  });

  it('refuses to approve a request whose registration row is missing, but can still reject it', async () => {
    const created = SystemRequest.createIsatRequest({
      employeeId: 'emp-uuid-1',
      saturday: '2026-11-07',
      team: 'T',
      conditions: allPassed,
      profile
    });
    const orphan = SystemRequest.fromRow(created.toRow());
    assert.equal(orphan.isat, null);
    reqRepo.requests.set(orphan.id, orphan);

    await assert.rejects(
      service.reviewRequest(orphan.id, 'admin', 'APPROVE'),
      new RegExp(`Đơn iSAT thiếu dữ liệu đăng ký: ${orphan.id}`)
    );
    assert.equal(orphan.status, 'PENDING');
    assert.equal(attRepo.schedules.size, 0);

    const rejected = await service.reviewRequest(orphan.id, 'admin', 'REJECT', 'Dữ liệu lỗi');
    assert.equal(rejected.status, 'REJECTED');
  });

  it('getById and listRequests return the isat block', async () => {
    const created = await service.createIsatRequest({
      employeeId: 'nguyen-van-a',
      saturday: '2026-11-07',
      team: 'T',
      conditions: allPassed
    });
    const byId = await service.getById(created.id);
    assert.equal(byId!.isat!.saturday, '2026-11-07');

    const listed = await service.listRequests({ employeeId: 'emp-uuid-1', type: 'ISAT' });
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].isat!.saturday, '2026-11-07');
  });

  describe('author lookups by username', () => {
    const form = { saturday: '2026-11-07', team: 'T', conditions: allPassed };

    it('cancels from the username session although the request is stored under the uuid', async () => {
      const created = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form });
      assert.equal(created.employeeId, 'emp-uuid-1');

      const cancelled = await service.cancelRequest(created.id, 'nguyen-van-a', 'Đổi kế hoạch');
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.reviewNote, 'Đổi kế hoạch');
      assert.equal(reqRepo.requests.get(created.id)!.status, 'CANCELLED');
    });

    it('does not resolve the canceller when it already equals the stored author', async () => {
      const created = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form });
      const cancelled = await service.cancelRequest(created.id, 'emp-uuid-1');
      assert.equal(cancelled.status, 'CANCELLED');
      assert.deepEqual(reqRepo.resolveCalls, []);
    });

    it('still refuses a stranger whose username resolves to another uuid or to nothing', async () => {
      const created = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form });

      await assert.rejects(
        service.cancelRequest(created.id, 'tran-van-b'),
        /Only the request author \(employee 'emp-uuid-1'\) can cancel this request/
      );
      await assert.rejects(
        service.cancelRequest(created.id, 'ghost'),
        /Only the request author \(employee 'emp-uuid-1'\) can cancel this request/
      );
      assert.deepEqual(reqRepo.resolveCalls, ['tran-van-b', 'ghost']);
      assert.equal(reqRepo.requests.get(created.id)!.status, 'PENDING');
    });

    it('lists by username and counts the iSAT request stored under the uuid', async () => {
      const created = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form });
      await service.createIsatRequest({ employeeId: 'tran-van-b', ...form });

      const listed = await service.listRequests({ employeeId: 'nguyen-van-a' });
      assert.equal(listed.total, 1);
      assert.deepEqual(listed.items.map(i => i.id), [created.id]);
    });

    it('still lists other request types stored under the username next to the iSAT ones', async () => {
      const isat = await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form });
      const leave = await service.createLeaveRequest({
        employeeId: 'nguyen-van-a', title: 'Nghỉ phép', reason: 'Việc nhà',
        leaveType: 'PAID', startDate: '2026-11-10', endDate: '2026-11-10', daysCount: 1
      });

      const listed = await service.listRequests({ employeeId: 'nguyen-van-a' });
      assert.equal(listed.total, 2);
      assert.deepEqual(listed.items.map(i => i.id).sort(), [isat.id, leave.id].sort());

      const onlyLeave = await service.listRequests({ employeeId: 'nguyen-van-a', type: 'LEAVE' });
      assert.deepEqual(onlyLeave.items.map(i => i.id), [leave.id]);
    });

    it('lists an unknown username by that name alone and skips the lookup without an employee filter', async () => {
      await service.createIsatRequest({ employeeId: 'nguyen-van-a', ...form });
      const ghost = await service.listRequests({ employeeId: 'ghost' });
      assert.deepEqual([ghost.total, ghost.items.length], [0, 0]);
      assert.deepEqual(reqRepo.resolveCalls, ['ghost']);

      const all = await service.listRequests({});
      assert.equal(all.total, 1);
      assert.deepEqual(reqRepo.resolveCalls, ['ghost']);
    });
  });
});

describe('Đơn iSAT - lịch làm việc', () => {
  it('WorkSchedule.withIsat keeps the shift and clears OT', () => {
    const id = randomUUID();
    const s = WorkSchedule.create({
      employeeId: 'e',
      workDate: '2026-11-07',
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00',
      approvedOtHours: 2
    }).withIsat(id);
    assert.deepEqual(
      [s.scheduleType, s.status, s.approvedOtHours, s.plannedStartTime, s.sourceRequestId],
      ['ISAT', 'ON_LEAVE', 0, '08:00', id]
    );
  });
});

describe('Đơn iSAT - controller', () => {
  it('controller forwards only form fields with the employeeId given by Admin and wraps errors', async () => {
    const calls: any[] = [];
    const ctrl = new RequestsController({
      createIsatRequest: async (i: any) => (calls.push(i), { id: 'r1' })
    } as any);
    assert.deepEqual(
      await ctrl.createIsat({ employeeId: 'nguyen-van-a', saturday: '2026-11-07', team: 'T', conditions: {}, title: 'x' }, { username: 'admin' } as any),
      { created: true, request: { id: 'r1' } }
    );
    assert.deepEqual(calls[0], { employeeId: 'nguyen-van-a', saturday: '2026-11-07', team: 'T', conditions: {} });

    const failing = new RequestsController({
      createIsatRequest: async () => {
        throw new Error('boom');
      }
    } as any);
    await assert.rejects(failing.createIsat({ employeeId: 'x' }, { username: 'admin' } as any), (e: any) => e instanceof BadRequestError && e.message === 'boom');

    assert.deepEqual(ctrl.listIsatConditions(), {
      conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label }))
    });
  });
});
