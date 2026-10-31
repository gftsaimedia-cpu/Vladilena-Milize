'use strict';
// Sổ phép năm, vừa lưu vừa tính. Mỗi lần được cộng phép (qua tháng làm việc tròn, thâm niên, sinh nhật)
// hoặc phép hết hạn là MỘT dòng, có ngày phát sinh. Số dư hiện tại lưu sẵn ở staff.leave_balance (lib/domain/employee/schema.js).
// Cả sổ lẫn số dư đều do máy chủ tính lại theo đúng quy tắc của public/leave.js (LeaveAccountService), nên số lưu và số tính không bao giờ lệch nhau
// quá một nhịp làm mới; ngày nghỉ phép đã dùng và điều chỉnh tay của Admin không ghi vào sổ (đã có ở lịch và hồ sơ).
function ensureLeaveSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_uuid TEXT NOT NULL,
      username TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('start','month','seniority','birthday','expire')),
      on_date TEXT NOT NULL CHECK (date(on_date) IS on_date),
      days REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (staff_uuid, kind, on_date)
    );
    CREATE INDEX IF NOT EXISTS leave_ledger_staff ON leave_ledger (staff_uuid, on_date);
  `);
}

module.exports = { ensureLeaveSchema };
