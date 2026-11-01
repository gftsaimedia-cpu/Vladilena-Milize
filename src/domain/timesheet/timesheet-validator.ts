'use strict';
const { HttpError } = require('../../platform/http');
const { RuleSet } = require('../shared/rule');
const { SheetContext } = require('./sheet-context');
const { ShiftAssignment } = require('./shift-assignment');
const { ConsecutiveDaysOverlapRule, MonthBoundaryOverlapRule } = require('./rules/overlap-rules');
const {
  MakeupDayRule,
  SundayRule,
  IsatDayRule,
  OffScheduleRule,
  HolidayMakeupRule
} = require('./rules/day-calendar-rules');
const { ExtraNightRule, HolidayOtSpillRule } = require('./rules/extra-hours-rules');
const {
  MakeupHoursBenefitRule,
  OtBenefitRule,
  HolidayOtBenefitRule,
  ApprovedLeaveBenefitRule,
  AbsenceDeclarationRule
} = require('./rules/benefit-rules');
const { UnpaidWithLeaveRule } = require('./rules/unpaid-with-leave-rule');

// Kiểm tra nghiệp vụ khi lưu Lịch ước tính (PUT /api/sheet). Chạy trên hồ sơ của người sở hữu lịch (khai thay: người được khai).
// Lịch VẪN được lưu, mỗi vi phạm là một cảnh báo nói chuyện gì, ngày nào và hệ quả cho tiền lương. Hệ quả tiền đã đối chiếu với bộ máy
// (src/engine/payroll-engine.ts, src/engine/work-schedule.ts):
//   - ngày ngoài lịch làm việc (kể cả Chủ nhật): ca chính không có tiền; chỉ đoạn OT đã duyệt và có chấm công liền mạch được trả;
//   - giờ vào – ra khác ca cố định: nhân sự tự khai vẫn tính theo ca được gán; Admin khai thay tính theo ca Admin chọn;
//   - OT chỉ ra tiền khi chức vụ có quyền lợi OT và Admin đã duyệt khoản; hai trần giờ chặn khi lưu (src/domain/overtime);
//   - iSAT chỉ trả khi chức vụ có quyền lợi iSAT và đúng thứ trong tuần; khai sai thứ hoặc sai quyền lợi bị chặn;
//   - ngày phép năm trả lương ngày theo chức vụ, bộ máy không xét số dư phép;
//   - lương ngày công tính theo ngày, không theo giờ: hai ngày chồng giờ chỉ ảnh hưởng giờ làm thêm.
// Kiểm định dạng (ngày không thuộc tháng...) vẫn chặn.
//
// Thứ tự kiểm là thứ tự cảnh báo trả cho giao diện (test so cả mảng), nên các bộ luật dưới đây giữ đúng thứ tự cũ:
//   1. sheetRules   cả lịch: chồng giờ giữa hai ngày liền nhau, chồng giờ qua ranh giới tháng
//   2. với mỗi ngày: dayBefore → ShiftAssignment (gán preset rồi nêu cảnh báo ca) → dayAfter
//   3. leaveRules   cả lịch: nghỉ không lương khi còn phép năm
//   4. dayLimits    trần giờ ngày (src/domain/overtime)
// Thêm luật mới = thêm một class Rule vào bộ phù hợp (tham số ruleSets hoặc mặc định dưới đây); validate() không phải sửa.
class TimesheetValidator {
  [key: string]: any;

  declare ruleSets: any;

  // rulesFor(month) → { punch, params, workSchedule }; schedule.scheduleOf(u, month); sheetFlagsOf(params, type, level);
  // holidays() → mảng ngày lễ; dayLimits({ params, clean, prevDays, holidays }) ném khi vượt trần ngày
  constructor({
    rulesFor,
    schedule,
    sheetFlagsOf,
    holidays,
    neighborDays,
    leaveDates,
    ledgerFor,
    isatRefusal,
    dayLimits,
    shifts = new ShiftAssignment(),
    ruleSets = {}
  }: any) {
    Object.assign(this, { rulesFor, schedule, sheetFlagsOf, holidays, dayLimits, shifts });
    this.ruleSets = {
      sheetRules: new RuleSet([new ConsecutiveDaysOverlapRule(), new MonthBoundaryOverlapRule({ neighborDays })]),
      dayBefore: new RuleSet([
        new MakeupDayRule(),
        new SundayRule(),
        new IsatDayRule({ isatRefusal }),
        new OffScheduleRule(),
        new HolidayMakeupRule()
      ]),
      dayAfter: new RuleSet([
        new ExtraNightRule(),
        new HolidayOtSpillRule(),
        new MakeupHoursBenefitRule(),
        new OtBenefitRule(),
        new HolidayOtBenefitRule(),
        new ApprovedLeaveBenefitRule(),
        new AbsenceDeclarationRule()
      ]),
      leaveRules: new RuleSet([new UnpaidWithLeaveRule({ leaveDates, ledgerFor })]),
      ...ruleSets
    };
  }

  // clean: ngày đã làm sạch (cleanDays); ngày đi làm được gán clean[d].preset (mã ca của ngày).
  // onBehalf: Admin khai thay (khoản Admin có quyền duyệt được duyệt luôn trong cùng lần lưu, src/domain/sheet-on-behalf.ts):
  // câu cảnh báo không nói "chờ duyệt". Trả { sheetParams, sched, holidays } cho phần còn lại của PUT /sheet.
  async validate({ u, month, clean, prevDays, onBehalf = false }: any) {
    const rules = await this.rulesFor(month);
    const sched = await this.schedule.scheduleOf(u, month); // lịch làm việc của người trong tháng (một nguồn: src/engine/work-schedule.ts)
    const holidays = new Set<any>(await this.holidays());
    const sheet = new SheetContext({
      u,
      month,
      clean,
      prevDays,
      onBehalf,
      rules,
      sched,
      flags: this.sheetFlagsOf(rules.params, u.type, u.level),
      holidays
    });
    const { sheetRules, dayBefore, dayAfter, leaveRules } = this.ruleSets;
    await sheetRules.check(sheet);
    for (const date of Object.keys(clean)) {
      if (!date.startsWith(month)) throw new HttpError(400, `Ngày ${date} không thuộc tháng ${month}`);
      const day = sheet.day(date);
      await dayBefore.check(day);
      const shift = this.shifts.resolve(day);
      if (shift.preset !== undefined) day.c.preset = shift.preset;
      for (const violation of shift.violations) violation.raise();
      await dayAfter.check(day);
    }
    await leaveRules.check(sheet);
    await this.dayLimits({ params: rules.params, clean, prevDays, holidays });
    return { sheetParams: rules.params, sched, holidays };
  }
}

export = { TimesheetValidator };
