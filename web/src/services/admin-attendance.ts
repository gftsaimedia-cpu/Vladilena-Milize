// Dịch vụ Chấm công Admin. Máy chủ thật: GET /api/v2/attendance/timesheets (cả lưới 4 tuần và tháng đang xem),
// /employees và các đơn đang chờ (chuông); dữ liệu giả: mock/attendance.ts.
import { attendanceFromTimesheets, dayDetailFrom, employeeViewFrom, gridFromOf, type AttendanceInput } from '@/builders/api/attendance';
import { attendanceView, dayDetail, type AttendanceView, type DayDetail } from '@/mock/attendance';
import { employeeView, type EmployeeView } from '@/mock/attendance-employee';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { getInbox } from './admin-main';
import { api, qs } from './http';

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Hôm nay theo giờ Việt Nam (UTC+7) của đồng hồ máy chủ.
function today(): string {
  const now = useSessionStore().serverNow;
  return new Date((now ? Date.parse(now) : Date.now()) + 7 * 3600000).toISOString().slice(0, 10);
}

// Đọc một lần đủ dữ liệu cho tháng `month` và lưới 4 tuần quanh hôm nay.
async function load(month: string): Promise<AttendanceInput> {
  const t = today();
  const [y, m] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const gridFrom = gridFromOf(t);
  const startDate = [gridFrom, `${month}-01`].sort()[0];
  const endDate = [addDays(gridFrom, 27), monthEnd].sort()[1];
  const [ts, emp, inbox] = await Promise.all([
    api.get(`/attendance/timesheets${qs({ startDate, endDate })}`),
    api.get('/employees'),
    getInbox()
  ]);
  return { month, today: t, employees: emp.employees || [], timesheets: ts.timesheets || [], pending: inbox.items };
}

/** Màn Chấm công của một tháng 'YYYY-MM'; null khi tháng đó không có dữ liệu giả (chế độ dữ liệu giả). */
export async function getAttendance(month: string): Promise<AttendanceView | null> {
  if (__MOCK__) return respond(attendanceView(month));
  return attendanceFromTimesheets(await load(month));
}

/** Hộp chi tiết một ngày của một người; null khi không có người này. */
export async function getDayDetail(personId: string, date: string): Promise<DayDetail | null> {
  if (__MOCK__) return respond(dayDetail(personId, date));
  return dayDetailFrom(await load(date.slice(0, 7)), personId, date);
}

/** Hồ sơ chấm công của một người trong một tháng; null khi không có người này. */
export async function getEmployeeAttendance(personId: string, month: string): Promise<EmployeeView | null> {
  if (__MOCK__) return respond(employeeView(personId, month));
  return employeeViewFrom(await load(month), personId);
}
