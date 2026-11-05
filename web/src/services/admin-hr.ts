// Dịch vụ màn Nhân sự (chỉ đọc). Máy chủ thật: GET /api/v2/employees và /employees/:username; dữ liệu giả: mock/staff.
import { staffListFromEmployees, staffProfileFromEmployee } from '@/builders/api/staff';
import { staffListView, staffProfile, type StaffListView, type StaffProfile } from '@/mock/staff';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { ApiError, api } from './http';

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
