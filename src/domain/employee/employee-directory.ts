'use strict';
// Dựng Nhân viên của một tháng từ ba nguồn: hồ sơ (EmployeeRepository), danh mục chức vụ (PositionCatalog), danh mục ca (ShiftCatalog);
// và tra lịch sử thay đổi của một người theo uuid (nhật ký kiểm toán).
const { Employee } = require('./employee');

class EmployeeDirectory {
  declare employees: any;
  declare positions: any;
  declare shifts: any;
  declare audit: any;

  // employees: EmployeeRepository; positions: PositionCatalog; shifts: ShiftCatalog; audit: store.audit (src/platform/db.ts)
  constructor({ employees, positions, shifts, audit }: any) {
    this.employees = employees;
    this.positions = positions;
    this.shifts = shifts;
    this.audit = audit;
  }

  async #compose(profile?, month?) {
    return new Employee({
      profile,
      position: await this.positions.position(profile.type, profile.level, month),
      shift: await this.shifts.find(profile.shiftCode)
    });
  }

  async byUuid(uuid?, month?) {
    const profile = await this.employees.byUuid(uuid);
    return profile ? await this.#compose(profile, month) : null;
  }

  async byUsername(username?, month?) {
    const profile = await this.employees.byUsername(username);
    return profile ? await this.#compose(profile, month) : null;
  }

  // Các dòng nhật ký về một người, mới nhất trước. Dòng ghi trước khi có uuid (chỉ có subject = username) cũng được gộp,
  // vì username không đổi được (trigger staff_username_fixed) nên ánh xạ username ↔ uuid là cố định.
  async trace(uuid?, { limit, beforeId, sensitivities }: any = {}) {
    const profile = await this.employees.byUuid(uuid);
    if (!profile) return null;
    return {
      uuid: profile.uuid,
      username: profile.username,
      items: await this.audit.list({
        person: { uuid: profile.uuid, username: profile.username },
        limit,
        beforeId,
        sensitivities
      })
    };
  }
}

export = { EmployeeDirectory };
