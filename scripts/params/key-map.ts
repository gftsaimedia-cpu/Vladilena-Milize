'use strict';
// Bảng đường dẫn mã → khoá tham số. CHỈ LÀ DỮ LIỆU, không logic.
// extract-defaults.js đi qua MỌI lá của các đối tượng nguồn; lá không khớp mục nào dưới đây thì script DỪNG (không đoán).
//
// Cú pháp đường dẫn: các đoạn cách nhau dấu chấm; đoạn là chữ cố định, `<tên>` (khớp mọi giá trị, dùng lại được ở khoá), hoặc
// `<tên:a|b|c>` (chỉ khớp một trong các giá trị). Khoá thay `<tên>` bằng giá trị đã khớp.
//
// Ba loại mục:
//   { path, key }                  sinh khoá `key` (có thể nhiều khoá: key là mảng) với giá trị chép từ mã
//   { path, ignore: 'lý do' }      lá không phải tham số (chữ hiển thị, bản chép đã có khoá khác ...)
//   { path, derived: 'lý do' }     giá trị dẫn xuất từ khoá khác; params:check kiểm bằng nhau, không lưu
// Nguồn kiểu regex (`regex`): giá trị là nhóm bắt đầu tiên, biểu thức `a * b` được tính; `transform` đổi đơn vị.

// Các khoá TYPES, TAX_RULES, hằng số rời, ca cố định, trần OT nằm ở hand-defaults.json và src/engine/payroll-params.ts → DEFAULTS,
// là nguồn duy nhất; KHÔNG script nào ở scripts/params/ đọc src/engine/index.html.
// Bản đóng băng test/fixtures/legacy-payroll-block.js chỉ dùng để đối chiếu trong check.js.

const RULES = [
  /* ---- src/engine/actual-hours.ts ---- */
  { path: 'ActualHours.RULE.GRACE_MIN', key: 'attendance.graceMin' },
  { path: 'ActualHours.RULE.STEP_MIN', key: 'attendance.stepMin' },
  { path: 'ActualHours.RULE.SHIFT_WORK_MIN', derived: '= time.workHoursPerDay × unit.minutesPerHour' },
  { path: 'ActualHours.POLICY.makeupHolidayRate', key: 'holiday.makeupRate' },
  { path: 'ActualHours.POLICY.cutRounding', key: 'attendance.cutRounding' },
  { path: 'ActualHours.POLICY.<name>', key: 'attendance.<name>Rule' },
  /* ---- src/engine/kpi-score.ts ---- */
  { path: 'KpiScore.COMPONENTS.<key>.weight', key: 'kpi.weight.<key>' },
  { path: 'KpiScore.WEWORK_MIN', key: 'kpi.weworkMin' },
  { path: 'KpiScore.POLICY.<name>', key: 'kpi.<name>Rule' },
  /* ---- src/engine/approval-view.ts ---- */
  { path: 'ApprovalView.POLICY.pending.<item>', key: 'request.type.<item>.pendingRule' },
  { path: 'ApprovalView.POLICY.rejected.<item>', key: 'request.type.<item>.rejectedRule' },
  { path: 'ApprovalView.COUNTS_ABSENT.<item>', key: 'request.type.<item>.countsAbsent' },
  /* ---- src/platform/config.ts ---- */
  { path: 'config.AUDIT_PAGE_MAX', key: 'system.audit.pageMax' },
  { path: 'config.AUDIT_PAGE_DEFAULT', key: 'system.audit.pageDefault' },
  { path: 'config.PAYSLIP_PAGE_DEFAULT', key: 'system.page.payslips.default' },
  { path: 'config.PAYSLIP_PAGE_MAX', key: 'system.page.payslips.max' },
  { path: 'config.REASON_MIN', key: 'control.reasonMinLength' },
  { path: 'config.REASON_MAX', key: 'control.reasonMaxLength' },
  { path: 'config.PARAMS_MAX_CHANGES', key: 'system.params.maxChanges' },
  { path: 'config.PARAMS_PREVIEW_MAX_PEOPLE', key: 'system.params.previewMaxPeople' },
  { path: 'config.EVENTS_HEARTBEAT_SEC', key: 'system.events.heartbeatSec' },
  { path: 'config.EVENTS_RETRY_MS', key: 'system.events.retryMs' },
  { path: 'config.EVENTS_MAX_PER_USER', key: 'system.events.maxPerUser' },
  { path: 'config.EVENTS_MAX_TOTAL', key: 'system.events.maxTotal' },
  { path: 'config.EVENTS_MAX_BACKLOG_BYTES', key: 'system.events.maxBacklogBytes' },
  { path: 'config.ATTR_MAX_PER_CLASS', key: 'system.attr.maxPerClass' },
  // Hằng kỹ thuật của cơ chế cảnh báo và nạp lô, không phải tham số của C&B
  { path: 'config.WARN_NAMES_MAX', ignore: 'số tên tối đa trong một câu cảnh báo (kỹ thuật)' },
  { path: 'config.WARN_NAMES_SHORT', ignore: 'số tên tối đa trong câu cảnh báo gọn (kỹ thuật)' },
  { path: 'config.WARN_MAX', ignore: 'trần số cảnh báo giữ trong một yêu cầu (kỹ thuật)' },
  { path: 'config.HTTP_KEEP_ALIVE_MS', ignore: 'giới hạn kỹ thuật của máy chủ HTTP' },
  { path: 'config.HTTP_HEADERS_TIMEOUT_MS', ignore: 'giới hạn kỹ thuật của máy chủ HTTP' },
  { path: 'config.HTTP_REQUEST_TIMEOUT_MS', ignore: 'giới hạn kỹ thuật của máy chủ HTTP' },
  { path: 'config.HTTP_GZIP_MIN_BYTES', ignore: 'ngưỡng kỹ thuật nén gzip' },
  { path: 'config.UV_THREADPOOL_SIZE', ignore: 'cấu hình kỹ thuật của Node' },
  { path: 'config.COMPUTE_CACHE_TTL_MS', ignore: 'giới hạn kỹ thuật bộ nhớ đệm phép tính' },
  { path: 'config.COMPUTE_CACHE_MAX_ENTRIES', ignore: 'giới hạn kỹ thuật bộ nhớ đệm phép tính' },
  { path: 'config.PASSWORD_HASH_CONCURRENCY', ignore: 'giới hạn kỹ thuật chống nghẽn luồng nền' },
  { path: 'config.PASSWORD_HASH_QUEUE_MAX', ignore: 'giới hạn kỹ thuật chống nghẽn luồng nền' },
  { path: 'config.SHED_MAX_LAG_MS', ignore: 'ngưỡng kỹ thuật từ chối khi quá tải' },
  { path: 'config.SHED_MAX_INFLIGHT', ignore: 'ngưỡng kỹ thuật từ chối khi quá tải' },
  { path: 'config.OVERLOAD_RETRY_AFTER_SEC', ignore: 'giá trị kỹ thuật gửi cho khách khi quá tải' },
  { path: 'config.WRITE_RATE_PER_MINUTE', ignore: 'giới hạn kỹ thuật chống dồn lệnh ghi' },
  { path: 'config.LOOP_LAG_WINDOW_MS', ignore: 'cửa sổ đo trễ vòng lặp (kỹ thuật)' },
  { path: 'config.STATIC_CACHE_MAX_BYTES', ignore: 'giới hạn kỹ thuật bộ nhớ đệm file tĩnh' },
  { path: 'config.SHUTDOWN_GRACE_MS', ignore: 'giới hạn kỹ thuật khi tắt máy chủ' },
  { path: 'config.LOOP_LAG_RESOLUTION_MS', ignore: 'độ phân giải đo vòng lặp sự kiện (kỹ thuật)' },
  { path: 'config.WARN_CODES_AUDIT_MAX', ignore: 'số mã cảnh báo ghi vào nhật ký (kỹ thuật)' },
  { path: 'config.SQL_IN_CHUNK', ignore: 'số id tối đa trong một mệnh đề IN khi nạp lô (kỹ thuật)' },
  { path: 'config.CATALOG_BASE_MONTH', ignore: 'tháng nền của dòng danh mục (dữ liệu, không phải tham số)' },
  {
    path: 'config.CATALOG_ROW_ID_BASE',
    ignore: 'số id cộng thêm cho dòng danh mục khi trộn với param_versions (kỹ thuật)'
  },
  { path: 'config.LEAVE_REFRESH_MS', ignore: 'nhịp làm mới số dư phép lưu sẵn (kỹ thuật)' },
  // Giới hạn đoán mật khẩu và thời hạn phiên: src/platform/auth.ts đọc khoá qua PayrollParams.DEFAULTS, nguồn của mặc định là src/platform/config.ts
  { path: 'config.LOGIN_MAX_FAILURES', key: 'system.login.maxFailures' },
  { path: 'config.LOGIN_SPRAY_USERS', key: 'system.login.sprayUsers' },
  { path: 'config.LOGIN_WINDOW_MIN', key: 'system.login.windowMin' },
  { path: 'config.LOGIN_MAX_KEYS', key: 'system.login.maxKeys' },
  { path: 'config.SESSION_DAYS', key: 'system.session.days' },
  { path: 'config.STAFF_BULK_MAX', key: 'system.staff.bulkMax' },
  // server.js đọc system.approval.maxDecideItems từ tham số: mặc định nằm ở src/platform/config.ts
  { path: 'config.APPROVAL_MAX_DECIDE_ITEMS', key: 'system.approval.maxDecideItems' },
  { path: 'config.ENTRIES_REQUIRE_APPROVAL', key: 'system.entries.requireApproval' },
  { path: 'config.ENTRIES_MAX_PER_BATCH', key: 'system.entries.maxPerBatch' },
  { path: 'config.ENTRIES_MAX_AMOUNT', key: 'system.entries.maxAmount' },
  { path: 'config.ENTRIES_LABEL_MAX', key: 'system.entries.labelMaxLength' },
  // Giới hạn kỹ thuật của định danh và nhãn chức vụ, khối, và độ dài chuỗi nhắc lại trong lỗi: chưa có khoá registry
  { path: 'config.POSITION_CODE_MIN', ignore: 'giới hạn kỹ thuật của mã chức vụ, chưa là khoá registry' },
  { path: 'config.POSITION_CODE_MAX', ignore: 'giới hạn kỹ thuật của mã chức vụ, chưa là khoá registry' },
  { path: 'config.POSITION_LABEL_MAX', ignore: 'giới hạn kỹ thuật của tên chức vụ, chưa là khoá registry' },
  { path: 'config.POSITION_SHORT_MAX', ignore: 'giới hạn kỹ thuật của tên viết tắt chức vụ, chưa là khoá registry' },
  {
    path: 'config.BLOCK_CONFIRM_MARK_MAX',
    ignore: 'giới hạn kỹ thuật của dấu xác nhận cờ của khối, chưa là khoá registry'
  },
  { path: 'config.ROLES_CUSTOM_MAX', ignore: 'giới hạn kỹ thuật của số vai trò tuỳ chỉnh, chưa là khoá registry' },
  { path: 'config.ROLE_CODE_MAX', ignore: 'giới hạn kỹ thuật của mã vai trò, chưa là khoá registry' },
  { path: 'config.ROLE_LABEL_MAX', ignore: 'giới hạn kỹ thuật của tên vai trò, chưa là khoá registry' },
  { path: 'config.PASSWORD_MIN_LENGTH', ignore: 'giới hạn kỹ thuật của mật khẩu, chưa là khoá registry' },
  { path: 'config.BLOCK_LABEL_MAX', ignore: 'giới hạn kỹ thuật của tên khối phụ cấp, chưa là khoá registry' },
  { path: 'config.HOLIDAY_NAME_MAX', ignore: 'giới hạn kỹ thuật của tên ngày lễ, chưa là khoá registry' },
  {
    path: 'config.ERROR_ECHO_FIELD_MAX',
    ignore: 'độ dài chuỗi nhắc lại trong thông báo lỗi, không phải tham số nghiệp vụ'
  },
  {
    path: 'config.ERROR_ECHO_KEY_MAX',
    ignore: 'độ dài chuỗi nhắc lại trong thông báo lỗi, không phải tham số nghiệp vụ'
  },
  {
    path: 'config.ERROR_ECHO_CODE_MAX',
    ignore: 'độ dài chuỗi nhắc lại trong thông báo lỗi, không phải tham số nghiệp vụ'
  },
  // Đợt dọn bảng nhớ requestId của Check-in/out: hằng kỹ thuật, không phải tham số của C&B
  {
    path: 'config.CHECKOUT_GRACE_MIN',
    ignore: 'số phút Check-out muộn được bỏ qua trước khi bắt giải trình (chủ dự án 28/10/2026)'
  },
  { path: 'config.PUNCH_REQUEST_KEEP_DAYS', ignore: 'số ngày giữ bản nhớ requestId trước khi dọn (kỹ thuật)' },
  { path: 'config.PUNCH_REQUEST_PURGE_MS', ignore: 'nhịp lặp đợt dọn bảng nhớ requestId (kỹ thuật)' }
];

// Nguồn viết dưới dạng hằng số có tên trong mã, đọc bằng regex trên văn bản (script dừng nếu regex không còn khớp: mã đã đổi).
// transform: 'none' | 'minToHours' | 'msToMin' (đổi đơn vị của mã sang đơn vị của khoá)
const REGEX_SOURCES = [
  // attendance.openSessionMaxHours và attendance.earlyCheckinMaxHours: punch.js đọc khoá, mặc định nằm ở hand-defaults.json
  { file: 'src/platform/http.ts', regex: /const MAX_BODY_BYTES = ([\de.+]+)/, key: 'system.http.maxBodyBytes' },
  {
    file: 'src/domain/input.ts',
    regex: /const NOTE_MAX = (\d+)/,
    key: 'control.reasonMaxLength',
    mustEqualFirst: true
  },
  { file: 'src/server.ts', regex: /paging\('limit', (\d+), 1, \d+\)/, key: 'system.page.approvals.default' },
  { file: 'src/server.ts', regex: /paging\('limit', \d+, 1, (\d+)\)/, key: 'system.page.approvals.max' },
  { file: 'src/server.ts', regex: /paging\('pageSize', (\d+), \d+\)/, key: 'system.page.corrections.default' },
  { file: 'src/server.ts', regex: /paging\('pageSize', \d+, (\d+)\)/, key: 'system.page.corrections.max' },
  { file: 'src/ops/pg-backup.ts', regex: /const DEFAULT_KEEP = (\d+)/, key: 'system.backup.keep' },
  {
    file: 'src/domain/attendance/geofence-policy.ts',
    regex: /finiteIn\(b\.radiusM, (\d+), \d+\)/,
    key: 'geofence.radiusM.min'
  },
  {
    file: 'src/domain/attendance/geofence-policy.ts',
    regex: /finiteIn\(b\.radiusM, \d+, (\d+)\)/,
    key: 'geofence.radiusM.max'
  },
  {
    file: 'src/domain/attendance/geofence-policy.ts',
    regex: /finiteIn\(maxAccuracyM, (\d+), \d+\)/,
    key: 'geofence.maxAccuracyM.min'
  },
  {
    file: 'src/domain/attendance/geofence-policy.ts',
    regex: /finiteIn\(maxAccuracyM, \d+, (\d+)\)/,
    key: 'geofence.maxAccuracyM.max'
  },
  {
    file: 'src/domain/attendance/geofence-policy.ts',
    regex: /b\.maxAccuracyM === undefined \? (\d+)/,
    key: 'geofence.maxAccuracyM.default'
  }
];

// Số điền tay vì MÃ CHƯA CÓ HẰNG SỐ (số viết cứng trong hàm, hoặc cài đặt mới): `scripts/params/hand-defaults.json`.
// Mỗi khoá ghi lý do. Khi số viết cứng được thay bằng khoá, mục tương ứng chuyển sang sinh từ mã hoặc bị bỏ.
const HAND_FILE = 'scripts/params/hand-defaults.json';

module.exports = { RULES, REGEX_SOURCES, HAND_FILE };
