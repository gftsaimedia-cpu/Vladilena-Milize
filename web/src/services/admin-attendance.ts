// Dịch vụ Chấm công Admin. Máy chủ thật: GET /api/v2/attendance/week (lưới, đã lọc q/group) và
// GET /api/v2/attendance/employees/:username (hồ sơ tháng), BE tính hết; đơn chờ (chuông) vẫn từ /requests để có chữ chi tiết.
// Dữ liệu giả: mock/attendance.ts trả cùng dạng DTO.
import {
  attendanceFromWeek,
  dayDetailFromDto,
  employeeFromDto,
  type AttendanceView,
  type DayDetail,
  type EmployeeMonthDTO,
  type EmployeeView,
  type WeekDTO
} from '@/builders/api/attendance';
import { employeeDto } from '@/mock/attendance-employee';
import { personStatusOf } from '@/mock/people-status';
import { weekDto } from '@/mock/attendance';
import { respond } from '@/mock/respond';
import { getInbox } from './admin-main';
import { api, qs } from './http';

const GRID_DAYS = 28;

async function fetchWeek(month: string, q: string, group: string): Promise<WeekDTO | null> {
  if (__MOCK__) {
    const dto = weekDto({ month, q, group });
    return dto ? respond(dto) : null;
  }
  return api.get(`/attendance/week${qs({ days: GRID_DAYS, month, q: q.trim() || undefined, group: group || undefined })}`);
}

async function fetchEmployee(username: string, month: string): Promise<EmployeeMonthDTO | null> {
  if (__MOCK__) {
    const dto = employeeDto(username, month);
    return dto ? respond(dto) : null;
  }
  try {
    return await api.get(`/attendance/employees/${encodeURIComponent(username)}${qs({ month })}`);
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

/** Màn Chấm công của một tháng 'YYYY-MM', lọc theo tên (`q`) và nhóm (`group`) ngay ở máy chủ; null khi tháng không có dữ liệu giả. */
export async function getAttendance(month: string, q = '', group = ''): Promise<AttendanceView | null> {
  const [dto, inbox] = await Promise.all([fetchWeek(month, q, group), getInbox()]);
  if (!dto) return null;
  const view = attendanceFromWeek(dto, inbox.items);
  if (!__MOCK__) return view;
  // Dữ liệu giả: DTO giữ đúng dạng phản hồi BE hiện nay (chưa có staffStatus), nên trạng thái nhân sự gắn ở đây theo họ tên.
  return {
    ...view,
    rows: view.rows.map(r => ({ ...r, ps: personStatusOf(r.person.name) })),
    pending: view.pending.map(p => ({ ...p, ps: personStatusOf(p.person.name) }))
  };
}

/** Hộp chi tiết một ngày của một người; null khi không có người này. */
export async function getDayDetail(personId: string, date: string): Promise<DayDetail | null> {
  const [dto, inbox] = await Promise.all([fetchEmployee(personId, date.slice(0, 7)), getInbox()]);
  return dto ? dayDetailFromDto(dto, date, inbox.items) : null;
}

/** Hồ sơ chấm công của một người trong một tháng; null khi không có người này. */
export async function getEmployeeAttendance(personId: string, month: string): Promise<EmployeeView | null> {
  const dto = await fetchEmployee(personId, month);
  return dto ? employeeFromDto(dto) : null;
}
