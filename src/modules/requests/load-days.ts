import { EmployeeDays, addDays, type SystemRequest } from './domain';
import type { RequestsRepository, StaffContext } from './requests.repository';
import type { DayStatusRepository } from './day-status.repository';
import type { HolidaysRepository, Holiday } from '../holidays/holidays.repository';

/** Các kho `loadEmployeeDays` đọc; người gọi đưa bản gắn giao dịch nếu đang trong khoá. */
export interface DayStores {
  requests: RequestsRepository;
  holidays?: HolidaysRepository;
  days?: DayStatusRepository;
}

/**
 * Lịch, ngày lễ, đơn đang chờ/đã duyệt và trạng thái ngày (`day_status`) của nhân sự quanh [from, to]. Đọc rộng thêm một
 * ngày mỗi phía để thấy ca đêm hôm trước và ca hôm sau (§5.5 bước 2). `holidays` là các ngày lễ của khoảng đã đọc.
 * Thiếu lịch lễ, bảng trạng thái ngày hay cấu hình loại nhân sự thì báo lỗi trước khi đọc gì.
 */
export async function loadEmployeeDays(
  stores: DayStores,
  staff: StaffContext,
  from: string,
  to: string
): Promise<{ days: EmployeeDays; active: SystemRequest[]; holidays: Holiday[] }> {
  const holidaysRepo = stores.holidays;
  if (!holidaysRepo) {
    throw new Error('Thiếu lịch lễ công ty');
  }
  const daysRepo = stores.days;
  if (!daysRepo) {
    throw new Error('Thiếu bảng trạng thái ngày');
  }
  const regularDows = staff.regularDows;
  if (!regularDows) {
    throw new Error(`Thiếu cấu hình loại nhân sự ${staff.employeeType}`);
  }
  const lo = addDays(from, -1);
  const hi = addDays(to, 1);
  // Trong giao dịch, các truy vấn chạy lần lượt trên cùng một kết nối dù gửi cùng lúc.
  const [schedules, holidays, active, claims] = await Promise.all([
    stores.requests.listScheduleDays(staff.employeeId, lo, hi),
    holidaysRepo.listBetween(lo, hi),
    stores.requests.listActive(staff.employeeId),
    daysRepo.listBetween(staff.employeeId, lo, hi)
  ]);
  const days = new EmployeeDays({
    regularDows,
    holidays: holidays.map(h => h.date),
    defaultShift: staff.defaultShift,
    schedules,
    activeRequests: active,
    claims
  });
  return { days, active, holidays };
}
