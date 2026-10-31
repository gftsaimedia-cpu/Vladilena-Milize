'use strict';
// Mặt tiền giữ tên hàm xuất cũ; logic nằm ở class WorkedHours (lib/domain/overtime/worked-hours.js).
const { WorkedHours } = require('./overtime/worked-hours');

module.exports = {
  toMin: WorkedHours.toMin,
  overlapsNight: WorkedHours.overlapsNight,
  spanH: WorkedHours.spanH,
  shiftFor: WorkedHours.shiftFor,
  extraOtHours: WorkedHours.extraOtHours,
  estimateOtHours: WorkedHours.estimateOtHours,
  actualOtHours: WorkedHours.actualOtHours,
  estimateHolidayOtHours: WorkedHours.estimateHolidayOtHours,
  actualHolidayOtHours: WorkedHours.actualHolidayOtHours
};
