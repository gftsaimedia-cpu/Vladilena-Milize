'use strict';
// Giới hạn giờ làm theo trần mặc định của registry (law.ceiling.otDayTotalHours, law.ceiling.otMonthHours): giờ ròng một ngày, OT trong tháng,
// kiểm trần ngày / tháng cho một lịch khai. Luật nằm ở rules/*, bộ luật khai lịch ở SheetLimits; đây là chỗ nối chúng với trần mặc định.
// Các hàm tĩnh không dùng `this` nên nơi gọi lấy riêng từng hàm bằng destructuring được.
const { OtLimits } = require('./ot-limits');
const { WorkedHours } = require('./worked-hours');
const { SheetLimits } = require('./sheet-limits');
const { DayHoursCapRule } = require('./rules/day-hours-cap-rule');
const { MonthlyOtCapRule } = require('./rules/monthly-ot-cap-rule');
const { RuleSet } = require('../shared/rule');

const DEFAULT_LIMITS = OtLimits.defaults();
const sheetLimits = new SheetLimits();
const monthOtOnly = new RuleSet([new MonthlyOtCapRule()]);

const raise = (violation?) => {
  if (violation) violation.raise();
};

class HourLimits {
  static DAY_HOURS_CAP = DEFAULT_LIMITS.dayCap;
  static MONTH_OT_CAP = DEFAULT_LIMITS.monthCap;
  static extraSpanH = WorkedHours.extraSpanH;
  static monthOtHours = WorkedHours.monthOtHours;

  // Giờ nghỉ và mốc nghỉ của bộ tham số một tháng
  static breakOf(params?) {
    const worked = WorkedHours.forParams(params);
    return { breakHours: worked.breakHours, breakAfterHours: worked.breakAfterHours };
  }

  static dayNetHours(day, { holiday = false, breakHours, breakAfterHours }: any) {
    return new WorkedHours({ breakHours, breakAfterHours }).dayNetHours(day, { holiday });
  }

  static assertDayHours(date?, hours?) {
    raise(DayHoursCapRule.violationFor(DEFAULT_LIMITS, date, hours));
  }

  static assertMonthOt(month?, hours?, before?) {
    raise(MonthlyOtCapRule.violationFor(DEFAULT_LIMITS, month, hours, before));
  }

  static checkDayHours(args?) {
    return sheetLimits.checkDays(args);
  }

  static checkMonthOt({ month, clean, prevDays, holidays = [] }: any) {
    return monthOtOnly.check({ limits: DEFAULT_LIMITS, month, clean, prevDays, holidays });
  }

  static checkSheetLimits(args?) {
    return sheetLimits.checkMonth(args);
  }
}

export = { HourLimits };
