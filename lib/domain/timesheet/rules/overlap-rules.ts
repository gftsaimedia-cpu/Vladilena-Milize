'use strict';
const { Rule, Violation } = require('../../shared/rule');
const { DayMath } = require('../day-math');

const { sameHours } = DayMath;
const CODE = 'SHEET_DAYS_OVERLAP';
const NOTE =
  'Lương ngày công tính theo ngày nên không bị tính hai lần, nhưng giờ làm thêm ở phần chồng có thể bị tính hai lần.';
const overlap = (date?, message?) => Violation.warn(CODE, `${message}. ${NOTE}`, undefined, { date });

// Không được chồng giờ sang ngày hôm sau: kết thúc (giờ ra / giờ ra làm thêm) phải <= lúc bắt đầu (giờ vào làm thêm / giờ vào) ngày kế tiếp.
// Không chặn lại cặp giờ đã lưu chưa sửa: dữ liệu đã lưu có thể gắn ca sau 0h với ngày bắt đầu ca đêm. Mỗi luật nhận SheetContext.

// Hai ngày liền nhau trong cùng lần lưu
class ConsecutiveDaysOverlapRule extends Rule {
  *evaluate({ clean, prevDays, punch }: any) {
    const sorted = Object.keys(clean).sort();
    for (let i = 0; i + 1 < sorted.length; i++) {
      const [today, tomorrow] = [sorted[i], sorted[i + 1]];
      const a = clean[today],
        b = clean[tomorrow];
      if (DayMath.shiftDate(today, 1) !== tomorrow || !a.in || !b.in) continue;
      if (sameHours(a, prevDays[today]) && sameHours(b, prevDays[tomorrow])) continue;
      if (punch.workBounds(a, today).end > punch.workBounds(b, tomorrow).start)
        yield overlap(today, `Ngày ${today}: giờ ra không được sau giờ vào ngày hôm sau (${b.extraIn || b.in})`);
    }
  }
}

// Qua ranh giới tháng: ngày cuối tháng trước ↔ ngày 1 tháng này, ngày cuối tháng này ↔ ngày 1 tháng sau
// (chỉ kiểm khi ngày giáp ranh của tháng này vừa đổi)
class MonthBoundaryOverlapRule extends Rule {
  declare neighborDays: any;

  constructor({ neighborDays }: any) {
    super();
    this.neighborDays = neighborDays;
  }

  async *evaluate({ u, month, clean, prevDays, punch }: any) {
    const isWork = (x?) => x && x.kind === 'work' && x.in && x.out;
    const changed = (date?) => !sameHours(clean[date], prevDays[date]);
    const first = `${month}-01`,
      last = DayMath.lastDayOf(month);
    for (const [date, x] of Object.entries<any>(await this.neighborDays(u.username, month))) {
      if (
        date < first &&
        changed(first) &&
        isWork(x) &&
        isWork(clean[first]) &&
        punch.workBounds(x, date).end > punch.workBounds(clean[first], first).start
      )
        yield overlap(
          first,
          `Ngày ${first}: giờ vào ${clean[first].extraIn || clean[first].in} không được trước giờ ra ngày ${date} (${x.extraOut || x.out})`
        );
      if (
        date > last &&
        changed(last) &&
        isWork(clean[last]) &&
        isWork(x) &&
        punch.workBounds(clean[last], last).end > punch.workBounds(x, date).start
      )
        yield overlap(
          last,
          `Ngày ${last}: giờ ra ${clean[last].extraOut || clean[last].out} không được sau giờ vào ngày ${date} (${x.extraIn || x.in})`
        );
    }
  }
}

export = { ConsecutiveDaysOverlapRule, MonthBoundaryOverlapRule };
