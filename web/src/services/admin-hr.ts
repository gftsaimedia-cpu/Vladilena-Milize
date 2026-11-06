// Dịch vụ màn Nhân sự (chỉ đọc). Máy chủ thật: GET /api/v2/employees và /employees/:username; dữ liệu giả: mock/staff.
import { staffListFromEmployees, staffProfileFromEmployee } from '@/builders/api/staff';
import { assignStaffShift, moveStaffDept, staffListView, staffProfile, type StaffListView, type StaffProfile } from '@/mock/staff';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { notConnected } from './data-mode';
import { ApiError, api } from './http';

// Gán ca và Đổi phòng ban cho nhiều người: máy chủ thật chưa có phòng ban, route nhiều người và giờ của ca
// (docs/fe-yeu-cau/admin-loc-nhan-su-chon-nhieu--api-be.md mục 4.2–4.3), nên hai nút chỉ có ở dữ liệu giả.
export const STAFF_BULK = __MOCK__;

/** Ca chọn được khi gán ca (theo board I3). */
export const SHIFT_OPTIONS = [
  { code: 'hc', label: 'Hành chính · 08:00–17:00' },
  { code: 'ca2', label: 'Ca 2 · 14:00–22:00' }
] as const;

/** Chuyển nhiều người sang một phòng; trả id những người đã chuyển. */
export async function moveStaffToDept(ids: string[], dept: string): Promise<string[]> {
  if (__MOCK__) return respond(moveStaffDept(ids, dept));
  return notConnected();
}

/** Gán một ca cho nhiều người; trả id những người đã gán. */
export async function assignShift(ids: string[], code: string): Promise<string[]> {
  const label = SHIFT_OPTIONS.find(s => s.code === code)?.label ?? code;
  if (__MOCK__) return respond(assignStaffShift(ids, label));
  return notConnected();
}

// Hôm nay theo giờ Việt Nam (UTC+7) của đồng hồ máy chủ.
function today(): string {
  const now = useSessionStore().serverNow;
  const t = now ? Date.parse(now) : Date.now();
  return new Date(t + 7 * 3600000).toISOString().slice(0, 10);
}

/** Danh sách nhân sự: 4 thẻ chỉ số, tổng số hồ sơ và các dòng. */
export async function getStaffList(): Promise<StaffListView> {
  if (__MOCK__) return respond(staffListView());
  const { employees = [] } = await api.get('/employees');
  return staffListFromEmployees(employees, today());
}

/** Hồ sơ một người theo id (tên đăng nhập); null nếu không có người này. */
export async function getStaffProfile(id: string): Promise<StaffProfile | null> {
  if (__MOCK__) return respond(staffProfile(id));
  try {
    const { employee } = await api.get(`/employees/${encodeURIComponent(id)}`);
    return staffProfileFromEmployee(employee, today());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
