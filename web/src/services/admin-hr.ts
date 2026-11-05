// Dịch vụ màn Nhân sự. Máy chủ thật: GET /api/v2/employees và /employees/:username; thêm nhân sự POST /employees
// (hộp Thêm nhân sự, mở từ Nhân sự và từ Phân quyền › Tài khoản). Dữ liệu giả: mock/staff, thêm chỉ trả lời "đã tạo".
import type { TypeRow } from '@/builders/api/catalog';
import { staffListFromEmployees, staffProfileFromEmployee } from '@/builders/api/staff';
import { staffListView, staffProfile, type StaffListView, type StaffProfile } from '@/mock/staff';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { catalogRows } from './admin-catalog';
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

/** Dữ liệu cho hộp Thêm nhân sự: danh mục chức vụ (mọi phiên bản), các tên đăng nhập đã có, hôm nay. */
export async function getNewStaffOptions(): Promise<{ catalog: TypeRow[]; taken: string[]; today: string }> {
  const [catalog, taken] = await Promise.all([
    catalogRows(),
    __MOCK__
      ? respond(staffListView().rows.map(r => r.id))
      : api.get('/employees').then(r => (r.employees || []).map(e => e.account.username))
  ]);
  return { catalog, taken, today: today() };
}

/** Thêm nhân sự (POST /api/v2/employees); thân dựng bằng builders/admin-hr/new-staff. Lỗi máy chủ ném nguyên văn. */
export async function createEmployee(body: Record<string, unknown>): Promise<unknown> {
  if (__MOCK__) return respond({ created: true });
  return api.post('/employees', body);
}
