'use strict';
// Phân loại route cho giới hạn tải. Khoá đúng dạng ROUTE_CAPS (lib/authz.js → routeKey). test/unit/route-classes.test.js giữ cho
// mọi khoá ở đây có thật trong ROUTE_CAPS (đổi tên route mà quên cập nhật thì test đỏ).

// Route nặng: tính cả bảng lương/cả tháng cho mọi người, hoặc lưu lịch của hàng trăm người trong một giao dịch (PUT /sheet/bulk). Quá tải thì từ chối 503 + Retry-After; màn tự nạp lại nên người dùng chỉ phải chờ vài giây.
const HEAVY_ROUTES = Object.freeze(
  new Set([
    'GET /team',
    'GET /alerts',
    'GET /approvals',
    'GET /periods/:month/estimates',
    'GET /staff',
    'GET /ai/review',
    'PUT /sheet/bulk'
  ])
);

// Lệnh ghi KHÔNG bị giới hạn tốc độ theo người: Check-in/out là việc 300 người làm gần như cùng giờ đầu ca, tuyệt đối không được từ chối.
const UNLIMITED_WRITE_ROUTES = Object.freeze(new Set(['POST /punch', 'POST /login', 'POST /logout']));

module.exports = { HEAVY_ROUTES, UNLIMITED_WRITE_ROUTES };
