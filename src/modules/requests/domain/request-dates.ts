import type { SystemRequest } from './system-request';
import { eachDate } from './working-days';

/**
 * Các ngày mà dòng ngày công (`timesheet_entries`) phải tính lại khi đơn `req` được nộp, duyệt, từ chối hoặc huỷ (T2).
 * Không trùng, tăng dần. Đơn nghỉ và nghỉ có làm bù: cả khoảng nghỉ cộng ngày của các khung bù; đổi ca: cả khoảng đổi ca;
 * OT: ngày OT; iSAT: Thứ Bảy đăng ký; giải trình: ngày giải trình; tạm ứng không đụng ngày nào.
 */
export function requestDates(req: SystemRequest): string[] {
  const dates = new Set<string>();
  switch (req.type) {
    case 'LEAVE':
    case 'LEAVE_WITH_MAKEUP':
      if (req.leaveStartDate) {
        for (const date of eachDate(req.leaveStartDate, req.leaveEndDate ?? req.leaveStartDate)) dates.add(date);
      }
      for (const slot of req.makeupSlots) dates.add(slot.date);
      break;
    case 'SHIFT_CHANGE':
      if (req.changeStartDate) {
        for (const date of eachDate(req.changeStartDate, req.changeEndDate ?? req.changeStartDate)) dates.add(date);
      }
      break;
    case 'OVERTIME':
      if (req.otDate) dates.add(req.otDate);
      break;
    case 'ISAT':
      if (req.isat) dates.add(req.isat.saturday);
      break;
    case 'EXPLANATION':
      if (req.explanationDate) dates.add(req.explanationDate);
      break;
    case 'HALF_SHIFT_LEAVE':
      if (req.halfShiftDate) dates.add(req.halfShiftDate);
      break;
    default:
      break;
  }
  return [...dates].sort();
}
