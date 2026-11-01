// Quy tắc nhập chung của các hộp thoại Cài đặt (theo chữ trên thiết kế: lý do bắt buộc, 10–300 ký tự).
export const REASON_MIN = 10;
export const REASON_MAX = 300;

export const reasonOk = (text?) => {
  const n = (text || '').trim().length;
  return n >= REASON_MIN && n <= REASON_MAX;
};
