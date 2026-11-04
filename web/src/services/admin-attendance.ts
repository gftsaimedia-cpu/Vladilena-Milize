// Dịch vụ Chấm công: chỉ đọc dữ liệu giả (mock/attendance.ts), không gọi api().
import { attendanceView, dayDetail, type AttendanceView, type DayDetail } from '@/mock/attendance';
import { respond } from '@/mock/respond';

/** Màn Chấm công của một tháng 'YYYY-MM'; null khi tháng đó không có dữ liệu giả. */
export const getAttendance = (month: string): Promise<AttendanceView | null> => respond(attendanceView(month));

/** Hộp chi tiết một ngày của một người; null khi người hoặc ngày không có dữ liệu. */
export const getDayDetail = (personId: string, date: string): Promise<DayDetail | null> =>
  respond(dayDetail(personId, date));
