'use strict';
// Đọc và ghi sổ phép (bảng leave_ledger) cùng số dư lưu sẵn (staff.leave_balance, leave_balance_on).
const { Repository } = require('../shared/repository');

const rowToEvent = r => ({ kind: r.kind, onDate: r.on_date, days: r.days });
const keyOf = e => `${e.kind}|${e.onDate}`;

class LeaveLedgerRepository extends Repository {
  eventsOf(staffUuid) {
    return this.all(
      'SELECT kind, on_date, days FROM leave_ledger WHERE staff_uuid = ? ORDER BY on_date, id',
      staffUuid
    ).map(rowToEvent);
  }

  // Đưa sổ của một người về đúng danh sách `events` (do quy tắc tính ra): thêm dòng thiếu, sửa số ngày đổi, bỏ dòng không còn đúng
  // (ví dụ Admin sửa ngày vào làm thì các mốc tháng tròn đổi). Trả số dòng đã đổi; không đổi gì thì không ghi.
  sync(staff, events, at) {
    const have = new Map(this.eventsOf(staff.uuid).map(e => [keyOf(e), e]));
    const want = new Map(events.map(e => [keyOf(e), e]));
    let changed = 0;
    for (const [key, e] of want) {
      const old = have.get(key);
      if (old && old.days === e.days) continue;
      this.run(
        `INSERT INTO leave_ledger (staff_uuid, username, kind, on_date, days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (staff_uuid, kind, on_date) DO UPDATE SET days = excluded.days, updated_at = excluded.updated_at`,
        staff.uuid,
        staff.username,
        e.kind,
        e.onDate,
        e.days,
        at,
        at
      );
      changed++;
    }
    for (const [key, e] of have)
      if (!want.has(key)) {
        this.run(
          'DELETE FROM leave_ledger WHERE staff_uuid = ? AND kind = ? AND on_date = ?',
          staff.uuid,
          e.kind,
          e.onDate
        );
        changed++;
      }
    return changed;
  }

  // Ghi số dư lưu sẵn; chỉ ghi khi khác số đang lưu. Trả true nếu có ghi
  saveBalance(username, balance, on) {
    return (
      this.run(
        `UPDATE staff SET leave_balance = ?, leave_balance_on = ?
         WHERE username = ? AND (leave_balance IS NOT ? OR leave_balance_on IS NOT ?)`,
        balance,
        on,
        username,
        balance,
        on
      ).changes > 0
    );
  }
}

module.exports = { LeaveLedgerRepository };
