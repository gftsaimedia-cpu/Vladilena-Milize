'use strict';
const { Rule, Violation } = require('../../shared/rule');

const CODE = 'BENEFIT_NOT_ALLOWED';

// Nhóm luật quyền lợi của chức vụ / bậc (cờ sheetFlagsOf: canOt, canApproved, canDeclareAbsence, canMakeupHours). Chỉ cảnh báo, không chặn.
// Mỗi luật nhận DayContext. Thêm quyền lợi mới = thêm một class vào đây và một dòng đăng ký ở TimesheetValidator.

// Làm bù theo giờ của ngày khai MỚI hoặc ĐỔI (máy chủ không tin giao diện). Bộ máy không kiểm cờ này nên khoản vẫn chờ Admin duyệt và,
// nếu được duyệt, có tiền. Câu cảnh báo kèm details.code vì giao diện đọc mã này.
class MakeupHoursBenefitRule extends Rule {
  *evaluate({ c, date, unchanged, flags, onBehalf }: any) {
    if (unchanged || c.extraKind !== 'makeup' || flags.canMakeupHours) return;
    yield Violation.warn(
      CODE,
      onBehalf
        ? `Ngày ${date}: chức vụ hoặc bậc của người này không có quyền lợi khai làm bù theo giờ: Admin khai thay nên khoản được duyệt luôn (khi có quyền duyệt loại này) và vẫn được tính tiền.`
        : `Ngày ${date}: chức vụ hoặc bậc của bạn không có quyền lợi khai làm bù theo giờ: khoản chờ Admin duyệt và, nếu được duyệt, vẫn được tính tiền.`,
      undefined,
      { code: CODE }
    );
  }
}

class OtBenefitRule extends Rule {
  *evaluate({ c, date, flags }: any) {
    if (c.extraKind === 'ot' && !flags.canOt)
      yield Violation.warn(
        CODE,
        'Chức vụ của bạn không có overtime',
        `Ngày ${date}: OT khai không được trả tiền (0 ₫) dù Admin duyệt.`
      );
  }
}

// Làm ngày lễ là OT: ngày lễ trong lịch khai đi làm (giờ vào – ra là khung giờ OT) cũng cần quyền lợi OT, cùng cách cảnh báo như OT ngày thường
class HolidayOtBenefitRule extends Rule {
  *evaluate({ c, date, unchanged, inSched, isHoliday, flags }: any) {
    if (!unchanged && inSched && isHoliday && c.kind === 'work' && !!c.in && !!c.out && !flags.canOt)
      yield Violation.warn(
        CODE,
        'Chức vụ của bạn không có overtime',
        `Ngày ${date}: OT ngày lễ không được trả tiền (0 ₫) dù Admin duyệt; ngày lễ chỉ nhận lương ngày lễ (nếu chức vụ có).`
      );
  }
}

// Giữ ngày cũ chưa đổi loại để có thể sửa/xóa từng ngày sau khi chuyển nhóm; không cho nhóm mới thêm, chuyển loại hoặc khôi phục ngày nghỉ được duyệt
class ApprovedLeaveBenefitRule extends Rule {
  *evaluate({ c, p, date, flags }: any) {
    if (c.kind === 'approved' && !flags.canApproved && p?.kind !== 'approved')
      yield Violation.warn(
        CODE,
        `Ngày ${date}: chức vụ của bạn không có quyền lợi nghỉ được duyệt: ngày này chờ Admin duyệt, không lương.`
      );
  }
}

class AbsenceDeclarationRule extends Rule {
  *evaluate({ c, date, inSched, flags }: any) {
    if (!flags.canDeclareAbsence && (c.kind === 'leave' || (c.kind === 'unpaid' && inSched)))
      yield Violation.warn(
        CODE,
        `Ngày ${date}: chức vụ của bạn không khai nghỉ được ở ngày trong lịch: khoản chờ Admin xem lại; ngày nghỉ không lương không được trả tiền.`
      );
  }
}

export = {
  MakeupHoursBenefitRule,
  OtBenefitRule,
  HolidayOtBenefitRule,
  ApprovedLeaveBenefitRule,
  AbsenceDeclarationRule
};
