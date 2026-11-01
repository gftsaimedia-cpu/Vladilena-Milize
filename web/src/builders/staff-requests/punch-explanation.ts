// Giải trình lúc bấm Check-in / Check-out (hàm thuần: không gọi mạng, không đọc đồng hồ máy).
// Máy chủ trả 409 CHECKIN_NEEDS_EXPLANATION / CHECKOUT_NEEDS_EXPLANATION khi lần bấm không hợp lệ mà chưa kèm giải trình;
// nhân sự nhập lý do rồi bấm lại cùng thao tác với body.explanation.

/** Số ký tự tối đa của một giải trình mà máy chủ nhận. */
export const EXPLANATION_MAX = 500;

const SIDE_OF = { CHECKIN_NEEDS_EXPLANATION: 'in', CHECKOUT_NEEDS_EXPLANATION: 'out' };

/** Lỗi của lần bấm là yêu cầu giải trình thì { side: 'in' | 'out', message, note, cases }; lỗi khác hoặc không phải lỗi: null. */
export function explanationDemand(err?) {
  const side = err && SIDE_OF[err.code];
  if (!side) return null;
  const data = err.data || {};
  return { side, message: err.message, note: data.note || '', cases: Array.isArray(data.cases) ? data.cases : [] };
}

/** Đã cắt khoảng trắng đầu đuôi: { text } nếu hợp lệ, { error } nếu rỗng hoặc quá dài. */
export function checkExplanationText(value?) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { error: 'Giải trình không được để trống' };
  if (text.length > EXPLANATION_MAX) return { error: `Giải trình tối đa ${EXPLANATION_MAX} ký tự` };
  return { text };
}

/**
 * Mục cho hộp Giải trình khi lần bấm bị đòi giải trình; null khi lỗi không phải yêu cầu giải trình.
 * send(text) bấm lại cùng thao tác kèm lý do.
 */
export function punchExplanationItem(err?, send?, date = '') {
  const demand = explanationDemand(err);
  return demand ? { date, prompt: demand.message, side: demand.side, submit: send } : null;
}
