'use strict';
const { Rule, Violation } = require('../../shared/rule');
const { WorkedHours, EPS } = require('../worked-hours');

const ddmm = (date?) => `${date.slice(8)}/${date.slice(5, 7)}`;
const shown = (n?) => Math.round(n * 100) / 100;

const SAME_FIELDS = ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut'];
const sameDay = (a?, b?) => !!a && !!b && SAME_FIELDS.every(key => (a[key] || '') === (b[key] || ''));

// Trần giờ ròng một ngày (OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca). Chặn 400 DAY_HOURS_CAP.
// context: { limits: OtLimits, params, clean, prevDays, holidays }
class DayHoursCapRule extends Rule {
  // Vi phạm của MỘT ngày với giờ ròng đã biết (null khi trong trần)
  static violationFor(limits?, date?, hours?) {
    if (hours <= limits.dayCap + EPS) return null;
    return Violation.block(
      'DAY_HOURS_CAP',
      `Ngày ${ddmm(date)}: OT và làm thêm tối đa ${limits.dayCap} giờ một ngày, không tính giờ nghỉ giữa ca (đang khai ${shown(hours)} giờ)`,
      { date }
    );
  }

  // Kiểm từng ngày vừa thêm hoặc đổi giờ trong `clean`: ngày đi làm có đoạn làm thêm (hoặc ngày lễ, khung vào – ra là giờ OT)
  // phải có giờ ròng ≤ trần. Ngày không đổi so với lịch đang lưu `prevDays` giữ nguyên.
  *evaluate({ limits, params, clean, prevDays, holidays = [] }: any) {
    const holidaySet = new Set<any>(holidays);
    const worked = WorkedHours.forParams(params);
    for (const [date, day] of Object.entries<any>(clean)) {
      if (day.kind !== 'work' || !day.in || !day.out || sameDay(day, prevDays[date])) continue;
      const holiday = holidaySet.has(date);
      if (!holiday && !(day.extraKind && WorkedHours.extraSpanH(day) > 0)) continue;
      const violation = DayHoursCapRule.violationFor(limits, date, worked.dayNetHours(day, { holiday }));
      if (violation) yield violation;
    }
  }
}

export = { DayHoursCapRule };
