// Dữ liệu giả cho giai đoạn chưa nối máy chủ.
// Mọi màn lấy dữ liệu qua một hàm trong services/<nhóm>.js (trả Promise), không import thẳng từ mock/.
// Khi nối máy chủ: đổi thân hàm đó sang api() của services/http.js; màn không phải sửa.
export const MOCK_DELAY = 120; // giả độ trễ mạng (ms)

/** Trả bản sao dữ liệu giả sau một độ trễ nhỏ, như một lần gọi máy chủ. */
export function fromMock(data, ms = MOCK_DELAY) {
  return new Promise(resolve => setTimeout(() => resolve(data == null ? data : structuredClone(data)), ms));
}

/** Giả một lần ghi thành công: trả { ok: true, ...extra }. */
export function mockSave(extra = {}, ms = MOCK_DELAY) {
  return fromMock({ ok: true, ...extra }, ms);
}
