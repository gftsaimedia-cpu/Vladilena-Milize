'use strict';
const { RuleSet } = require('../shared/rule');
const { OtLimits } = require('./ot-limits');
const { DayHoursCapRule } = require('./rules/day-hours-cap-rule');
const { MonthlyOtCapRule } = require('./rules/monthly-ot-cap-rule');
const { IsatMonthlyLimitRule } = require('./rules/isat-monthly-limit-rule');

// Giới hạn khai của Lịch ước tính (PUT /api/sheet), gom theo mục đích. Thêm giới hạn mới = thêm một Rule vào đúng bộ dưới đây.
//   perDay    kiểm từng ngày vừa đổi
//   perMonth  kiểm cả tháng (trần OT chặn, rồi iSAT cảnh báo: thứ tự giữ như trước)
class SheetLimits {
  declare perDay: any;
  declare perMonth: any;

  constructor({
    perDay = new RuleSet([new DayHoursCapRule()]),
    perMonth = new RuleSet([new MonthlyOtCapRule(), new IsatMonthlyLimitRule()])
  }: any = {}) {
    this.perDay = perDay;
    this.perMonth = perMonth;
  }

  async checkDays({ params, clean, prevDays, holidays = [] }: any) {
    await this.perDay.check({ limits: OtLimits.of(params), params, clean, prevDays, holidays });
  }

  async checkMonth({ params, month, clean, prevDays, holidays = [] }: any) {
    await this.perMonth.check({ limits: OtLimits.of(params), params, month, clean, prevDays, holidays });
  }
}

export = { SheetLimits };
