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
  holidays: async () => await store.getSetting('holidays', []),
  neighborDays,
  leaveDates,
  ledgerFor:
    date =>
    async (...args) =>
      (await rulesFor(date.slice(0, 7))).leave.ledger(...args),
  isatRefusal,
  dayLimits: checkDayHours
});
const extraTimes = new ExtraTimes();
const revision = new SheetRevision({ sheetOf: async (username, month) => await store.getSheet(username, month) });

module.exports = {
  checkSheet: async input => await validator.validate(input),
  assertSheetRev: async (username, month, expectedRev) => await revision.assert(username, month, expectedRev),
  checkExtraTimes: (date, d, extra) => extraTimes.check(date, d, extra),
  dm: DayMath.dm
};
