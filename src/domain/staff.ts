const crypto = require('node:crypto');
const store = require('../platform/db');
const authz = require('../platform/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const { monthParams } = require('../platform/request-rules'); // tên bậc hiệu lực của tháng hiện tại (giờ Việt Nam)
const Positions = require('../params/positions'); // nhãn chức vụ
const Shifts = require('./shifts'); // nhãn ca cố định

/* ---------- hồ sơ nhân sự gửi ra ngoài ---------- */
// Số phiên bản phiên chỉ dùng nội bộ để thu hồi cookie, không gửi cho trình duyệt.
// levelName: tên bậc hiệu lực (level.<loại>.<bậc>.name) của tháng hiện tại, để app nhân viên (không có quyền config.read) hiện đúng tên Admin đã đặt.
// Quản trị viên không có bậc nên bỏ trường; bậc không còn trong bộ tham số thì levelName = null.
const publicStaff = async ({ sessionVersion, ...rest }: any) => {
  if (rest.role === 'admin') return rest;
  const key = `level.${rest.type}.${rest.level}.name`;
  const params = await monthParams();
  // insured: giá trị HIỆU LỰC (cột đã ghi riêng thì theo cột; cột NULL thì theo insurance.coverage.<hợp đồng> của tháng hiện tại); insuredExplicit: cột có giá trị (true) hay NULL (false),
  // để màn Hồ sơ không đưa người đã ghim đúng bằng mặc định về NULL khi lưu. Che theo quyền như các trường tiền (PAY_STAFF_FIELDS).
  const column = await store.getStaffRow(rest.username);
  const insuredExplicit = !!column && column.insured != null;
  const insured = insuredExplicit ? !!column.insured : params[`insurance.coverage.${rest.contract}`] === true;
  return { ...rest, insured, insuredExplicit, levelName: Object.hasOwn(params, key) ? params[key] : null };
};
// Che trường theo quyền của người xem: trường tiền và thuế cần salary.read (của chính mình thì luôn có), ngày sinh cần profile.read.pii
const PAY_STAFF_FIELDS = ['dependants', 'contract', 'insured', 'insuredExplicit', 'taxOn', 'deductOn', 'advanceOn'];
const PAY_SHEET_FIELDS = ['kpiPct', 'kpiAmt', 'kpiAdmPct', 'kpiAdmAmt'];
// Số phiên bản hồ sơ cho khoá lạc quan: bảng staff chưa có cột phiên bản nên lấy dấu vân tay của các cột hồ sơ đang lưu
// (kể cả khoá tài khoản locked_at, locked_by: đó là thay đổi thật). Loại các cột kỹ thuật tự đổi khi nhân sự đăng xuất hay đổi mật khẩu
// (session_version, pass_hash): nếu không, Admin mở hồ sơ, người đó đăng xuất, Admin lưu sẽ bị 409 STAFF_STALE dù hồ sơ không đổi.
// Cột mới thêm vào bảng staff mặc định được tính (chặt hơn là bỏ sót); cột kỹ thuật mới tự đổi phải thêm vào danh sách này.
// leave_balance, leave_balance_on: số phép lưu sẵn, máy chủ tự làm mới mỗi giờ (src/domain/leave), không phải Admin sửa hồ sơ
const REV_SKIP_COLUMNS = Object.freeze(['session_version', 'pass_hash', 'leave_balance', 'leave_balance_on']);
const REV_HEX_LENGTH = 16;
const staffRevision = async (username?) => {
  const row = await store.getStaffRow(username);
  if (!row) return null;
  const canonical = JSON.stringify(
    Object.keys(row)
      .filter(key => !REV_SKIP_COLUMNS.includes(key))
      .sort()
      .map(key => [key, row[key]])
  );
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, REV_HEX_LENGTH);
};
const staffForViewer = async (viewer?, staff?) => {
  const out = await publicStaff(staff);
  out.rev = await staffRevision(staff.username); // gửi kèm để Admin gửi lại expectedRev khi lưu (PUT /api/staff/:u)
  if (!(await authz.can(viewer, 'salary.read', { username: staff.username })))
    for (const key of PAY_STAFF_FIELDS) delete out[key];
  if (!(await authz.can(viewer, 'profile.read.pii', { username: staff.username }))) delete out.birthday;
  return out;
};
// Tóm tắt hồ sơ người chủ của một lịch khi Admin xem/khai thay (GET /api/sheet?user=): chỉ trường người xem được thấy (theo staffForViewer), không trường lương
const ownerView = async (viewer?, staff?, month?) => {
  const shown = await staffForViewer(viewer, staff);
  const params = await monthParams(month);
  return {
    username: shown.username,
    name: shown.name,
    type: shown.type,
    typeLabel: Positions.defOf(params, shown.type).label,
    level: shown.level,
    levelName: shown.levelName ?? null,
    shiftCode: shown.shiftCode ?? null,
    shiftLabel: shown.shiftCode ? await Shifts.labelOf(shown.shiftCode, month) : null,
    startDate: shown.startDate ?? null,
    payrollSubject: !!shown.payrollSubject
  };
};
const sheetForViewer = async (viewer?, username?, sheet?) => {
  if (await authz.can(viewer, 'salary.read', { username })) return sheet;
  const out: Record<string, any> = { ...sheet };
  for (const key of PAY_SHEET_FIELDS) delete out[key];
  return out;
};

export = { staffRevision, publicStaff, staffForViewer, ownerView, sheetForViewer };
