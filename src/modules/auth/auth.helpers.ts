const { clientIp } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh

export const LOCKED_MESSAGE = 'Tài khoản đã bị khoá. Liên hệ Admin để được mở lại.';
// Địa chỉ dùng cho giới hạn đăng nhập: cùng hàm với nhật ký chấm công (clientIp), để header giả không lách được.
export const loginAddress = clientIp;
