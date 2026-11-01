'use strict';
const { Violation } = require('../shared/rule');
const { DayMath } = require('./day-math');

const { dm } = DayMath;

// Ca của một ngày đi làm trong Lịch ước tính. Trả { preset, violations }: preset là mã ca gán cho ngày (undefined = không đụng tới),
// violations là các cảnh báo kèm theo. Không ghi gì: TimesheetValidator gán preset vào ngày rồi mới nêu cảnh báo.
//   - nhân sự tự khai: giờ theo ca cố định Admin gán (không tự chọn ca); chưa gán ca thì khai tự do
//   - Admin khai thay: ca của ngày là ca Admin chọn (mọi ca trong danh mục), tính phụ cấp ca, giờ nghỉ, giờ thiếu theo ca này
//     (src/domain/attendance/admin-presence.ts dựng lượt theo ca này, bộ máy đọc mã ca của ngày)
class ShiftAssignment {
  // Mã ca của ngày Admin khai thay: mã ca Admin chọn (có trong danh mục), không chọn thì ca có đúng giờ vào – ra đã khai (ưu tiên ca được
  // gán, rồi mã mới của ca trong danh mục); không ca nào khớp thì '' và PUT /sheet đòi Admin chọn ca (SHEET_ADMIN_SHIFT_REQUIRED).
  static adminShiftOf(punch?, day?, assignedCode?) {
    if (day.preset && Object.hasOwn(punch.SHIFT, day.preset)) return day.preset;
    const fits = (code?) =>
      Object.hasOwn(punch.SHIFT, code) && punch.SHIFT[code][0] === day.in && punch.SHIFT[code][1] === day.out;
    if (assignedCode && fits(assignedCode)) return assignedCode;
    const match = Object.keys(punch.SHIFT).find(fits);
    return match ? punch.canonicalOf(match) : '';
  }

  resolve(day?) {
    const { c, sheet } = day;
    const assigned = sheet.punch.SHIFT[sheet.u.shiftCode];
    if (c.kind === 'work' && day.onBehalf) return this.#byAdmin(day, assigned);
    if (c.kind === 'work' && assigned) return this.#bySelf(day, assigned);
    return { preset: undefined, violations: [] };
  }

  // Giờ khai không khớp ca nào trong danh mục và Admin không chọn ca: không âm thầm tính theo ca được gán. Ngày lưu từ trước không đổi giữ nguyên
  #byAdmin({ c, date, unchanged, sheet }: any, assigned?) {
    const preset = ShiftAssignment.adminShiftOf(sheet.punch, c, sheet.u.shiftCode);
    const violations: any[] = [];
    if (!preset && !unchanged)
      violations.push(
        Violation.warn(
          'SHEET_ADMIN_SHIFT_REQUIRED',
          `Ngày ${dm(date)}: giờ ${c.in}–${c.out} không khớp ca nào trong danh mục. Hãy chọn ca cho ngày này.`,
          `Chưa chọn ca thì ngày này tính theo ca được gán${assigned ? ` (${assigned[0]}–${assigned[1]})` : ', mà người này chưa được gán ca nên chưa ghi được giờ có mặt và ngày không có tiền'}.`,
          { date }
        )
      );
    return { preset, violations };
  }

  #bySelf({ c, p, date, isHoliday, sheet }: any, assigned?) {
    const { u, punch } = sheet;
    if (c.in === assigned[0] && c.out === assigned[1]) return { preset: u.shiftCode, violations: [] };
    // Ngày đã lưu không đổi giờ (ví dụ ngày Admin khai thay theo ca khác) giữ mã ca đã lưu; ngày khai mới lệch ca thì bỏ mã ca do
    // nhân sự gửi: ngày vẫn tính theo ca được gán
    const kept = !!p && p.kind === 'work' && p.in === c.in && p.out === c.out;
    const preset = kept && p.preset && Object.hasOwn(punch.SHIFT, p.preset) ? p.preset : '';
    const violations: any[] = [];
    // Ngày lễ: giờ vào – ra là khung giờ OT ngày lễ, không phải ca, nên không so với ca được gán
    if (!kept && !isHoliday) {
      // Giờ khai rộng hơn ca được gán mà không khai làm thêm: ngày có Check-in/out tính theo ca được gán (ActualHours.apply), phần ngoài ca không có tiền
      const wider = DayMath.outsideShift(c, assigned[0], assigned[1]).wraps && !c.extraKind;
      violations.push(
        Violation.warn(
          'SHEET_SHIFT_MISMATCH',
          wider
            ? `Ngày ${dm(date)}: giờ khai ${c.in}–${c.out} rộng hơn ca cố định ${assigned[0]}–${assigned[1]} do Admin gán. Ngày có Check-in/out tính theo ca được gán: giờ ngoài ca không được trả nếu không khai là OT hoặc làm bù theo giờ (chọn ca được gán rồi nhập giờ trước/sau ca).`
            : `Ngày ${dm(date)}: giờ khai khác ca cố định ${assigned[0]}–${assigned[1]} do Admin gán: ngày vẫn tính phụ cấp ca theo ca được gán; Admin sẽ xem lại.`,
          undefined,
          { date }
        )
      );
    }
    return { preset, violations };
  }
}

export = { ShiftAssignment };
