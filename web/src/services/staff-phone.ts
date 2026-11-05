// Dịch vụ dữ liệu của app nhân viên trên điện thoại (/nv/*). Máy chủ thật: nhóm "của tôi" /api/v2/me/* (danh tính lấy
// từ phiên); dữ liệu giả: mock/staff-phone qua respond(). Đổi mật khẩu và đăng xuất dùng services/session.
import {
  attendanceViewOf,
  dayDetailOf,
  homeViewOf,
  incomeViewOf,
  profileViewOf,
  requestDetailOf,
  requestsViewOf,
  type MeProfile
} from '@/builders/api/staff-phone';
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
import { ApiError, api, qs } from './http';
import * as session from './session';

const VN_MS = 7 * 3600000;
const vnNow = () => new Date(Date.now() + VN_MS).toISOString();
const today = () => vnNow().slice(0, 10);
const nowTime = () => vnNow().slice(11, 16);
const shiftLineOf = (p: MeProfile) =>
  `${p.shift.type === 'NORMAL' ? 'HC' : p.shift.type} ${p.shift.startTime}–${p.shift.endTime}`;

export async function getHome(): Promise<HomeView> {
  if (__MOCK__) return respond(homeView());
  const [t, profile, income, reqs] = await Promise.all([
    api.get('/me/today'),
    api.get('/me/profile'),
    api.get('/me/income').catch(() => null),
    api.get('/me/requests')
  ]);
  return homeViewOf(t, profile, income, reqs.items || [], nowTime());
}

// recent: số dòng "Gần đây" (điện thoại 5, máy tính 7). month 'YYYY-MM'; không có thì không gửi, máy chủ lấy tháng hiện tại
// theo giờ của nó (đồng hồ máy có thể lệch sang tháng sau). Dữ liệu giả chỉ có một tháng.
export async function getAttendance(recent = 5, month?: string | null): Promise<AttendanceView> {
  if (__MOCK__) return respond(attendanceView(recent));
  const [m, profile] = await Promise.all([api.get(`/me/attendance${qs({ month })}`), api.get('/me/profile')]);
  return attendanceViewOf(m, shiftLineOf(profile), today(), recent);
}

// null khi ngày không có ca, chưa tới, hoặc chuỗi ngày sai
export async function getDay(date: string): Promise<DayDetail | null> {
  if (__MOCK__) return respond(dayDetail(date));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const [day, profile] = await Promise.all([api.get(`/me/attendance/${date}`), api.get('/me/profile')]);
  return dayDetailOf(day, { start: profile.shift.startTime, end: profile.shift.endTime }, today(), nowTime());
}

export async function getRequests(): Promise<RequestsView> {
  if (__MOCK__) return respond(requestsView());
  const res = await api.get('/me/requests');
  return requestsViewOf(res.items || []);
}

// null khi không có yêu cầu mang id này (hoặc không phải của mình)
export async function getRequest(id: string): Promise<RequestDetail | null> {
  if (__MOCK__) return respond(requestDetail(id));
  try {
    const { request, steps } = await api.get(`/me/requests/${encodeURIComponent(id)}`);
    return requestDetailOf(request, steps);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// month 'YYYY-MM'; không có thì máy chủ lấy tháng hiện tại (như getAttendance). Dữ liệu giả chỉ có một tháng.
export async function getIncome(month?: string | null): Promise<IncomeView> {
  if (__MOCK__) return respond(incomeView());
  return incomeViewOf(await api.get(`/me/income${qs({ month })}`));
}

export async function getProfile(): Promise<ProfileView> {
  if (__MOCK__) return respond(profileView());
  return profileViewOf(await api.get('/me/profile'));
}

// Vị trí hiện tại cho vùng chấm công; không có hoặc bị từ chối thì gửi không kèm toạ độ (máy chủ quyết).
function position(): Promise<{ lat?: number; lng?: number; accuracyM?: number }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({});
  return new Promise(resolve =>
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}),
      { timeout: 8000, maximumAge: 60000 }
    )
  );
}

// Check-out rồi trả màn Hôm nay mới.
// Chấm vào / ra rồi tải lại màn Hôm nay. Máy chủ từ chối lượt chấm thì ném lỗi như cũ; lượt chấm đã ghi mà tải lại màn lỗi thì
// trả null (không ném): ShiftCard báo đã chấm, màn cha tự tải lại.
export async function checkOut(): Promise<HomeView | null> {
  if (__MOCK__) {
    checkOutNow();
    return respond(homeView());
  }
  await api.post('/me/punches', { kind: 'OUT', ...(await position()) });
  return getHome().catch(() => null);
}

/** Check-in rồi trả màn Hôm nay mới (máy chủ thật). */
export async function checkIn(): Promise<HomeView | null> {
  await api.post('/me/punches', { kind: 'IN', ...(await position()) });
  return getHome().catch(() => null);
}

export const changePassword = ({ current, next }: { current: string; next: string }): Promise<{ ok: true }> =>
  session.changePassword(current, next) as Promise<{ ok: true }>;

export const logout = (): Promise<{ ok: true }> => session.logout() as Promise<{ ok: true }>;
