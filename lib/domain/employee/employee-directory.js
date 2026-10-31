'use strict';
// Dựng Nhân viên của một tháng từ ba nguồn: hồ sơ (EmployeeRepository), danh mục chức vụ (PositionCatalog), danh mục ca (ShiftCatalog);
// và tra lịch sử thay đổi của một người theo uuid (nhật ký kiểm toán).
const { Employee } = require('./employee');

class EmployeeDirectory {
  // employees: EmployeeRepository; positions: PositionCatalog; shifts: ShiftCatalog; audit: store.audit (lib/db.js)
  constructor({ employees, positions, shifts, audit }) {
    this.employees = employees;
    this.positions = positions;
    this.shifts = shifts;
    this.audit = audit;
  }

  #compose(profile, month) {
    return new Employee({
      profile,
      position: this.positions.position(profile.type, profile.level, month),
      shift: this.shifts.find(profile.shiftCode)
    });
  }

  byUuid(uuid, month) {
    const profile = this.employees.byUuid(uuid);
    return profile ? this.#compose(profile, month) : null;
  }

  byUsername(username, month) {
    const profile = this.employees.byUsername(username);
    return profile ? this.#compose(profile, month) : null;
  }

  // Các dòng nhật ký về một người, mới nhất trước. Dòng ghi trước khi có uuid (chỉ có subject = username) cũng được gộp,
  // vì username không đổi được (trigger staff_username_fixed) nên ánh xạ username ↔ uuid là cố định.
  trace(uuid, { limit, beforeId, sensitivities } = {}) {
    const profile = this.employees.byUuid(uuid);
    if (!profile) return null;
    return {
      uuid: profile.uuid,
      username: profile.username,
      items: this.audit.list({
        person: { uuid: profile.uuid, username: profile.username },
        limit,
        beforeId,
        sensitivities
      })
    };
  }
}

module.exports = { EmployeeDirectory };
