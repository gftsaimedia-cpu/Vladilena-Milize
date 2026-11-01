'use strict';
const { Rule, Violation } = require('../../shared/rule');
const { WorkedHours, EPS } = require('../worked-hours');

const shown = (n?) => Math.round(n * 100) / 100;

// Trần giờ OT một tháng (OT cộng giờ ca chính làm ngày lễ). Chặn 400 OT_MONTH_CAP khi vượt trần VÀ tăng so với lịch đang lưu
// (dữ liệu cũ đã vượt thì vẫn lưu được ngày khác).
// context: { limits: OtLimits, month, clean, prevDays, holidays }
class MonthlyOtCapRule extends Rule {
  static violationFor(limits?, month?, hours?, before?) {
    if (!(hours > limits.monthCap + EPS && hours > before + EPS)) return null;
    return Violation.block(
      'OT_MONTH_CAP',
      `Tháng ${month}: OT (kể cả giờ làm ngày lễ) tối đa ${limits.monthCap} giờ (đang khai ${shown(hours)} giờ)`
    );
  }

  async *evaluate({ limits, month, clean, prevDays, holidays = [] }: any) {
    const violation = MonthlyOtCapRule.violationFor(
      limits,
      month,
      await WorkedHours.monthOtHours(clean, holidays, month),
      await WorkedHours.monthOtHours(prevDays, holidays, month)
    );
    if (violation) yield violation;
  }
}

export = { MonthlyOtCapRule };
