'use strict';
// Đọc hồ sơ nhân viên (bảng staff) theo uuid hoặc tài khoản. Ghi hồ sơ vẫn đi qua PUT /api/staff/:u (server.js → store.upsertStaff),
// nơi đã có quyền theo trường, khoá lạc quan và nhật ký; repository này không có đường ghi thứ hai.
const { StaffRepository } = require('../../data');
const { Repository } = require('../shared/repository');
const { Profile } = require('./profile');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class EmployeeRepository extends Repository {
  declare staff: any;

  constructor(deps?) {
    super(deps);
    this.staff = new StaffRepository(this.queryBuilder);
  }

  async byUuid(uuid?) {
    if (!UUID_RE.test(String(uuid))) return null;
    const row = await this.staff.findByUuid(uuid);
    return row ? Profile.fromRow(row) : null;
  }

  async byUsername(username?) {
    const row = await this.staff.find(username);
    return row ? Profile.fromRow(row) : null;
  }

  async uuidOf(username?) {
    const row = await this.staff.uuidOf(username);
    return row ? row.uuid : null;
  }

  // Mọi hồ sơ; onDate: bỏ người đã nghỉ việc trước ngày đó
  async list({ onDate }: any = {}) {
    return (await this.staff.all()).map(Profile.fromRow).filter(p => !onDate || !p.isResignedBy(onDate));
  }
}

export = { EmployeeRepository, UUID_RE };
