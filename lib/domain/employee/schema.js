'use strict';
// Danh tính nhân viên nằm trên bảng staff (MỘT bảng người), không tách sang bảng profiles:
//   uuid             mã định danh không đổi, dùng để truy vết (nhật ký ghi kèm subject_uuid / actor_uuid)
//   family_name      họ và tên đệm, viết hoa chữ đầu ("Hồ Thị Khánh")
//   given_name       tên, là chữ cuối ("Huyền")
//   contract_status  'probation' (thử việc) | 'official' (chính thức) | NULL (Admin chưa nhập); chỉ để hiển thị, không đổi tiền
//   resigned_on      ngày nghỉ việc 'YYYY-MM-DD' | NULL (còn làm)
//   leave_balance    số phép năm còn lại lưu sẵn, máy chủ tính lại theo public/leave.js (lib/domain/leave); NULL = chưa tính hoặc không có tài khoản phép
//   leave_balance_on ngày tính số dư trên
// username vẫn là khoá của các bảng cũ nên bị khoá không cho đổi (trigger), uuid sinh một lần và cũng không đổi.
const crypto = require('node:crypto');
const { PersonName } = require('./person-name');

// UUID phiên bản 4 sinh bằng SQL: dòng thêm thẳng bằng câu lệnh (script, test) vẫn có uuid
const SQL_UUID = `lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2)
  || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))`;

// helpers: addColumn, once của lib/db.js
function ensureEmployeeSchema(db, { addColumn, once }) {
  for (const [column, type] of [
    ['uuid', 'TEXT'],
    ['family_name', 'TEXT'],
    ['given_name', 'TEXT'],
    ['contract_status', "TEXT CHECK (contract_status IS NULL OR contract_status IN ('probation','official'))"],
    ['resigned_on', 'TEXT'],
    ['leave_balance', 'REAL'],
    ['leave_balance_on', 'TEXT']
  ])
    addColumn('staff', column, type);
  // Nhật ký chỉ thêm dòng (trigger chặn sửa) nên dòng cũ không điền ngược được; tra theo uuid thì gộp thêm dòng cũ có subject = username
  addColumn('audit_log', 'subject_uuid', 'TEXT');
  addColumn('audit_log', 'actor_uuid', 'TEXT');
  once('staff_identity_v1', () => {
    const rows = db.prepare('SELECT username, name FROM staff WHERE uuid IS NULL OR given_name IS NULL').all();
    const fill = db.prepare(
      `UPDATE staff SET uuid = COALESCE(uuid, ?), family_name = COALESCE(family_name, ?), given_name = COALESCE(given_name, ?)
       WHERE username = ?`
    );
    for (const row of rows) {
      const name = PersonName.parse(row.name);
      fill.run(crypto.randomUUID(), name.familyName, name.givenName, row.username);
    }
  });
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS staff_uuid ON staff (uuid);
    CREATE INDEX IF NOT EXISTS audit_subject_uuid ON audit_log (subject_uuid, id);
    CREATE TRIGGER IF NOT EXISTS staff_username_fixed BEFORE UPDATE OF username ON staff
      WHEN NEW.username IS NOT OLD.username
      BEGIN SELECT RAISE(ABORT, 'staff.username không đổi được: truy vết bằng uuid'); END;
    CREATE TRIGGER IF NOT EXISTS staff_uuid_fixed BEFORE UPDATE OF uuid ON staff
      WHEN OLD.uuid IS NOT NULL AND NEW.uuid IS NOT OLD.uuid
      BEGIN SELECT RAISE(ABORT, 'staff.uuid không đổi được'); END;
    CREATE TRIGGER IF NOT EXISTS staff_uuid_default AFTER INSERT ON staff
      WHEN NEW.uuid IS NULL
      BEGIN UPDATE staff SET uuid = ${SQL_UUID} WHERE username = NEW.username; END;
  `);
}

module.exports = { ensureEmployeeSchema };
