'use strict';
// Mặt tiền (facade) giữ nguyên tên hàm xuất cũ của giới hạn giờ làm và cửa sổ tạm ứng; thân hàm uỷ quyền cho các class:
//   lib/domain/overtime/   OtLimits (trần), WorkedHours (đo giờ), rules/* (luật), SheetLimits (bộ luật khai lịch)
//   lib/domain/advance/    AdvanceRequestWindow (cửa sổ xin tạm ứng)
// Code mới dùng thẳng các class; facade sẽ bỏ khi call site chuyển sang DI (G4).
const { OtLimits } = require('./overtime/ot-limits');
const { WorkedHours } = require('./overtime/worked-hours');
const { SheetLimits } = require('./overtime/sheet-limits');
const { DayHoursCapRule } = require('./overtime/rules/day-hours-cap-rule');
const { MonthlyOtCapRule } = require('./overtime/rules/monthly-ot-cap-rule');
const { RuleSet } = require('./shared/rule');
const { AdvanceRequestWindow } = require('./advance/advance-request-window');

// Trần mặc định của registry (law.ceiling.otDayTotalHours, law.ceiling.otMonthHours), giữ làm hằng cho nơi cũ và test
const DEFAULT_LIMITS = OtLimits.defaults();
const DAY_HOURS_CAP = DEFAULT_LIMITS.dayCap;
const MONTH_OT_CAP = DEFAULT_LIMITS.monthCap;

const sheetLimits = new SheetLimits();
const monthOtOnly = new RuleSet([new MonthlyOtCapRule()]);
const advanceWindow = new AdvanceRequestWindow();

const raise = violation => {
  if (violation) violation.raise();
};
const breakOf = params => {
  const worked = WorkedHours.forParams(params);
  return { breakHours: worked.breakHours, breakAfterHours: worked.breakAfterHours };
};

module.exports = {
  DAY_HOURS_CAP,
  MONTH_OT_CAP,
  extraSpanH: WorkedHours.extraSpanH,
  dayNetHours: (day, { holiday = false, breakHours, breakAfterHours }) =>
    new WorkedHours({ breakHours, breakAfterHours }).dayNetHours(day, { holiday }),
  monthOtHours: WorkedHours.monthOtHours,
  assertDayHours: (date, hours) => raise(DayHoursCapRule.violationFor(DEFAULT_LIMITS, date, hours)),
  assertMonthOt: (month, hours, before) => raise(MonthlyOtCapRule.violationFor(DEFAULT_LIMITS, month, hours, before)),
  checkDayHours: args => sheetLimits.checkDays(args),
  checkMonthOt: ({ month, clean, prevDays, holidays = [] }) =>
    monthOtOnly.check({ limits: DEFAULT_LIMITS, month, clean, prevDays, holidays }),
  checkSheetLimits: args => sheetLimits.checkMonth(args),
  breakOf,
  ADVANCE_REQUEST_DAYS: AdvanceRequestWindow.REQUEST_DAYS,
  advanceWindow: today => advanceWindow.view(today),
  advanceWindowOpen: today => advanceWindow.isOpen(today),
  assertAdvanceWindowOpen: today => advanceWindow.assertOpen(today),
  assertAdvanceMonthCurrent: (month, today) => advanceWindow.assertMonthCurrent(month, today)
};
