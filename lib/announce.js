const events = require('./events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const configRev = require('./params/config-rev'); // số phiên bản chung của cấu hình (settings.config_rev)
const { vnToday } = require('./request-rules');

/* ---------- báo cho màn đang mở (lib/events.js) ---------- */
// Mọi lần phát nằm SAU khi giao dịch của route đã trả (đã COMMIT); lỗi thì không tới được dòng phát.
// Thay đổi cấu hình (công tắc, GPS, ngày lễ): fromMonth là tháng đầu tiên bị ảnh hưởng, mặc định tháng hiện tại.
const announceSetting = (kind, by, fromMonth) =>
  events.emit.paramsChanged({ configRev: configRev.read(), fromMonth: fromMonth || vnToday().slice(0, 7), kind, by });
// Việc chấm công mới chờ Admin (quên Check-out tự đóng, Check-out ra trạng thái chờ): gom theo tháng trong lúc xử lý yêu cầu rồi phát một lần khi yêu cầu xong
const attendanceHints = new Set();
function announceAttendance() {
  const months = [...attendanceHints];
  attendanceHints.clear();
  for (const month of months) events.emit.attendanceChanged('forgot', month);
}

module.exports = { attendanceHints, announceSetting, announceAttendance };
