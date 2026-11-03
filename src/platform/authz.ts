'use strict';
// Quyền theo năng lực. Vai trò mặc định là tập năng lực viết trong mã (chỉ đọc); vai trò tuỳ chỉnh là dữ liệu ở settings (src/domain/roles/roles.ts); vai trò gán cho từng người nằm ở store.roles.
// Từ chối theo mặc định: route không có trong ROUTE_CAPS bị 403 NO_ROUTE_POLICY (server.js → api()).
const getStore = () => require('./db');
const ApprovalView = require('../engine/approval-view'); // danh sách loại yêu cầu duyệt được (ITEMS) cho vai trò tuỳ chỉnh

/* ---------- năng lực ---------- */
const CAPS = [
  'profile.read',
  'profile.write',
  'profile.read.pii',
  'profile.sensitive.read',
  'profile.sensitive.write',
  'contract.read',
  'contract.write',
  'salary.read',
  'salary.write',
  'attendance.read',
  'attendance.correct',
  'attendance.lock',
  'attendance.import',
  'kpi.score.write',
  'payroll.view',
  'payroll.calculate',
  'payroll.approve',
  'payroll.override',
  'payroll.pay',
  'period.reopen',
  'period.reopen.inputs',
  'config.read',
  'config.payroll',
  'config.legal',
  'config.profile',
  'audit.read',
  'report.read',
  'report.export',
  'roles.manage',
  'staff.lock'
];
// Họ năng lực có khuôn: request.decide.<nhóm>. '*' ở cuối là mọi nhóm.
const DECIDE_ALL = 'request.decide.*';
const DECIDE_PREFIX = 'request.decide.';

/* ---------- vai trò: HR không xem lương và tài khoản; Kế toán xem lương và tài khoản; Kế toán không duyệt phiếu ---------- */
const ROLE_CAPS = Object.freeze({
  admin: Object.freeze([...CAPS, DECIDE_ALL]),
  cb: Object.freeze([
    'profile.read',
    'contract.read',
    'salary.read',
    'salary.write',
    'attendance.read',
    'attendance.correct',
    'attendance.lock',
    DECIDE_ALL,
    'kpi.score.write',
    'payroll.view',
    'payroll.calculate',
    'payroll.approve',
    'payroll.override',
    'period.reopen',
    'config.read',
    'config.payroll',
    'audit.read',
    'report.read',
    'report.export'
  ]),
  accounting: Object.freeze([
    'profile.read',
    'profile.sensitive.read',
    'salary.read',
    'payroll.view',
    'payroll.pay',
    'config.read',
    'config.legal',
    'audit.read',
    'report.read',
    'report.export'
  ]),
  hr: Object.freeze([
    'profile.read',
    'profile.write',
    'contract.read',
    'contract.write',
    'attendance.read',
    DECIDE_PREFIX + 'leave',
    'report.read',
    'report.export'
  ]),
  manager: Object.freeze(['profile.read', 'attendance.read', DECIDE_ALL, 'report.read']),
  staff: Object.freeze(['profile.read', 'attendance.read', 'salary.read', 'payroll.view', 'contract.read'])
});
// Phạm vi dữ liệu mặc định của mỗi vai trò: all, team (nhóm mình, cần bảng staff_assignments), self (tự mình)
const ROLE_SCOPE = Object.freeze({
  admin: 'all',
  cb: 'all',
  accounting: 'all',
  hr: 'all',
  manager: 'team',
  staff: 'self'
});
const SCOPE_RANK = { self: 1, team: 2, all: 3 };

/* ---------- vai trò tuỳ chỉnh (dữ liệu, không phải mã) ----------
 * Lưu ở bảng settings, khoá 'roles.custom': { rev, roles: [{ code, label, caps, approvals, scope, rev, deprecated, copiedFrom, ... }] }.
 * Vai trò mặc định trong mã (ROLE_CAPS) chỉ đọc và thắng mọi mã trùng. Vai trò tuỳ chỉnh chỉ giữ năng lực đã có trong CAPS,
 * trừ RESERVED_CAPS (chỉ vai trò admin có): đọc lại từ DB cũng lọc như lúc ghi để dữ liệu bị sửa tay không cấp được quyền quản trị.
 * Vai trò đã ngưng dùng (deprecated) không còn cho năng lực nào; dòng gán của người vẫn giữ.
 */
const CUSTOM_ROLES_KEY = 'roles.custom';
const RESERVED_CAPS = Object.freeze(['roles.manage']);
const DECIDE_ITEMS = Object.freeze([...ApprovalView.ITEMS]);
const SCOPES = Object.freeze(['all', 'team', 'self']);
const isBuiltinRole = (code?) => typeof code === 'string' && Object.hasOwn(ROLE_CAPS, code);
const isGrantableCap = (cap?) => CAPS.includes(cap) && !RESERVED_CAPS.includes(cap);
const decideCap = (item?) => DECIDE_PREFIX + item;
// Năng lực hiệu lực của một vai trò tuỳ chỉnh: caps hợp lệ + request.decide.<loại> cho từng loại được duyệt (không trùng, đã sắp)
function customCapsOf(def?) {
  const caps = new Set<any>((Array.isArray(def.caps) ? def.caps : []).filter(isGrantableCap));
  for (const item of Array.isArray(def.approvals) ? def.approvals : [])
    if (DECIDE_ITEMS.includes(item)) caps.add(decideCap(item));
  return Object.freeze([...caps].sort());
}
// Bảng vai trò tuỳ chỉnh hiện hành (luôn có hình { rev, roles })
async function customTable() {
  const value = await getStore().getSetting(CUSTOM_ROLES_KEY, null);
  if (!value || typeof value !== 'object' || !Array.isArray(value.roles)) return { rev: 0, roles: [] };
  return {
    rev: Number.isInteger(value.rev) ? value.rev : 0,
    roles: value.roles.filter(r => r && typeof r.code === 'string' && !isBuiltinRole(r.code))
  };
}
// Map mã → { caps, scope } của vai trò tuỳ chỉnh CÒN DÙNG
async function activeCustomRoles(given?) {
  const table = given === undefined ? await customTable() : given;
  const out = new Map<any, any>();
  for (const def of table.roles)
    if (!def.deprecated)
      out.set(def.code, { caps: customCapsOf(def), scope: SCOPES.includes(def.scope) ? def.scope : 'all' });
  return out;
}

/* ---------- chính sách từng route ----------
 * Khoá = `${METHOD} /${đoạn 1}/${đoạn 2}` đúng như server.js → api() tạo; khoá có tham số trong đường dẫn do
 * routeKey() đặt tên (ví dụ 'PUT /staff/:u'). Mỗi mục là một trong:
 *   { public: true }                  không cần đăng nhập
 *   { authenticated: true }           mọi người đã đăng nhập; handler tự giới hạn theo người (chỉ dữ liệu của mình)
 *   { cap: 'self-or:<nl>' }           như authenticated; người không chỉ "tự mình" phải có năng lực <nl> ở phạm vi người đó (handler gọi can())
 *   { cap: '<nl>' }                   cần năng lực ở phạm vi toàn bộ (all); 'request.decide.*' = có quyền duyệt ít nhất một nhóm
 * Route ghi có thêm:
 *   periodScope: 'attendance'|'kpi'|'slip'|'params'|null   cổng khoá kỳ (store.assertPeriodOpen); null = không theo tháng
 *   periodMonth: nơi lấy tháng (tài liệu; handler gọi cổng ngay sau khi kiểm đầu vào)
 */
const A = { authenticated: true };
const readCap = (cap?) => ({ cap });
const write = (policy?, periodScope: any = null, periodMonth: any = null) => ({ ...policy, periodScope, periodMonth });
const ROUTE_CAPS = Object.freeze({
  'POST /login': { public: true, periodScope: null },
  'POST /logout': { public: true, periodScope: null },
  'GET /me': { public: true },
  'GET /health': { public: true, periodScope: null }, // Cho proxy/giám sát hỏi máy chủ còn sống không
  'PUT /password': write(A),
  'GET /holidays': A,
  'PUT /holidays': write(readCap('config.payroll'), 'attendance', 'ngày lễ đổi (hiệu hai tập)'),
  'GET /sheet': { cap: 'self-or:attendance.read' },
  'PUT /sheet': write(A, 'attendance', 'body.month'),
  // Chấm công thay hàng loạt: cổng cần có quyền duyệt ở ít nhất một nhóm; quyền ở phạm vi từng người kiểm trong src/domain/sheet-bulk.ts
  'PUT /sheet/bulk': write(readCap(DECIDE_ALL), 'attendance', 'body.month'),
  'GET /kpi/scores': readCap('kpi.score.write'),
  // Nhân sự lưu được điểm Tự đánh giá (self) của CHÍNH MÌNH; handler kiểm năng lực đầy đủ cho mọi trường hợp khác
  'PUT /kpi/scores': write({ cap: 'self-or:kpi.score.write' }, 'kpi', 'body.month'),
  'GET /approvals': readCap(DECIDE_ALL),
  'GET /approvals/count': readCap(DECIDE_ALL),
  'GET /alerts': readCap(DECIDE_ALL),
  'PUT /approvals/decide': write(readCap(DECIDE_ALL), 'attendance', 'items[].date'),
  'GET /slip-override': readCap('payroll.override'),
  'PUT /slip-override': write(readCap('payroll.override'), 'slip', 'body.month'),
  'GET /punch': A,
  'POST /punch': write(A, 'attendance', 'ngày công của lượt (ca đêm thuộc ngày bắt đầu)'),
  'GET /ot': readCap('attendance.correct'),
  'POST /ot': write(readCap('attendance.correct'), 'attendance', 'ngày của lượt'),
  'PUT /ot': write(readCap('attendance.correct'), 'attendance', 'ngày của lượt'),
  'GET /events': A,
  'GET /today': readCap('attendance.read'),
  'GET /attendance': readCap('attendance.read'),
  // Công tắc ngày và vùng GPS: không theo tháng, có nhật ký
  'PUT /settings/geofence': write(readCap('config.payroll')),
  'GET /staff': readCap('profile.read'),
  'POST /staff': write(readCap('profile.write')),
  'GET /team': readCap('payroll.view'),
  'PUT /staff/:u': write(readCap('profile.write')),
  'PUT /staff/shift-bulk': write(readCap('profile.write')),
  'PUT /staff/:u/roles': write(readCap('roles.manage')),
  'POST /staff/:u/password': write(readCap('roles.manage')), // Admin đặt lại mật khẩu của tài khoản khác (không gửi lại cả hồ sơ)
  'GET /roles': readCap('roles.manage'),
  // Vai trò tuỳ chỉnh (dữ liệu ở settings, src/domain/roles/roles.ts): tạo, sao chép, sửa, ngưng dùng; không theo tháng
  'POST /roles': write(readCap('roles.manage')),
  'PUT /roles/:code': write(readCap('roles.manage')),
  'POST /roles/:code/deprecate': write(readCap('roles.manage')),
  'GET /positions': readCap('config.read'),
  'GET /entitlements': readCap('config.read'),
  // Thêm chức vụ: cổng chỉ cần xem được cấu hình; năng lực config.payroll và khoá kỳ kiểm trong src/params/save.ts → addPosition (như PUT /settings/params)
  'POST /positions': write(readCap('config.read')),
  'POST /positions/:code/levels': write(readCap('config.payroll')), // thêm bậc cho một chức vụ; khoá kỳ và tháng áp dụng kiểm ở src/params/save.ts → addLevel

  // Khối phụ cấp thêm được: năng lực kiểm ở cổng; khoá kỳ và tháng áp dụng do src/params/save.ts kiểm như PUT /settings/params
  // Lịch của người theo loại nhân sự: xem là chính mình hoặc profile.read
  'GET /staff/:u/schedule': { cap: 'self-or:profile.read' },
  'POST /blocks': write(readCap('config.payroll')),
  'PUT /blocks/:code/confirm': write(readCap('config.legal')), // Kế toán xác nhận cờ thuế, nền bảo hiểm của khối
  'GET /settings/params': readCap('config.read'),
  // Ca làm: bao quanh shift.preset.*; năng lực sửa và khoá kỳ kiểm trong src/params/save.ts như PUT /settings/params
  'GET /settings/shifts': readCap('config.read'),
  'PUT /settings/shifts': write(readCap('config.read')),
  'GET /settings/first-run': readCap('config.read'),
  'GET /settings/version': A, // số phiên bản chung của cấu hình, để hỏi lại khi không có kênh đẩy
  // Lưu tham số: cổng chỉ cần xem được cấu hình; năng lực sửa theo editableBy của TỪNG khoá và khoá kỳ (tháng chưa chốt sớm nhất, 409 PERIOD_LOCKED)
  // được kiểm trong src/params/save.ts, nên periodScope là null như các route kỳ lương
  'PUT /settings/params': write(readCap('config.read')),
  'POST /settings/params/preview': write(readCap('config.read')),
  'POST /settings/params/revert': write(readCap('config.read')),
  // Kỳ lương: khoá có tham số tháng; route ghi của vòng đời không theo tháng nên periodScope là null
  'GET /periods': readCap('payroll.view'),
  'GET /periods/:month': readCap('payroll.view'),
  'POST /periods/:month/lock-attendance': write(readCap('attendance.lock')),
  'POST /periods/:month/calculate': write(readCap('payroll.calculate')),
  'POST /periods/:month/approve': write(readCap('payroll.approve')),
  'POST /periods/:month/mark-paid': write(readCap('payroll.pay')),
  'POST /periods/:month/reopen': write(readCap('period.reopen')),
  'GET /periods/:month/payslips': readCap('payroll.view'),
  'GET /periods/:month/estimates': readCap('payroll.view'),
  'GET /periods/:month/estimates/:username': readCap('payroll.view'),
  'GET /periods/:month/payslips/:username': { cap: 'self-or:payroll.view' },
  'PUT /periods/:month/payslips/decide': write(readCap('payroll.approve')),
  'GET /periods/:month/verify': readCap('audit.read'),
  // Số ước tính của chính người đăng nhập (chỉ dữ liệu của mình, mọi người đã đăng nhập)
  'GET /me/estimate': A,
  'GET /audit': readCap('audit.read'),
  'GET /audit/verify': readCap('audit.read'),
  // khoản điền thêm: khoá kỳ (từ `approved`, kèm suggestMonth) và khoá lạc quan rev do src/domain/payroll/pay-entries.ts kiểm, vì tháng nằm ở dòng đã lưu
  // (PUT, decide, void) nên periodScope là null như các route kỳ lương
  'GET /pay-entries': readCap('salary.read'),
  'POST /pay-entries': write(readCap('salary.write')),
  'POST /pay-entries/bulk': write(readCap('salary.write')),
  'PUT /pay-entries/:id': write(readCap('salary.write')),
  'PUT /pay-entries/:id/decide': write(readCap('payroll.approve')),
  'POST /pay-entries/:id/void': write(readCap('salary.write')),
  'POST /pay-entries/:id/confirm-flags': write(readCap('config.legal')), // Kế toán xác nhận cờ miễn thuế, nền bảo hiểm
  // Yêu cầu ứng lương: chỉ đọc lịch sử. Quyền theo người (chính chủ, request.decide.advance ở phạm vi người đó) kiểm trong handler, nên periodScope là null
  'GET /advance-requests': A,
  // Yêu cầu tạm ứng theo tháng: xem là của mình hoặc mọi người (người duyệt / xem lương, handler kiểm); gửi và rút chỉ cho chính mình
  // (cổng chỉ cần đăng nhập, handler dùng tài khoản đang đăng nhập); duyệt, từ chối, huỷ duyệt, duyệt tất cả cần
  // request.decide.* ở cổng và request.decide.advance ở phạm vi từng người trong handler. Khoá kỳ (đã duyệt, đã chi trả) kiểm trong src/domain/advance/routes.js
  // vì tháng nằm trong thân yêu cầu, nên periodScope là null
  'GET /advance-approvals': A,
  'POST /advance-approvals/request': write(A),
  'POST /advance-approvals/withdraw': write(A),
  'POST /advance-approvals/approve': write(readCap(DECIDE_ALL)),
  'POST /advance-approvals/reject': write(readCap(DECIDE_ALL)),
  'POST /advance-approvals/cancel': write(readCap(DECIDE_ALL)),
  'POST /advance-approvals/approve-all': write(readCap(DECIDE_ALL)),
  // Giải trình: ai đăng nhập cũng gọi; quyền theo người (chỉ Admin yêu cầu người khác) kiểm trong src/domain/explanations.js
  'GET /explanations': A,
  'POST /explanations': write(A),
  'POST /explanations/:id/answer': write(A),
  'POST /explanations/:id/decide': write(readCap('attendance.correct')),
  // Danh mục chức vụ, bậc, ca trong DB: xem cần config.read; sửa cần config.payroll. Khoá kỳ của tháng áp dụng kiểm trong
  // src/domain/shared/catalog-change.ts (tháng nằm trong thân yêu cầu), nên periodScope là null như PUT /settings/params
  'GET /catalog/positions': readCap('config.read'),
  'PUT /catalog/positions/:code': write(readCap('config.payroll')),
  'PUT /catalog/levels': write(readCap('config.payroll')),
  'GET /catalog/shifts': readCap('config.read'),
  'PUT /catalog/shifts': write(readCap('config.payroll')),
  // Nhân viên theo uuid: xem hồ sơ cần profile.read; lịch sử thay đổi (nhật ký) cần audit.read
  'GET /employees/:uuid': readCap('profile.read'),
  'GET /employees/:uuid/trace': readCap('audit.read'),
  // Sổ phép lưu sẵn: chính mình hoặc profile.read (handler kiểm); tính lại ngay cần profile.write
  'GET /leave/ledger': { cap: 'self-or:profile.read' },
  'POST /leave/refresh': write(readCap('profile.write')),
  // Employee V2
  'GET /v2/employees': readCap('profile.read'),
  'GET /v2/employees/:username': readCap('profile.read'),
  'POST /v2/employees': write(readCap('profile.write')),
  'PUT /v2/employees/:username': write(readCap('profile.write')),
  'DELETE /v2/employees/:username': write(readCap('profile.write')),
  'PATCH /v2/employees/:username/profile': write(readCap('profile.write')),
  'PATCH /v2/employees/:username/account': write(readCap('profile.write')),
  'PATCH /v2/employees/:username/contract': write(readCap('profile.write')),
  'PATCH /v2/employees/:username/position': write(readCap('profile.write')),
  'PATCH /v2/employees/:username/shift': write(readCap('profile.write')),
  'PATCH /v2/employees/:username/leave': write(readCap('profile.write')),
  // Request V2
  'GET /v2/requests': A,
  'GET /v2/requests/:id': A,
  'POST /v2/requests/leave': write(A),
  'POST /v2/requests/correction': write(A),
  'POST /v2/requests/overtime': write(A),
  'POST /v2/requests/advance': write(A),
  'PATCH /v2/requests/:id/review': write(readCap(DECIDE_ALL)),
  'PATCH /v2/requests/:id/cancel': write(A),
  // Attendance V2
  'POST /v2/attendance/punches': write(readCap('attendance.read')),
  'GET /v2/attendance/punches': readCap('attendance.read'),
  'GET /v2/attendance/timesheets': readCap('attendance.read'),
  'GET /v2/attendance/timesheets/:employeeId/:workDate': readCap('attendance.read')
});

/* ---------- tra cứu ---------- */
// Khoá chính sách của một yêu cầu: seg = đoạn đường dẫn ['api', ...]
function routeKey(method?, seg?) {
  if (seg[1] === 'v2' && seg[2] === 'employees') {
    if (seg.length === 3) return `${method} /v2/employees`;
    if (seg.length === 4) return `${method} /v2/employees/:username`;
    if (seg.length === 5) return `${method} /v2/employees/:username/${seg[4]}`;
  }
  if (seg[1] === 'v2' && seg[2] === 'requests') {
    if (seg.length === 3) return `${method} /v2/requests`;
    if (seg.length === 4) {
      if (method === 'POST') return `${method} /v2/requests/${seg[3]}`;
      return `${method} /v2/requests/:id`;
    }
    if (seg.length === 5) return `${method} /v2/requests/:id/${seg[4]}`;
  }
  if (seg[1] === 'v2' && seg[2] === 'attendance') {
    if (seg[3] === 'punches' && seg.length === 4) return `${method} /v2/attendance/punches`;
    if (seg[3] === 'timesheets') {
      if (seg.length === 4) return `${method} /v2/attendance/timesheets`;
      if (seg.length === 6) return `${method} /v2/attendance/timesheets/:employeeId/:workDate`;
    }
  }
  // Kỳ lương: /api/periods/<tháng>[/<bước>[/<tên đăng nhập | decide>]]; tháng sai dạng cho handler trả 400 BAD_MONTH
  if (seg[1] === 'periods' && seg.length >= 3 && seg.length <= 5) {
    if (seg.length === 3) return `${method} /periods/:month`;
    if (seg[3] === 'payslips') {
      if (seg.length === 4) return `${method} /periods/:month/payslips`;
      return seg[4] === 'decide'
        ? `${method} /periods/:month/payslips/decide`
        : `${method} /periods/:month/payslips/:username`;
    }
    const [, , , step, who] = seg; // bước và tên đăng nhập (nếu có) của đường dẫn kỳ lương
    if (step === 'estimates' && who !== undefined) return `${method} /periods/:month/estimates/:username`;
    if (seg.length === 4) return `${method} /periods/:month/${seg[3]}`;
  }
  if (seg.length === 4 && seg[1] === 'settings' && seg[2] === 'params') return `${method} /settings/params/${seg[3]}`;
  if (seg[1] === 'staff' && seg[3] === 'schedule' && seg.length === 4) return `${method} /staff/:u/schedule`;
  if (seg[1] === 'blocks' && seg.length === 4) return `${method} /blocks/:code/${seg[3]}`;
  if (seg[1] === 'positions' && seg.length === 4 && seg[3] === 'levels') return `${method} /positions/:code/levels`;
  // Khoản điền thêm: /api/pay-entries[/bulk | /<mã>[/<bước>]]
  if (seg[1] === 'pay-entries' && seg.length === 3)
    return seg[2] === 'bulk' ? `${method} /pay-entries/bulk` : `${method} /pay-entries/:id`;
  if (seg[1] === 'pay-entries' && seg.length === 4) return `${method} /pay-entries/:id/${seg[3]}`;
  if (seg[1] === 'explanations' && seg.length === 4) return `${method} /explanations/:id/${seg[3]}`;
  if (seg[1] === 'catalog' && seg[2] === 'positions' && seg.length === 4) return `${method} /catalog/positions/:code`;
  if (seg[1] === 'employees' && seg.length === 3) return `${method} /employees/:uuid`;
  if (seg[1] === 'employees' && seg.length === 4) return `${method} /employees/:uuid/${seg[3]}`;
  if (seg.length === 3 && seg[1] === 'staff' && seg[2] === 'shift-bulk' && method === 'PUT')
    return 'PUT /staff/shift-bulk';
  if (seg[1] === 'roles' && seg.length === 3) return `${method} /roles/:code`;
  if (seg[1] === 'roles' && seg.length === 4) return `${method} /roles/:code/${seg[3]}`;
  if (seg.length === 4 && seg[1] === 'staff' && seg[3] === 'roles') return `${method} /staff/:u/roles`;
  if (seg.length === 4 && seg[1] === 'staff' && seg[3] === 'password') return `${method} /staff/:u/password`;
  if (seg.length === 2 && seg[1] === 'staff' && method === 'POST') return 'POST /staff';
  if (seg.length === 3 && seg[1] === 'staff' && method === 'PUT') return 'PUT /staff/:u';
  return `${method} /${seg.slice(1, 3).join('/')}`;
}
const policyOf = (key?) => (Object.hasOwn(ROUTE_CAPS, key) ? ROUTE_CAPS[key] : null);

// Vai trò hiệu lực: đã gán (store.roles) + 'admin' từ staff.role cũ + 'staff' nếu là nhân sự được trả lương. Tài khoản khoá không có vai trò.
async function rolesOf(me?) {
  if (!me || me.locked) return [];
  const roles = new Set<any>(await getStore().roles.effectiveRoles(me.username));
  if (me.payrollSubject) roles.add('staff');
  const custom = await activeCustomRoles();
  return [...roles].filter(r => isBuiltinRole(r) || custom.has(r)).sort();
}
// Năng lực và phạm vi của một vai trò hiệu lực (mặc định trong mã hoặc tuỳ chỉnh còn dùng)
const capsOfRole = (role?, custom?) => (isBuiltinRole(role) ? ROLE_CAPS[role] : custom.get(role).caps);
const scopeOfRole = (role?, custom?) => (isBuiltinRole(role) ? ROLE_SCOPE[role] : custom.get(role).scope);
const grants = (roleCaps?, cap?) =>
  roleCaps.some(
    c =>
      c === cap ||
      (c.endsWith('.*') && cap.startsWith(c.slice(0, -1))) ||
      (cap === DECIDE_ALL && c.startsWith(DECIDE_PREFIX))
  );
// Phạm vi rộng nhất mà người này có cho một năng lực: 'all' | 'team' | 'self' | null
async function scopeOf(me?, cap?) {
  let best: any = null;
  const custom = await activeCustomRoles();
  for (const role of await rolesOf(me))
    if (grants(capsOfRole(role, custom), cap) && (!best || SCOPE_RANK[scopeOfRole(role, custom)] > SCOPE_RANK[best]))
      best = scopeOfRole(role, custom);
  return best;
}
// can(me, cap, target): target { username } hỏi trên dữ liệu của một người; bỏ trống = "có năng lực này ở phạm vi nào đó"
async function can(me?, cap?, target?) {
  const scope = await scopeOf(me, cap);
  if (!scope) return false;
  if (target === undefined || target === null || scope === 'all') return true;
  if (scope === 'self') return !!target.username && target.username === me.username;
  // team: chưa có bảng staff_assignments nên chỉ dữ liệu của chính mình
  return !!target.username && target.username === me.username;
}
// Mọi năng lực người này có (dạng phẳng, gồm 'request.decide.*' hoặc từng nhóm), để gửi cho giao diện
async function capsOf(me?) {
  const out = new Set<any>();
  const custom = await activeCustomRoles();
  for (const role of await rolesOf(me)) for (const c of capsOfRole(role, custom)) out.add(c);
  return [...out].sort();
}
// Kiểm cổng của một route cho người đã đăng nhập: trả null nếu qua, ngược lại mã lỗi
async function gate(me?, policy?) {
  if (policy.public || policy.authenticated) return null;
  const cap = String(policy.cap || '');
  if (cap.startsWith('self-or:')) return null;
  return (await scopeOf(me, cap)) === 'all' || (cap === DECIDE_ALL && (await scopeOf(me, cap)))
    ? null
    : 'FORBIDDEN_CAP';
}
// Mức nhạy cảm của nhật ký người này được đọc
async function auditSensitivities(me?) {
  const out = ['normal'];
  if ((await scopeOf(me, 'salary.read')) === 'all') out.push('pay');
  if ((await scopeOf(me, 'profile.sensitive.read')) === 'all') out.push('pii');
  return out;
}
// Không ai quyết định khoản của chính mình. Admin cũ không là nhân sự được trả lương nên không bị ảnh hưởng.
function isSelfDecision(me?, subjectUsername?) {
  return !!me && !!me.payrollSubject && !!subjectUsername && subjectUsername === me.username;
}

export = {
  CAPS,
  ROLE_CAPS,
  ROLE_SCOPE,
  CUSTOM_ROLES_KEY,
  RESERVED_CAPS,
  DECIDE_ITEMS,
  DECIDE_PREFIX,
  SCOPES,
  isBuiltinRole,
  isGrantableCap,
  customCapsOf,
  customTable,
  activeCustomRoles,
  ROUTE_CAPS,
  DECIDE_ALL,
  routeKey,
  policyOf,
  rolesOf,
  scopeOf,
  can,
  capsOf,
  gate,
  auditSensitivities,
  isSelfDecision
};
