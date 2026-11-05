import type { SettingsReader } from '../settings';
import type { StaffContext } from './requests.repository';

/**
 * Hồ sơ nộp đơn với tuần làm của chính người đó ở `month` (cùng tháng đã đưa cho `findStaffContext`): tuần riêng nếu có,
 * không thì tuần của loại nhân sự. Loại chưa cấu hình (`regularDows: null`) giữ nguyên để báo "Thiếu cấu hình loại nhân sự";
 * không có `settings` (service dựng tay trong test) cũng trả nguyên hồ sơ.
 */
export async function withPersonWeek(
  staff: StaffContext,
  month: string,
  settings?: Pick<SettingsReader, 'workWeekOf'>
): Promise<StaffContext> {
  if (!settings || !staff.regularDows) return staff;
  const { weekdays } = await settings.workWeekOf(staff.employeeId, month);
  return { ...staff, regularDows: weekdays };
}
