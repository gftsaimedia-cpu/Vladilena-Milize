'use strict';
const blocks = require('./blocks'); // khối phụ cấp do C&B thêm, xác nhận cờ
const payEntries = require('./pay-entries'); // khoản điền thêm theo người theo tháng
const schedule = require('./schedule'); // lịch làm việc theo loại nhân sự
const positions = require('./positions'); // chức vụ và bảng quyền lợi
const roles = require('./roles'); // vai trò mặc định và tuỳ chỉnh (Cài đặt › Phân quyền)
const shifts = require('./shifts'); // giờ ca làm (Cài đặt › Kỳ lương & chấm công)
const advanceRequests = require('./advance-requests'); // yêu cầu ứng lương: lịch sử
const advanceApprovals = require('./advance/routes'); // duyệt tạm ứng theo tháng
const explanations = require('./explanation/routes'); // giải trình Check-out muộn và yêu cầu giải trình
// Mô-đun theo lớp: danh mục chức vụ/bậc/ca trong DB, nhân viên theo uuid, sổ phép lưu sẵn
const positionCatalog = require('./position/routes');
const shiftCatalog = require('./shift/routes');
const employees = require('./employee/routes');
const leave = require('./leave/routes');

// Bảng gửi đường dẫn của các nhóm route nằm ngoài server.js: handlerFor(seg) trả hàm xử lý (nhận { req, res, seg, url, me, actx }) hoặc null.
// Quyền đã kiểm ở cổng ROUTE_CAPS trước khi tới đây (lib/authz.js).
function handlerFor(seg) {
  if (seg[1] === 'blocks') return blocks.handle;
  if (seg[1] === 'pay-entries') return payEntries.handle;
  if (seg[1] === 'advance-requests') return advanceRequests.handle;
  if (seg[1] === 'advance-approvals') return advanceApprovals.handle;
  if (seg[1] === 'explanations') return explanations.handle;
  if (seg[1] === 'roles') return roles.handle;
  if (seg[1] === 'catalog' && seg[2] === 'shifts' && seg.length === 3) return shiftCatalog.handle;
  if (seg[1] === 'catalog' && (seg[2] === 'positions' || seg[2] === 'levels')) return positionCatalog.handle;
  if (seg[1] === 'employees' && (seg.length === 3 || (seg.length === 4 && seg[3] === 'trace'))) return employees.handle;
  if (seg[1] === 'leave' && seg.length === 3) return leave.handle;
  if (seg[1] === 'settings' && seg[2] === 'shifts' && seg.length === 3) return shifts.handle;
  if (seg[1] === 'positions' || seg[1] === 'entitlements') return positions.handle;
  if (seg[1] === 'staff' && seg[3] === 'schedule' && seg.length === 4) return schedule.handleStaffSchedule;
  return null;
}

module.exports = { handlerFor };
