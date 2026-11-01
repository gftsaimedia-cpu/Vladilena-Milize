'use strict';
const { Rule, Violation } = require('../../shared/rule');
const { WorkedHours } = require('../../overtime/worked-hours');
const { DayMath } = require('../day-math');

const { dm, gap } = DayMath;
const { toMin, overlapsNight } = WorkedHours;

// Nhóm luật về giờ làm thêm (OT, làm bù) khai quanh ca. Mỗi luật nhận DayContext.

// Làm bù / OT không được rơi vào khung 22h–6h (ngày đã lưu từ trước và không đổi giờ thì giữ nguyên): chỉ xét đoạn trước ca và sau ca
class ExtraNightRule extends Rule {
  *evaluate({ c, date, unchanged, pendingText }: any) {
    if (unchanged) return;
    const night =
      (c.extraIn && overlapsNight(toMin(c.extraIn), toMin(c.in))) ||
      (c.extraOut && overlapsNight(toMin(c.out), toMin(c.extraOut)));
    if (night)
      yield Violation.warn(
        'SHEET_EXTRA_NIGHT',
        `Ngày ${dm(date)}: giờ làm thêm rơi vào khung 22h–6h: ${pendingText}.`,
        undefined,
        { date }
      );
  }
}

// OT ngày lễ được khai và được trả, làm bao nhiêu giờ tính bấy nhiêu; chỉ phút nằm trong ngày lễ hưởng giá OT ngày lễ, phút sang ngày
// thường (sau 0 giờ) tính như OT thường. Chỉ báo (không chặn) khi đoạn OT tràn sang ngày thường kề bên, để người khai biết phần đó
// không hưởng giá ngày lễ. (Làm bù ngày lễ chặn ở HolidayMakeupRule.)
class HolidayOtSpillRule extends Rule {
  *evaluate({ c, date, unchanged, isHoliday, onBehalf, sheet }: any) {
    if (unchanged || !isHoliday || c.extraKind !== 'ot' || !c.in || !c.out) return;
    const start = toMin(c.in),
      end = start + (gap(c.in, c.out) || 1440);
    const ordinary = (shift?) => {
      const other = DayMath.shiftDate(date, shift);
      return !sheet.holidays.has(other) ? other : '';
    };
    const other =
      c.extraOut && end + gap(c.out, c.extraOut) > 1440 && ordinary(1)
        ? ordinary(1)
        : c.extraIn && start - gap(c.extraIn, c.in) < 0 && ordinary(-1)
          ? ordinary(-1)
          : '';
    if (other)
      yield Violation.warn(
        'SHEET_EXTRA_ON_HOLIDAY',
        `Ngày ${dm(date)} là ngày lễ: giờ OT nằm trong ngày ${dm(date)} tính giá OT ngày lễ, giờ OT sang ngày ${dm(other)} (ngày thường) tính như OT thường${onBehalf ? '.' : ', sau khi Admin duyệt.'}`,
        undefined,
        { date }
      );
  }
}

export = { ExtraNightRule, HolidayOtSpillRule };
