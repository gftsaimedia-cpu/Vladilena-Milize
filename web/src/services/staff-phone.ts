// Dịch vụ dữ liệu cho giao diện nhân viên trên điện thoại. Hôm nay, Chấm công, Thu nhập, Tôi gọi máy chủ thật;
// Yêu cầu, tạm ứng, giải trình cũng gọi máy chủ thật (qua staff-requests.js).
import { buildAttendance, buildDayDetail } from '@/builders/staff-phone/attendance';
import { monthsBetween, neighbors, shiftName, vnDate, vnTime } from '@/builders/staff-phone/common';
import { buildHome } from '@/builders/staff-phone/home';
import { buildEstimateIncome, buildPayslipIncome, emptyIncome } from '@/builders/staff-phone/income';
import { buildProfile } from '@/builders/staff-phone/profile';
import { buildPhoneRequests } from '@/builders/staff-requests/list';
import { ApiError, api } from './http';
import * as session from './session';
import {
  answerExplanation,
  cancelDayRequest,
  getAdvance,
  getExplanations,
  getFormContext,
  loadRequestsData,
  requestAdvance,
  sendDayRequest,
  submitAbsentExplanation,
  submitExplanation,
  withdrawAdvance
} from './staff-requests';

const monthOf = (date?) => date.slice(0, 7);
const q = (month?) => '?month=' + encodeURIComponent(month);

// GET /me của một lần mở màn; các lời gọi liền nhau trong 3 giây dùng chung một phản hồi.
let meCache: any = null;
function getMe() {
  if (!meCache || Date.now() - meCache.at > 3000) meCache = { at: Date.now(), p: api('GET', '/me') };
  const mine = meCache;
  return mine.p.catch(e => {
    if (meCache === mine) meCache = null;
    throw e;
  });
}

/** Ngày, tháng hiện tại theo giờ máy chủ và các tháng xem được (từ tháng bắt đầu làm tới tháng hiện tại). */
export async function getMonthContext() {
  const me = await getMe();
  const today = vnDate(me.serverNow);
  const month = monthOf(today);
  const start = me.user && me.user.startDate ? monthOf(me.user.startDate) : month;
  return { me, today, month, months: monthsBetween(start, month) };
}

const scheduleLabel = (sheet?) =>
  (sheet.workSchedule && sheet.workSchedule.describe && sheet.workSchedule.describe.label) || '';
function shiftLineOf(punchState?, me?, sheet?) {
  const name = shiftName(punchState.shiftConfig && punchState.shiftConfig.shifts, me.user.shiftCode);
  const label = scheduleLabel(sheet);
  return label ? `${name} · làm ${label}` : name;
}

// GET /me + GET /punch + GET /sheet + GET /me/estimate của tháng hiện tại → màn Hôm nay
export async function getHome() {
  const ctx = await getMonthContext();
  const [punchState, sheet, estimate] = await Promise.all([
    api('GET', '/punch'),
    api('GET', '/sheet' + q(ctx.month)),
    api('GET', '/me/estimate' + q(ctx.month))
  ]);
  return buildHome({ me: ctx.me, punch: punchState, sheet, estimate });
}

// Mỗi lần bấm một requestId mới; thử lại sau lỗi mạng giữ nguyên id để máy chủ không ghi hai lần.
let retry: any = null;
const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Không lấy được vị trí'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('Không lấy được vị trí')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// POST /punch { type: 'in' | 'out', requestId, sessionId (Check-out), location (Check-in khi cần vùng chấm công), explanation }
export async function punch(kind?, _time?, explanation?) {
  const type = kind === 'out' ? 'out' : 'in';
  if (!retry || retry.type !== type) retry = { type, id: newId() };
  const body: Record<string, any> = { type, requestId: retry.id };
  if (explanation) body.explanation = explanation;
  try {
    if (type === 'out') {
      const state = await api('GET', '/punch');
      if (!state.open) throw new ApiError(409, 'Bạn không có lượt đang mở', {});
      body.sessionId = state.open.id;
    } else {
      const me = await getMe();
      if (me.geofenceRequired) body.location = await getPosition();
    }
    const res = await api('POST', '/punch', body);
    retry = null;
    meCache = null;
    return { ...res, ok: true, time: vnTime(res.serverNow) };
  } catch (e) {
    if (e instanceof ApiError) retry = null;
    throw e;
  }
}

// GET /sheet?month= + GET /me/estimate?month= → thẻ tháng; null nếu tháng không có dữ liệu chấm công
export async function getAttendance(month?) {
  const ctx = await getMonthContext();
  const [sheet, estimate, punchState] = await Promise.all([
    api('GET', '/sheet' + q(month)),
    api('GET', '/me/estimate' + q(month)),
    api('GET', '/punch')
  ]);
  return buildAttendance({
    month,
    sheet,
    estimate,
    me: ctx.me,
    today: ctx.today,
    nav: neighbors(ctx.months, month),
    shiftLine: shiftLineOf(punchState, ctx.me, sheet),
    nowIso: ctx.me.serverNow
  });
}

// GET /sheet?month= của tháng chứa ngày đó → các lượt vào/ra gốc (kể cả OT, giờ bù) và công của ngày
export async function getDayDetail(date?) {
  const ctx = await getMonthContext();
  const [sheet, punchState] = await Promise.all([api('GET', '/sheet' + q(monthOf(date))), api('GET', '/punch')]);
  return buildDayDetail({
    date,
    sheet,
    me: ctx.me,
    shiftLine: shiftLineOf(punchState, ctx.me, sheet),
    nowIso: ctx.me.serverNow
  });
}

// GET /me + GET /sheet của tháng hiện tại → yêu cầu đã gửi (theo sheet.approvals), phép năm
export async function getRequests() {
  const ctx = await getMonthContext();
  const { sheet } = await loadRequestsData({ me: ctx.me });
  return buildPhoneRequests({ month: ctx.month, today: ctx.today, sheet });
}

// GET /me + GET /punch (ca được gán) + GET /sheet (phép còn lại) → ngữ cảnh biểu mẫu gửi yêu cầu
export async function getDayFormContext() {
  const ctx = await getMonthContext();
  return getFormContext({ me: ctx.me });
}

// PUT /sheet (đọc lại tháng, sửa đúng một ngày, gửi kèm expectedRev) → { ok, item }; item là yêu cầu vừa tạo (null khi ngày không cần duyệt)
export const submitDayRequest = (payload?, ctx?) => sendDayRequest(payload, ctx);

// PUT /sheet bỏ khai báo ngày của một yêu cầu đang chờ
export { cancelDayRequest };

// GET /advance-approvals?month= (tháng hiện tại): số tiền do máy chủ tính, trạng thái, ngày được xin
export async function getMyAdvance() {
  const ctx = await getMonthContext();
  return getAdvance({ me: ctx.me });
}
// POST /advance-approvals/request và /withdraw { month, expectedRev }
export { requestAdvance, withdrawAdvance };

// GET /explanations; POST /explanations { sessionId, text } hoặc { date, text }; POST /explanations/:id/answer { text }
export { answerExplanation, getExplanations, submitAbsentExplanation, submitExplanation };

// Phiếu chính thức của tháng (GET /periods/:month/payslips/:username) khi đã có; chưa có (403, 404) hoặc phiếu lỗi thì số của GET /me/estimate.
// Tháng không có phiếu và không có số trả khung rỗng chỉ mang nút chuyển tháng (emptyIncome).
export async function getIncome(month?) {
  const ctx = await getMonthContext();
  const nav = neighbors(ctx.months, month);
  try {
    const res = await api(
      'GET',
      `/periods/${encodeURIComponent(month)}/payslips/${encodeURIComponent(ctx.me.user.username)}`
    );
    const official = buildPayslipIncome({ month, res, nav });
    if (official) return official;
  } catch (e) {
    if (!(e instanceof ApiError) || ![403, 404].includes(e.status)) throw e;
  }
  const estimate = await api('GET', '/me/estimate' + q(month));
  return buildEstimateIncome({ month, estimate, nav }) || emptyIncome(month, nav);
}

// GET /me + GET /punch + GET /sheet → màn Tôi
export async function getProfile() {
  const ctx = await getMonthContext();
  const [punchState, sheet] = await Promise.all([api('GET', '/punch'), api('GET', '/sheet' + q(ctx.month))]);
  return buildProfile({ me: ctx.me, punch: punchState, sheet });
}

// GET /sheet (kpiParts.self của chính mình) + GET /me/estimate (có KPI hay không, kỳ đã chốt) → { month, self, locked }; null khi nhân sự không có KPI.
export async function getSelfKpi(month?) {
  const [sheet, estimate] = await Promise.all([
    api('GET', '/sheet' + q(month)),
    api('GET', '/me/estimate' + q(month)).catch(() => null)
  ]);
  const m = estimate && estimate.m;
  if (!m || m.kpiAmt === undefined || m.kpiAmt === null) return null;
  const parts = sheet.kpiParts || {};
  return { month, self: typeof parts.self === 'number' ? parts.self : null, locked: !!estimate.official };
}

// PUT /kpi/scores { month, scores: { self } }: nhân sự chỉ lưu điểm Tự đánh giá của chính mình. Lỗi của máy chủ ném ApiError nguyên văn.
export async function saveSelfKpi({ month, self }: any) {
  const res = await api('PUT', '/kpi/scores', { month, scores: { self } });
  const saved = res && res.kpiParts && typeof res.kpiParts.self === 'number' ? res.kpiParts.self : self;
  return { month, self: saved };
}

// PUT /password { current, next }
export const changePassword = ({ current, next }: any = {}) => session.changePassword(current, next);

// POST /logout
export const logout = () => {
  meCache = null;
  return session.logout();
};
