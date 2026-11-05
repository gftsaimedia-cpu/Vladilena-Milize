// Dịch vụ dữ liệu của app nhân viên trên điện thoại (/nv/*): trả dữ liệu giả của mock/staff-phone qua respond(),
// không gọi máy chủ. Đổi mật khẩu và đăng xuất dùng phiên giả của services/session.
import { respond } from '@/mock/respond';
import {
  attendanceView,
  checkOutNow,
  dayDetail,
  homeView,
  incomeView,
  profileView,
  requestDetail,
  requestsView,
  type AttendanceView,
  type DayDetail,
  type HomeView,
  type IncomeView,
  type ProfileView,
  type RequestDetail,
  type RequestsView
} from '@/mock/staff-phone';
import * as session from './session';

export const getHome = (): Promise<HomeView> => respond(homeView());
export const getAttendance = (recent = 5): Promise<AttendanceView> => respond(attendanceView(recent));
// null khi ngày không có dữ liệu (Chủ nhật, chưa tới, ngoài tháng 10, chuỗi sai)
export const getDay = (date: string): Promise<DayDetail | null> => respond(dayDetail(date));
export const getRequests = (): Promise<RequestsView> => respond(requestsView());
// null khi không có yêu cầu mang id này
export const getRequest = (id: string): Promise<RequestDetail | null> => respond(requestDetail(id));
export const getIncome = (): Promise<IncomeView> => respond(incomeView());
export const getProfile = (): Promise<ProfileView> => respond(profileView());

// Check-out: ghi giờ ra của đồng hồ giả cho hôm nay rồi trả màn Hôm nay mới.
export async function checkOut(): Promise<HomeView> {
  checkOutNow();
  return respond(homeView());
}

// Mockup luôn thành công.
export const changePassword = ({ current, next }: { current: string; next: string }): Promise<{ ok: true }> =>
  session.changePassword(current, next) as Promise<{ ok: true }>;

export const logout = (): Promise<{ ok: true }> => session.logout() as Promise<{ ok: true }>;
