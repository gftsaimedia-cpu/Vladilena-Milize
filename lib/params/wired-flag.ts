'use strict';
// Một khoá cụ thể của một mục registry có "nối vào bộ máy" chưa (cờ wired, xem scripts/params/wired.ts để biết cách cờ được tính và kiểm).
// wired: true = mọi khoá của mục đã nối. wired: false kèm unwiredKeys = bảng hỗn hợp (ví dụ bậc lương: lương cơ bản đã nối, lương KPI tối đa còn
// bản sao ở server.js): chỉ khoá liệt kê bị chặn. wired: false không kèm unwiredKeys = không khoá nào nối. Thiếu cờ (mục không sửa được) = chưa nối.
const isKeyWired = (entry?, key?) =>
  entry.wired === true ||
  (entry.wired === false && Array.isArray(entry.unwiredKeys) && !entry.unwiredKeys.includes(key));

export = { isKeyWired };
