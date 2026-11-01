'use strict';
// Phân loại route cho giới hạn tải. Khoá đúng dạng ROUTE_CAPS (src/platform/authz.ts → routeKey). test/unit/route-classes.test.ts giữ cho
// mọi khoá ở đây có thật trong ROUTE_CAPS (đổi tên route mà quên cập nhật thì test đỏ).

// Route nặng: tính cả bảng lương/cả tháng cho mọi người, hoặc lưu lịch của hàng trăm người trong một giao dịch (PUT /sheet/bulk). Quá tải thì từ chối 503 + Retry-After; màn tự nạp lại nên người dùng chỉ phải chờ vài giây.
const HEAVY_ROUTES = Object.freeze(
  new Set<any>([
    'GET /team',
    'GET /alerts',
    'GET /approvals',
    'GET /periods/:month/estimates',
    'GET /staff',
    'PUT /sheet/bulk'
  ])
);

// Lệnh ghi KHÔNG bị giới hạn tốc độ theo người: Check-in/out là việc 300 người làm gần như cùng giờ đầu ca, tuyệt đối không được từ chối.
const UNLIMITED_WRITE_ROUTES = Object.freeze(new Set<any>(['POST /punch', 'POST /login', 'POST /logout']));

export = { HEAVY_ROUTES, UNLIMITED_WRITE_ROUTES };
