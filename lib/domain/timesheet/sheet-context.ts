'use strict';
const { DayMath } = require('./day-math');

// Dữ kiện của MỘT lần lưu Lịch ước tính (PUT /api/sheet), dựng một lần rồi đưa cho mọi luật.
//   u          hồ sơ người sở hữu lịch (khai thay: người được khai)
//   month      'YYYY-MM'
//   clean      ngày đã làm sạch (cleanDays); luật KHÔNG sửa, chỉ ShiftAssignment được gán preset ở bước riêng
//   prevDays   lịch đang lưu
//   onBehalf   Admin khai thay
//   rules      { punch, params, workSchedule } của tháng
//   workPlan   lịch làm việc của người trong tháng
//   flags      cờ quyền lợi của chức vụ / bậc (sheetFlagsOf)
//   holidays   Set ngày lễ
class SheetContext {
  declare u: any;
  declare month: any;
  declare clean: any;
  declare prevDays: any;
  declare onBehalf: any;
  declare punch: any;
  declare params: any;
  declare workSchedule: any;
  declare workPlan: any;
  declare flags: any;
  declare holidays: any;

  constructor({ u, month, clean, prevDays, onBehalf, rules, sched, flags, holidays }: any) {
    this.u = u;
    this.month = month;
    this.clean = clean;
    this.prevDays = prevDays;
    this.onBehalf = onBehalf;
    this.punch = rules.punch;
    this.params = rules.params;
    this.workSchedule = rules.workSchedule;
    this.workPlan = sched;
    this.flags = flags;
    this.holidays = holidays;
  }

  // Câu nói khoản làm thêm sẽ được xử lý ra sao, tuỳ ai khai
  get pendingText() {
    return this.onBehalf
      ? 'Admin khai thay nên khoản được duyệt luôn (khi có quyền duyệt loại này) và được tính tiền'
      : 'khoản chờ Admin duyệt và, nếu được duyệt, vẫn được tính tiền';
  }

  day(date?) {
    return new DayContext(this, date);
  }
}

// Dữ kiện của một ngày trong lần lưu: suy ra một lần từ SheetContext
class DayContext {
  declare sheet: any;
  declare date: any;
  declare c: any;
  declare p: any;
  declare dow: any;
  declare inSched: any;
  declare isHoliday: any;
  declare unchanged: any;

  constructor(sheet?, date?) {
    this.sheet = sheet;
    this.date = date;
    this.c = sheet.clean[date];
    this.p = sheet.prevDays[date];
    this.dow = DayMath.dayOfWeek(date);
    this.inSched = sheet.workSchedule.isWorkDay(sheet.workPlan, date);
    this.isHoliday = sheet.holidays.has(date);
    // Ngày đã lưu và không đổi giữ nguyên dù nay nằm ngoài lịch (lịch đổi sau khi khai: "ngày mồ côi"): không chặn cả lần lưu
    const { c, p } = this;
    this.unchanged =
      !!p &&
      p.kind === c.kind &&
      p.in === c.in &&
      p.out === c.out &&
      (p.extraKind || '') === c.extraKind &&
      (p.extraIn || '') === c.extraIn &&
      (p.extraOut || '') === c.extraOut;
  }

  get flags() {
    return this.sheet.flags;
  }

  get onBehalf() {
    return this.sheet.onBehalf;
  }

  get pendingText() {
    return this.sheet.pendingText;
  }
}

export = { SheetContext, DayContext };
