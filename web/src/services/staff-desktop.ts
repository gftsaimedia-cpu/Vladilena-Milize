// Dịch vụ dữ liệu của nhân viên trên máy tính: gọi máy chủ qua api() rồi đổi về dạng màn đang đọc (builders/staff-desktop).
import {
  buildDayPanel,
  buildHome,
  buildMe,
  buildMonth,
  buildProfile,
  serverTodayOf
} from '../builders/staff-desktop/index';
import { buildDesktopRequests } from '../builders/staff-requests/list';
import { api } from './http';
import { changePassword, login as sessionLogin, logout as sessionLogout } from './session';
import {
  answerExplanation,
  cancelDayRequest,
  getAdvance,
  getExplanations,
  getFormContext,
  requestAdvance,
  sendDayRequest,
  submitAbsentExplanation,
  submitExplanation,
  withdrawAdvance
} from './staff-requests';

const q = (v?) => encodeURIComponent(v);
const sheetOf = async (month?) => ({ ...(await api('GET', `/sheet?month=${q(month)}`)), month });

// GET /api/me (tên, vị trí, ca, ngày bắt đầu, ngày lễ, giờ máy chủ)
export const getStaffMe = async () => buildMe(await api('GET', '/me'));

// GET /api/me + /api/punch + /api/sheet (ca hôm nay, nút Check-in/Check-out, tuần này, các ngày gần đây)
export async function getStaffHome() {
  const meRes = await api('GET', '/me');
  const month = serverTodayOf(meRes).slice(0, 7);
  const [punch, sheet] = await Promise.all([api('GET', '/punch'), sheetOf(month)]);
  return buildHome({ meRes, punch, sheet });
}

// GET /api/sheet?month= (chấm công, yêu cầu) + GET /api/me/estimate?month= (thu nhập, KPI). month trống: tháng hiện tại.
// Tháng chưa có dữ liệu trả khung trống. prev/next: tháng liền trước/sau trong khoảng từ ngày bắt đầu làm tới tháng hiện tại.
export async function getStaffMonth(_kb?, month?) {
  const meRes = await api('GET', '/me');
  const current = serverTodayOf(meRes).slice(0, 7);
  const target = /^\d{4}-\d{2}$/.test(month || '') ? month : current;
  const [sheet, est] = await Promise.all([
    sheetOf(target),
    api('GET', `/me/estimate?month=${q(target)}`).catch(() => null)
  ]);
  const built = buildMonth({ month: target, current, meRes, sheet, est });
  return { ...built, requests: buildDesktopRequests({ month: target, today: serverTodayOf(meRes), sheet }) };
}

// GET /sheet (kpiParts.self của chính mình) + GET /me/estimate (có KPI hay không, kỳ đã chốt) → { month, self, locked }; null khi nhân sự không có KPI.
// (Chuyển nguyên văn từ services/staff-phone khi app điện thoại sang dữ liệu giả; q() ở đây chỉ mã hoá giá trị nên '?month=' viết trong đường dẫn.)
export async function getStaffSelfKpi(month?) {
  const [sheet, estimate] = await Promise.all([
    api('GET', `/sheet?month=${q(month)}`),
    api('GET', `/me/estimate?month=${q(month)}`).catch(() => null)
  ]);
  const m = estimate && estimate.m;
  if (!m || m.kpiAmt === undefined || m.kpiAmt === null) return null;
  const parts = sheet.kpiParts || {};
  return { month, self: typeof parts.self === 'number' ? parts.self : null, locked: !!estimate.official };
}

// PUT /kpi/scores { month, scores: { self } }: nhân sự chỉ lưu điểm Tự đánh giá của chính mình. Lỗi của máy chủ ném ApiError nguyên văn.
export async function saveStaffSelfKpi({ month, self }: any) {
  const res = await api('PUT', '/kpi/scores', { month, scores: { self } });
  const saved = res && res.kpiParts && typeof res.kpiParts.self === 'number' ? res.kpiParts.self : self;
  return { month, self: saved };
}

// GET /api/me + GET /api/punch (ca được gán) + GET /api/sheet (phép còn lại) → ngữ cảnh hộp gửi yêu cầu
export const getStaffDayFormContext = () => getFormContext();

// PUT /api/sheet (đọc lại tháng, sửa đúng một ngày, gửi kèm expectedRev) → { ok, item }
export const submitStaffDayRequest = (payload?, ctx?) => sendDayRequest(payload, ctx);

// PUT /api/sheet bỏ khai báo ngày của một yêu cầu đang chờ
export { cancelDayRequest as cancelStaffDayRequest };

// GET /api/advance-approvals?month= (tháng hiện tại); POST /api/advance-approvals/request và /withdraw
export {
  getAdvance as getStaffAdvance,
  requestAdvance as requestStaffAdvance,
  withdrawAdvance as withdrawStaffAdvance
};

// GET /api/explanations; POST /api/explanations { sessionId, text } hoặc { date, text }; POST /api/explanations/:id/answer { text }
export {
  answerExplanation as answerStaffExplanation,
  getExplanations as getStaffExplanations,
  submitAbsentExplanation as submitStaffAbsentExplanation,
  submitExplanation as submitStaffExplanation
};

// GET /api/sheet?month= của tháng chứa ngày đó: các lượt vào/ra gốc và trạng thái công
export async function getStaffDay(_kb?, date?) {
  const meRes = await api('GET', '/me');
  const sheet = await sheetOf(date.slice(0, 7));
  return buildDayPanel({ date, sheet, today: serverTodayOf(meRes) });
}

// GET /api/me + GET /api/punch (tên ca) + GET /api/sheet (lịch làm việc)
export async function getStaffProfile() {
  const meRes = await api('GET', '/me');
  const month = serverTodayOf(meRes).slice(0, 7);
  const [punch, sheet] = await Promise.all([api('GET', '/punch'), sheetOf(month)]);
  const label = sheet.workSchedule && sheet.workSchedule.describe && sheet.workSchedule.describe.label;
  return buildProfile({ ...meRes, schedule: { label } }, punch.shiftConfig);
}

// Mã của một lần bấm: giữ nguyên khi thử lại sau lỗi mạng (máy chủ trả lại phản hồi cũ, không chấm công hai lần), bỏ khi máy chủ đã trả lời.
const newId = () =>
  globalThis.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
let attempt: any = null;

function defaultGetPos(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

/** Dựng thân yêu cầu POST /punch cho giao diện Desktop: kiểm tra geofence và lấy đúng sessionId khi Check-out. */
export async function buildPunchBodyForDesktop({ type, requestId, explanation, me, punchState, getPos }: any) {
  const body: Record<string, any> = {
    type,
    requestId,
    ...(explanation ? { explanation } : {})
  };
  if (type === 'out') {
    const sessionId = punchState?.open?.id ?? punchState?.openSession?.id ?? null;
    if (sessionId) body.sessionId = sessionId;
  }
  if (type === 'in' && me?.geofenceRequired) {
    const pos = typeof getPos === 'function' ? await getPos() : await defaultGetPos();
    if (pos) body.location = pos;
  }
  return body;
}

// POST /api/punch  (kind: 'in' | 'out', explanation: lý do khi lần bấm không hợp lệ). Lỗi của máy chủ ném ApiError với câu nguyên văn, mã ở .code.
export async function staffCheck(kind?, explanation?, getPos?) {
  const type = kind === 'out' ? 'out' : 'in';
  let punchState: any = null;
  let me: any = null;
  if (type === 'out') {
    punchState = await api('GET', '/punch');
  } else {
    me = await api('GET', '/me').catch(() => null);
  }
  const sessionId = type === 'out' ? (punchState?.open?.id ?? punchState?.openSession?.id ?? null) : null;
  if (!attempt || attempt.type !== type || attempt.sessionId !== sessionId)
    attempt = { type, sessionId, requestId: newId() };
  const body = await buildPunchBodyForDesktop({
    type,
    requestId: attempt.requestId,
    explanation,
    me,
    punchState,
    getPos
  });
  try {
    const res = await api('POST', '/punch', body);
    attempt = null;
    return { ok: true, ...res };
  } catch (e) {
    if (e && e.status) attempt = null; // máy chủ đã trả lời: lần bấm sau là lượt mới
    throw e;
  }
}

// PUT /api/password  { current, next } (qua services/session.js)
export async function changeMyPassword({ current, next }: any) {
  try {
    await changePassword(current, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// POST /api/login rồi GET /api/me (qua services/session.js) → { ok, role }
export async function login({ username, password }: any) {
  try {
    const session = await sessionLogin({ username, password });
    return { ok: true, role: session.user && session.user.role === 'admin' ? 'admin' : 'staff' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// POST /api/logout (qua services/session.js)
export const logout = () => sessionLogout();
