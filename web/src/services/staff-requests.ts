// Gọi máy chủ cho yêu cầu của nhân viên (dùng chung điện thoại và máy tính): gửi và huỷ yêu cầu theo ngày, tạm ứng, giải trình.
// Yêu cầu theo ngày ghi qua PUT /sheet (thay cả tháng) nên luôn đọc lại tháng ngay trước khi ghi, sửa đúng một ngày, gửi kèm expectedRev.
import { vnDate } from '@/builders/staff-phone/common';
import { buildAdvance } from '@/builders/staff-requests/advance';
import { buildExplanations } from '@/builders/staff-requests/explanation';
import { buildFormContext, dayFromRequest } from '@/builders/staff-requests/form';
import { buildItems } from '@/builders/staff-requests/list';
import { api } from './http';

const q = (v?) => encodeURIComponent(v);

/** GET /me + GET /sheet của tháng hiện tại (+ GET /punch cho ca được gán khi withPunch). me có sẵn thì không gọi lại. */
export async function loadRequestsData({ me, withPunch = false }: any = {}) {
  const meRes = me || (await api('GET', '/me'));
  const today = vnDate(meRes.serverNow);
  const month = today.slice(0, 7);
  const [sheet, punch] = await Promise.all([
    api('GET', `/sheet?month=${q(month)}`),
    withPunch ? api('GET', '/punch') : Promise.resolve(null)
  ]);
  return { me: meRes, today, month, sheet, punch };
}

/** Ngữ cảnh biểu mẫu: ca được gán, phép còn lại, ngày hôm nay, ngày lễ. */
export async function getFormContext({ me }: any = {}) {
  const data = await loadRequestsData({ me, withPunch: true });
  return buildFormContext(data);
}

// PUT /sheet { month, days, kpiPct, kpiAmt, expectedRev }: day = ngày gửi lên, null = bỏ khai báo ngày đó.
async function saveDay(date?, day?) {
  const month = date.slice(0, 7);
  const fresh = await api('GET', `/sheet?month=${q(month)}`);
  const days = JSON.parse(JSON.stringify(fresh.days || {}));
  if (day) days[date] = day;
  else delete days[date];
  const res = await api('PUT', '/sheet', {
    month,
    days,
    kpiPct: fresh.kpiPct === undefined ? null : fresh.kpiPct,
    kpiAmt: fresh.kpiAmt === undefined ? null : fresh.kpiAmt,
    expectedRev: fresh.rev
  });
  const item = buildItems({ approvals: res.approvals, days }).find(i => i.date === date) || null;
  return { ...res, item };
}

/** Gửi một yêu cầu theo ngày: payload = { date, type, kind, start, end, outMinutes } của biểu mẫu. Trả { ok, item } (item null khi ngày không cần duyệt). */
export async function sendDayRequest(payload?, ctx?) {
  const form = ctx || (await getFormContext());
  return saveDay(payload.date, dayFromRequest(payload, form));
}

/** Huỷ yêu cầu đang chờ của một ngày: bỏ khai báo ngày đó. */
export const cancelDayRequest = (date?) => saveDay(date, null);

// GET /advance-approvals?month= (tháng hiện tại của máy chủ)
export async function getAdvance({ me }: any = {}) {
  const month = vnDate((me || (await api('GET', '/me'))).serverNow).slice(0, 7);
  return buildAdvance(await api('GET', `/advance-approvals?month=${q(month)}`));
}

// POST /advance-approvals/request { month, expectedRev }: số tiền do máy chủ tính, nhân viên chỉ bấm xin
export async function requestAdvance(advance?) {
  await api('POST', '/advance-approvals/request', { month: advance.month, expectedRev: advance.rev });
  return getAdvance();
}

// POST /advance-approvals/withdraw { month, expectedRev }: rút yêu cầu đang chờ
export async function withdrawAdvance(advance?) {
  await api('POST', '/advance-approvals/withdraw', { month: advance.month, expectedRev: advance.rev });
  return getAdvance();
}

// GET /explanations + GET /sheet của tháng hiện tại (actualReport.absent: ngày vắng, trừ ngày đã có giải trình)
export async function getExplanations() {
  const [res, me] = await Promise.all([api('GET', '/explanations'), api('GET', '/me')]);
  const month = vnDate(me.serverNow).slice(0, 7);
  const sheet = await api('GET', `/sheet?month=${q(month)}`).catch(() => null);
  return buildExplanations(res, sheet);
}

// POST /explanations { sessionId, text }: giải trình lại Check-out muộn của lượt của chính mình
export const submitExplanation = ({ sessionId, text }: any) => api('POST', '/explanations', { sessionId, text });

// POST /explanations { date, text }: giải trình ngày vắng của chính mình
export const submitAbsentExplanation = ({ date, text }: any) => api('POST', '/explanations', { date, text });

// POST /explanations/:id/answer { text }: trả lời yêu cầu giải trình của Admin
export const answerExplanation = ({ id, text }: any) => api('POST', `/explanations/${q(id)}/answer`, { text });
