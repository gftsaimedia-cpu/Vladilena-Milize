'use strict';
// Tài khoản phép năm của nhân viên: lưu số phép hiện tại và tự cập nhật DB mỗi khi qua tháng làm việc tròn hoặc sinh nhật.
// Cách làm: máy chủ tính lại theo src/engine/leave.ts (một nguồn quy tắc, giữ nguyên hết hạn và quy tiền phép dư), rồi ghi số dư vào staff.leave_balance
// và các lần cộng/hết hạn vào sổ leave_ledger. Chạy khi máy chủ khởi động, rồi mỗi config.LEAVE_REFRESH_MS; xem sổ của một người cũng làm mới người đó.
// Một hồ sơ lỗi không làm dừng cả lượt: lỗi được ghi nhật ký chạy và bỏ qua người đó.
const { accrualEvents } = require('./leave-events');

class LeaveAccountService {
  declare ledger: any;
  declare store: any;
  declare rules: any;
  declare reported: any;

  // ledger: LeaveLedgerRepository; store: src/platform/db.ts (đọc hồ sơ); rules: { rulesFor, benefitOf, leaveDates, vnToday, nowIso }
  constructor({ ledger, store, rules }: any) {
    this.ledger = ledger;
    this.store = store;
    this.rules = rules;
    this.reported = new Set();
  }

  // Người này có tài khoản phép không (cờ leaveAccount của chức vụ/bậc, có ngày vào làm, có trong bảng lương)
  hasAccount(staff?, params?) {
    const { benefitOf } = this.rules;
    return (
      !!staff &&
      !!staff.uuid &&
      staff.payrollSubject &&
      !!staff.startDate &&
      benefitOf(params, staff.type, 'leaveAccount', staff.level)
    );
  }

  // Tính lại và lưu cho một người. Trả { balance, on, summary, events } hoặc null nếu người này không có tài khoản phép
  async refresh(staff?, today = this.rules.vnToday()) {
    const { rulesFor, leaveDates, nowIso } = this.rules;
    const { params, leave } = await rulesFor(today.slice(0, 7));
    if (!this.hasAccount(staff, params)) {
      if (staff && staff.leaveBalance != null) await this.ledger.saveBalance(staff.username, null, null);
      return null;
    }
    // Đã nghỉ việc: số dư chốt ở ngày nghỉ việc
    const upTo = staff.resignedOn && staff.resignedOn < today ? staff.resignedOn : today;
    const used = (await leaveDates(staff)).filter(d => d <= upTo);
    const summary = leave.ledger(staff, used, upTo);
    const events = [
      ...accrualEvents(staff, upTo, params),
      ...summary.settled.filter(s => s.days > 0).map(s => ({ kind: 'expire', onDate: s.on, days: -s.days }))
    ];
    await this.ledger.transaction(async () => {
      await this.ledger.sync(staff, events, nowIso());
      await this.ledger.saveBalance(staff.username, summary.balance, upTo);
    });
    const { settled, ...rest } = summary;
    return { balance: summary.balance, on: upTo, summary: rest, events };
  }

  // Làm mới mọi người. Trả { checked, accounts, failed }: checked = số hồ sơ đã xét (giữ cho tương thích),
  // accounts = số người có tài khoản phép (màn Admin báo số này, không đếm người không có phép)
  async refreshAll(today = this.rules.vnToday()) {
    let checked = 0,
      accounts = 0,
      failed = 0;
    for (const staff of await this.store.listStaff()) {
      try {
        if (await this.refresh(staff, today)) accounts++;
        checked++;
      } catch (error) {
        failed++;
        const mark = `${staff.username}:${error && error.code}`;
        if (!this.reported.has(mark)) {
          this.reported.add(mark);
          console.error(
            `[leave] không tính được phép của ${staff.username}: ${String(error && error.message).slice(0, 200)}`
          );
        }
      }
    }
    return { checked, accounts, failed };
  }

  // Hẹn giờ chạy (gọi từ khối khởi động của server.js). Trả hàm dừng
  start(intervalMs?) {
    const run = () => this.refreshAll();
    const first = setImmediate(run);
    const timer = setInterval(run, intervalMs);
    timer.unref();
    return () => {
      clearImmediate(first);
      clearInterval(timer);
    };
  }
}

export = { LeaveAccountService };
