import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { Employee } from '../../src/modules/employees/domain';

class FakeEmployeesRepository extends EmployeesRepository {
  employees: Map<string, Employee> = new Map();

  constructor() {
    super({} as any);
  }

  override async save(employee: Employee, _actor?: string): Promise<Employee> {
    this.employees.set(employee.username, employee);
    return employee;
  }

  override async findByUsernameOrUuid(id: string): Promise<Employee | null> {
    for (const emp of this.employees.values()) {
      if (emp.username === id || emp.profile.uuid === id) {
        return emp;
      }
    }
    return null;
  }

  override async findAll(): Promise<Employee[]> {
    return Array.from(this.employees.values());
  }
}

describe('Employees V2 - Quản lý nhân sự & Cập nhật hồ sơ Profile Drawer', () => {
  const repo = new FakeEmployeesRepository();
  const service = new EmployeesService(repo);

  it('1. Tạo nhân sự mới thành công với đầy đủ hồ sơ, chức vụ và ca', async () => {
    const employee = service.buildEmployeeFromInput({
      username: 'tran-minh-ngoc',
      name: 'Trần Minh Ngọc',
      birthday: '1996-11-20',
      dependants: 2,
      role: 'manager',
      type: 'ql',
      level: 3,
      jobTitle: 'Trưởng ca Vận hành Đêm',
      shiftType: 'NORMAL',
      shiftStartTime: '08:00',
      shiftEndTime: '17:00',
      hasInsurance: true,
      canAdvance: true,
    });

    const saved = await service.save(employee, 'admin');
    assert.equal(saved.username, 'tran-minh-ngoc');
    assert.equal(saved.profile.name.fullName, 'Trần Minh Ngọc');
    assert.equal(saved.contract.position.type, 'ql');
    assert.equal(saved.contract.position.level, 3);
    assert.equal(saved.contract.position.jobTitle, 'Trưởng ca Vận hành Đêm');
    assert.equal(saved.profile.dependants, 2);
  });

  it('2. Cập nhật hồ sơ (sửa Profile Drawer) hoàn toàn không phụ thuộc timesheets cũ', async () => {
    const existing = await service.findByUsernameOrUuid('tran-minh-ngoc');
    assert.ok(existing);

    // Cập nhật đổi bậc sang Fresher (1), đổi tên
    const updated = service.buildEmployeeFromInput(
      {
        name: 'Trần Minh Tuấn',
        level: 1,
        jobTitle: 'Trưởng ca Vận hành Ngày',
        hasInsurance: false,
      },
      existing
    );

    const saved = await service.save(updated, 'admin');
    assert.equal(saved.profile.name.fullName, 'Trần Minh Tuấn');
    assert.equal(saved.contract.position.level, 1);
    assert.equal(saved.contract.position.jobTitle, 'Trưởng ca Vận hành Ngày');
    assert.equal(saved.contract.hasInsurance, false);
    // Các trường khác được bảo toàn
    assert.equal(saved.contract.position.type, 'ql');
    assert.equal(saved.profile.dependants, 2);
  });

  it('3. Ngừng hoạt động (deactivate) nhân sự chuyển contract status sang nghiviec và lock account', async () => {
    const ok = await service.deactivate('tran-minh-ngoc', 'admin');
    assert.equal(ok, true);

    const check = await service.findByUsernameOrUuid('tran-minh-ngoc');
    assert.ok(check);
    assert.equal(check.contract.status, 'nghiviec');
    assert.equal(check.account.isLocked, true);
  });
});
