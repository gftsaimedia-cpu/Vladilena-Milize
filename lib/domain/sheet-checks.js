'use strict';
// Mặt tiền giữ tên hàm xuất cũ; logic nằm ở các class của lib/domain/timesheet/ (TimesheetValidator, ExtraTimes, SheetRevision),
// phụ thuộc nối thật ở đây. Đọc store, request-rules mỗi lần gọi: test mở DB khác vẫn đúng.
const store = require('../db');
const { rulesFor } = require('../request-rules');
const { leaveDates, neighborDays, schedule } = require('./sheet');
const { sheetFlagsOf } = require('./positions');
const { isatRefusal } = require('./isat-rule');
const { checkDayHours } = require('./limits');
const { DayMath } = require('./timesheet/day-math');
const { ExtraTimes } = require('./timesheet/extra-times');
const { SheetRevision } = require('./timesheet/sheet-revision');
const { TimesheetValidator } = require('./timesheet/timesheet-validator');

const validator = new TimesheetValidator({
  rulesFor,
  schedule,
  sheetFlagsOf,
  holidays: () => store.getSetting('holidays', []),
  neighborDays,
  leaveDates,
  ledgerFor:
    date =>
    (...args) =>
      rulesFor(date.slice(0, 7)).leave.ledger(...args),
  isatRefusal,
  dayLimits: checkDayHours
});
const extraTimes = new ExtraTimes();
const revision = new SheetRevision({ sheetOf: (username, month) => store.getSheet(username, month) });

module.exports = {
  checkSheet: input => validator.validate(input),
  assertSheetRev: (username, month, expectedRev) => revision.assert(username, month, expectedRev),
  checkExtraTimes: (date, d, extra) => extraTimes.check(date, d, extra),
  dm: DayMath.dm
};
