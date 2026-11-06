// Dịch vụ màn Nhân sự (chỉ đọc). Máy chủ thật: GET /api/v2/employees và /employees/:username; dữ liệu giả: mock/staff.
import { staffListFromEmployees, staffProfileFromEmployee } from '@/builders/api/staff';
import { assignStaffShift, moveStaffDept, staffListView, staffProfile, type StaffListView, type StaffProfile } from '@/mock/staff';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { ApiError, api } from './http';

// Gán ca và Đổi phòng ban cho nhiều người. Máy chủ thật: POST /api/v2/employees/shift và /employees/department;
// phòng ban lấy từ GET /api/v2/departments, ca từ GET /api/v2/employees/meta/shifts (6 ca cố định của công ty).
export const STAFF_BULK = true;

export type ShiftOption = { code: string; label: string };

/** Ca chọn được khi gán ca (dữ liệu giả, theo board I3). */
export const SHIFT_OPTIONS: readonly ShiftOption[] = [
  { code: 'hc', label: 'Hành chính · 08:00–17:00' },
  { code: 'ca2', label: 'Ca 2 · 14:00–22:00' }
];

/** Các ca để gán: máy chủ thật trả đủ sáu ca kèm giờ; dữ liệu giả giữ hai ca của board. */
export async function getShiftOptions(): Promise<readonly ShiftOption[]> {
  if (__MOCK__) return SHIFT_OPTIONS;
  const { shifts = [] } = await api.get('/employees/meta/shifts');
  return shifts.map((s: any) => ({ code: s.code, label: s.startTime ? `${s.name || s.code} · ${s.startTime}–${s.endTime}` : s.name || s.code }));
}

type Department = { id: number; name: string };

/** Các phòng ban để chuyển người tới: máy chủ thật theo GET /departments; dữ liệu giả trả rỗng (màn tự lấy từ các dòng đang có). */
export async function getDepartments(): Promise<Department[]> {
  if (__MOCK__) return [];
  const { departments = [] } = await api.get('/departments');
  return departments.map((d: any) => ({ id: d.id, name: d.name }));
}

// Kết quả { done, failed } của route nhiều người: trả tên đăng nhập những người đã đổi; không ai đổi được mà có lỗi thì báo lỗi đầu tiên.
function doneIds(out: { done?: any[]; failed?: { message: string }[] }): string[] {
  const done = (out.done || []).map(v => v.account.username);
  if (!done.length && out.failed?.length) throw new ApiError(400, out.failed[0].message, {});
  return done;
}

/** Chuyển nhiều người sang một phòng; trả id những người đã chuyển. */
export async function moveStaffToDept(ids: string[], dept: string): Promise<string[]> {
  if (__MOCK__) return respond(moveStaffDept(ids, dept));
  const target = (await getDepartments()).find(d => d.name === dept);
  if (!target) throw new ApiError(404, `Không tìm thấy phòng ${dept}`, {});
  return doneIds(await api.post('/employees/department', { usernames: ids, departmentId: target.id }));
}

/** Gán một ca cho nhiều người; trả id những người đã gán. */
export async function assignShift(ids: string[], code: string): Promise<string[]> {
  if (__MOCK__) {
    const label = SHIFT_OPTIONS.find(s => s.code === code)?.label ?? code;
    return respond(assignStaffShift(ids, label));
  }
  return doneIds(await api.post('/employees/shift', { usernames: ids, shiftCode: code }));
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
