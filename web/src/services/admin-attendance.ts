// Dịch vụ Chấm công: chỉ đọc dữ liệu giả (mock/attendance.ts), không gọi api().
import { attendanceView, dayDetail, type AttendanceView, type DayDetail } from '@/mock/attendance';
import { employeeView, type EmployeeView } from '@/mock/attendance-employee';
import { respond } from '@/mock/respond';

/** Màn Chấm công của một tháng 'YYYY-MM'; null khi tháng đó không có dữ liệu giả. */
export const getAttendance = (month: string): Promise<AttendanceView | null> => respond(attendanceView(month));

/** Hộp chi tiết một ngày của một người; null khi người hoặc ngày không có dữ liệu. */
export const getDayDetail = (personId: string, date: string): Promise<DayDetail | null> =>
  respond(dayDetail(personId, date));

/** Hồ sơ chấm công của một người trong một tháng; null khi không có người, `data` null khi tháng không có dữ liệu giả. */
export const getEmployeeAttendance = (personId: string, month: string): Promise<EmployeeView | null> =>
  respond(employeeView(personId, month));
