'use strict';
// Nơi nối các lớp kiểm lịch khai (TimesheetValidator, SheetRevision, ExtraTimes) với phụ thuộc thật: kho dữ liệu, luật theo tháng,
// ngày nghỉ, lịch làm việc, giới hạn giờ. Dựng một lần ở lần dùng đầu; đọc store mỗi lần gọi nên test mở DB khác vẫn đúng.
// Không đặt trong container.js vì container ← explanations ← payroll-service ← sheet sẽ thành vòng require.
const store = require('../../platform/db');
const { rulesFor } = require('../../platform/request-rules');
const { leaveDates, neighborDays, schedule } = require('../sheet');
const { sheetFlagsOf } = require('../positions');
const { isatRefusal } = require('../isat-rule');
const { HourLimits } = require('../overtime/hour-limits');
const { ExtraTimes } = require('./extra-times');
const { SheetRevision } = require('./sheet-revision');
const { TimesheetValidator } = require('./timesheet-validator');

let built: any = null;

function timesheet() {
  if (!built)
    built = {
      validator: new TimesheetValidator({
        rulesFor,
        schedule,
        sheetFlagsOf,
        holidays: async () => await store.getSetting('holidays', []),
        neighborDays,
        leaveDates,
        ledgerFor:
          (date?) =>
          async (...args) =>
            (await rulesFor(date.slice(0, 7))).leave.ledger(...args),
        isatRefusal,
        dayLimits: HourLimits.checkDayHours
      }),
      revision: new SheetRevision({ sheetOf: async (username?, month?) => await store.getSheet(username, month) }),
      extraTimes: new ExtraTimes()
    };
  return built;
}

export = { timesheet };
