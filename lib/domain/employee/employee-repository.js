'use strict';
// Đọc hồ sơ nhân viên (bảng staff) theo uuid hoặc tài khoản. Ghi hồ sơ vẫn đi qua PUT /api/staff/:u (server.js → store.upsertStaff),
// nơi đã có quyền theo trường, khoá lạc quan và nhật ký; repository này không có đường ghi thứ hai.
const { Repository } = require('../shared/repository');
const { Profile } = require('./profile');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class EmployeeRepository extends Repository {
  async byUuid(uuid) {
    if (!UUID_RE.test(String(uuid))) return null;
    const row = await this.one('SELECT * FROM staff WHERE uuid = ?', uuid);
    return row ? Profile.fromRow(row) : null;
  }

  async byUsername(username) {
    const row = await this.one('SELECT * FROM staff WHERE username = ?', username);
    return row ? Profile.fromRow(row) : null;
  }

  async uuidOf(username) {
    const row = await this.one('SELECT uuid FROM staff WHERE username = ?', username);
    return row ? row.uuid : null;
  }

  // Mọi hồ sơ; onDate: bỏ người đã nghỉ việc trước ngày đó
  list({ onDate } = {}) {
    return this.all('SELECT * FROM staff ORDER BY role, type, name')
      .map(Profile.fromRow)
      .filter(p => !onDate || !p.isResignedBy(onDate));
  }
}

module.exports = { EmployeeRepository, UUID_RE };
