// Một số test dùng đồng hồ thật của máy và cần hôm nay (giờ Việt Nam) là ngày làm: nút Check-in không mở vào Chủ nhật.
// Chủ nhật thì bỏ qua các test đó (có lý do rõ ràng) thay vì báo đỏ; các ngày khác chạy bình thường.
export const REST_DAY_TODAY = new Date(Date.now() + 7 * 3600000).getUTCDay() === 0;
export const REST_DAY_REASON = 'Hôm nay (giờ VN) là Chủ nhật: Check-in không mở ở ngày nghỉ, test dùng đồng hồ thật này chỉ chạy ngày làm';
