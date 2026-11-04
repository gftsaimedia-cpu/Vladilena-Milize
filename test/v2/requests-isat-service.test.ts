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

class FakeRequestsRepository extends RequestsRepository {
  requests: Map<string, SystemRequest> = new Map();
  profiles: Map<string, IsatProfile> = new Map([
    ['emp-uuid-1', nvProfile],
    ['nguyen-van-a', nvProfile],
    ['ctv-user', ctvProfile]
  ]);
  profileMonths: string[] = [];

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

  override async findIsatProfile(id: string, month: string): Promise<IsatProfile | null> {
    this.profileMonths.push(month);
    return this.profiles.get(id) ?? null;
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
    assert.equal(reqRepo.profileMonths.at(-1), new Date().toISOString().slice(0, 7));
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
  it('controller forwards only form fields with the session fallback and wraps errors', async () => {
    const calls: any[] = [];
    const ctrl = new RequestsController({
      createIsatRequest: async (i: any) => (calls.push(i), { id: 'r1' })
    } as any);
    assert.deepEqual(
      await ctrl.createIsat({ saturday: '2026-11-07', team: 'T', conditions: {}, title: 'x' }, { username: 'nguyen-van-a' } as any),
      { created: true, request: { id: 'r1' } }
    );
    assert.deepEqual(calls[0], { employeeId: 'nguyen-van-a', saturday: '2026-11-07', team: 'T', conditions: {} });

    const failing = new RequestsController({
      createIsatRequest: async () => {
        throw new Error('boom');
      }
    } as any);
    await assert.rejects(failing.createIsat({}, undefined), (e: any) => e instanceof BadRequestError && e.message === 'boom');

    assert.deepEqual(ctrl.listIsatConditions(), {
      conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label }))
    });
  });
});
