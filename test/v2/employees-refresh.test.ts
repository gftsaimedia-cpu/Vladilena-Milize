import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { Employee } from '../../src/modules/employees/domain';
import { EmployeesRepository, type EmploymentDates } from '../../src/modules/employees/employees.repository';
import { EmployeesService } from '../../src/modules/employees/employees.service';

// FP5 I1: lưu hồ sơ chỉ ghi lại dòng ngày công khi một trong năm trường của T4 đổi, và bỏ qua tháng đã đóng băng.

const NOW = new Date('2026-11-05T10:00:00Z');

/** Repository giả giữ hồ sơ trong bộ nhớ; `employmentDates` đọc lại từ hồ sơ đã lưu như cột `staff`. */
class MemoryRepo extends EmployeesRepository {
  readonly people = new Map<string, Employee>();

  constructor() {
    super({} as any);
  }

  override withTransaction(): EmployeesRepository {
    return this;
  }

  override async save(employee: Employee): Promise<Employee> {
    this.people.set(employee.username, employee);
    return employee;
  }

  override async findByUsername(username: string): Promise<Employee | null> {
    return this.people.get(username) ?? null;
  }

  override async findByUsernameOrUuid(id: string): Promise<Employee | null> {
    return [...this.people.values()].find(e => e.username === id || e.profile.uuid === id) ?? null;
  }

  override async employmentDates(id: string): Promise<EmploymentDates | null> {
    const e = await this.findByUsernameOrUuid(id);
    if (!e) return null;
    return {
      uuid: e.profile.uuid,
      startDate: e.contract.effectiveFrom,
      resignedOn: e.contract.resignedOn,
      type: e.contract.position.type,
      level: e.contract.position.level,
      shiftType: e.contract.shift.type,
      shiftStart: e.contract.shift.startTime,
      shiftEnd: e.contract.shift.endTime
    };
  }
}

class FakeDays {
  readonly refreshed: string[] = [];
  frozen = new Set<string>();
  frozenAsked: Array<[string, string]> = [];

  async refreshMonth(_employeeId: string, month: string): Promise<unknown[]> {
    this.refreshed.push(month);
    return [];
  }

  async frozenMonths(from: string, to: string): Promise<Set<string>> {
    this.frozenAsked.push([from, to]);
    return this.frozen;
  }
}

const fakeTx = { run: async <T>(cb: (trx: any) => Promise<T>) => cb({}) };
const fakeAudit = { append: async () => ({ id: 1, hash: '' }) };

describe('EmployeesService: ghi lại dòng ngày sau khi lưu hồ sơ (FP5 I1)', () => {
  let repo: MemoryRepo;
  let days: FakeDays;
  let service: EmployeesService;

  beforeEach(async () => {
    repo = new MemoryRepo();
    days = new FakeDays();
    service = new EmployeesService(repo, fakeTx as any, fakeAudit as any, days as unknown as AttendanceDaysService);
    service.now = () => NOW;
    await service.create(
      {
        username: 'binh',
        name: 'Bình',
        type: 'nv',
        level: 1,
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        effectiveFrom: '2026-09-01',
        role: 'staff'
      },
      'admin'
    );
    days.refreshed.length = 0;
    days.frozenAsked.length = 0;
  });

  it('chỉ đổi tên, mật khẩu, vai trò hay chức danh → không ghi lại tháng nào', async () => {
    await service.update('binh', { name: 'Bình Mới' }, 'admin');
    await service.update('binh', { password: 'mat-khau-moi-123' }, 'admin');
    await service.update('binh', { role: 'manager' }, 'admin');
    await service.update('binh', { jobTitle: 'Trưởng nhóm' }, 'admin');
    assert.deepEqual(days.refreshed, []);
  });

  it('đổi ca mặc định → ghi lại từ tháng vào làm tới tháng hiện tại', async () => {
    await service.update('binh', { shiftType: 'FLEX', shiftStartTime: '13:00', shiftEndTime: '22:00' }, 'admin');
    assert.deepEqual(days.refreshed, ['2026-09', '2026-10', '2026-11']);
  });

  it('đổi loại, đổi bậc, đổi ngày vào làm → mỗi thay đổi đều ghi lại', async () => {
    await service.update('binh', { type: 'tts' }, 'admin');
    assert.deepEqual(days.refreshed, ['2026-09', '2026-10', '2026-11']);
    days.refreshed.length = 0;
    await service.update('binh', { level: 2 }, 'admin');
    assert.equal(days.refreshed.length, 3);
    days.refreshed.length = 0;
    await service.update('binh', { effectiveFrom: '2026-10-05' }, 'admin');
    // Tháng nhỏ nhất trong bốn ngày (cũ 09, mới 10) là 09.
    assert.deepEqual(days.refreshed, ['2026-09', '2026-10', '2026-11']);
  });

  it('tháng đã rời open nằm trong khoảng → bỏ qua tháng đó, các tháng open vẫn ghi', async () => {
    days.frozen = new Set(['2026-09', '2026-10']);
    await service.update('binh', { shiftType: 'FLEX', shiftStartTime: '13:00', shiftEndTime: '22:00' }, 'admin');
    assert.deepEqual(days.frozenAsked, [['2026-09-01', '2026-11-01']]);
    assert.deepEqual(days.refreshed, ['2026-11']);
  });

  it('tạo hồ sơ mới và deactivate vẫn ghi lại', async () => {
    await service.create(
      { username: 'chi', name: 'Chi', type: 'nv', level: 1, shiftType: 'NORMAL', effectiveFrom: '2026-10-01' },
      'admin'
    );
    assert.deepEqual(days.refreshed, ['2026-10', '2026-11']);
    days.refreshed.length = 0;
    assert.equal(await service.deactivate('chi', 'admin'), true);
    assert.deepEqual(days.refreshed, ['2026-10', '2026-11']);
  });

  it('deactivate người đã nghỉ cùng ngày vẫn ghi lại (không gác theo trường đổi)', async () => {
    await service.deactivate('binh', 'admin');
    days.refreshed.length = 0;
    await service.deactivate('binh', 'admin');
    assert.deepEqual(days.refreshed, ['2026-09', '2026-10', '2026-11']);
  });
});
