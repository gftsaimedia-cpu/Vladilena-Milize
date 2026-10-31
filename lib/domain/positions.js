const paramsStore = require('../params/store');
const paramsSave = require('../params/save');
const events = require('../events');
const { HttpError, send, readJson } = require('../http');
const { validMonth } = require('./input');
const Positions = require('../params/positions');
const { monthParams, benefitOf, vnToday } = require('../request-rules');
const { warnIf } = require('../warnings');
const { leaveSummary } = require('./sheet'); // bộ tham số của tháng hiện tại (giờ Việt Nam)

// Dữ liệu chức vụ cho giao diện. Chỉ đọc; thêm chức vụ đi qua lib/params/save.js → addPosition.
// GET /api/positions?month=      { month, paramsRev, positions }
// GET /api/entitlements?month=   { month, paramsRev, positions, blocks, cells }  (bảng quyền lợi: hàng là khối, cột là chức vụ)
const resolveMonth = month => paramsStore.resolve(month);
const positionsView = month => {
  const resolved = resolveMonth(month);
  return { month, paramsRev: resolved.rev, positions: Positions.list(resolved.params) };
};
const entitlementsView = month => {
  const resolved = resolveMonth(month);
  return { month, paramsRev: resolved.rev, ...Positions.entitlements(resolved.params) };
};
// Cờ quyền lợi của CHÍNH người đang đăng nhập, theo tháng hiện tại (như levelName ở publicStaff); quản trị viên không có chức vụ nên null
const myPosition = me => {
  if (!me || !me.payrollSubject) return { benefits: null, positionLabel: null };
  const params = monthParams();
  return {
    benefits: {
      ...Positions.benefitsOf(params, me.type, me.level),
      startDateRequired: params[`type.${me.type}.startDateRequired`] === true
    },
    positionLabel: Object.hasOwn(params, `type.${me.type}.workdays`) ? Positions.defOf(params, me.type).label : null
  };
};

// Cờ quyền lợi mà PUT /sheet kiểm (thay các so sánh loại nhân sự ghi cứng); chức vụ lạ không có cờ nào
// level: bậc của người (ghi đè theo bậc thắng cờ của chức vụ)
const sheetFlagsOf = (params, type, level) => ({
  canOt: benefitOf(params, type, 'ot', level),
  canIsat: benefitOf(params, type, 'isat', level),
  canApproved: benefitOf(params, type, 'approvedLeave', level),
  canDeclareAbsence: benefitOf(params, type, 'absenceDeclarable', level),
  hasLeaveAccount: benefitOf(params, type, 'leaveAccount', level),
  canMakeupHours: benefitOf(params, type, 'makeupHours', level)
});
// Cờ gửi yêu cầu của một ngày khai MỚI hoặc ĐỔI (máy chủ không tin giao diện): làm bù theo giờ
// (lưu và cảnh báo): bộ máy không kiểm cờ này nên khoản vẫn chờ Admin duyệt và, nếu được duyệt, có tiền.
// OT (kể cả OT ngày lễ) theo quyền lợi OT và kiểm ở lib/domain/sheet-checks.js.
// onBehalf: Admin khai thay, khoản được duyệt luôn trong cùng lần lưu (lib/domain/sheet-on-behalf.js) nên câu cảnh báo không nói "chờ duyệt"
function checkRequestFlags(flags, day, date, { onBehalf = false }) {
  const denied = (violated, what) =>
    warnIf('BENEFIT_NOT_ALLOWED', violated, {
      details: { code: 'BENEFIT_NOT_ALLOWED' },
      message: onBehalf
        ? `Ngày ${date}: chức vụ hoặc bậc của người này không có quyền lợi khai ${what}: Admin khai thay nên khoản được duyệt luôn (khi có quyền duyệt loại này) và vẫn được tính tiền.`
        : `Ngày ${date}: chức vụ hoặc bậc của bạn không có quyền lợi khai ${what}: khoản chờ Admin duyệt và, nếu được duyệt, vẫn được tính tiền.`
    });
  denied(day.extraKind === 'makeup' && !flags.canMakeupHours, 'làm bù theo giờ');
}
// Mã chức vụ nhận được cho hồ sơ nhân sự của tháng: chức vụ chưa ngưng dùng
const activeCodesOf = params => Positions.codesOf(params).filter(code => !Positions.defOf(params, code).deprecated);

// Hồ sơ kèm số dư phép khi chức vụ có tài khoản phép (cờ leaveAccount), còn lại giữ nguyên
const withLeave = (params, staff) =>
  benefitOf(params, staff.type, 'leaveAccount', staff.level) ? { ...staff, leave: leaveSummary(staff) } : staff;

// GET /api/positions?month=, GET /api/entitlements?month= (config.read), POST /api/positions (thêm chức vụ bằng sao chép); quyền đã kiểm ở ROUTE_CAPS và lib/params/save.js
async function handle({ req, res, seg, url, me, actx }) {
  if (req.method === 'POST' && seg.length === 4 && seg[3] === 'levels') {
    const saved = paramsSave.addLevel(me, actx, seg[2], await readJson(req));
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return send(res, 200, saved);
  }
  if (req.method === 'POST') {
    const saved = paramsSave.addPosition(me, actx, await readJson(req));
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return send(res, 200, saved);
  }
  const month = url.searchParams.get('month') || vnToday().slice(0, 7);
  if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
  return send(res, 200, seg[1] === 'positions' ? positionsView(month) : entitlementsView(month));
}

module.exports = {
  handle,
  withLeave,
  sheetFlagsOf,
  checkRequestFlags,
  activeCodesOf,
  positionsView,
  entitlementsView,
  myPosition
};
