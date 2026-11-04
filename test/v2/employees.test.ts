import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { EmployeesRepository, type StaffRow } from '../../src/modules/employees/employees.repository';
import { Employee } from '../../src/modules/employees/domain';

// Một dòng `staff` đủ cột như PostgreSQL trả về (BIGINT đã parse thành number); ghi đè cột cần thử.
function staffRow(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    username: 'nguyen-van-a',
    name: 'Nguyễn Văn A',
    role: 'staff',
    type: 'nv',
    level: 1,
    idorm: 0,
    pass_hash: 'none',
    created_at: '2026-01-05T01:00:00.000Z',
    start_date: '2026-01-05',
    birthday: null,
    contract: null,
    insured: null,
    dependants: 0,
    job_title: null,
    tax_on: 1,
    deduct_on: null,
    advance_on: 1,
    locked_at: null,
    locked_by: null,
    session_version: 0,
    payroll_subject: 1,
    uuid: '6f1c2a4e-0d4b-4b8e-9a51-2f0c3d9e7a10',
    family_name: 'Nguyễn',
    given_name: 'Văn A',
    contract_status: 'official',
    resigned_on: null,
    leave_balance: 12,
    leave_balance_on: null,
    shift_type: 'NORMAL',
    shift_start_time: '08:00',
    shift_end_time: '17:00',
    shift_allowance_pct: 0,
    leave_total_days: 12,
    leave_used_days: 0,
    ...overrides,
  };
}

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

describe('Employees V2 - Nhãn hợp đồng (staff.contract) & cờ bảo hiểm (staff.insured)', () => {
  const service = new EmployeesService(new FakeEmployeesRepository());

  it('1. Đọc rồi ghi lại hồ sơ giữ đúng nhãn hợp đồng; giá trị không phải nhãn thành NULL', () => {
    const cases: Array<[string | null, string | null]> = [
      ['long', 'long'],
      ['short', 'short'],
      [null, null],
      ['', null],
      ['2026-12-31', null],
    ];
    for (const [stored, written] of cases) {
      const employee = EmployeesRepository.fromRow(staffRow({ contract: stored }));
      assert.equal(EmployeesRepository.toRow(employee).contract, written, `contract ${stored}`);
    }
  });

  it('2. Đọc rồi ghi lại hồ sơ giữ đúng cờ bảo hiểm NULL / 0 / 1', () => {
    for (const insured of [null, 0, 1]) {
      const employee = EmployeesRepository.fromRow(staffRow({ insured }));
      assert.equal(EmployeesRepository.toRow(employee).insured, insured, `insured ${insured}`);
    }
  });

  it('3. Thân PUT của form web (contract, insured ở cấp ngoài) ghi đúng nhãn và cờ', () => {
    const existing = EmployeesRepository.fromRow(staffRow({ contract: 'long', insured: 1 }));
    const cases: Array<[Record<string, unknown>, string | null, number | null]> = [
      [{ contract: 'short', insured: null }, 'short', null],
      [{ contract: 'long', insured: false }, 'long', 0],
      [{ contract: null, insured: true }, null, 1],
      [{ contract: '', insured: null }, null, null],
    ];
    for (const [body, contract, insured] of cases) {
      const row = EmployeesRepository.toRow(service.buildEmployeeFromInput(body, existing));
      assert.equal(row.contract, contract, `contract ${JSON.stringify(body)}`);
      assert.equal(row.insured, insured, `insured ${JSON.stringify(body)}`);
    }
  });

  it('4. Sửa trường khác (đổi tên) giữ nguyên nhãn hợp đồng và cờ bảo hiểm NULL', () => {
    const existing = EmployeesRepository.fromRow(staffRow({ contract: 'short', insured: null }));
    const row = EmployeesRepository.toRow(service.buildEmployeeFromInput({ name: 'Nguyễn Văn B' }, existing));
    assert.equal(row.name, 'Nguyễn Văn B');
    assert.equal(row.contract, 'short');
    assert.equal(row.insured, null);
  });

  it('5. Nhân sự mới không gửi nhãn hay cờ bảo hiểm thì cả hai là NULL (theo mặc định của hợp đồng)', () => {
    const employee = service.buildEmployeeFromInput({ username: 'le-thi-c', name: 'Lê Thị C', type: 'tts' });
    const row = EmployeesRepository.toRow(employee);
    assert.equal(row.contract, null);
    assert.equal(row.insured, null);
  });

  it('6. Thân dạng DTO (contract là object) đọc nhãn từ contract.term và cờ từ contract.hasInsurance', () => {
    const existing = EmployeesRepository.fromRow(staffRow({ contract: 'short', insured: null }));
    const row = EmployeesRepository.toRow(
      service.buildEmployeeFromInput({ contract: { term: 'long', hasInsurance: false } }, existing)
    );
    assert.equal(row.contract, 'long');
    assert.equal(row.insured, 0);
  });

  it('7. Nhãn hợp đồng hoặc cờ bảo hiểm sai kiểu bị từ chối', () => {
    const existing = EmployeesRepository.fromRow(staffRow({ contract: 'long', insured: 1 }));
    assert.throws(() => service.buildEmployeeFromInput({ contract: 'medium' }, existing), /hợp đồng/);
    assert.throws(() => service.buildEmployeeFromInput({ insured: 'yes' }, existing), /bảo hiểm/);
  });

  it('8. Hồ sơ trả về API có nhãn hợp đồng và cờ bảo hiểm NULL', () => {
    const dto = EmployeesRepository.fromRow(staffRow({ contract: 'short', insured: null })).toDTO();
    assert.equal(dto.contract.term, 'short');
    assert.equal(dto.contract.hasInsurance, null);
  });
});
