'use strict';
const { Rule, Violation } = require('../../shared/rule');
const { DayMath } = require('../day-math');

const { dm } = DayMath;
const OUTSIDE_PAY = 'Ca chính không có tiền (0 ₫); chỉ đoạn OT đã được duyệt và có chấm công mới được trả.';

// Nhóm luật "ngày này có được khai không". Mỗi luật nhận DayContext (src/domain/timesheet/sheet-context.ts).

// Loại ngày 'makeup' (làm bù cả ngày) không còn: khai mới hoặc sửa thì chặn; ngày đã lưu gửi lại không đổi thì giữ nguyên
// (bộ máy tính 0) để lưu được các ngày khác
class MakeupDayRule extends Rule {
  *evaluate({ c, date, unchanged }: any) {
    if (c.kind !== 'makeup') return;
    if (!unchanged)
      yield Violation.block(
        'SHEET_MAKEUP_DAY_REMOVED',
        'Không còn loại ngày Làm bù cả ngày. Giờ làm bù khai ở ngày đi làm, trước hoặc sau ca.',
        { date }
      );
    yield Violation.warn(
      'SHEET_MAKEUP_DAY_LEGACY',
      `Ngày ${dm(date)}: loại Làm bù cả ngày không còn dùng, không tính lương. Hãy khai lại.`,
      undefined,
      { date }
    );
  }
}

class SundayRule extends Rule {
  *evaluate({ date, dow }: any) {
    if (dow === 0)
      yield Violation.warn('SHEET_SUNDAY', `Ngày ${date} là Chủ nhật, không chấm công hay làm bù`, OUTSIDE_PAY, {
        date
      });
  }
}

// iSAT chặn cứng: chỉ vào thứ isat.weekday và chỉ chức vụ có quyền lợi iSAT; ngày iSAT đã lưu và không đổi loại giữ nguyên
class IsatDayRule extends Rule {
  declare isatRefusal: any;

  constructor({ isatRefusal }: any) {
    super();
    this.isatRefusal = isatRefusal;
  }

  *evaluate({ c, p, date, sheet }: any) {
    if (c.kind !== 'isat' || p?.kind === 'isat') return;
    const refusal = this.isatRefusal({ params: sheet.params, staff: sheet.u, date });
    if (refusal) yield Violation.block(refusal.code, refusal.message, { date });
  }
}

// Ngày ngoài lịch làm việc: chỉ được khai nghỉ không lương. Ca chính không có tiền; chỉ đoạn OT đã duyệt và có chấm công liền mạch được trả
class OffScheduleRule extends Rule {
  *evaluate({ c, date, dow, inSched, unchanged }: any) {
    if (dow !== 0 && !inSched && !unchanged && c.kind !== 'unpaid')
      yield Violation.warn(
        'SHEET_OFF_SCHEDULE',
        `Ngày ${date} nằm ngoài lịch làm việc, chỉ được khai nghỉ không lương`,
        OUTSIDE_PAY,
        { date }
      );
  }
}

// Không khai làm bù vào ngày lễ, chặn: giờ làm bù kèm ngày đi làm, ngày làm bù dự kiến của "Nghỉ, sẽ làm bù". Bộ máy không trả giờ
// làm bù ngày lễ. Ngày đã lưu và không đổi (lễ thêm sau khi khai) giữ nguyên.
class HolidayMakeupRule extends Rule {
  static planDates(day?) {
    return day && day.kind === 'willmakeup' ? [...(day.makeupPlans || []).map(plan => plan.date), day.makeupDate] : [];
  }

  *evaluate({ c, p, date, unchanged, sheet }: any) {
    const before = HolidayMakeupRule.planDates(p);
    const hit = [
      ...(c.extraKind === 'makeup' && !unchanged ? [date] : []),
      ...HolidayMakeupRule.planDates(c).filter(x => x && !before.includes(x))
    ].find(x => sheet.holidays.has(x));
    if (hit)
      yield Violation.block('SHEET_MAKEUP_ON_HOLIDAY', `Ngày ${dm(hit)} là ngày lễ: không khai làm bù vào ngày lễ.`);
  }
}

export = { MakeupDayRule, SundayRule, IsatDayRule, OffScheduleRule, HolidayMakeupRule };
