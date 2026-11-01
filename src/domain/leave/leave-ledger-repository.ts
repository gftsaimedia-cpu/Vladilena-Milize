'use strict';
// Đọc và ghi sổ phép (bảng leave_ledger) cùng số dư lưu sẵn (staff.leave_balance, leave_balance_on).
const { LeaveLedgerRepository: LedgerTable } = require('../../data');
const { Repository } = require('../shared/repository');

const rowToEvent = (r?) => ({ kind: r.kind, onDate: r.on_date, days: r.days });
const keyOf = (e?) => `${e.kind}|${e.onDate}`;

class LeaveLedgerRepository extends Repository {
  declare table: any;

  constructor(deps?) {
    super(deps);
    this.table = new LedgerTable(this.queryBuilder);
  }

  async eventsOf(staffUuid?) {
    return (await this.table.eventsOf(staffUuid)).map(rowToEvent);
  }

  // Đưa sổ của một người về đúng danh sách `events` (do quy tắc tính ra): thêm dòng thiếu, sửa số ngày đổi, bỏ dòng không còn đúng
  // (ví dụ Admin sửa ngày vào làm thì các mốc tháng tròn đổi). Trả số dòng đã đổi; không đổi gì thì không ghi.
  async sync(staff?, events?, at?) {
    const have = new Map<any, any>((await this.eventsOf(staff.uuid)).map(e => [keyOf(e), e]));
    const want = new Map<any, any>(events.map(e => [keyOf(e), e]));
    let changed = 0;
    for (const [key, e] of want) {
      const old = have.get(key);
      if (old && old.days === e.days) continue;
      await this.table.upsert({
        staffUuid: staff.uuid,
        username: staff.username,
        kind: e.kind,
        onDate: e.onDate,
        days: e.days,
        at
      });
      changed++;
    }
    for (const [key, e] of have)
      if (!want.has(key)) {
        await this.table.remove(staff.uuid, e.kind, e.onDate);
        changed++;
      }
    return changed;
  }

  // Ghi số dư lưu sẵn; chỉ ghi khi khác số đang lưu. Trả true nếu có ghi
  async saveBalance(username?, balance?, on?) {
    return await this.table.saveBalance(username, balance, on);
  }
}

export = { LeaveLedgerRepository };
