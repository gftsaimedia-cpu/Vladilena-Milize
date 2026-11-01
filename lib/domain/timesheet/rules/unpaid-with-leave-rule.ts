'use strict';
const { Rule, Violation } = require('../../shared/rule');
const { DayMath } = require('../day-math');

// Phép năm: ngày phép chờ duyệt hoặc đã duyệt tính là đã dùng (chờ duyệt giữ chỗ); ngày bị từ chối trả lại phép (leaveDates).
// T2–T6 còn phép năm thì phải dùng phép năm, không được chọn "Nghỉ không lương" (thứ 7 chọn tự do; ngày đã lưu từ trước giữ nguyên).
// Phụ thuộc: leaveDates(u, { month, days }) và ledgerFor(date) trả sổ phép năm của tháng chứa date.
class UnpaidWithLeaveRule extends Rule {
  declare leaveDates: any;
  declare ledgerFor: any;

  constructor({ leaveDates, ledgerFor }: any) {
    super();
    this.leaveDates = leaveDates;
    this.ledgerFor = ledgerFor;
  }

  async *evaluate({ u, month, clean, prevDays, flags, workSchedule, workPlan }: any) {
    if (!flags.hasLeaveAccount) return;
    const all = await this.leaveDates(u, { month, days: clean });
    for (const [date, day] of Object.entries<any>(clean)) {
      if (day.kind !== 'unpaid' || prevDays[date]?.kind === 'unpaid') continue;
      const dow = DayMath.dayOfWeek(date);
      const before = await this.ledgerFor(date)(
        u,
        all.filter(x => x < date),
        date
      );
      const left = before.total - before.expired - before.used;
      // chỉ ngày thường nằm trong lịch của người
      if (dow >= 1 && dow <= 5 && workSchedule.isWorkDay(workPlan, date) && left >= 1 - 1e-6)
        yield Violation.warn(
          'SHEET_UNPAID_WITH_LEAVE',
          `Ngày ${date}: còn ${left} ngày phép năm — ngày thường phải dùng phép năm trước, hết phép mới được nghỉ không lương`,
          'Chọn nghỉ không lương thì ngày này không được trả lương và không trừ vào số phép còn lại.',
          { date }
        );
    }
  }
}

export = { UnpaidWithLeaveRule };
