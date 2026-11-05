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
const thisMonth = () => today().slice(0, 7);
const shiftLineOf = (p: MeProfile) =>
  `${p.shift.type === 'NORMAL' ? 'HC' : p.shift.type} ${p.shift.startTime}–${p.shift.endTime}`;

export async function getHome(): Promise<HomeView> {
  if (__MOCK__) return respond(homeView());
  const [t, profile, income, reqs] = await Promise.all([
    api.get('/me/today'),
    api.get('/me/profile'),
    api.get(`/me/income${qs({ month: thisMonth() })}`).catch(() => null),
    api.get('/me/requests')
  ]);
  return homeViewOf(t, profile, income, reqs.items || [], nowTime());
}

export async function getAttendance(): Promise<AttendanceView> {
  if (__MOCK__) return respond(attendanceView());
  const [month, profile] = await Promise.all([api.get(`/me/attendance${qs({ month: thisMonth() })}`), api.get('/me/profile')]);
  return attendanceViewOf(month, shiftLineOf(profile), today());
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

export async function getIncome(): Promise<IncomeView> {
  if (__MOCK__) return respond(incomeView());
  return incomeViewOf(await api.get(`/me/income${qs({ month: thisMonth() })}`));
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
export async function checkOut(): Promise<HomeView> {
  if (__MOCK__) {
    checkOutNow();
    return respond(homeView());
  }
  await api.post('/me/punches', { kind: 'OUT', ...(await position()) });
  return getHome();
}

/** Check-in rồi trả màn Hôm nay mới (máy chủ thật). */
export async function checkIn(): Promise<HomeView> {
  await api.post('/me/punches', { kind: 'IN', ...(await position()) });
  return getHome();
}

export const changePassword = ({ current, next }: { current: string; next: string }): Promise<{ ok: true }> =>
  session.changePassword(current, next) as Promise<{ ok: true }>;

export const logout = (): Promise<{ ok: true }> => session.logout() as Promise<{ ok: true }>;
