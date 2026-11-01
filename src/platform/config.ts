'use strict';
// Giới hạn kỹ thuật của máy chủ ở MỘT chỗ (không số trong mã nghiệp vụ).
// Các hằng số này là NGUỒN của khoá registry `system.audit.*`, `control.reason*Length` và `system.slipOverride.reasonRequired`
// (editableBy: ops, hiện chỉ đọc ở tab Hệ thống): scripts/params/extract-defaults.ts đọc chúng vào src/engine/payroll-params.ts → DEFAULTS,
// nên đổi giá trị ở đây rồi chạy `npm run params:extract`. Module giữ vai trò người đọc mỏng cho server.js.
export = Object.freeze({
  // Nhật ký kiểm toán
  AUDIT_PAGE_MAX: 200, // số dòng tối đa một trang GET /api/audit
  AUDIT_PAGE_DEFAULT: 50,
  // Danh sách phiếu lương của một kỳ (GET /api/periods/:month/payslips)
  PAYSLIP_PAGE_DEFAULT: 50,
  PAYSLIP_PAGE_MAX: 200,
  // Cảnh báo thay cho chặn (src/platform/warnings.ts): số tên/người tối đa nêu trong một câu cảnh báo (ngày lễ lệch lịch: 20; phần còn lại ghi "và N người khác")
  WARN_NAMES_MAX: 20,
  SQL_IN_CHUNK: 500, // số id tối đa trong một mệnh đề IN khi nạp lô (lượt bấm, điều chỉnh theo phiên): dưới giới hạn biến của SQLite
  WARN_NAMES_SHORT: 5, // câu cảnh báo gọn (thực lĩnh âm, phiếu còn cờ AI)
  WARN_MAX: 50, // trần số cảnh báo giữ trong một yêu cầu (một yêu cầu lô không làm phản hồi phình vô hạn); phần dư gộp thành WARNINGS_TRUNCATED
  WARN_CODES_AUDIT_MAX: 20, // số mã cảnh báo tối đa ghi vào nhật ký (after.warnings)
  // Lý do: 10 đến 300 ký tự
  REASON_MIN: 10,
  REASON_MAX: 300,
  // Lưu tham số (src/params/save.ts): số thay đổi tối đa một lần Lưu; số người tối đa trong bảng tác động của xem trước (totals vẫn tính cả)
  PARAMS_MAX_CHANGES: 50,
  PARAMS_PREVIEW_MAX_PEOPLE: 50,
  // Kênh báo GET /api/events (src/platform/events.ts): nhịp tim (giây), gợi ý nối lại (mili giây), trần kết nối mỗi người và cả máy chủ,
  // trần byte chờ ghi của một kết nối (vượt thì đóng, khách nối lại và nạp lại)
  EVENTS_HEARTBEAT_SEC: 25,
  EVENTS_RETRY_MS: 3000,
  EVENTS_MAX_PER_USER: 5,
  EVENTS_MAX_TOTAL: 3000,
  EVENTS_MAX_BACKLOG_BYTES: 262144,
  // Giữ kết nối HTTP (keep-alive): mặc định của Node là 5 giây, ngắn hơn thời gian trình duyệt/điện thoại giữ socket,
  // nên khách dùng lại một socket máy chủ vừa đóng → ECONNRESET "ma" dù không có tải.
  // headersTimeout phải LỚN HƠN keepAliveTimeout (Node cảnh báo nếu ngược). Áp ở server.js, ngay sau createServer.
  HTTP_KEEP_ALIVE_MS: 65000,
  HTTP_HEADERS_TIMEOUT_MS: 66000,
  // Tối đa thời gian nhận trọn một yêu cầu (kẻ gửi chậm không giữ socket mãi); luồng SSE là phản hồi nên không bị tính.
  HTTP_REQUEST_TIMEOUT_MS: 30000,
  // Nén gzip phản hồi từ cỡ này trở lên (byte); nhỏ hơn thì tốn CPU hơn lợi băng thông.
  HTTP_GZIP_MIN_BYTES: 1024,
  // Số luồng của libuv (băm mật khẩu scrypt, nén gzip, đọc file chạy ở đây). Mặc định 4 làm 100 người đăng nhập cùng lúc xếp hàng sau nhau.
  UV_THREADPOOL_SIZE: 8,
  // Tắt êm: quá thời gian này mà còn kết nối treo thì thoát cưỡng bức (mili giây).
  SHUTDOWN_GRACE_MS: 10000,
  // File tĩnh nén sẵn được giữ trong bộ nhớ nếu nhỏ hơn cỡ này (byte); lớn hơn thì đọc theo luồng.
  STATIC_CACHE_MAX_BYTES: 2097152,
  // Bộ nhớ đệm phép tính nặng chỉ-đọc (src/ops/compute-cache.ts): tuổi tối đa của kết quả (chặn phần phụ thuộc giờ) và số kết quả giữ lại.
  COMPUTE_CACHE_TTL_MS: 15000,
  COMPUTE_CACHE_MAX_ENTRIES: 64,
  // Giới hạn đồng thời (src/ops/limiters.ts). Băm mật khẩu (scrypt) chạy ở luồng nền: 100 người đăng nhập cùng lúc chiếm hết luồng, làm cả nén gzip và
  // đọc file đứng chờ. Chỉ cho PASSWORD_HASH_CONCURRENCY phép băm chạy cùng lúc (nhỏ hơn UV_THREADPOOL_SIZE), hàng đợi tối đa PASSWORD_HASH_QUEUE_MAX,
  // thừa nữa thì trả 503 + Retry-After thay vì giữ kết nối.
  PASSWORD_HASH_CONCURRENCY: 4,
  PASSWORD_HASH_QUEUE_MAX: 200,
  // Route nặng (src/ops/route-classes.ts) bị từ chối 503 khi vòng lặp sự kiện trễ KÉO DÀI từ SHED_MAX_LAG_MS (trung vị vài giây gần nhất) hoặc có từ SHED_MAX_INFLIGHT yêu cầu đang xử lý.
  SHED_MAX_LAG_MS: 150,
  SHED_MAX_INFLIGHT: 150,
  OVERLOAD_RETRY_AFTER_SEC: 3,
  // Mỗi người tối đa số lệnh ghi (POST/PUT/DELETE, trừ Check-in/out) mỗi phút: chặn script lặp hoặc nút bấm dồn, không ảnh hưởng người dùng bình thường.
  WRITE_RATE_PER_MINUTE: 240,
  // Đo độ trễ vòng lặp sự kiện (phút đo mỗi 20 ms) để /api/health và nhật ký truy cập báo máy chủ có đang nghẽn không.
  LOOP_LAG_RESOLUTION_MS: 20,
  // Cửa sổ trượt (mili giây) của số đo trễ vòng lặp: bộ chặn quá tải và /api/health chỉ nhìn vài giây gần nhất, không phải cả đời tiến trình.
  LOOP_LAG_WINDOW_MS: 5000,
  // Thuộc tính mở rộng của lớp: số thuộc tính tuỳ chỉnh tối đa mỗi lớp
  ATTR_MAX_PER_CLASS: 20,
  // Giới hạn đoán mật khẩu (src/platform/auth.ts): số lần sai mỗi (địa chỉ, tên), số tên khác nhau mỗi địa chỉ, cửa sổ tính (phút), số mục tối đa trong bộ nhớ;
  // thời hạn phiên (ngày; biến môi trường SESSION_DAYS thắng)
  LOGIN_MAX_FAILURES: 5,
  LOGIN_SPRAY_USERS: 30,
  LOGIN_WINDOW_MIN: 15,
  LOGIN_MAX_KEYS: 5000,
  SESSION_DAYS: 14,
  // Số người tối đa trong một lần gán ca hàng loạt (PUT /api/staff/shift-bulk)
  STAFF_BULK_MAX: 200,
  // Số khoản tối đa trong một lần duyệt (PUT /api/approvals/decide)
  APPROVAL_MAX_DECIDE_ITEMS: 200,
  // Khoản điền thêm theo người theo tháng (src/domain/payroll/pay-entries.ts): bắt buộc người duyệt khác người lập (bật mặc định);
  // số khoản tối đa một lần nhập hàng loạt; số tiền tối đa mỗi khoản (đồng, chặn nhập nhầm); số ký tự tối đa của nhãn (bằng CHECK của bảng)
  ENTRIES_REQUIRE_APPROVAL: true,
  ENTRIES_MAX_PER_BATCH: 200,
  ENTRIES_MAX_AMOUNT: 100000000000,
  ENTRIES_LABEL_MAX: 80,
  // Chức vụ và khối do C&B thêm (src/params/positions.ts, block-defs.js): mã chức vụ 2 đến 16 ký tự, tên 1 đến 40, tên viết tắt 1 đến 8; tên khối 1 đến 40.
  // Giới hạn kỹ thuật (độ dài định danh và nhãn), không phải tham số nghiệp vụ; key-map.js ghi nhận là ignore.
  POSITION_CODE_MIN: 2,
  POSITION_CODE_MAX: 16,
  POSITION_LABEL_MAX: 40,
  HOLIDAY_NAME_MAX: 60, // tên ngày lễ (nhãn hiển thị)
  POSITION_SHORT_MAX: 8,
  BLOCK_LABEL_MAX: 40,
  // Độ dài tối thiểu của mật khẩu khi Admin đặt hoặc đặt lại, và khi tự đổi (số ký tự)
  PASSWORD_MIN_LENGTH: 6,
  // Dấu xác nhận cờ thuế, bảo hiểm của khối (flagsConfirmedBy là tên đăng nhập, flagsConfirmedAt là thời điểm ISO): số ký tự tối đa của mỗi chuỗi
  BLOCK_CONFIRM_MARK_MAX: 128,
  // Vai trò tuỳ chỉnh (src/domain/roles/roles.ts): số vai trò tuỳ chỉnh tối đa (kể cả đã ngưng dùng), mã vai trò dài tối đa (bằng ROLE_RE của src/platform/db.ts), tên vai trò dài tối đa
  ROLES_CUSTOM_MAX: 30,
  ROLE_CODE_MAX: 32,
  ROLE_LABEL_MAX: 40,
  // Số ký tự tối đa của chuỗi người dùng được nhắc lại trong thông báo lỗi (tên trường lạ, khoá, mã), để lỗi không mang theo dữ liệu dài
  ERROR_ECHO_FIELD_MAX: 40,
  ERROR_ECHO_KEY_MAX: 60,
  ERROR_ECHO_CODE_MAX: 20,
  // Bảng nhớ requestId của Check-in/out (src/domain/attendance/attendance-sessions.ts → purgePunchRequests): xoá bản ghi cũ hơn số ngày này (khoảng 3,7 KB/dòng,
  // 2 dòng/người/ngày nên không dọn thì phình khoảng 2,8 GB/năm với 1.000 người), lặp mỗi số giờ bên dưới.
  // Phải LỚN HƠN cửa sổ thử lại của phía khách (src/engine/nhan-vien/punch.js → ATTEMPT_TTL_MS, 2 giờ), nếu không sẽ chấm công hai lần.
  PUNCH_REQUEST_KEEP_DAYS: 30,
  PUNCH_REQUEST_PURGE_MS: 86400000, // 24 giờ: nhịp lặp lại đợt dọn trên (server.js → setInterval(...).unref())
  // Check-out muộn hơn giờ kết thúc ca (cộng phần làm thêm đã khai) quá số phút này thì phải giải trình trước (src/domain/explanation/explanations.ts).
  CHECKOUT_GRACE_MIN: 30,
  // Tháng nền của danh mục chức vụ và ca (dòng nạp từ mặc định áp cho mọi tháng; dòng Admin sửa sau mang tháng áp dụng riêng)
  CATALOG_BASE_MONTH: '2000-01',
  // Số id cộng thêm cho dòng của danh mục khi trộn với param_versions: cùng tháng áp dụng thì danh mục thắng (sửa sau cùng ở danh mục)
  CATALOG_ROW_ID_BASE: 1099511627776,
  // Nhịp làm mới số dư phép lưu sẵn trong bảng staff (mili giây): cộng phép tháng tròn, sinh nhật và ghi sổ phép
  LEAVE_REFRESH_MS: 3600000
});
