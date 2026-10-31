// Lương Nhân Sự — web app tính lương tự phục vụ. Chạy: node server.js (Node.js >= 22.13, không cần npm install).
// Số luồng libuv phải đặt TRƯỚC khi có việc nền đầu tiên (băm mật khẩu, nén gzip); biến môi trường do người vận hành đặt thì giữ.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || String(require('./lib/config').UV_THREADPOOL_SIZE);
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
// Nạp file .env (nếu có) vào biến môi trường, không ghi đè biến đã đặt sẵn.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const store = require('./lib/db');
const auth = require('./lib/auth');
const { HttpError, send, readJson, securityHeaders, serveStatic, clientIp } = require('./lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const {
  requestRules,
  rulesFor,
  monthParams,
  typeParam,
  benefitOf,
  levelCountOf,
  vnToday,
  nowIso
} = require('./lib/request-rules'); // quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { attendanceHints, announceSetting, announceAttendance } = require('./lib/announce'); // báo sau COMMIT: cấu hình đổi (chấm công mới đi qua punchHints, kind 'punch')
const { validMonth, validDate, USERNAME_RE, TIME_RE, NOTE_MAX, positiveId } = require('./lib/domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const {
  toMin,
  overlapsNight,
  shiftFor,
  estimateOtHours,
  actualOtHours,
  estimateHolidayOtHours,
  actualHolidayOtHours
} = require('./lib/domain/work-hours'); // giờ ca, OT, giờ làm ngày lễ
const { estimateSheet, leaveDates, neighborDays, schedule } = require('./lib/domain/sheet'); // lịch ước tính và ngày phép
const { publicStaff, staffForViewer, ownerView, sheetForViewer, staffRevision } = require('./lib/domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
const { cleanGeofence, geofenceView, checkGeofence } = require('./lib/domain/geofence'); // vùng GPS Check-in
const {
  punchStaff,
  closeStale,
  closeStaleFor,
  punchHints,
  hintPunch,
  announcePunches,
  sessionOverlap,
  correctionVersion
} = require('./lib/domain/attendance'); // phiên Check-in/out dùng chung
// lượt gửi cho màn hình: kèm lượt bấm, yêu cầu điều chỉnh và status / statusNote
const { sessionHistory, sessionsFor, sessionsWithHistory } = require('./lib/domain/attendance/session-view');
const { CheckinEntitlement } = require('./lib/domain/attendance/checkin-entitlement'); // Check-in lúc này có được không, theo quyền nào
const {
  hasKpi,
  cleanKpi,
  cleanKpiAmt,
  kpiScoreItem,
  kpiPartsView,
  kpiHttpError,
  selfScoreOnly
} = require('./lib/domain/kpi'); // KPI: trần, điểm, hiển thị
const {
  sheetApprovals,
  reconcileHolidayWork,
  reconcileStaffType,
  listApprovals,
  tallyApprovals,
  approvalHttpError
} = require('./lib/domain/approvals'); // khoản tự khai chờ duyệt
const { aiReviewResult, aiReviewResultCached } = require('./lib/domain/ai-review'); // kết quả soát dữ liệu của AI
const { assertNotAiBlocked } = require('./lib/domain/ai-block'); // AI chặn duyệt khoản dính luật nặng (chỉ khi công tắc Agents bật)
const agents = require('./lib/agents'); // công tắc Agents
const { checkSheetLimits } = require('./lib/domain/limits'); // trần OT tháng (OT cộng giờ ca chính làm ngày lễ), giới hạn iSAT theo tháng
const { OtLimits } = require('./lib/domain/overtime/ot-limits'); // trần giờ làm: MỘT nguồn đọc từ bộ tham số của tháng
const { sheetOwner, approveOnBehalf } = require('./lib/domain/sheet-on-behalf'); // Admin khai lịch thay nhân sự
const sheetBulk = require('./lib/domain/sheet-bulk'); // Admin chấm công thay nhiều người, nhiều ngày, một ca
const { checkSheet, assertSheetRev, checkExtraTimes, dm } = require('./lib/domain/sheet-checks'); // kiểm nghiệp vụ khi lưu lịch ước tính
const { isatRefusal } = require('./lib/domain/isat-rule'); // ngày iSAT đúng thứ và đúng quyền lợi
const shiftsDomain = require('./lib/domain/shifts'); // giờ ca (nhân viên đọc qua phần bổ sung của /api/punch)
const { listOt, validateOtDeclaration } = require('./lib/domain/ot'); // khai OT thực tế ở Check-in/out
const otSheet = require('./lib/domain/ot-sheet'); // OT Check-in/out được duyệt thành OT đã duyệt của ngày trong Lịch ước tính
const domainRoutes = require('./lib/domain/routes'); // khối phụ cấp, khoản điền thêm, lịch theo loại nhân sự
const authz = require('./lib/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const Roles = require('./lib/roles'); // vai trò tuỳ chỉnh (dữ liệu ở settings)
const audit = require('./lib/audit'); // nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('./lib/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const paramsStore = require('./lib/params/store');
const configRev = require('./lib/params/config-rev'); // số phiên bản chung của cấu hình (settings.config_rev)
const HolidayNames = require('./lib/domain/holidays'); // tên ngày lễ (nhãn hiển thị)
const Positions = require('./lib/params/positions'); // chức vụ là dữ liệu: danh sách, quyền lợi, bảng quyền lợi
const { myPosition, sheetFlagsOf, activeCodesOf, withLeave } = require('./lib/domain/positions'); // cờ quyền lợi và chức vụ
const paramsSave = require('./lib/params/save'); // lưu tham số: kiểm, xem trước tác động, ghi cả lô, hoàn tác
const periods = require('./lib/periods'); // vòng đời kỳ lương, phiếu chụp bất biến, số ước tính của nhân sự
const events = require('./lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const findings = require('./lib/findings'); // bỏ qua phát hiện AI của phiếu, có lý do
const { RuntimeMonitor } = require('./lib/ops/runtime-monitor'); // độ trễ vòng lặp, bộ nhớ (nghẽn máy chủ)
const { attachAccessLog } = require('./lib/ops/access-log'); // nhật ký truy cập JSON + X-Request-Id
const explanations = require('./lib/explanations'); // giải trình Check-out muộn
const { container } = require('./lib/domain/container'); // các lớp của lib/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const { PersonName } = require('./lib/domain/employee/person-name'); // họ trước, tên sau
const { Overloaded, AsyncGate, RateLimiter, LoadShedder } = require('./lib/ops/limiters'); // giới hạn tải trong bộ nhớ
const { HEAVY_ROUTES, UNLIMITED_WRITE_ROUTES } = require('./lib/ops/route-classes'); // route nặng bị từ chối khi quá tải; route ghi không bị giới hạn tốc độ
const monitor = new RuntimeMonitor();
let apiInflight = 0; // yêu cầu API đang xử lý (không tính luồng SSE sống lâu)
// Biến môi trường (số dương) ghi đè giá trị mặc định trong lib/config.js: vận hành nới/siết giới hạn khi triển khai mà không sửa mã
const limitOf = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);
const hashGate = new AsyncGate({
  limit: limitOf('PASSWORD_HASH_CONCURRENCY', config.PASSWORD_HASH_CONCURRENCY),
  maxQueue: config.PASSWORD_HASH_QUEUE_MAX,
  retryAfterSec: config.OVERLOAD_RETRY_AFTER_SEC
});
const writeLimiter = new RateLimiter({ perMinute: limitOf('WRITE_RATE_PER_MINUTE', config.WRITE_RATE_PER_MINUTE) });
const shedder = new LoadShedder({
  lagMs: () => monitor.recent().p50, // trễ KÉO DÀI (trung vị): một phép tính nặng đơn lẻ làm p99/max vọt lên nhưng không phải quá tải
  inflight: () => apiInflight,
  maxLagMs: limitOf('SHED_MAX_LAG_MS', config.SHED_MAX_LAG_MS),
  maxInflight: limitOf('SHED_MAX_INFLIGHT', config.SHED_MAX_INFLIGHT),
  retryAfterSec: config.OVERLOAD_RETRY_AFTER_SEC
});
const warnings = require('./lib/warnings'); // cảnh báo thay cho chặn
const { warnIf, selfDecision } = warnings;
// Lý do ghi nhận (đặt lại mật khẩu, gán vai trò, gán ca): không bắt buộc, quá ${config.REASON_MAX} ký tự là 400. Trả '' khi trống.
const reasonText = `Lý do tối đa ${config.REASON_MAX} ký tự`;
const reasonOf = value => warnings.optionalReason(value, { tooLong: reasonText });

// Biên của một ngày giờ Việt Nam (Asia/Ho_Chi_Minh, +07:00, không có giờ mùa hè) dưới dạng ISO UTC
const vnDayIso = (day, edge) =>
  new Date(`${day}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`).toISOString();

const PORT = Number(process.env.PORT || 3000);
// Hợp đồng mặc định của chức vụ mới đọc type.<mã>.defaultContract của tháng hiện tại (lỗi hoặc giá trị lạ thì db dùng mặc định của nó)
store.setDefaultContractResolver(type => typeParam(monthParams(), type, 'defaultContract'));
const LOCKED_MESSAGE = 'Tài khoản đã bị khoá. Liên hệ Admin để được mở lại.';
// Các ô Admin được sửa trên phiếu lương: tiền (đồng, ≥ 0) và số lượng (ngày / giờ / %)
const SLIP_MONEY = [
  'workBase',
  'leavePay',
  'settlePay',
  'isatPay',
  'holidayPay',
  'otPay',
  'attendance',
  'travel',
  'flexPay',
  'breakPay',
  'nightPay',
  'kpiPay',
  'kpiAmt',
  'lateCut',
  'exempt',
  'insurance',
  'tax',
  'advance'
];
const SLIP_QTY = [
  'workDays',
  'unpaidDays',
  'leaveDays',
  'settleDays',
  'isatDays',
  'holidayDays',
  'ot15H',
  'ot20H',
  'ot30H',
  'kpiPct',
  'debtH',
  'leaveLeft',
  'kpiBase',
  'kpiUser',
  'kpiQltt',
  'kpiPeer',
  'kpiSelf',
  'kpiBonus'
]; // % đạt từng phần KPI; Tổng KPI = Σ % × trọng số (40/24/12/18/6) + Bonus

// So cả hai lịch trước khi ghi. Xung đột cũ không liên quan giữ nguyên;
// xung đột mới phải xử lý trước ở luồng lịch ước tính / chấm công của nó.
function holidayOtConflicts(beforeDates, afterDates) {
  const before = new Set(beforeDates),
    after = new Set(afterDates),
    conflicts = [];
  const added = date => after.has(date) && !before.has(date);
  for (const staff of store.listStaff().filter(s => s.payrollSubject)) {
    const identity = { username: staff.username, name: staff.name };
    const checkLimit = (source, month, beforeHours, afterHours) => {
      const monthCap = OtLimits.of(monthParams(month)).monthCap;
      if (afterHours > monthCap + 1e-6 && afterHours > beforeHours + 1e-6)
        conflicts.push({
          ...identity,
          source,
          month,
          reason: 'month-limit',
          limit: monthCap,
          beforeHours,
          afterHours
        });
    };
    for (const sheet of store.listSheets(staff.username)) {
      const { days } = estimateSheet(staff.username, sheet.month);
      for (const [date, entry] of Object.entries(days))
        if (added(date) && entry.extraKind)
          conflicts.push({ ...identity, source: 'estimate', month: sheet.month, date, reason: 'holiday-extra' });
      checkLimit(
        'estimate',
        sheet.month,
        estimateHolidayOtHours(days, before, sheet.month),
        estimateHolidayOtHours(days, after, sheet.month)
      );
    }
    const months = new Map();
    for (const s of store.listSessions({ username: staff.username })) {
      const month = s.date.slice(0, 7);
      if (!months.has(month)) months.set(month, []);
      months.get(month).push(s);
      if (added(s.date) && actualOtHours(s.entry) > 0)
        conflicts.push({
          ...identity,
          source: 'attendance',
          month,
          date: s.date,
          sessionId: s.id,
          reason: 'holiday-ot'
        });
    }
    for (const [month, rows] of months)
      checkLimit(
        'attendance',
        month,
        actualHolidayOtHours(rows, before, month),
        actualHolidayOtHours(rows, after, month)
      );
  }
  return conflicts;
}

/* ---------- check-in / check-out ---------- */
// Nhân viên chỉ Check-in được cho ngày công (ngày punch.js gán cho lượt: ca đêm thuộc ngày bắt đầu ca, lượt ngoài khung ca thuộc ngày bấm) là:
//   ngày làm việc trong lịch của loại nhân sự và không phải ngày lễ; hoặc
//   ngày có khoản OT (kể cả OT khai trên ngày lễ) hay làm bù theo giờ ở trạng thái đã duyệt (sheetApprovals: khoản Admin khai thay được duyệt ngay khi lưu).
// Ngày tự khai đi làm không có khoản duyệt, khoản chờ duyệt hay bị từ chối đều không mở Check-in.
// Ngày nghỉ cả ngày cũng đóng Check-in: iSAT, nghỉ phép năm, nghỉ không lương đã khai (chờ duyệt hay đã duyệt, trừ khoản bị từ chối);
// nghỉ được duyệt, nghỉ sẽ làm bù chỉ khi đã duyệt. Ngoại lệ: ngày đó có khoản OT hay làm bù đã duyệt. checkInDay trả câu báo '' khi ngày qua, ngược lại câu báo cho nhân viên.
// Thời điểm bấm còn phải nằm trong khung ca hoặc trong khoảng giờ của khoản đã duyệt: lib/domain/attendance/checkin-entitlement.js (checkInVerdict) ghép hai điều kiện.
const CHECKIN_ITEMS = ['ot', 'makeup_hours'];
const OFF_DECLARED = ['isat', 'leave', 'unpaid'];
const OFF_DAY_TEXT = {
  isat: 'nghỉ iSAT',
  leave: 'nghỉ phép năm',
  unpaid: 'nghỉ không lương',
  approved: 'nghỉ được duyệt',
  willmakeup: 'nghỉ, sẽ làm bù'
};
// block: câu báo ('' = ngày qua cổng); off: ngày đã khai nghỉ cả ngày; via: 'shift' khi ngày nằm trong lịch và không đóng, ngược lại loại khoản đã duyệt mở ngày đó.
function checkInDay(staff, date) {
  const { day, approval } = declaredDay(staff, date) || {};
  const holiday = store.getSetting('holidays', []).includes(date);
  const scheduled = !holiday && schedule.isWorkDay(staff, date);
  const off = day && Object.hasOwn(OFF_DAY_TEXT, day.kind) ? day.kind : '';
  const closed = OFF_DECLARED.includes(off)
    ? !approval || approval.status !== 'rejected'
    : approval && approval.status === 'approved';
  if (approval && approval.status === 'approved' && CHECKIN_ITEMS.includes(approval.item))
    return { block: '', via: scheduled && !off ? 'shift' : approval.item };
  if (off && closed) return { block: `Hôm nay bạn ${OFF_DAY_TEXT[off]}, không Check-in được.`, via: '', off: true };
  if (scheduled) return { block: '', via: 'shift' };
  return { block: 'Hôm nay bạn không có lịch làm việc hay giờ OT/làm bù được duyệt nên không Check-in được.', via: '' };
}
// Ngày khai trong lịch ước tính của nhân sự và dòng duyệt hiệu lực của nó; null khi ngày không có khai
function declaredDay(staff, date) {
  const month = date.slice(0, 7);
  const day = estimateSheet(staff.username, month).days[date];
  return day
    ? {
        day,
        approval: sheetApprovals(staff.username, month, { [date]: day })[date] || null,
        holiday: store.getSetting('holidays', []).includes(date)
      }
    : null;
}
const checkinEntitlement = new CheckinEntitlement({
  punch: () => rulesFor().punch,
  declared: declaredDay,
  dayBlock: checkInDay,
  punchStaff
});
const checkInVerdict = (staff, iso) => checkinEntitlement.decide(staff, iso);
function punchState(staff) {
  const punch = rulesFor().punch;
  const openSession = store.openSession(staff.username),
    lastSession = store.lastSession(staff.username);
  // Không có lượt mở: xét ngày công mà một lượt Check-in lúc này sẽ nhận. canCheckIn false kèm checkInBlock (câu lý do) khi bị chặn;
  // checkInBlock chỉ có mặt khi bị chặn
  const verdict = openSession ? null : checkInVerdict(staff, nowIso());
  const block = verdict && !verdict.allowed ? verdict.message : '';
  const canCheckIn = !openSession && !block;
  const shownOpen = sessionHistory(openSession),
    shownLast = sessionHistory(lastSession);
  const s = openSession || lastSession,
    shown = shownOpen || shownLast,
    day = s?.entry;
  // Nhãn của lượt do máy chủ phân loại (status, statusNote: cùng nơi với phiếu): record mang đúng nhãn đó để màn nhân viên không đọc kind 'pending' của lượt
  // đã bị từ chối thành "Chờ xử lý"; `pending` (lý do lượt đang chờ) chỉ có khi lượt thật sự chờ xử lý
  const record = day ? { ...day, status: shown.status, statusNote: shown.statusNote } : null;
  // Các trường tương thích mang đúng phiên đã chọn, không gộp danh sách phiên thành ngày lương.
  return {
    enabled: true,
    canCheckIn,
    ...(block ? { checkInBlock: block, checkInCode: verdict.code } : {}),
    ...(canCheckIn ? { checkInEntitlement: verdict.entitlement } : {}),
    openSession: shownOpen,
    lastSession: shownLast,
    open: openSession
      ? {
          id: openSession.id,
          at: day.presIn,
          since: punch.vnTime(day.presIn),
          date: openSession.date,
          plannedShift: day.plannedShift || null
        }
      : null,
    date: s?.date || punch.vnDate(nowIso()),
    ...schedule.punchSchedule(staff, s?.date || punch.vnDate(nowIso())),
    record,
    sunday: false,
    outside: '',
    done: !openSession && day?.presOut ? { in: punch.vnTime(day.presIn), out: punch.vnTime(day.presOut) } : null,
    pending: !openSession && day?.kind === 'pending' && shown.status === 'pending' ? day.reason : null
  };
}
/* ---------- số liệu theo tham số của tháng, cho app nhân viên: chỉ đọc, không ghi ---------- */
// Bảng số phút bị trừ theo số phút trễ / về sớm (chỉ số = số phút, 0..SHIFT_WORK_MIN; trễ hơn nữa thì dùng phần tử cuối), dựng từ cutMin
// của đúng tháng: app nhân viên tra bảng thay vì tự làm tròn bằng quy tắc mặc định.
function cutRuleView(month) {
  const ah = rulesFor(month).actualHours;
  const { GRACE_MIN, STEP_MIN, SHIFT_WORK_MIN } = ah.RULE;
  return {
    graceMin: GRACE_MIN,
    stepMin: STEP_MIN,
    shiftWorkMin: SHIFT_WORK_MIN,
    rounding: ah.POLICY.cutRounding,
    table: Array.from({ length: SHIFT_WORK_MIN + 1 }, (_, minutes) => ah.cutMin(minutes))
  };
}
// Số phép năm tính đến hôm nay của một nhân sự theo quy tắc của tháng chứa hôm nay (cùng mã với kiểm số dư của PUT /sheet:
// rulesFor(tháng của ngày).leave.accrued và leaveDates); null khi chức vụ / bậc không có tài khoản phép
function leaveBalanceView(staff) {
  if (!staff || !staff.payrollSubject) return null;
  const today = vnToday();
  if (!sheetFlagsOf(rulesFor(today.slice(0, 7)).params, staff.type, staff.level).hasLeaveAccount) return null;
  // Sổ phép (public/leave.js → ledger): dùng phép cũ trước, phép tích luỹ tới 31/12 hết hạn cuối tháng leave.expiry.month của năm sau
  const got = rulesFor(today.slice(0, 7)).leave.ledger(
    staff,
    leaveDates(staff).filter(d => d <= today),
    today
  );
  return {
    asOf: today,
    accrued: got.total,
    start: got.start,
    months: got.months,
    seniority: got.seniority, // thâm niên (ngày)
    birthdays: got.birthdays,
    adjust: got.adjust,
    used: got.used,
    expired: got.expired, // phép đã hết hạn (đã quy tiền vào phiếu tháng liền sau)
    remaining: got.balance,
    balance: got.balance,
    expiring: got.expiring // { days, on } trong khoảng từ 01/01 tới ngày hết hạn, null khi không có
  };
}
// Báo cáo từng ngày của ActualHours.apply (trạng thái, phút trễ / về sớm, phút bị trừ) cho cả tháng như app nhân viên. null khi không phải nhân sự được trả lương
function actualReportView(staff, month) {
  if (!staff || !staff.payrollSubject) return null;
  const { report, missing, absent } = rulesFor(month).actualHours.apply(
    estimateSheet(staff.username, month).days,
    store.listSessions({ username: staff.username, month }),
    {
      asOf: nowIso(),
      staff,
      holidays: store.getSetting('holidays', []),
      month
    }
  );
  return { report, missing, absent };
}
// "Nếu Check-out bây giờ": chạy ActualHours.apply của tháng trên ca đang mở được đóng vào lúc này
function checkoutPreview(staff) {
  const open = store.openSession(staff.username);
  const planned = open && open.entry && open.entry.plannedShift;
  if (!planned || !planned.date || !planned.in || !planned.out) return null;
  const month = planned.date.slice(0, 7),
    now = nowIso();
  const others = store.listSessions({ username: staff.username, month }).filter(s => s.id !== open.id);
  const closed = { id: open.id, date: open.date, state: 'closed', entry: { ...open.entry, presOut: now } };
  const { report } = rulesFor(month).actualHours.apply(
    { [planned.date]: { kind: 'work', in: planned.in, out: planned.out } },
    [...others, closed].filter(s => s.date === planned.date),
    {
      asOf: now,
      staff,
      holidays: store.getSetting('holidays', []),
      month
    }
  );
  const r = report[planned.date];
  if (!r || r.state !== 'ok') return null; // ngoài lịch / ngoài ca: không áp được
  return { early: r.early || 0, cutEnd: r.cutEndMin || 0, cutStart: r.cutStartMin || 0, paidMin: r.paidMin };
}
// Phần bổ sung (không lưu vào bản phát lại theo requestId) của GET / POST /api/punch
const punchExtras = staff => ({
  serverNow: nowIso(),
  cutRule: cutRuleView(vnToday().slice(0, 7)),
  shiftConfig: shiftsDomain.employeeView(vnToday().slice(0, 7)), // giờ ca và hai ngưỡng Check-in cho nhân viên (không có config.read)
  checkoutPreview: checkoutPreview(staff)
});
/* ---------- kiểm tra dữ liệu vào ---------- */
// 'makeup': loại ngày cũ, chỉ để ngày đã lưu gửi lại không đổi đi qua; khai mới hoặc sửa bị chặn ở checkSheet (SHEET_MAKEUP_DAY_REMOVED)
const DAY_KINDS = ['work', 'makeup', 'leave', 'unpaid', 'willmakeup', 'approved', 'isat'];
// Mã ca của một ngày: mã ca trong danh mục (Normal1…) hoặc mã cũ n1…g2 của ngày đã lưu trước đó
const PRESET_RE = /^(n1|n2|f1|f2|g1|g2|[A-Z][A-Za-z]*[0-9]+)$/;
const isShiftCode = code =>
  typeof code === 'string' && PRESET_RE.test(code) && Object.hasOwn(rulesFor().punch.SHIFT, code);
function cleanDays(days) {
  if (!days || typeof days !== 'object' || Array.isArray(days)) throw new HttpError(400, 'days phải là object');
  const out = {};
  for (const [date, d] of Object.entries(days)) {
    if (!validDate(date) || !d || typeof d !== 'object') throw new HttpError(400, `Ngày không hợp lệ: ${date}`);
    // Thiếu kind (bản ghi rất cũ) là đi làm; giá trị lạ bị từ chối, không âm thầm đổi thành đi làm
    const kind = d.kind === undefined ? 'work' : d.kind;
    if (!DAY_KINDS.includes(kind)) throw new HttpError(400, `Ngày ${dm(date)}: loại ngày không hợp lệ`);
    if (kind === 'work' || kind === 'makeup') {
      if (typeof d.in !== 'string' || typeof d.out !== 'string' || !TIME_RE.test(d.in) || !TIME_RE.test(d.out))
        throw new HttpError(400, `Giờ không hợp lệ ở ngày ${dm(date)}`);
      // Không giới hạn khoảng cách giữa giờ vào và giờ ra (vd. 20:00→09:00 được lưu); giờ trả lương do engine giới hạn
      if (
        (d.extraOut && (typeof d.extraOut !== 'string' || !TIME_RE.test(d.extraOut))) ||
        (d.extraIn && (typeof d.extraIn !== 'string' || !TIME_RE.test(d.extraIn)))
      )
        throw new HttpError(400, `Giờ làm thêm không hợp lệ ở ngày ${dm(date)}`);
      if (d.extraKind != null && typeof d.extraKind !== 'string')
        throw new HttpError(400, `Ngày ${dm(date)}: loại làm thêm không hợp lệ`);
      if (d.extraKind && !['makeup', 'ot'].includes(d.extraKind))
        throw new HttpError(400, `Ngày ${dm(date)}: loại làm thêm phải là làm bù hoặc OT`);
      // làm thêm trước ca (giờ vào làm thêm → giờ vào) và/hoặc sau ca (giờ ra → giờ ra làm thêm); trùng giờ ca coi như không có
      const extraIn = d.extraIn && d.extraIn !== d.in ? d.extraIn : '',
        extraOut = d.extraOut && d.extraOut !== d.out ? d.extraOut : '';
      // Bản ghi cũ có giờ ra làm thêm mà thiếu extraKind là làm bù (đúng như calcDay và approval-view đọc): giữ nguyên giờ,
      // không xoá. Chỉ có giờ vào làm thêm thì calcDay không tính gì: giữ nguyên giờ, để extraKind rỗng, không đoán loại.
      const extraKind = d.extraKind || (extraOut ? 'makeup' : '');
      // Thiếu giờ làm thêm, giờ trùng giờ ca, nhập nhầm phía (trước / sau ca): lib/domain/sheet-checks.js → checkExtraTimes
      checkExtraTimes(date, d, { extraKind, extraIn, extraOut });
      if (d.preset != null && d.preset !== '' && !isShiftCode(d.preset))
        throw new HttpError(400, `Ngày ${dm(date)}: ca chọn sẵn không hợp lệ`);
      const breakMin = d.breakMin == null ? 0 : d.breakMin;
      if (!Number.isInteger(breakMin) || breakMin < 0 || breakMin > 1440)
        throw new HttpError(400, `Ngày ${dm(date)}: số phút ra khỏi văn phòng phải là số nguyên từ 0 đến 1440`);
      out[date] = {
        kind,
        shift: shiftFor(d.in, d.out),
        in: d.in,
        out: d.out,
        extraKind,
        extraIn,
        extraOut,
        preset: d.preset || '',
        breakMin
      };
    } else out[date] = { kind };
    // Giải trình Check-in/out (tuỳ chọn, mọi loại ngày): chữ do người khai nhập, Admin xem khi duyệt
    if (d.punchNote != null) {
      if (typeof d.punchNote !== 'string') throw new HttpError(400, `Ngày ${dm(date)}: giải trình phải là chữ`);
      const punchNote = d.punchNote.trim();
      if (punchNote.length > NOTE_MAX)
        throw new HttpError(400, `Ngày ${dm(date)}: giải trình tối đa ${NOTE_MAX} ký tự`);
      if (punchNote) out[date].punchNote = punchNote;
    }
    // "Nghỉ, sẽ làm bù": ngày/giờ làm bù dự kiến CHỈ để Admin xem khi duyệt, không chặn gì (ngày nào, giờ nào, dài bao lâu, qua đêm, để trống).
    // Chỉ làm sạch kiểu dữ liệu: ô sai dạng thành rỗng, tối đa 31 dòng, bỏ dòng trống hoàn toàn.
    if (kind === 'willmakeup') {
      const text = (value, ok) => (typeof value === 'string' && ok(value) ? value : '');
      if (Array.isArray(d.makeupPlans)) {
        const plans = d.makeupPlans
          .filter(plan => plan && typeof plan === 'object' && !Array.isArray(plan))
          .slice(0, 31)
          .map(plan => ({
            date: text(plan.date, validDate),
            from: text(plan.from, v => TIME_RE.test(v)),
            to: text(plan.to, v => TIME_RE.test(v))
          }))
          .filter(plan => plan.date || plan.from || plan.to);
        if (plans.length) out[date].makeupPlans = plans;
      } else if (typeof d.makeupDate === 'string' && validDate(d.makeupDate)) {
        out[date].makeupDate = d.makeupDate; // dữ liệu cũ chỉ có ngày
      }
    }
  }
  return out;
}
// Địa chỉ dùng cho giới hạn đăng nhập: cùng hàm với nhật ký chấm công (clientIp), để header giả không lách được.
const loginAddress = clientIp;

/* ---------- API ---------- */
// Ghi vào kỳ đã duyệt hoặc chi trả: phiếu của lần chạy đã chốt là bản chụp đóng băng (lib/db.js → freezeOverrides, trigger payslips_frozen_update),
// số đã trả KHÔNG đổi theo dữ liệu vừa lưu cho tới khi kỳ được mở lại và tính lại. Cảnh báo nói thẳng điều đó.
function warnFrozen(month) {
  const period = store.periods.get(month);
  if (period.status === 'approved' || period.status === 'paid')
    warnings.warn(
      'PERIOD_FROZEN',
      `Kỳ ${month} đã ${period.status === 'paid' ? 'chi trả' : 'duyệt'}: số trên phiếu đã chốt KHÔNG đổi cho tới khi kỳ được mở lại và tính lại; thay đổi vừa lưu chỉ có tác dụng từ lúc đó.`,
      { details: { month, status: period.status } }
    );
}
async function api(req, res, url, me) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const route = `${req.method} /${seg.slice(1, 3).join('/')}`;
  const need = () => {
    if (!me) throw new HttpError(401, 'Chưa đăng nhập');
    return me;
  };
  // Cổng quyền MỘT chỗ: route không có trong ROUTE_CAPS bị từ chối mặc định; thiếu năng lực thì 403 trước khi đọc thân yêu cầu.
  const policy = authz.policyOf(authz.routeKey(req.method, seg));
  if (!policy) {
    need();
    throw new HttpError(403, 'Đường dẫn này chưa có chính sách quyền, bị từ chối', { code: 'NO_ROUTE_POLICY' });
  }
  if (!policy.public) {
    need();
    if (authz.gate(me, policy))
      throw new HttpError(403, 'Chỉ Admin hoặc vai trò được giao quyền mới được thao tác này', {
        code: 'FORBIDDEN_CAP',
        cap: policy.cap
      });
  }
  // Giới hạn tải (sau cổng quyền, trước khi đọc thân yêu cầu): route nặng bị từ chối khi máy chủ nghẽn; lệnh ghi của một người bị giới hạn tốc độ
  const routeKey = authz.routeKey(req.method, seg);
  if (HEAVY_ROUTES.has(routeKey)) {
    const reason = shedder.check();
    if (reason)
      throw new Overloaded(`Máy chủ đang bận (${reason}), thử lại sau ít giây`, config.OVERLOAD_RETRY_AFTER_SEC);
  }
  if (me && req.method !== 'GET' && !UNLIMITED_WRITE_ROUTES.has(routeKey)) {
    const waitSec = writeLimiter.take(me.username);
    if (waitSec > 0)
      return send(
        res,
        429,
        { error: `Bạn thao tác quá nhanh. Thử lại sau ${waitSec} giây.`, code: 'WRITE_RATE_LIMITED' },
        { 'Retry-After': String(waitSec) }
      );
  }
  const actx = me ? audit.context(me) : null; // ngữ cảnh nhật ký của yêu cầu này
  // Test tĩnh permissions-matrix nhận dạng route chỉ-Admin bằng tên hàm này. Cổng thật đã chạy ở trên;
  // hàm này chỉ khẳng định route đã khai báo một năng lực và người gọi đã qua cổng đó.
  const needAdmin = () => {
    need();
    if (!policy.cap) throw new Error('needAdmin() dùng ở route không khai báo năng lực trong ROUTE_CAPS');
    return me;
  };
  // Cổng khoá kỳ: gọi ở route ghi sau khi kiểm đầu vào; kỳ đã khoá thì ghi cảnh báo PERIOD_LOCKED và route vẫn lưu. dates: ngày hoặc tháng (YYYY-MM-DD | YYYY-MM)
  const guardPeriod = (...dates) => {
    if (!policy.periodScope) throw new Error('guardPeriod() dùng ở route không khai báo periodScope');
    for (const month of new Set(
      dates
        .flat()
        .filter(Boolean)
        .map(d => String(d).slice(0, 7))
    )) {
      store.assertPeriodOpen(month, policy.periodScope);
      warnFrozen(month);
    }
  };
  const routed = domainRoutes.handlerFor(seg); // quyền đã kiểm ở cổng ROUTE_CAPS ở trên
  if (routed) return routed({ req, res, seg, url, me, actx });

  // Cho proxy/giám sát: tiến trình còn sống, DB trả lời được, vòng lặp có đang nghẽn không. Không lộ dữ liệu nghiệp vụ.
  if (route === 'GET /health') {
    store.db.prepare('SELECT 1').get();
    return send(res, 200, { ok: true, ...monitor.snapshot() });
  }
  if (route === 'POST /login') {
    const { username, password } = await readJson(req);
    const u = String(username || '')
      .trim()
      .toLowerCase();
    const key = auth.loginKey(loginAddress(req), u);
    const wait = auth.loginWait(key);
    if (wait > 0)
      return send(
        res,
        429,
        { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60)} phút.` },
        { 'Retry-After': String(wait) }
      );
    const row = store.getStaffRow(u);
    // Tên không có thật cũng chạy băm mật khẩu và nhận cùng thông báo, để không đoán được tên nào có thật
    if (!(await hashGate.run(() => auth.verifyLoginAsync(String(password || ''), row)))) {
      const { addressWait } = auth.loginFailed(key);
      // Lần sai vừa làm cả địa chỉ bị khoá (thử mật khẩu trên nhiều tài khoản)
      if (addressWait > 0)
        return send(
          res,
          429,
          { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(addressWait / 60)} phút.` },
          { 'Retry-After': String(addressWait) }
        );
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    // Kiểm khoá TRƯỚC khi ghi nhận thành công: mật khẩu đúng của một tài khoản đã bị khoá không được xoá bộ đếm dò
    if (row.locked_at) throw new HttpError(403, LOCKED_MESSAGE);
    auth.loginSucceeded(key);
    return send(
      res,
      200,
      {
        user: publicStaff(store.getStaff(u)),
        holidays: store.getSetting('holidays', []),
        ...geofenceView(store.getStaff(u))
      },
      { 'Set-Cookie': auth.cookieHeader(auth.createSession(u), auth.SESSION_MAX_AGE_SEC) }
    );
  }
  if (route === 'POST /logout') {
    // Đăng xuất thu hồi phiên: mọi cookie cũ của tài khoản này hết hiệu lực, kể cả bản bị sao chép
    if (me) {
      store.bumpSessionVersion(me.username);
      events.closeUser(me.username, 'logout');
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', 0) });
  }
  if (route === 'GET /me')
    return send(res, 200, {
      user: me ? publicStaff(me) : null,
      serverNow: nowIso(), // giờ máy chủ (ISO), để app nhân viên tính lệch đồng hồ điện thoại (NV.skewMs)
      // Vai trò và năng lực hiệu lực. Chế độ HR / Nhân viên là trạng thái giao diện, máy chủ luôn kiểm theo năng lực.
      roles: authz.rolesOf(me),
      caps: authz.capsOf(me),
      payrollSubject: !!(me && me.payrollSubject),
      agentsEnabled: agents.enabled(), // công tắc Agents (route /settings/agents)
      holidays: store.getSetting('holidays', []),
      ...myPosition(me),
      ...geofenceView(me)
    });

  if (route === 'PUT /password') {
    const u = need();
    const { current, next } = await readJson(req);
    if (!(await auth.verifyPasswordAsync(String(current || ''), store.getStaffRow(u.username).pass_hash)))
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    if (String(next || '').length < config.PASSWORD_MIN_LENGTH)
      throw new HttpError(400, `Mật khẩu mới cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
    const passHash = await auth.hashPasswordAsync(String(next));
    store.transaction(() => {
      store.setPassword(u.username, passHash);
      // Chỉ ghi hành động, không bao giờ ghi mật khẩu hay hàm băm
      audit.write(actx, { action: 'password.change', entityKind: 'staff', entityId: u.username, subject: u.username });
    });
    store.bumpSessionVersion(u.username); // phiên cũ hết hiệu lực; cấp phiên mới cho trình duyệt đang đổi
    events.closeUser(u.username, 'password'); // luồng cũ gắn với cookie cũ; trình duyệt này nối lại bằng cookie mới
    return send(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': auth.cookieHeader(auth.createSession(u.username), auth.SESSION_MAX_AGE_SEC) }
    );
  }

  if (route === 'GET /holidays') {
    need();
    return send(res, 200, { dates: store.getSetting('holidays', []), names: HolidayNames.read() });
  }
  if (route === 'PUT /holidays') {
    needAdmin();
    const { dates, names } = await readJson(req);
    if (!Array.isArray(dates) || dates.some(d => !validDate(d)))
      throw new HttpError(400, 'Danh sách ngày không hợp lệ');
    const clean = [...new Set(dates)].sort();
    const namesClean = HolidayNames.clean(names, clean); // tên hiển thị của ngày lễ; sai đầu vào là 400 trước mọi thay đổi
    // Khoá kỳ: chỉ các ngày thật sự đổi (thêm hoặc bỏ) mới bị xét, lưu lại danh sách y nguyên không bị chặn
    const holidaysBefore = store.getSetting('holidays', []);
    guardPeriod(
      holidaysBefore.filter(d => !clean.includes(d)),
      clean.filter(d => !holidaysBefore.includes(d))
    );
    store.transaction(() => {
      const conflicts = [];
      const holidayParams = monthParams();
      for (const staff of store
        .listStaff()
        .filter(s => s.payrollSubject && benefitOf(holidayParams, s.type, 'leaveAccount', s.level))) {
        const before = leaveDates(staff),
          after = leaveDates(staff, undefined, clean);
        for (const date of after) {
          const led = rulesFor(date.slice(0, 7)).leave.ledger(staff, after, date),
            got = led.total - led.expired, // phép còn được dùng tại ngày đó: đã cộng trừ phần đã hết hạn
            used = led.used;
          const beforeDeficit = Math.max(0, before.filter(d => d <= date).length - got),
            afterDeficit = Math.max(0, used - got);
          if (afterDeficit > beforeDeficit + 1e-6)
            conflicts.push({
              username: staff.username,
              name: staff.name,
              date,
              accrued: got,
              used,
              beforeDeficit,
              afterDeficit
            });
        }
      }
      if (conflicts.length) {
        const first = conflicts[0];
        // Lưu và cảnh báo, nêu tối đa config.WARN_NAMES_MAX người. Bộ máy trả lương ngày phép theo chức vụ chứ không xét số dư,
        // nên ngày phép vượt số dư vẫn được tính lương nếu Admin duyệt (public/payroll-engine.js → kind 'leave').
        const people = [...new Set(conflicts.map(c => c.username))];
        const months = [...new Set(conflicts.map(c => c.date.slice(0, 7)))].sort();
        warnIf('HOLIDAY_LEAVE_CONFLICT', true, {
          message: () =>
            `Đổi ngày lễ làm ${people.length} người thiếu phép trong tháng ${months.join(', ')} (${people.slice(0, config.WARN_NAMES_MAX).join(', ')}${people.length > config.WARN_NAMES_MAX ? ` và ${people.length - config.WARN_NAMES_MAX} người khác` : ''}): ngày phép vượt số dư vẫn được tính lương nếu được duyệt. Hãy kiểm tra lịch nghỉ của họ.`,
          details: { count: people.length, months },
          count: people.length
        });
      }
      const otConflicts = holidayOtConflicts(store.getSetting('holidays', []), clean);
      if (otConflicts.length) {
        const first = otConflicts[0],
          source = first.source === 'estimate' ? 'Lịch ước tính' : 'Check-in/out';
        const detail =
          first.reason === 'month-limit'
            ? `tháng ${first.month} có ${Math.round(first.afterHours * 100) / 100}/${first.limit} giờ làm ngày lễ + OT`
            : `ngày ${first.date} đang có ${first.source === 'estimate' ? 'giờ làm bù/OT' : 'OT chờ hoặc đã duyệt'}`;
        const people = [...new Set(otConflicts.map(c => c.username))];
        const months = [...new Set(otConflicts.map(c => (c.month || c.date).slice(0, 7)))].sort();
        warnIf('HOLIDAY_OT_CONFLICT', true, {
          message: () =>
            `Đổi ngày lễ làm giờ làm ngày lễ + OT của ${people.length} người đổi trong tháng ${months.join(', ')} (${people.slice(0, config.WARN_NAMES_MAX).join(', ')}${people.length > config.WARN_NAMES_MAX ? ` và ${people.length - config.WARN_NAMES_MAX} người khác` : ''}). Giờ làm ngày lễ trả theo hệ số ngày lễ và bộ máy không cắt theo trần: tiền của họ có thể tăng.`,
          details: { count: people.length, months },
          count: people.length
        });
      }
      const before = store.getSetting('holidays', []);
      const namesBefore = HolidayNames.read();
      store.setSetting('holidays', clean);
      const namesChanged = HolidayNames.write(namesClean);
      configRev.bump(); // số phiên bản chung, cùng giao dịch
      reconcileHolidayWork(before, clean);
      audit.write(actx, {
        action: 'holiday.set',
        entityKind: 'setting',
        entityId: 'holidays',
        before: { dates: before, ...(namesChanged ? { names: namesBefore } : {}) },
        after: { dates: clean, ...(namesChanged ? { names: namesClean } : {}) }
      });
    });
    const changedHolidays = [
      ...holidaysBefore.filter(d => !clean.includes(d)),
      ...clean.filter(d => !holidaysBefore.includes(d))
    ].sort();
    if (changedHolidays.length) announceSetting('holidays', me.username, changedHolidays[0].slice(0, 7));
    return send(res, 200, { dates: clean, names: namesClean });
  }

  /* ---------- số ước tính của chính người đăng nhập (chỉ dữ liệu của mình; ghi rõ là ước tính) ---------- */
  if (route === 'GET /me/estimate') {
    const u = need();
    const month = url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
    // Không đọc tham số user: người khác không bao giờ xem được qua route này
    return send(res, 200, periods.estimate(u, month, { rows: url.searchParams.get('rows') === '1' }));
  }
  if (route === 'GET /sheet') {
    const u = need();
    const month = url.searchParams.get('month'),
      who = (url.searchParams.get('user') || u.username).toLowerCase();
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Tài khoản ngoài bảng lương và không có quyền xem lịch (tài khoản chỉ có vai trò) xem lịch của CHÍNH MÌNH: 200 với lịch trống, không phải 403 "xem bảng của người khác"; Admin nhận bảng đầy đủ
    // (an toàn: không có dữ liệu của ai; payrollSubject false để giao diện ẩn các phần chỉ dành cho người được trả lương)
    if (who === u.username && !u.payrollSubject && !authz.can(u, 'attendance.read', { username: who }))
      return send(res, 200, {
        month,
        payrollSubject: false,
        days: {},
        attendanceSessions: [],
        otherLeave: [],
        neighbors: {},
        approvals: {},
        corrections: [],
        kpiWeights: Object.fromEntries(rulesFor(month).kpi.COMPONENTS.map(c => [c.key, c.weight])),
        kpiParts: { complete: false }
      });
    if (!authz.can(u, 'attendance.read', { username: who }))
      throw new HttpError(403, 'Không được xem bảng của người khác');
    const staff = who === u.username ? u : store.getStaff(who);
    if (staff && staff.payrollSubject) closeStale(staff);
    // otherLeave: ngày nghỉ phép năm ở các tháng khác, để giao diện tính số phép còn lại; corrections: yêu cầu điều chỉnh trong tháng
    return send(res, 200, {
      ...sheetForViewer(u, who, estimateSheet(who, month)),
      rev: store.getSheet(who, month).rev, // số lần lưu lịch khai; gửi lại làm expectedRev khi PUT /api/sheet
      ...(staff && who !== u.username ? { owner: ownerView(u, staff, month) } : {}), // hồ sơ tóm tắt người được xem (khai thay)
      attendanceSessions: sessionsFor({ username: who, month }),
      otherLeave: staff ? leaveDates(staff).filter(d => !d.startsWith(month)) : [],
      neighbors: neighborDays(who, month),
      ...schedule.scheduleView(staff, month),
      // Trọng số 5 thành phần KPI của tháng (tham số kpi.weight.*), để màn nhân viên không viết cứng
      kpiWeights: Object.fromEntries(rulesFor(month).kpi.COMPONENTS.map(c => [c.key, c.weight])),
      kpiParts: kpiPartsView(
        hasKpi(staff, monthParams(month)) && authz.can(u, 'salary.read', { username: who })
          ? store.getKpiScores(who, month)
          : null,
        month,
        u
      ),
      corrections: store.listCorrections({ username: who, month }),
      approvals: sheetApprovals(who, month, estimateSheet(who, month).days),
      // Số liệu theo tham số của tháng cho app nhân viên: số phép đến hôm nay, báo cáo trễ / về sớm / phút trừ từng ngày, bảng làm tròn phút trừ
      leaveBalance: leaveBalanceView(staff),
      actualReport: actualReportView(staff, month),
      cutRule: cutRuleView(month)
    });
  }
  if (route === 'PUT /sheet') {
    const caller = need();
    const { month, days, kpiPct, kpiAmt, user: onBehalfOf, expectedRev, confirmDays } = await readJson(req);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Admin khai lịch thay nhân sự (user khác người gọi, cần request.decide.* ở phạm vi người đó, nếu không 403): MỌI kiểm tra bên dưới chạy trên hồ sơ của người được khai
    const u = sheetOwner(caller, onBehalfOf),
      onBehalf = u !== caller;
    guardPeriod(month);
    const prevDays = estimateSheet(u.username, month).days;
    const clean = cleanDays(days);
    const { sheetParams, sched, holidays } = checkSheet({ u, month, clean, prevDays, onBehalf }); // kiểm nghiệp vụ lịch ước tính (lib/domain/sheet-checks.js)
    checkSheetLimits({ params: sheetParams, month, clean, prevDays, holidays }); // trần OT tháng = OT cộng giờ ca chính làm ngày lễ (MONTH_OT_CAP), isat.monthlyLimit
    // Khai thay không đụng vào % và mức KPI tự đánh giá của người được khai (đó là phần của họ): giữ đúng số đang lưu
    const kept = onBehalf ? store.getSheet(u.username, month) : null;
    const amt = onBehalf ? kept.kpiAmt : cleanKpiAmt(kpiAmt, u, month),
      pct = onBehalf ? kept.kpiPct : cleanKpi(kpiPct);
    // Lịch và trạng thái duyệt đổi cùng nhau hoặc không đổi gì; trạng thái duyệt chỉ do máy chủ quyết, không đọc từ yêu cầu
    let decided = [];
    const changes = store.transaction(() => {
      assertSheetRev(u.username, month, expectedRev); // lệch rev → 409 SHEET_STALE, chưa ghi gì
      store.setSheet(u.username, month, clean, pct, amt);
      const found = store.approvals.reconcile(
        u.username,
        month,
        store.approvals.declaredItems(clean, { holidays: [...holidays], staffType: u.type, schedule: sched })
      );
      if (onBehalf)
        decided = approveOnBehalf({ caller, owner: u, month, found, prevDays, clean, actx, confirmDays }).decided;
      return found;
    });
    if (changes.added.length || changes.reset.length || changes.resubmitted.length || changes.removed.length)
      events.emit.approvalsChanged(month);
    if (onBehalf) {
      events.emit.estimateChanged(u.username, month); // máy của người được khai nạp lại lịch
      if (decided.length) events.emit.requestsDecided(decided);
    }
    return send(res, 200, {
      ok: true,
      rev: store.getSheet(u.username, month).rev, // gửi lại làm expectedRev ở lần lưu sau
      approvals: sheetApprovals(u.username, month, estimateSheet(u.username, month).days),
      reset: changes.reset,
      resubmitted: changes.resubmitted,
      removed: changes.removed,
      ...(onBehalf ? { onBehalf: true, autoApproved: decided.length } : {})
    });
  }
  // Admin chấm công thay hàng loạt: tất cả hoặc không (lib/domain/sheet-bulk.js)
  if (route === 'PUT /sheet/bulk') {
    const caller = needAdmin();
    const plan = sheetBulk.plan(caller, await readJson(req));
    guardPeriod(plan.month);
    return send(res, 200, sheetBulk.save({ caller, actx, plan, cleanDays }));
  }

  /* ---------- KPI 5 thành phần: Admin nhập điểm ---------- */
  if (route === 'GET /kpi/scores') {
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const KpiScore = rulesFor(month).kpi;
    const kpiParams = monthParams(month),
      rows = new Map(store.listKpiScores(month).map(row => [row.username, row]));
    return send(res, 200, {
      month,
      method: 'five',
      weights: Object.fromEntries(KpiScore.COMPONENTS.map(c => [c.key, c.weight])),
      items: store
        .listStaff()
        .filter(staff => hasKpi(staff, kpiParams))
        .map(staff => kpiScoreItem(staff, month, rows.get(staff.username) || null, kpiParams))
    });
  }
  if (route === 'PUT /kpi/scores') {
    const actor = need();
    const body = await readJson(req);
    const { month, scores, amt, reason } = body;
    const user = body.user !== undefined ? body.user : body.username; // nhận cả user lẫn username
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Nhân sự không có kpi.score.write ở phạm vi all chỉ lưu được điểm `self` của chính mình (bỏ trống user = chính mình)
    const full = authz.scopeOf(me, 'kpi.score.write') === 'all';
    const wanted = user === undefined && !full ? me.username : typeof user === 'string' ? user.toLowerCase() : '';
    if (!full) selfScoreOnly(me, wanted, scores, amt);
    if (!USERNAME_RE.test(wanted)) throw new HttpError(400, 'user không hợp lệ');
    const target = store.getStaff(wanted);
    if (!target) throw new HttpError(404, 'Không có nhân sự này');
    if (!hasKpi(target, monthParams(month))) throw new HttpError(400, 'Nhân sự này không có KPI');
    // Người có quyền đầy đủ tự nhập điểm self của mình cũng là việc của chính chủ, không phải tự quyết định điểm của người khác
    const ownSelfEntry =
      target.username === me.username && amt === undefined && Object.keys(scores || {}).join() === 'self';
    if (!ownSelfEntry)
      selfDecision(authz.isSelfDecision(me, target.username), {
        doing: 'nhập điểm KPI'
      });
    guardPeriod(month);
    const KpiScore = rulesFor(month).kpi;
    warnIf('KPI_MONTH_FUTURE', month > vnToday().slice(0, 7), {
      message: `Tháng ${month} chưa bắt đầu: điểm KPI nhập trước được lưu và dùng khi tháng đó tính lương; nếu đánh giá đổi, cần nhập lại trước khi chốt.`
    });
    // Mọi giá trị được kiểm xong rồi mới ghi: một giá trị sai thì không lưu gì. Điểm sai bị từ chối, không kẹp.
    const patch = {};
    if (scores !== undefined) {
      if (!scores || typeof scores !== 'object' || Array.isArray(scores))
        throw new HttpError(400, 'scores phải là đối tượng { wework, user, peer, manager, self }');
      const keys = KpiScore.COMPONENTS.map(c => c.key);
      for (const [key, value] of Object.entries(scores)) {
        if (!keys.includes(key))
          throw new HttpError(400, `Không có thành phần KPI "${key.slice(0, 40)}" (chỉ nhận ${keys.join(', ')})`);
        if (value === undefined) continue;
        const checked = KpiScore.checkScore(value);
        if (!checked.ok) throw new HttpError(400, `Điểm ${key}: ${checked.error}`);
        patch[key] = checked.value === null ? null : KpiScore.toUnits(checked.value);
      }
    }
    if (amt !== undefined) {
      if (amt !== null && (typeof amt !== 'number' || !Number.isFinite(amt)))
        throw new HttpError(400, 'Lương KPI phải là số không âm');
      patch.amt = cleanKpiAmt(amt, target, month); // không âm, không vượt trần level
    }
    if (reason != null && typeof reason !== 'string') throw new HttpError(400, 'Lý do phải là chữ');
    const note = (reason || '').trim();
    if (note.length > NOTE_MAX) throw new HttpError(400, `Lý do tối đa ${NOTE_MAX} ký tự`);
    if (!Object.keys(patch).length) throw new HttpError(400, 'Không có điểm hoặc mức KPI nào để lưu');
    let result;
    try {
      result = store.transaction(() => {
        const saved = store.setKpiScores(target.username, month, patch, actor.username, note || null);
        // Giá trị điểm nằm ở kpi_score_log (từng ô, cũ, mới); nhật ký hệ thống chỉ ghi ô nào đổi
        if (saved.changed.length)
          audit.write(actx, {
            action: 'kpi.score',
            entityKind: 'kpi',
            entityId: `${target.username}:${month}`,
            subject: target.username,
            month,
            after: { changed: saved.changed },
            reason: note || null,
            sensitivity: 'pay'
          });
        return saved;
      });
    } catch (error) {
      throw kpiHttpError(error);
    }
    if (result.changed.length) events.emit.estimateChanged(target.username, month);
    // Nhân sự tự nhập điểm self chỉ nhận lại phần của mình, không nhận dòng điểm đầy đủ (điểm các thành phần khác chưa lộ)
    if (!full)
      return send(res, 200, {
        ok: true,
        changed: result.changed,
        kpiParts: kpiPartsView(result.item, month, me)
      });
    return send(res, 200, {
      ok: true,
      item: kpiScoreItem(target, month, result.item),
      changed: result.changed
    });
  }
  /* ---------- Admin duyệt khoản tự khai trong Lịch ước tính (iSAT, nghỉ được duyệt, OT, làm bù) ---------- */
  // Quyền duyệt TỪNG khoản: nhóm duyệt = loại khoản (request.decide.<khoản>), kèm phạm vi dữ liệu của vai trò (nhóm mình: chỉ chính mình cho tới khi có
  // bảng phân công). Cổng ROUTE_CAPS chỉ hỏi "có ít nhất một nhóm".
  const canDecideRow = row => authz.can(me, `request.decide.${row.item}`, { username: row.username });
  if (route === 'GET /approvals') {
    needAdmin();
    const status = url.searchParams.get('status') || 'pending',
      month = url.searchParams.get('month') || undefined,
      user = url.searchParams.get('user')?.toLowerCase() || undefined;
    if (!['pending', 'approved', 'rejected', 'all'].includes(status))
      throw new HttpError(400, 'status phải là pending, approved, rejected hoặc all');
    if (month && !validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    if (user && !USERNAME_RE.test(user)) throw new HttpError(400, 'user không hợp lệ');
    const paging = (key, fallback, min, max) => {
      const raw = url.searchParams.get(key);
      if (raw === null) return fallback;
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max)
        throw new HttpError(400, `${key} phải là số nguyên từ ${min} đến ${max}`);
      return value;
    };
    const limit = paging('limit', 200, 1, 500),
      offset = paging('offset', 0, 0, Number.MAX_SAFE_INTEGER);
    const rows = listApprovals({ month, username: user }).filter(canDecideRow);
    const picked = rows
      .filter(row => status === 'all' || row.status === status)
      .sort((a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date))
      .slice(offset, offset + limit);
    const sheets = {};
    const lockedNames = new Set(
      store
        .listStaff()
        .filter(s => s.locked)
        .map(s => s.username)
    );
    const items = picked.map(row => {
      const sheetMonth = row.date.slice(0, 7),
        key = `${row.username}|${sheetMonth}`;
      if (!sheets[key]) {
        const sheet = estimateSheet(row.username, sheetMonth);
        sheets[key] = {
          ...sheetForViewer(me, row.username, sheet),
          approvals: sheetApprovals(row.username, sheetMonth, sheet.days)
        };
      }
      const day = sheets[key].days[row.date] || {};
      return {
        ...row,
        // Nhân sự bị khoá vẫn có khoản trong hàng chờ (Admin có thể còn phải chốt lương lần cuối), có đánh dấu
        ...(lockedNames.has(row.username) ? { locked: true } : {}),
        declared: {
          kind: day.kind || '',
          in: day.in || '',
          out: day.out || '',
          extraKind: day.extraKind || (day.extraOut ? 'makeup' : ''),
          extraIn: day.extraIn || '',
          extraOut: day.extraOut || '',
          ...(day.punchNote ? { punchNote: day.punchNote } : {}),
          ...(Array.isArray(day.makeupPlans) ? { makeupPlans: day.makeupPlans } : {}),
          ...(day.makeupDate ? { makeupDate: day.makeupDate } : {})
        }
      };
    });
    // limits: để màn duyệt cắt lô và đặt độ dài ô lý do theo đúng số của máy chủ, không chép tay
    const limits = { decideMax: rulesFor().params['system.approval.maxDecideItems'], noteMax: NOTE_MAX };
    return send(res, 200, { items, counts: tallyApprovals(rows), sheets, limits });
  }
  if (route === 'GET /approvals/count') {
    needAdmin();
    return send(res, 200, {
      pending: tallyApprovals(listApprovals({ status: 'pending' }).filter(canDecideRow)).pending
    });
  }
  // Việc Admin cần xử lý trong tháng, để giao diện hiện huy hiệu: quên Check-in/out, ngày vắng chưa có giải trình và số khoản chờ duyệt (mọi tháng, như /approvals/count).
  if (route === 'GET /alerts') {
    needAdmin();
    const month = url.searchParams.get('month');
    if (month === null)
      throw new HttpError(400, 'Thiếu month: gọi /api/alerts?month=YYYY-MM', { code: 'MONTH_REQUIRED' });
    if (!validMonth(month))
      throw new HttpError(400, `month "${month.slice(0, 12)}" không hợp lệ: phải dạng YYYY-MM`, { code: 'BAD_MONTH' });
    const holidays = store.getSetting('holidays', []),
      found = new Map(),
      absentFound = [];
    const explained = explanations.explainedByUser(month); // ngày đã có giải trình (mọi trạng thái): không còn là ngày vắng chưa ai xử lý
    const ActualHours = rulesFor(month).actualHours;
    // Quên Check-in/out là việc sửa chấm công: chỉ người có attendance.correct, và chỉ người trong phạm vi của mình
    const watched = store
      .listStaff()
      .filter(s => s.payrollSubject && authz.can(me, 'attendance.correct', { username: s.username }));
    closeStaleFor(watched); // lượt mở quá 16 giờ được đóng thành "quên check-out" trước khi đếm (chỉ người đang có lượt mở)
    for (const staff of watched) {
      const add = (date, kind) =>
        found.set(`${staff.username}|${date}|${kind}`, { username: staff.username, name: staff.name, date, kind });
      const sessions = store.listSessions({ username: staff.username, month });
      for (const x of sessions)
        if (x.entry.kind === 'pending' && x.entry.reason === 'forgot-out') add(x.date, 'forgot-out');
      // Thêm các ngày thiếu giờ vào / giờ ra mà ActualHours.apply chờ Admin xử lý (cùng cách dựng với GET /team)
      {
        // quy tắc của đúng tháng, lịch của người như checklist kỳ và bộ máy
        const { report, absent } = rulesFor(month).actualHours.apply(
          estimateSheet(staff.username, month).days,
          sessions,
          {
            asOf: nowIso(),
            staff,
            holidays,
            month
          }
        );
        for (const [date, r] of Object.entries(report))
          if (r.state === 'forgot-in' || r.state === 'forgot-out') add(date, r.state);
        // Ngày trong lịch không có lượt nào mà chưa ai giải trình: tính vắng, 0 công
        for (const date of absent)
          if (date.startsWith(month + '-') && !(explained.get(staff.username) || new Set()).has(date))
            absentFound.push({ username: staff.username, name: staff.name, date });
      }
    }
    const missingPunches = [...found.values()].sort(
      (a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)
    );
    const absentNoExplanation = absentFound.sort(
      (a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date)
    );
    return send(res, 200, {
      missingPunches,
      absentNoExplanation,
      pendingApprovals: tallyApprovals(listApprovals({ status: 'pending' }).filter(canDecideRow)).pending
    });
  }
  if (route === 'PUT /approvals/decide') {
    const admin = needAdmin(),
      b = await readJson(req);
    if (!['approve', 'reject'].includes(b.action)) throw new HttpError(400, 'action phải là approve hoặc reject');
    if (b.note != null && typeof b.note !== 'string') throw new HttpError(400, 'Lý do phải là chữ');
    const note = (b.note || '').trim();
    if (note.length > NOTE_MAX) throw new HttpError(400, `Lý do tối đa ${NOTE_MAX} ký tự`);
    const decideMax = rulesFor().params['system.approval.maxDecideItems'];
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > decideMax)
      throw new HttpError(400, `Chọn từ 1 đến ${decideMax} khoản để duyệt`);
    const seen = new Set();
    const items = b.items.map(item => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.username !== 'string' ||
        !USERNAME_RE.test(item.username) ||
        !validDate(item.date) ||
        !Number.isInteger(item.rev) ||
        typeof item.fingerprint !== 'string' ||
        !item.fingerprint
      )
        throw new HttpError(
          400,
          'Mỗi khoản cần tên đăng nhập, ngày hợp lệ, số phiên bản (rev) là số nguyên và dấu vân tay (fingerprint) Admin đã thấy'
        );
      const key = `${item.username}|${item.date}`;
      if (seen.has(key)) throw new HttpError(400, `Khoản ngày ${item.date} bị chọn hai lần`);
      seen.add(key);
      const decidee = store.getStaff(item.username);
      if (decidee && !decidee.payrollSubject)
        throw new HttpError(400, 'Tài khoản này không thuộc bảng lương nên không có khoản cần duyệt');
      return { username: item.username, date: item.date, rev: item.rev, fingerprint: item.fingerprint };
    });
    guardPeriod(items.map(item => item.date));
    // Từng khoản phải thuộc nhóm duyệt và phạm vi của người duyệt; một khoản không đủ quyền thì cả lô bị từ chối và không lưu gì
    for (const item of items) {
      const stored = store.approvals.get(item.username, item.date);
      if (stored && !canDecideRow(stored))
        throw new HttpError(
          403,
          `Bạn không có quyền duyệt khoản "${stored.item}" của ${item.username} ngày ${item.date}`,
          { code: 'FORBIDDEN_CAP', cap: `request.decide.${stored.item}` }
        );
    }
    // Duyệt khoản iSAT kiểm lại thứ trong tuần và quyền lợi của chức vụ (chặn cứng); từ chối luôn được
    if (b.action === 'approve')
      for (const item of items) {
        const stored = store.approvals.get(item.username, item.date),
          owner = store.getStaff(item.username);
        if (!stored || stored.item !== 'isat' || !owner) continue;
        const refusal = isatRefusal({ params: rulesFor(item.date.slice(0, 7)).params, staff: owner, date: item.date });
        if (refusal)
          throw new HttpError(400, `${item.username}: ${refusal.message}`, { code: refusal.code, date: item.date });
      }
    // AI chặn (khác các cảnh báo): chỉ khi duyệt và công tắc Agents bật; Từ chối luôn được
    if (b.action === 'approve') assertNotAiBlocked(items);
    try {
      const decided = store.transaction(() => {
        const rows = store.approvals.decide(
          items,
          b.action === 'approve' ? 'approved' : 'rejected',
          admin.username,
          note
        );
        // Một dòng cho mỗi khoản (lọc được theo người và tháng); request_id nối các dòng của cùng một lần bấm
        for (const row of rows)
          audit.write(actx, {
            action: 'approval.decide',
            entityKind: 'sheet_approval',
            entityId: `${row.username}:${row.date}`,
            subject: row.username,
            month: row.date.slice(0, 7),
            after: { status: row.status, rev: row.rev },
            reason: note || null
          });
        return rows;
      });
      for (const decidedMonth of new Set(decided.map(row => row.date.slice(0, 7))))
        events.emit.approvalsChanged(decidedMonth);
      events.emit.requestsDecided(decided);
      return send(res, 200, { ok: true, decided: decided.length, items: decided });
    } catch (error) {
      throw approvalHttpError(error);
    }
  }
  /* ---------- Admin sửa số trên phiếu lương (chỉ Admin đọc / ghi; nhân sự luôn thấy số tự tính) ---------- */
  if (route === 'GET /slip-override' || route === 'PUT /slip-override') {
    const admin = needAdmin(),
      b = req.method === 'PUT' ? await readJson(req) : null;
    const who = String((b ? b.user : url.searchParams.get('user')) || '').toLowerCase(),
      month = b ? b.month : url.searchParams.get('month');
    if (!store.getStaff(who)) throw new HttpError(404, 'Không có nhân sự này');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    if (b) {
      guardPeriod(month);
      selfDecision(authz.isSelfDecision(me, who), {
        doing: 'sửa số trên phiếu lương'
      });
      if (!b.values || typeof b.values !== 'object' || Array.isArray(b.values))
        throw new HttpError(400, 'values phải là object');
      const clean = {};
      for (const [k, v] of Object.entries(b.values)) {
        const money = SLIP_MONEY.includes(k);
        if (!money && !SLIP_QTY.includes(k)) throw new HttpError(400, `Không sửa được mục ${k}`);
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `Giá trị ${k} phải là số`);
        if (money ? v < 0 || v > 1e11 : Math.abs(v) > 1e4) throw new HttpError(400, `Giá trị ${k} ngoài giới hạn`);
        clean[k] = money ? Math.round(v) : Math.round(v * 100) / 100;
      }
      // Lý do không bắt buộc (quá ${config.REASON_MAX} ký tự là 400)
      const reason =
        warnings.optionalReason(b.reason, { tooLong: `Lý do sửa số phiếu tối đa ${config.REASON_MAX} ký tự` }) || null;
      // expectedRev (tuỳ chọn): số lần lưu Admin đã thấy; lệch thì store ném SLIP_STALE (409) và không ghi gì
      const opts = {};
      if (b.expectedRev !== undefined) {
        if (!Number.isInteger(b.expectedRev) || b.expectedRev < 0)
          throw new HttpError(400, 'expectedRev phải là số nguyên không âm');
        opts.expectedRev = b.expectedRev;
      }
      store.transaction(() => {
        const prior = store.getSlipOverride(who, month).values;
        store.setSlipOverride(who, month, clean, admin.username, reason, opts);
        audit.slipOverride(actx, who, month, prior, clean, reason);
      });
    }
    return send(res, 200, store.getSlipOverride(who, month));
  }
  /* ---------- check-in / check-out: mỗi lần ghi nhắm đúng một phiên ---------- */
  if (route === 'GET /punch') {
    const u = need();
    if (!u.payrollSubject)
      return send(res, 200, {
        enabled: false,
        canCheckIn: false,
        openSession: null,
        lastSession: null,
        serverNow: nowIso()
      });
    closeStale(u);
    return send(res, 200, { ...punchState(u), ...punchExtras(u) });
  }
  if (route === 'POST /punch') {
    const u = need();
    if (!u.payrollSubject)
      throw new HttpError(
        403,
        u.role === 'admin' ? 'Admin không chấm công' : 'Tài khoản không thuộc bảng lương không chấm công'
      );
    const punch = rulesFor().punch;
    const b = await readJson(req),
      { type, requestId, sessionId } = b;
    if (!['in', 'out'].includes(type) || typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))
      throw new HttpError(400, 'Cần loại thao tác và requestId hợp lệ');
    if (type === 'out' && !positiveId(sessionId)) throw new HttpError(400, 'Cần ID lượt Check-out');
    const operation = JSON.stringify({ type, sessionId: type === 'out' ? sessionId : null });
    const response = store.transaction(() => {
      const prior = store.getPunchRequest(u.username, requestId);
      if (prior) {
        if (prior.operation !== operation) throw new HttpError(409, 'requestId đã dùng cho thao tác khác');
        return JSON.parse(prior.response_json);
      }
      closeStale(u);
      const t = nowIso();
      let session;
      if (type === 'in') {
        const outsideZone = checkGeofence(b.location); // chỉ Check-in cần vị trí; Check-out thì không. outsideZone: cờ ngoài vùng, chỉ true/false, không toạ độ
        if (store.openSession(u.username)) throw new HttpError(409, 'Bạn đang có lượt mở — Check-out trước');
        const opened = punch.openSessionDay(punchStaff(u), t);
        const verdict = checkInVerdict(u, t); // không có lịch / khoản được duyệt, hay ngoài khung ca mà không khoản nào phủ giờ này: không ghi gì
        if (!verdict.allowed) throw new HttpError(409, verdict.message, { code: verdict.code });
        guardPeriod(opened.date); // ca đêm thuộc ngày bắt đầu ca
        if (outsideZone) opened.entry.outsideZone = true;
        const overlap = sessionOverlap(u.username, t, new Date(Date.parse(t) + 1).toISOString());
        if (overlap) throw new HttpError(400, overlap);
        // Check-in không hợp lệ (trễ, ngoài ca, ngoài vùng GPS, lượt thứ hai trong ca) phải có giải trình gửi kèm (b.explanation)
        const inCases = container.punchExplanation.casesIn(u.username, opened);
        container.punchExplanation.demand('in', inCases, b.explanation);
        session = store.createSession(u.username, opened.date, 'open', opened.entry);
        store.addPunch(
          u.username,
          t,
          'in',
          clientIp(req),
          false,
          { plannedShift: opened.entry.plannedShift || null },
          session.id
        );
        if (inCases.length)
          container.punchExplanation.record({
            side: 'in',
            username: u.username,
            session,
            cases: inCases,
            text: b.explanation,
            actx
          });
      } else {
        session = store.getSession(sessionId);
        if (!session || session.username !== u.username) throw new HttpError(404, 'Không có lượt chấm công này');
        if (session.state !== 'open') throw new HttpError(409, 'Lượt này đã Check-out');
        guardPeriod(session.date);
        if (Date.parse(t) < Date.parse(session.entry.presIn))
          throw new HttpError(400, 'Giờ Check-out không thể trước giờ vào');
        // Check-out muộn hơn giờ kết thúc ca (cộng phần làm thêm đã khai) quá CHECKOUT_GRACE_MIN phút (check-out muộn chỉ có
        // hiệu lực khi Admin duyệt giải trình): giải trình gửi kèm (b.explanation), lượt thành "Quên Check-out" và giữ giờ bấm chờ Admin duyệt
        const sheetDay = estimateSheet(u.username, session.date.slice(0, 7)).days[session.date];
        const late = { staff: u, session, at: t, ip: clientIp(req), text: b.explanation, actx };
        if (explanations.needsExplanation(session, t, sheetDay))
          session = container.lateCheckout.record({
            ...late,
            lateMin: explanations.lateCheckoutMin(session, t, sheetDay)
          });
        else {
          // Check-out sớm (không phải muộn): cũng phải có giải trình gửi kèm; giờ bấm vẫn là giờ ra của lượt
          const outCases = container.punchExplanation.casesOut({ staff: u, session, at: t, sheetDay });
          container.punchExplanation.demand(
            'out',
            outCases,
            b.explanation,
            outCases.length ? { preview: checkoutPreview(u) } : {}
          );
          session = container.lateCheckout.checkOut(late);
          if (outCases.length)
            container.punchExplanation.record({
              side: 'out',
              username: u.username,
              session,
              cases: outCases,
              text: b.explanation,
              actx
            });
        }
      }
      hintPunch(u.username, session.date); // báo Admin và máy khác của chính người này sau khi yêu cầu xong (ca đêm thuộc ngày bắt đầu)
      const response = punchState(u);
      store.savePunchRequest(u.username, requestId, operation, session.id, response);
      return response;
    });
    // serverNow lấy lúc gửi (không lưu trong bản phát lại theo requestId, nếu không máy khách sẽ nhận giờ cũ)
    return send(res, 200, { ...response, ...punchExtras(u) });
  }
  if (route === 'GET /ot') {
    needAdmin();
    const status = url.searchParams.get('status');
    return send(res, 200, { ot: listOt(['approved', 'rejected'].includes(status) ? status : 'pending') });
  }
  if (route === 'POST /ot') {
    const admin = needAdmin(),
      b = await readJson(req);
    const result = store.transaction(() => {
      if (!positiveId(b.sessionId)) throw new HttpError(400, 'Cần chọn lượt chấm công');
      const session = store.getSession(b.sessionId);
      if (!session) throw new HttpError(404, 'Không có lượt chấm công này');
      correctionVersion(session, b.version);
      const staff = store.getStaff(session.username);
      if (!staff || !staff.payrollSubject) throw new HttpError(400, 'Không có nhân sự tương ứng');
      guardPeriod(session.date);
      const reason = String(b.reason || '')
        .trim()
        .slice(0, 300);
      const entry = validateOtDeclaration(staff, session, b),
        old = session.entry;
      if (old.extraKind === 'ot') {
        entry.otDeclarationHistory = [
          ...(old.otDeclarationHistory || []),
          {
            extraIn: old.extraIn || '',
            extraOut: old.extraOut || '',
            declaration: old.otDeclaration || null,
            review: old.otReview || null,
            changedBy: admin.username,
            changedAt: nowIso()
          }
        ];
        if (old.otReview) entry.otHistory = [...(old.otHistory || []), old.otReview];
      }
      delete entry.otReview;
      entry.otDeclaration = { by: admin.username, at: nowIso(), reason };
      entry.otNeedsReview = true;
      const updated = store.updateSession(session.id, session.version, {
        date: session.date,
        state: session.state,
        entry
      });
      if (!updated) throw new HttpError(409, 'Lượt chấm công đã thay đổi — tải lại trước khi khai OT');
      audit.write(actx, {
        action: 'ot.declare',
        entityKind: 'attendance_session',
        entityId: String(updated.id),
        subject: session.username,
        month: session.date.slice(0, 7),
        reason
      });
      return { ok: true, sessionId: updated.id, sessionVersion: updated.version };
    });
    {
      const declared = store.getSession(result.sessionId);
      if (declared) events.emit.attendanceChanged('ot', declared.date.slice(0, 7));
    }
    return send(res, 200, result);
  }
  if (route === 'PUT /ot') {
    const admin = needAdmin(),
      b = await readJson(req);
    let otSession = null,
      onSheet = false;
    store.transaction(() => {
      if (!positiveId(b.sessionId)) throw new HttpError(400, 'Cần chọn lượt OT');
      const session = store.getSession(b.sessionId);
      if (!session || session.entry.extraKind !== 'ot') throw new HttpError(404, 'Lượt này không có OT');
      otSession = { username: session.username, date: session.date };
      correctionVersion(session, b.version);
      if (session.state === 'open') throw new HttpError(409, 'Lượt này đang mở');
      guardPeriod(session.date);
      selfDecision(authz.isSelfDecision(me, session.username), {
        doing: 'duyệt OT'
      });
      if (session.entry.otReview) throw new HttpError(409, 'OT lượt này đã được xử lý');
      if (!['approve', 'reject'].includes(b.action)) throw new HttpError(400, 'action phải là approve hoặc reject');
      const note = String(b.note || '')
        .trim()
        .slice(0, 300);
      if (b.action === 'approve') {
        if (session.entry.otDeclaration)
          validateOtDeclaration(store.getStaff(session.username), session, session.entry);
        else {
          const err = rulesFor(session.date.slice(0, 7)).punch.extraFits(session.entry);
          warnIf('OT_OUTSIDE_PRESENCE', !!err, {
            message: () => `${err}: bộ máy chỉ trả phần giờ có mặt liền với ca (không trả quá giờ đã chấm công).`
          });
        }
      }
      const entry = {
        ...session.entry,
        otNeedsReview: false,
        otReview: { ok: b.action === 'approve', by: admin.username, at: nowIso(), ...(note ? { note } : {}) }
      };
      store.updateSession(session.id, session.version, { date: session.date, state: session.state, entry });
      // OT được duyệt thành OT đã duyệt của ngày trên Lịch ước tính (nguồn tiền OT của bộ máy)
      if (b.action === 'approve')
        onSheet = otSheet.payOnSheet({ session, staff: store.getStaff(session.username), by: admin.username });
      audit.write(actx, {
        action: 'ot.decide',
        entityKind: 'attendance_session',
        entityId: String(session.id),
        subject: session.username,
        month: session.date.slice(0, 7),
        after: { status: b.action === 'approve' ? 'approved' : 'rejected' },
        reason: note || null
      });
    });
    events.emit.punchCorrected(otSession.username, otSession.date);
    events.emit.attendanceChanged('ot', otSession.date.slice(0, 7));
    if (onSheet) {
      events.emit.approvalsChanged(otSession.date.slice(0, 7));
      events.emit.estimateChanged(otSession.username, otSession.date.slice(0, 7));
    }
    return send(res, 200, { ok: true });
  }
  if (route === 'GET /ai/review') {
    needAdmin();
    agents.assertEnabled();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Thêm vào kết quả kiểm tra trực tiếp: trạng thái kỳ và từng phát hiện đã được bỏ qua chưa (by, at, note chỉ cho người có ai.review.read, cũng là cổng của route này)
    const review = aiReviewResultCached(month, url.searchParams.get('impacts') === '1');
    return send(res, 200, {
      ...review,
      findings: findings.annotate(month, review.findings),
      period: { status: store.periods.get(month).status }
    });
  }
  if (route === 'POST /ai/findings' && seg[3] === 'dismiss') {
    const admin = needAdmin();
    agents.assertEnabled();
    const b = await readJson(req);
    if (!validMonth(b.month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const dismissed = findings.dismiss(
      { month: b.month, username: b.username, rule: b.rule, reason: b.reason, by: admin.username },
      actx
    );
    return send(res, 200, dismissed);
  }
  if (route === 'GET /events') {
    const listener = need(); // mọi người đã đăng nhập; luồng này chỉ gợi ý nạp lại, không mang dữ liệu
    return events.handleSse(req, res, listener);
  }
  if (route === 'GET /today') {
    needAdmin();
    const { punch, actualHours: ActualHours } = rulesFor();
    const today = punch.vnDate(nowIso());
    const people = store.listStaff().filter(s => s.payrollSubject);
    closeStaleFor(people);
    const rows = people.map(staff => {
      const sessions = store.listSessions({ username: staff.username }),
        open = store.openSession(staff.username);
      const todaySessions = sessions.filter(
        s =>
          s.state === 'open' ||
          s.date === today ||
          (s.entry.presOut && punch.vnDate(s.entry.presOut) === today) ||
          (s.entry.kind === 'pending' &&
            s.entry.reason === 'forgot-out' &&
            s.entry.presIn &&
            punch.forgotOutDate(s.entry.presIn) === today)
      );
      const latest = todaySessions
          .slice()
          .sort(
            (a, b) =>
              (Date.parse(a.entry.presOut || a.entry.presIn) || 0) -
                (Date.parse(b.entry.presOut || b.entry.presIn) || 0) || a.id - b.id
          )
          .at(-1),
        session = open || latest,
        day = session?.entry;
      return {
        username: staff.username,
        name: staff.name,
        type: staff.type,
        shiftCode: staff.shiftCode,
        date: session?.date || today,
        sessionId: session?.id || null,
        sessionCount: todaySessions.length,
        plannedShift: day?.plannedShift || null,
        presIn: day?.presIn || null,
        presOut: day?.presOut || null,
        open: !!open,
        in: day?.presIn ? punch.vnTime(day.presIn) : null,
        out: !open && day?.presOut ? punch.vnTime(day.presOut) : null,
        // cùng luật làm tròn với tính lương (phút làm việc, bỏ giờ nghỉ); chỉ để hiển thị
        late: day?.plannedShift && day?.presIn ? ActualHours.lateMinutes(day.plannedShift, day.presIn) : 0,
        kind: day?.kind || null,
        reason: day?.reason || null,
        session: session || null
      };
    });
    // Trạng thái hiển thị của lượt được chọn (lib/domain/attendance/session-status.js), nạp lô một lần cho mọi người; không có lượt thì null
    const shown = new Map(sessionsWithHistory(rows.filter(r => r.session).map(r => r.session)).map(s => [s.id, s]));
    for (const row of rows) {
      const s = row.session && shown.get(row.session.id);
      delete row.session;
      row.status = s ? s.status : null;
      row.statusNote = s ? s.statusNote : '';
    }
    return send(res, 200, { today, rows });
  }
  if (route === 'GET /attendance') {
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const staff = store.listStaff(),
      names = Object.fromEntries(staff.map(s => [s.username, s.name])),
      types = Object.fromEntries(staff.map(s => [s.username, s.type]));
    closeStaleFor(staff.filter(s => s.payrollSubject));
    return send(res, 200, {
      month,
      rows: sessionsFor({ month }).map(s => ({ ...s, name: names[s.username] || s.username, type: types[s.username] }))
    });
  }
  if (route === 'GET /settings/agents') {
    needAdmin();
    return send(res, 200, { enabled: agents.enabled() });
  }
  if (route === 'PUT /settings/agents') {
    const admin = needAdmin(),
      b = await readJson(req);
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'enabled phải là true hoặc false');
    const was = agents.enabled();
    if (b.enabled !== was)
      store.transaction(() => {
        agents.set(b.enabled);
        configRev.bump(); // số phiên bản chung, cùng giao dịch
        audit.write(actx, {
          action: 'setting.agents',
          entityKind: 'setting',
          entityId: agents.SETTING_KEY,
          before: { enabled: was },
          after: { enabled: b.enabled },
          sensitivity: 'pay'
        });
      });
    if (b.enabled !== was) announceSetting('agents', admin.username);
    return send(res, 200, { enabled: agents.enabled() });
  }
  if (route === 'PUT /settings/geofence') {
    needAdmin();
    const b = await readJson(req, true);
    // Tắt phải nói rõ: null (hoặc { geofence: null }). Thân rỗng hay thiếu trường không được ngầm hiểu là tắt.
    const off = b === null || (Object.keys(b).length === 1 && b.geofence === null);
    const next = off ? null : cleanGeofence(b);
    store.transaction(() => {
      const was = store.getSetting('geofence', null);
      store.setSetting('geofence', next);
      configRev.bump(); // số phiên bản chung, cùng giao dịch
      // Chỉ ghi bật/tắt và bán kính; KHÔNG ghi toạ độ
      const view = fence => ({ enabled: !!fence, ...(fence ? { radiusM: fence.radiusM } : {}) });
      audit.write(actx, {
        action: 'setting.geofence',
        entityKind: 'setting',
        entityId: 'geofence',
        before: view(was),
        after: { ...view(next), centreChanged: !!next && (!was || was.lat !== next.lat || was.lng !== next.lng) }
      });
    });
    announceSetting('geofence', me.username);
    return send(res, 200, { geofence: next });
  }
  if (route === 'GET /staff') {
    needAdmin();
    const listParams = monthParams();
    return send(res, 200, {
      staff: store.listStaff().map(s => staffForViewer(me, s.payrollSubject ? withLeave(listParams, s) : s))
    });
  }
  if (route === 'GET /team') {
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const kpiRows = new Map(store.listKpiScores(month).map(row => [row.username, row]));
    const teamParams = monthParams(month);
    const teamSchedule = schedule.team(month); // lịch của từng loại nhân sự
    const people = store.listStaff().filter(s => s.payrollSubject);
    closeStaleFor(people);
    // Lượt chấm công của cả tháng nạp MỘT lần (kèm lượt bấm và điều chỉnh), rồi chia theo người
    const sessionsOf = new Map();
    for (const session of sessionsFor({ month })) {
      if (!sessionsOf.has(session.username)) sessionsOf.set(session.username, []);
      sessionsOf.get(session.username).push(session);
    }
    const rows = people.map(s => {
      const sh = estimateSheet(s.username, month),
        attendanceSessions = sessionsOf.get(s.username) || [],
        approvals = sheetApprovals(s.username, month, sh.days);
      return {
        staff: staffForViewer(me, withLeave(teamParams, s)),
        ...sheetForViewer(me, s.username, sh),
        approvals,
        kpiParts: kpiPartsView(
          hasKpi(s, teamParams) && authz.can(me, 'salary.read', { username: s.username })
            ? kpiRows.get(s.username)
            : null,
          month,
          me
        ),
        pendingApprovals: Object.values(approvals).filter(x => x.status === 'pending').length,
        attendanceSessions,
        pendingDays: attendanceSessions.filter(s => s.entry.kind === 'pending' && s.entry.reason !== 'open').length,
        pendingOt: attendanceSessions.filter(s => s.entry.extraKind === 'ot' && !s.entry.otReview).length
      };
    });
    return send(res, 200, {
      month,
      rows,
      schedules: teamSchedule.schedules,
      holidays: store.getSetting('holidays', [])
    });
  }
  /* ---------- tham số tính lương: màn Cài đặt dựng từ registry ---------- */
  if (route === 'GET /settings/params' || route === 'GET /settings/first-run') {
    need(); // năng lực config.read đã kiểm ở cổng ROUTE_CAPS
    const month = url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
    if (route === 'GET /settings/first-run') return send(res, 200, paramsStore.firstRun(month));
    const groupText = url.searchParams.get('group');
    const group = groupText === null ? undefined : Number(groupText);
    if (group !== undefined && !Number.isInteger(group)) throw new HttpError(400, 'group phải là số nguyên');
    return send(res, 200, paramsStore.view(month, { group }));
  }
  if (route === 'GET /settings/version') {
    need();
    return send(res, 200, configRev.info());
  }
  if (seg[1] === 'settings' && seg[2] === 'params' && req.method !== 'GET') {
    need(); // cổng config.read đã kiểm ở ROUTE_CAPS; năng lực sửa từng khoá kiểm trong lib/params/save.js
    const b = await readJson(req);
    if (req.method === 'PUT' && seg.length === 3) {
      const saved = paramsSave.save(me, actx, b);
      if (saved.notice) events.emit.paramsChanged(saved.notice);
      return send(res, 200, saved);
    }
    if (req.method === 'POST' && seg[3] === 'preview') return send(res, 200, paramsSave.preview(me, b));
    if (req.method === 'POST' && seg[3] === 'revert') {
      const reverted = paramsSave.revert(me, actx, b);
      if (reverted.notice) events.emit.paramsChanged(reverted.notice);
      return send(res, 200, reverted);
    }
  }
  /* ---------- kỳ lương: danh sách kiểm, chốt công, tính lương và bản chụp, AI kiểm tra, duyệt, chi trả, mở lại ---------- */
  if (route === 'GET /periods') {
    need();
    return send(res, 200, {
      year: Number(url.searchParams.get('year') || vnToday().slice(0, 4)),
      periods: periods.list(url.searchParams.get('year') || vnToday().slice(0, 4))
    });
  }
  const periodKey = authz.routeKey(req.method, seg);
  if (periodKey.includes('/periods/:month')) {
    need(); // quyền đã kiểm ở cổng ROUTE_CAPS
    const month = seg[2];
    const step = periodKey.slice(periodKey.indexOf(':month') + ':month'.length);
    if (req.method === 'GET') {
      if (step === '') return send(res, 200, periods.view(month));
      if (step === '/verify') return send(res, 200, periods.verify(month));
      if (step === '/estimates') {
        const q = url.searchParams;
        return send(
          res,
          200,
          periods.estimates(month, {
            q: q.get('q') || undefined,
            type: q.get('type') || undefined,
            page: q.get('page') || undefined,
            pageSize: q.get('pageSize') || undefined
          })
        );
      }
      if (step === '/payslips') {
        const q = url.searchParams;
        return send(
          res,
          200,
          periods.payslips(month, {
            status: q.get('status') || undefined,
            q: q.get('q') || undefined,
            flag: q.get('flag') || undefined,
            type: q.get('type') || undefined,
            page: q.get('page') || undefined,
            pageSize: q.get('pageSize') || undefined
          })
        );
      }
      if (step === '/payslips/:username' || step === '/estimates/:username') {
        let username;
        try {
          username = decodeURIComponent(seg[4]).toLowerCase();
        } catch {
          throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
        }
        const viewAll = authz.scopeOf(me, 'payroll.view') === 'all'; // nhân sự chỉ có phạm vi tự mình
        // phiếu ước tính của người khác (kể cả của chính mình) chỉ dành cho phạm vi tất cả: lớp chặn thứ hai sau cổng route
        if (!viewAll && (step === '/estimates/:username' || username !== me.username))
          throw new HttpError(403, 'Chỉ xem được phiếu của chính mình', { code: 'FORBIDDEN_CAP' });
        // phiếu ước tính của một người đi cùng cổng payroll.view với danh sách ước tính (nhân sự đã bị chặn ở cổng)
        return send(
          res,
          200,
          step === '/estimates/:username'
            ? periods.estimateOne(month, username)
            : periods.payslip(month, username, { self: !viewAll })
        );
      }
    } else {
      const b = await readJson(req);
      const by = me.username;
      // Mỗi bước kỳ trả { month, status, rev }: báo cho các màn sau khi bước đã COMMIT
      const stepDone = out => {
        events.emit.periodChanged(out);
        return send(res, 200, out);
      };
      if (step === '/lock-attendance') return stepDone(periods.lockAttendance(month, b, actx, by));
      if (step === '/calculate') return stepDone(periods.calculate(month, b, actx, by));
      if (step === '/ai-review') {
        if (!authz.can(me, 'payroll.calculate'))
          throw new HttpError(403, 'Cần quyền tính lương để chạy AI kiểm tra', {
            code: 'FORBIDDEN_CAP',
            cap: 'payroll.calculate'
          });
        agents.assertEnabled();
        return stepDone(periods.aiReview(month, b, actx, by, m => aiReviewResult(m, false)));
      }
      if (step === '/approve') return stepDone(periods.approve(month, b, actx, by));
      if (step === '/mark-paid') {
        const paid = periods.markPaid(month, b, actx, by);
        events.emit.payslipAvailable(month, periods.payslipUsers(month));
        return stepDone(paid);
      }
      if (step === '/reopen') {
        const inputsCap = periods.REOPEN_INPUTS_CAP(b.to);
        if (inputsCap && !authz.can(me, inputsCap))
          throw new HttpError(403, 'Mở lại về bước này cần quyền mở lại dữ liệu đầu vào (chỉ Admin)', {
            code: 'FORBIDDEN_CAP',
            cap: inputsCap
          });
        return stepDone(periods.reopen(month, b, actx, by));
      }
      if (step === '/payslips/decide') return send(res, 200, { items: periods.decidePayslips(month, b, me, actx) });
    }
  }
  /* ---------- nhật ký kiểm toán (chỉ đọc; không có API sửa hay xoá) ---------- */
  if (route === 'GET /audit') {
    need(); // năng lực audit.read đã kiểm ở cổng ROUTE_CAPS
    const q = url.searchParams,
      text = key => q.get(key) || undefined;
    const limit = q.has('limit') ? Number(q.get('limit')) : config.AUDIT_PAGE_DEFAULT;
    if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, 'limit phải là số nguyên dương');
    for (const key of ['afterId', 'beforeId'])
      if (q.has(key) && !/^\d+$/.test(q.get(key))) throw new HttpError(400, `${key} phải là số nguyên không âm`);
    for (const key of ['from', 'to'])
      if (q.has(key) && !validDate(q.get(key))) throw new HttpError(400, `${key} phải dạng YYYY-MM-DD`);
    if (q.has('month') && !validMonth(q.get('month'))) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const filter = {
      // Chỉ có ngày thì biên là đầu và cuối NGÀY GIỜ VIỆT NAM (không phải UTC), đổi sang ISO UTC để so với cột at
      from: q.has('from') ? vnDayIso(q.get('from'), 'start') : undefined,
      to: q.has('to') ? vnDayIso(q.get('to'), 'end') : undefined,
      actor: text('actor'),
      action: text('action'),
      entity: text('entity'),
      subject: text('subject'),
      month: text('month'),
      afterId: q.has('afterId') ? Number(q.get('afterId')) : undefined,
      beforeId: q.has('beforeId') ? Number(q.get('beforeId')) : undefined,
      // Mức nhạy cảm theo năng lực người xem
      sensitivities: authz.auditSensitivities(me)
    };
    const size = Math.min(limit, config.AUDIT_PAGE_MAX);
    const rows = store.audit.list({ ...filter, limit: size }).map(audit.publicRow);
    return send(res, 200, {
      rows,
      total: store.audit.count(filter),
      limit: size,
      // Trang kế (mới → cũ): truyền nextBeforeId vào beforeId
      nextBeforeId: rows.length === size && !q.has('afterId') ? rows[rows.length - 1].id : null
    });
  }
  if (route === 'GET /audit/verify') {
    need(); // năng lực audit.read đã kiểm ở cổng ROUTE_CAPS
    return send(res, 200, store.audit.verify());
  }
  /* ---------- vai trò (Cài đặt › Phân quyền) ---------- */
  // GET /roles và các route vai trò tuỳ chỉnh nằm ở lib/domain/roles.js (lib/roles.js); ở đây chỉ còn gán vai trò cho tài khoản
  const rolesOfStaff = s => Roles.rolesOfStaff(s);
  const rolesRevOf = Roles.rolesRevOf;
  // Đặt lại mật khẩu của tài khoản KHÁC (màn Tài khoản): cần roles.manage ở cổng; không dùng cho chính mình (PUT /password). Mọi phiên cũ của người đó hết hiệu lực.
  if (req.method === 'POST' && seg.length === 4 && seg[1] === 'staff' && seg[3] === 'password') {
    const admin = needAdmin(),
      b = await readJson(req);
    let username;
    try {
      username = decodeURIComponent(seg[2]).toLowerCase();
    } catch {
      throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
    }
    if (username === admin.username)
      throw new HttpError(400, 'Không đặt lại mật khẩu của chính mình ở đây; dùng chức năng đổi mật khẩu của tôi', {
        code: 'USE_OWN_PASSWORD'
      });
    if (!store.getStaffRow(username)) throw new HttpError(404, 'Không có tài khoản này');
    if (typeof b.password !== 'string' || b.password.length < config.PASSWORD_MIN_LENGTH)
      throw new HttpError(400, `Mật khẩu cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
    const reason = reasonOf(b.reason);
    const passHash = await auth.hashPasswordAsync(b.password);
    store.transaction(() => {
      store.setPassword(username, passHash);
      // Chỉ ghi hành động và lý do, không bao giờ ghi mật khẩu hay hàm băm
      audit.write(actx, {
        action: 'password.reset',
        entityKind: 'staff',
        entityId: username,
        subject: username,
        reason: reason || null
      });
    });
    store.bumpSessionVersion(username); // mọi phiên cũ của người đó hết hiệu lực
    events.closeUser(username, 'password');
    return send(res, 200, { ok: true });
  }
  if (req.method === 'PUT' && seg.length === 4 && seg[1] === 'staff' && seg[3] === 'roles') {
    const admin = needAdmin(),
      b = await readJson(req);
    let username;
    try {
      username = decodeURIComponent(seg[2]).toLowerCase();
    } catch {
      throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
    }
    const target = store.getStaff(username);
    if (!target) throw new HttpError(404, 'Không có tài khoản này');
    const known = [...Roles.knownRoleSet()];
    if (!Array.isArray(b.roles) || b.roles.some(r => typeof r !== 'string' || !known.includes(r)))
      throw new HttpError(400, `roles phải là mảng vai trò có trong hệ thống: ${known.join(', ')}`);
    const reason = reasonOf(b.reason);
    if (b.expectedRev !== undefined && b.expectedRev !== null && !Number.isInteger(b.expectedRev))
      throw new HttpError(400, 'expectedRev phải là số nguyên');
    const want = [...new Set(b.roles)].sort();
    const outcome = store.transaction(() => {
      const history = store.roles.list({ username, includeRevoked: true });
      const rev = rolesRevOf(history);
      if (b.expectedRev !== undefined && b.expectedRev !== null && b.expectedRev !== rev)
        throw new HttpError(409, 'Vai trò của tài khoản này vừa được người khác đổi, tải lại rồi làm lại', {
          code: 'ROLES_STALE',
          rev
        });
      const current = rolesOfStaff(target);
      const stored = store.roles.activeRoles(username);
      const toGrant = want.filter(r => !current.includes(r));
      const toRevoke = current.filter(r => !want.includes(r));
      if (username === admin.username && current.includes('admin') && !want.includes('admin'))
        throw new HttpError(403, 'Không thể tự bỏ quyền Admin của mình', { code: 'SELF_ADMIN_REMOVAL' });
      for (const role of toRevoke)
        if (!stored.includes(role) && role !== 'staff')
          // staff dẫn xuất từ payrollSubject: gỡ được, tắt cờ ở bên dưới
          throw new HttpError(
            409,
            role === 'admin'
              ? 'Đây là tài khoản Admin gốc: đổi loại tài khoản ở Hồ sơ nhân sự, không gỡ ở đây được'
              : 'Vai trò staff là mặc định của nhân sự được trả lương, không gỡ được',
            { code: 'ROLE_DERIVED', role }
          );
      // Vai trò tuỳ chỉnh đã ngưng dùng chỉ để gỡ, không gán mới được
      const deprecatedGrant = toGrant.find(r => authz.customTable().roles.some(d => d.code === r && d.deprecated));
      if (deprecatedGrant)
        throw new HttpError(400, 'Vai trò đã ngưng dùng, không gán mới được', {
          code: 'ROLE_DEPRECATED',
          role: deprecatedGrant
        });
      for (const role of toGrant) store.roles.grant(username, role, admin.username);
      for (const role of toRevoke) if (stored.includes(role)) store.roles.revoke(username, role);
      // Vai trò staff = nhân sự được trả lương: gán thì bật payrollSubject, gỡ thì tắt (cùng giao dịch, có nhật ký staff.payrollSubject).
      // Tài khoản Admin gốc chưa có bậc lương hợp lệ (bậc 0) mà được gán staff thì phiếu báo lỗi bậc cho tới khi đặt bậc ở Hồ sơ; không tự đặt bậc thay Admin.
      if (
        Roles.syncPayroll(actx, username, want.includes('staff'), target.payrollSubject) &&
        want.includes('staff') &&
        !(target.level >= 1)
      )
        warnings.warn(
          'ROLE_STAFF_NO_LEVEL',
          'Tài khoản này chưa có bậc lương hợp lệ: phiếu lương sẽ báo lỗi cho tới khi đặt chức vụ và bậc ở Hồ sơ nhân sự.'
        );
      if (store.roles.countAdmins() < 1)
        throw new HttpError(409, 'Không được gỡ quản trị viên cuối cùng', { code: 'LAST_ADMIN' });
      // Một dòng nhật ký cho mỗi vai trò đổi (mức pii: đây là phân quyền truy cập dữ liệu cá nhân)
      for (const [role, active] of [...toGrant.map(r => [r, true]), ...toRevoke.map(r => [r, false])])
        audit.write(actx, {
          action: active ? 'role.grant' : 'role.revoke',
          entityKind: 'staff_role',
          entityId: `${username}:${role}`,
          subject: username,
          before: { role, active: !active },
          after: { role, active },
          reason: reason || null,
          sensitivity: 'pii'
        });
      return {
        granted: toGrant,
        revoked: toRevoke,
        rev: rolesRevOf(store.roles.list({ username, includeRevoked: true }))
      };
    });
    if (outcome.granted.length || outcome.revoked.length) events.emit.rolesChanged(username);
    return send(res, 200, { username, roles: rolesOfStaff(store.getStaff(username)), ...outcome });
  }
  /* ---------- gán ca cho nhiều người (Hồ sơ › Gán ca): tất cả hoặc không ---------- */
  if (req.method === 'PUT' && seg.length === 3 && seg[1] === 'staff' && seg[2] === 'shift-bulk') {
    needAdmin();
    const b = await readJson(req);
    const punchRules = rulesFor().punch;
    if (!Array.isArray(b.usernames) || !b.usernames.length)
      throw new HttpError(400, 'Chọn ít nhất một người để gán ca', { code: 'USERNAMES_REQUIRED' });
    const bulkMax = rulesFor().params['system.staff.bulkMax'];
    if (b.usernames.length > bulkMax)
      throw new HttpError(400, `Mỗi lần gán tối đa ${bulkMax} người`, { code: 'TOO_MANY' });
    const usernames = b.usernames.map(u => (typeof u === 'string' ? u.toLowerCase() : u));
    if (usernames.some(u => typeof u !== 'string' || !USERNAME_RE.test(u)))
      throw new HttpError(400, 'Danh sách tên đăng nhập không hợp lệ');
    if (new Set(usernames).size !== usernames.length) throw new HttpError(400, 'Danh sách có tên đăng nhập bị lặp');
    // Ca: preset (mã ca cố định) hoặc cặp giờ vào – ra trùng đúng một ca cố định; cùng luật với sửa ca từng người (mã phải có trong bảng ca)
    let shiftCode = b.preset;
    if (shiftCode === undefined && typeof b.in === 'string' && typeof b.out === 'string')
      shiftCode = Object.keys(punchRules.SHIFT).find(
        code => punchRules.SHIFT[code][0] === b.in && punchRules.SHIFT[code][1] === b.out
      );
    if (typeof shiftCode !== 'string' || !Object.hasOwn(punchRules.SHIFT, shiftCode))
      throw new HttpError(400, 'Ca cố định không hợp lệ', { code: 'SHIFT_UNKNOWN' });
    shiftCode = container.shifts.canonicalOf(shiftCode) || shiftCode; // hồ sơ lưu mã của danh mục ca
    // Ngày hiệu lực: ca đổi ngay (không có lịch hiệu lực); chỉ nhận hôm nay hoặc để trống
    if (b.effective !== undefined && b.effective !== null && b.effective !== vnToday())
      throw new HttpError(400, 'Ca có hiệu lực ngay khi lưu: ngày hiệu lực chỉ nhận hôm nay hoặc để trống', {
        code: 'EFFECTIVE_UNSUPPORTED'
      });
    const reason = reasonOf(b.reason);
    const people = usernames.map(u => store.getStaff(u));
    const missing = usernames.filter((u, i) => !people[i]);
    if (missing.length)
      throw new HttpError(404, `Không có tài khoản: ${missing.join(', ')}`, { code: 'STAFF_NOT_FOUND', missing });
    // Không ai tự đổi ca của chính mình: gán hàng loạt không được lách quy tắc đó
    selfDecision(
      people.some(p => authz.isSelfDecision(me, p.username) && p.shiftCode !== shiftCode),
      { doing: 'đổi ca' }
    );
    const result = store.transaction(() => {
      const updated = [],
        unchanged = [];
      for (const person of people) {
        if (person.shiftCode === shiftCode) {
          unchanged.push(person.username);
          continue;
        }
        store.db.prepare('UPDATE staff SET shift_code = ? WHERE username = ?').run(shiftCode, person.username);
        audit.write(actx, {
          action: 'staff.update',
          entityKind: 'staff',
          entityId: person.username,
          subject: person.username,
          before: { shiftCode: person.shiftCode },
          after: { shiftCode },
          reason: reason || null
        });
        updated.push({ username: person.username, shiftCode });
      }
      return { updated, unchanged };
    });
    return send(res, 200, { ok: true, shiftCode, ...result });
  }
  if (seg[1] === 'staff' && seg[2] && req.method === 'PUT') {
    const admin = needAdmin();
    let username;
    try {
      username = decodeURIComponent(seg[2]).toLowerCase();
    } catch {
      throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
    }
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Tên đăng nhập: chữ thường, số, dấu . _ - (2–40 ký tự)');
    const prev = store.getStaffRow(username);
    // Khoá hoặc mở khoá tài khoản đang giữ vai trò Admin cần năng lực quản lý vai trò (staff.lock gán được cho vai trò tuỳ chỉnh: không đủ để
    // khoá Admin), và không được khoá Admin chưa khoá cuối cùng (nếu không, không ai còn roles.manage để mở lại)
    const guardAdminLock = locking => {
      if (!prev || !(prev.role === 'admin' || store.roles.activeRoles(username).includes('admin'))) return;
      if (!authz.can(me, 'roles.manage'))
        throw new HttpError(403, 'Bạn không có quyền khoá hoặc mở khoá tài khoản Admin', {
          code: 'FORBIDDEN_CAP',
          cap: 'roles.manage'
        });
      if (locking && !prev.locked_at && store.roles.countAdmins() < 2)
        throw new HttpError(409, 'Không được khoá quản trị viên cuối cùng', { code: 'LAST_ADMIN' });
    };
    const b = await readJson(req);
    // expectedRev (tuỳ chọn): số phiên bản hồ sơ Admin đã thấy (trường rev của GET /api/staff); lệch thì 409 STAFF_STALE và không ghi gì.
    // Thiếu expectedRev thì ghi đè. Mọi kiểm tra và ghi sau đây chạy đồng bộ cùng một lượt xử lý, không có ai chen vào giữa.
    if (b.expectedRev !== undefined && b.expectedRev !== null) {
      if (typeof b.expectedRev !== 'string' || !b.expectedRev)
        throw new HttpError(400, 'expectedRev phải là chuỗi số phiên bản hồ sơ');
      const currentRev = staffRevision(username);
      if (b.expectedRev !== currentRev)
        throw new HttpError(
          409,
          'Hồ sơ này vừa được người khác sửa. Tải lại hồ sơ rồi lưu lại để không ghi đè thay đổi của họ.',
          { code: 'STAFF_STALE', currentRev }
        );
    }
    if (Object.hasOwn(b, 'locked') && typeof b.locked !== 'boolean')
      throw new HttpError(400, 'locked phải là true hoặc false');
    if (Object.hasOwn(b, 'locked') && !authz.can(me, 'staff.lock'))
      throw new HttpError(403, 'Bạn không có quyền khoá hoặc mở khoá tài khoản', {
        code: 'FORBIDDEN_CAP',
        cap: 'staff.lock'
      });
    if (b.locked === true && username === admin.username)
      throw new HttpError(400, 'Không thể tự khoá tài khoản đang đăng nhập');
    if (typeof b.locked === 'boolean') guardAdminLock(b.locked);
    // Chỉ khoá / mở khoá: không kiểm các trường hồ sơ khác (tài khoản cũ có thể thiếu ngày bắt đầu làm)
    // expectedRev đã được kiểm ở trên nên không tính vào số trường: { locked, expectedRev } vẫn là yêu cầu chỉ khoá / mở khoá
    if (Object.keys(b).filter(key => key !== 'expectedRev').length === 1 && Object.hasOwn(b, 'locked')) {
      if (!prev) throw new HttpError(404, 'Không có tài khoản này');
      store.transaction(() => {
        // Chỉ ghi nhật ký khi trạng thái khoá thật sự đổi: gửi lại locked như cũ (lưu hồ sơ) không thêm dòng khoá / mở khoá
        const changed = b.locked ? store.lockStaff(username, admin.username) : store.unlockStaff(username);
        if (changed) audit.staffLock(actx, username, b.locked);
      });
      if (b.locked) events.closeUser(username, 'locked');
      return send(res, 200, { staff: staffForViewer(me, store.getStaff(username)), created: false });
    }
    // Họ tên: name; hoặc familyName + givenName nhập riêng (họ trước, tên sau, viết hoa chữ đầu) thì name = họ + tên
    const nameParts =
      typeof b.familyName === 'string' || typeof b.givenName === 'string'
        ? new PersonName(String(b.familyName || ''), String(b.givenName || ''))
        : null;
    if (nameParts && nameParts.isEmpty())
      throw new HttpError(400, 'Thiếu tên (givenName)', { code: 'GIVEN_NAME_REQUIRED' });
    const name = nameParts ? nameParts.fullName : String(b.name || '').trim();
    if (!name) throw new HttpError(400, 'Thiếu họ tên');
    // Thử việc / chính thức (Admin nhập, chỉ hiển thị, không đổi tiền) và ngày nghỉ việc; không gửi thì giữ giá trị đang lưu
    if (b.contractStatus != null && b.contractStatus !== '' && !['probation', 'official'].includes(b.contractStatus))
      throw new HttpError(400, 'contractStatus phải là probation (thử việc) hoặc official (chính thức)', {
        code: 'BAD_CONTRACT_STATUS'
      });
    const contractStatus = b.contractStatus === undefined ? undefined : b.contractStatus || null;
    if (b.resignedOn != null && b.resignedOn !== '' && !validDate(b.resignedOn))
      throw new HttpError(400, 'Ngày nghỉ việc phải là ngày hợp lệ dạng YYYY-MM-DD', { code: 'BAD_RESIGNED_ON' });
    const resignedOn = b.resignedOn === undefined ? undefined : b.resignedOn || null;
    // Giá trị lạ bị từ chối, không đổi ngầm thành mặc định. Thiếu trường thì dùng mặc định (vai trò staff, loại tts).
    if (b.role !== undefined && b.role !== null && b.role !== 'admin' && b.role !== 'staff')
      throw new HttpError(400, 'Vai trò phải là admin hoặc staff');
    const role = b.role === 'admin' ? 'admin' : 'staff';
    // Cấp hay gỡ vai trò Admin cần năng lực quản lý vai trò (hiện chỉ Admin có)
    if (
      (role === 'admin' || prev?.role === 'admin') &&
      role !== (prev?.role ?? 'staff') &&
      !authz.can(me, 'roles.manage')
    )
      throw new HttpError(403, 'Bạn không có quyền đổi vai trò Admin', { code: 'FORBIDDEN_CAP', cap: 'roles.manage' });
    // Chức vụ là dữ liệu: mã phải có trong bảng chức vụ của tháng hiện tại (chức vụ ngưng dùng chỉ giữ cho người đang có); mã lạ là 400, không đổi ngầm thành mã khác
    const staffParams = monthParams();
    const activeCodes = activeCodesOf(staffParams);
    if (b.type !== undefined && b.type !== null && !activeCodes.includes(b.type) && !(prev && prev.type === b.type))
      throw new HttpError(400, `Loại nhân sự phải là một trong: ${activeCodes.join(', ')}`);
    const type = b.type === undefined || b.type === null ? Positions.defaultCode : b.type;
    // Vào bảng lương hay không (payrollSubject): nêu rõ thì theo đó (phải là true / false, không đổi ngầm); đổi vai trò admin ↔ staff mà không nêu thì
    // theo vai trò mới (admin: ngoài bảng lương, staff: vào bảng lương); còn lại giữ giá trị đang lưu (db: tài khoản mới theo vai trò)
    if (Object.hasOwn(b, 'payrollSubject') && typeof b.payrollSubject !== 'boolean')
      throw new HttpError(400, 'payrollSubject phải là true hoặc false');
    const roleChanged = !!prev && prev.role !== role;
    const payrollSubject = Object.hasOwn(b, 'payrollSubject')
      ? b.payrollSubject
      : roleChanged
        ? role !== 'admin'
        : undefined;
    const inPayroll = payrollSubject ?? (prev ? !!store.isPayrollSubject(username) : role !== 'admin');
    // Người trong bảng lương (hoặc không phải Admin) cần bậc hợp lệ. Admin ngoài bảng lương giữ bậc đang lưu: đổi vai trò không làm mất bậc.
    const keptLevel = prev && Number.isInteger(prev.level) && prev.level >= 1 ? prev.level : null;
    const needsLevel = role !== 'admin' || inPayroll;
    const level = !needsLevel
      ? (prev?.level ?? 0)
      : b.level == null || b.level === ''
        ? ((roleChanged ? keptLevel : null) ?? 1)
        : Number(b.level);
    const maxLevel = levelCountOf(staffParams, type);
    if (needsLevel && (!Number.isInteger(level) || level < 1 || level > maxLevel))
      throw new HttpError(400, `Level phải là số nguyên từ 1 đến ${maxLevel}`);
    // Phụ cấp đêm: chọn một trong bảng nightOptions của bậc (level.<loại>.<bậc>.nightOptions) hoặc của chức vụ (type.<loại>.nightOptions, chỉ NV có); loại không có bảng thì không có
    const nightOptions = typeParam(staffParams, type, 'nightOptions', level);
    const hasNightOptions = Array.isArray(nightOptions) && nightOptions.length > 0;
    const nightGiven = b.nightPct !== undefined && b.nightPct !== null && b.nightPct !== '';
    // Phụ cấp đêm lạ bị từ chối (loại không có bảng lựa chọn thì bỏ qua trường này)
    // Thiếu trường (form Hồ sơ không có ô này): giữ giá trị đã lưu nếu còn nằm trong bảng của chức vụ / bậc, nếu không (chưa lưu hoặc không còn được phép) lấy lựa chọn đầu tiên
    // Giá trị gửi lên bằng giá trị đã lưu thì không bị kiểm lại (bảng của bậc đổi sau khi lưu không làm hỏng lần lưu không đổi gì)
    const keptNight = prev && prev.type === type && prev.night_pct != null ? Number(prev.night_pct) : null; // prev là hàng thô (cột night_pct)
    if (hasNightOptions && nightGiven && Number(b.nightPct) !== keptNight && !nightOptions.includes(Number(b.nightPct)))
      throw new HttpError(400, `Phụ cấp đêm phải là một trong: ${nightOptions.join(', ')} (%)`);
    const nightPct = hasNightOptions
      ? nightGiven
        ? Number(b.nightPct)
        : keptNight !== null && nightOptions.includes(keptNight)
          ? keptNight
          : nightOptions[0]
      : null;
    const idorm = benefitOf(staffParams, type, 'idorm', level) && !!b.idorm; // iDorm chỉ nhận khi cờ iDorm của chức vụ hoặc bậc bật
    const givenShift = b.shiftCode == null || b.shiftCode === '' ? null : b.shiftCode;
    if (givenShift !== null && (typeof givenShift !== 'string' || !Object.hasOwn(rulesFor().punch.SHIFT, givenShift)))
      throw new HttpError(400, 'Ca cố định không hợp lệ');
    const shiftCode = givenShift === null ? null : container.shifts.canonicalOf(givenShift) || givenShift; // lưu mã của danh mục ca
    // phép năm: ngày đầu đi làm, ngày sinh, điều chỉnh tay (+/− ngày, bước 0,5)
    const startDate = b.startDate ? String(b.startDate) : null,
      birthday =
        b.birthday === undefined && prev && !authz.can(me, 'profile.read.pii')
          ? prev.birthday || null
          : b.birthday
            ? String(b.birthday)
            : null;
    if ((startDate && !validDate(startDate)) || (birthday && !validDate(birthday)))
      throw new HttpError(400, 'Ngày bắt đầu làm / ngày sinh phải là ngày hợp lệ dạng YYYY-MM-DD');
    // Chức vụ có cờ startDateRequired cần ngày bắt đầu làm để tính phép năm; Admin thì không
    // Thiếu ngày bắt đầu làm thì phép năm của người này chưa tính được (public/leave.js → accrued cần ngày bắt đầu)
    warnIf('START_DATE_REQUIRED', needsLevel && staffParams[`type.${type}.startDateRequired`] === true && !startDate, {
      message: 'Chức vụ này cần ngày bắt đầu làm: chưa có ngày thì số phép năm của người này chưa tính được.'
    });
    const leaveAdjust = Math.round((Number(b.leaveAdjust) || 0) * 2) / 2;
    if (Math.abs(leaveAdjust) > 365) throw new HttpError(400, 'Điều chỉnh phép tối đa ±365 ngày');
    // thuế TNCN / BH bắt buộc: thiếu trường (giao diện cũ) thì giữ giá trị đang lưu; null = dùng mặc định theo loại nhân sự
    const contract =
      b.contract === undefined
        ? (prev?.contract ?? null)
        : b.contract === null || b.contract === ''
          ? null
          : b.contract;
    if (contract !== null && contract !== 'long' && contract !== 'short')
      throw new HttpError(400, 'Loại hợp đồng không hợp lệ');
    // thiếu trường: giữ đúng giá trị đang lưu trong cột (NULL = theo insurance.coverage của hợp đồng, không ghim thành giá trị suy ra)
    const insured = b.insured === undefined ? (store.getStaffRow(username)?.insured ?? null) : b.insured;
    if (insured !== null && typeof insured !== 'boolean' && insured !== 0 && insured !== 1)
      throw new HttpError(400, 'Đóng bảo hiểm phải là có / không');
    const dep = b.dependants; // chỉ nhận số nguyên hoặc chuỗi chữ số; null / '' = 0
    const dependants =
      dep === undefined
        ? (prev?.dependants ?? 0)
        : dep === null || dep === ''
          ? 0
          : typeof dep === 'number' || (typeof dep === 'string' && /^\d+$/.test(dep))
            ? Number(dep)
            : NaN;
    if (!Number.isInteger(dependants) || dependants < 0 || dependants > 20)
      throw new HttpError(400, 'Số người phụ thuộc phải là số nguyên từ 0 đến 20');
    // tên vị trí công việc (in trên phiếu lương); thiếu trường thì giữ giá trị đang lưu
    const jt = b.jobTitle === undefined ? (prev?.job_title ?? '') : (b.jobTitle ?? '');
    if (typeof jt !== 'string' || jt.trim().length > 80) throw new HttpError(400, 'Vị trí công việc tối đa 80 ký tự');
    const jobTitle = jt.trim();
    // Admin bật/tắt từng khoản: khấu trừ thuế TNCN, giảm trừ gia cảnh, tạm ứng (thiếu trường thì giữ giá trị đang lưu)
    const flags = {};
    for (const [key, col] of [
      ['taxOn', 'tax_on'],
      ['deductOn', 'deduct_on'],
      ['advanceOn', 'advance_on']
    ]) {
      const v = b[key] === undefined ? (prev?.[col] ?? null) : b[key];
      if (v !== null && typeof v !== 'boolean' && v !== 0 && v !== 1)
        throw new HttpError(400, 'Thuế TNCN / giảm trừ gia cảnh / tạm ứng phải là có / không');
      flags[key] = v;
    }
    // Quyền theo trường. Cổng ROUTE_CAPS chỉ hỏi profile.write. Trường tiền (loại, bậc, phụ cấp đêm, iDorm, hợp đồng, bảo hiểm,
    // người phụ thuộc, thuế, giảm trừ, tạm ứng) cần salary.write; tạo tài khoản mới cũng đặt loại và bậc nên cũng cần. Mật khẩu của tài khoản KHÁC
    // cần roles.manage (chưa có quyền đặt lại mật khẩu riêng). Từ chối trước khi ghi bất cứ gì.
    {
      // So SÁNH THEO GIÁ TRỊ HIỆU LỰC: nhiều tài khoản lưu null ở contract, insured, taxOn, deductOn, advanceOn, nightPct; biểu mẫu gửi lại giá trị
      // hiệu lực (long, true, 40...). Cả hai phía đi qua cùng một hàm đưa null về mặc định nên "không đổi" không bị coi là đổi tiền.
      const nightDefault = p => {
        const options = typeParam(staffParams, p.type, 'nightOptions', p.level);
        return Array.isArray(options) && options.length ? options[0] : null;
      };
      const effectivePay = p => {
        const effectiveContract =
          p.contract === 'long' || p.contract === 'short'
            ? p.contract
            : typeParam(staffParams, p.type, 'defaultContract') === 'short'
              ? 'short'
              : 'long';
        return {
          type: p.type,
          level: p.level,
          nightPct: p.nightPct ?? nightDefault(p),
          idorm: !!p.idorm,
          contract: effectiveContract,
          // cột NULL: theo lựa chọn insurance.coverage.<hợp đồng> của Kế toán ở tháng hiện tại (như payrollPeople), nên gửi lại giá trị mặc định không bị coi là đổi tiền
          insured: p.insured == null ? staffParams[`insurance.coverage.${effectiveContract}`] === true : !!p.insured,
          dependants: p.dependants || 0,
          taxOn: p.taxOn == null ? true : !!p.taxOn,
          deductOn: p.deductOn == null ? true : !!p.deductOn,
          advanceOn: p.advanceOn == null ? true : !!p.advanceOn
        };
      };
      const payFields = prev
        ? (() => {
            const was = effectivePay({ ...store.getStaff(username), insured: store.getStaffRow(username).insured }); // insured thô: NULL giữ NULL
            const now = effectivePay({ type, level, nightPct, idorm, contract, insured, dependants, ...flags });
            return Object.keys(now).filter(key => now[key] !== was[key]);
          })()
        : ['type', 'level'];
      // Không ai tự sửa lương, thuế, bảo hiểm, ca, điều chỉnh phép hay mật khẩu của CHÍNH MÌNH (Admin ngoài diện lương không bị ảnh hưởng).
      // Các trường khác của chính mình không bị kiểm ở đây.
      if (prev && authz.isSelfDecision(me, username)) {
        const was = store.getStaff(username);
        const own = [
          ...payFields,
          ...(leaveAdjust !== was.leaveAdjust ? ['leaveAdjust'] : []),
          ...((shiftCode ?? null) !== (was.shiftCode ?? null) ? ['shiftCode'] : []),
          ...(b.password ? ['password'] : [])
        ];
        // Đặt mật khẩu của chính mình qua hồ sơ luôn bị chặn (đã có đường riêng USE_OWN_PASSWORD); các trường lương, ca, phép chỉ cảnh báo
        if (own.includes('password'))
          throw new HttpError(403, `Không được tự sửa các trường này của chính mình (${own.join(', ')})`, {
            code: 'SELF_DECISION_FORBIDDEN',
            fields: own
          });
        selfDecision(own.length > 0, { doing: `sửa ${own.join(', ')}` });
      }
      if (payFields.length && !authz.can(me, 'salary.write'))
        throw new HttpError(403, `Bạn không có quyền đổi trường lương (${payFields.join(', ')})`, {
          code: 'FORBIDDEN_CAP',
          cap: 'salary.write',
          fields: payFields
        });
      if (b.password && prev && username !== admin.username && !authz.can(me, 'roles.manage'))
        throw new HttpError(403, 'Bạn không có quyền đặt lại mật khẩu của tài khoản khác', {
          code: 'FORBIDDEN_CAP',
          cap: 'roles.manage'
        });
      // Tài khoản đã có không đặt mật khẩu qua hồ sơ: dùng đường đặt lại có lý do và có nhật ký (tạo tài khoản mới vẫn nhận mật khẩu)
      if (b.password && prev)
        throw new HttpError(400, 'Tài khoản đã có: dùng chức năng Đặt lại mật khẩu (kèm lý do), không đổi qua hồ sơ', {
          code: 'USE_PASSWORD_RESET'
        });
    }
    let passHash = prev?.pass_hash;
    if (b.password) {
      if (String(b.password).length < config.PASSWORD_MIN_LENGTH)
        throw new HttpError(400, `Mật khẩu cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
      passHash = await auth.hashPasswordAsync(String(b.password));
    }
    if (!passHash) throw new HttpError(400, 'Tài khoản mới cần mật khẩu');
    if (username === admin.username && prev?.role === 'admin' && role !== 'admin')
      throw new HttpError(400, 'Không thể tự bỏ quyền Admin của mình');
    // Hồ sơ và dòng duyệt đổi cùng nhau hoặc không đổi gì
    const staffBefore = prev ? store.getStaff(username) : null;
    store.transaction(() => {
      store.upsertStaff({
        username,
        name,
        role,
        type,
        level,
        nightPct,
        idorm,
        shiftCode,
        passHash,
        createdAt: prev?.created_at,
        startDate,
        birthday,
        leaveAdjust,
        contract,
        insured,
        dependants,
        jobTitle,
        ...(payrollSubject === undefined ? {} : { payrollSubject }),
        ...flags,
        ...(nameParts ? { familyName: nameParts.familyName, givenName: nameParts.givenName } : {}),
        contractStatus,
        resignedOn
      });
      if (needsLevel && (!prev || prev.type !== type || payrollSubject === true)) reconcileStaffType(username, type);
      // Hồ sơ không nhạy cảm có cũ, mới; trường tiền có mức pay; ngày sinh chỉ ghi "đã đổi"; mật khẩu chỉ ghi cờ
      const staffAfter = store.getStaff(username);
      // Tắt payrollSubject thì vai trò staff đã gán cũng được thu hồi (staff = nhân sự được trả lương); bật thì staff tự dẫn xuất
      if (!staffAfter.payrollSubject && store.roles.activeRoles(username).includes('staff'))
        store.roles.revoke(username, 'staff');
      audit.staffSaved(actx, staffBefore, staffAfter, { passwordSet: !!b.password });
      // Vào hay ra khỏi bảng lương đổi người nhận lương: một dòng riêng (mức pay), chỉ khi tài khoản đã có và cờ đổi
      if (staffBefore && staffBefore.payrollSubject !== staffAfter.payrollSubject)
        audit.write(actx, {
          action: 'staff.payrollSubject',
          entityKind: 'staff',
          entityId: username,
          subject: username,
          before: { payrollSubject: staffBefore.payrollSubject },
          after: { payrollSubject: staffAfter.payrollSubject },
          sensitivity: 'pay'
        });
    });
    // Đặt lại mật khẩu: mọi phiên cũ của người đó hết hiệu lực. Khoá / mở khoá chỉ khi yêu cầu có nói rõ.
    if (b.password && prev) {
      store.bumpSessionVersion(username);
      if (username !== admin.username) events.closeUser(username, 'password');
    }
    if (typeof b.locked === 'boolean')
      store.transaction(() => {
        // Chỉ ghi nhật ký khi trạng thái khoá thật sự đổi: gửi lại locked như cũ (lưu hồ sơ) không thêm dòng khoá / mở khoá
        const changed = b.locked ? store.lockStaff(username, admin.username) : store.unlockStaff(username);
        if (changed) audit.staffLock(actx, username, b.locked);
      });
    if (b.locked === true) events.closeUser(username, 'locked');
    const result = { staff: staffForViewer(me, store.getStaff(username)), created: !prev };
    // Admin tự đặt lại mật khẩu của mình: phiên hiện tại vừa bị thu hồi, cấp phiên mới cho trình duyệt đang dùng
    if (b.password && prev && username === admin.username)
      return send(res, 200, result, {
        'Set-Cookie': auth.cookieHeader(auth.createSession(username), auth.SESSION_MAX_AGE_SEC)
      });
    return send(res, 200, result);
  }
  throw new HttpError(404, 'Không có API này');
}

/* ---------- server ---------- */
Roles.reconcileStaffRole(); // tài khoản đã gán vai trò staff mà payrollSubject còn false thì bật (staff = nhân sự được trả lương)
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return send(res, 400, { error: 'Địa chỉ yêu cầu không hợp lệ' });
  }
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  if (url.pathname !== '/api/events') {
    apiInflight++;
    res.once('close', () => apiInflight--);
  }
  try {
    const sessionUser = auth.readSession(req.headers.cookie);
    const me = sessionUser ? store.getStaff(sessionUser) : null;
    await warnings.run(() => requestRules.run(new Map(), () => api(req, res, url, me)));
    announceAttendance();
    announcePunches();
  } catch (e) {
    attendanceHints.clear(); // lỗi thì giao dịch đã hoàn tác: không báo
    punchHints.clear();
    // Lỗi xảy ra SAU khi đã trả lời (announce*, báo tin SSE): chỉ ghi log. Trả lời lần hai sẽ ném ERR_HTTP_HEADERS_SENT
    // ngay trong catch này, và một rejection không ai bắt làm Node thoát tiến trình (mất cả hệ thống).
    if (res.headersSent || res.writableEnded) return console.error(e);
    if (e instanceof Overloaded)
      return send(res, 503, { error: e.message, code: 'OVERLOADED' }, { 'Retry-After': String(e.retryAfterSec) });
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.details });
    // Lỗi có mã của store (PERIOD_LOCKED, SLIP_STALE, REASON_REQUIRED...): code và mã HTTP do store quyết, chi tiết trải ra như HttpError
    if (e && typeof e.code === 'string' && Number.isInteger(e.httpStatus) && e.httpStatus < 500)
      return send(res, e.httpStatus, { error: e.message, code: e.code, ...e.details });
    console.error(e);
    send(res, 500, { error: 'Lỗi máy chủ' });
  }
});
// Giữ kết nối 65 giây thay vì 5 giây mặc định của Node (xem lib/config.js → HTTP_KEEP_ALIVE_MS)
server.keepAliveTimeout = config.HTTP_KEEP_ALIVE_MS;
server.headersTimeout = config.HTTP_HEADERS_TIMEOUT_MS;
server.requestTimeout = config.HTTP_REQUEST_TIMEOUT_MS; // kẻ gửi chậm không giữ socket mãi (luồng SSE là phản hồi nên không bị tính)

if (require.main === module) {
  if (store.listStaff().length === 0) {
    let boot;
    try {
      boot = auth.bootstrapAdminPassword();
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    store.upsertStaff({
      username: 'admin',
      name: 'Admin',
      role: 'admin',
      type: Positions.defaultCode,
      level: 0,
      passHash: auth.hashPassword(boot.password)
    });
    // Không bao giờ in mật khẩu ra log
    console.log(
      boot.generated
        ? 'Đã tạo tài khoản admin với mật khẩu ngẫu nhiên (không hiển thị). Muốn đặt mật khẩu: xoá DB vừa tạo, đặt ADMIN_PASSWORD trong .env rồi chạy lại.'
        : 'Đã tạo tài khoản admin với mật khẩu lấy từ ADMIN_PASSWORD — hãy đổi mật khẩu sau khi đăng nhập.'
    );
  }
  const proxyWarning = auth.trustProxyWarning();
  if (proxyWarning) console.warn(proxyWarning);
  // Dọn bảng nhớ requestId của Check-in/out: một lần lúc khởi động rồi mỗi PUNCH_REQUEST_PURGE_MS.
  // Chỉ xoá bản ghi cũ hơn PUNCH_REQUEST_KEEP_DAYS ngày; .unref() để timer không giữ tiến trình sống. Chỉ chạy khi chạy thật
  // (require.main === module) nên test nạp server không sinh timer. Không in dữ liệu cá nhân, chỉ số dòng.
  const purgePunchRequests = () => {
    try {
      const removed = store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
      console.log(`Dọn bảng nhớ lượt chấm công: đã xoá ${removed} dòng cũ hơn ${config.PUNCH_REQUEST_KEEP_DAYS} ngày`);
    } catch (e) {
      console.error('Không dọn được bảng nhớ lượt chấm công:', e.message);
    }
  };
  purgePunchRequests();
  setInterval(purgePunchRequests, config.PUNCH_REQUEST_PURGE_MS).unref();
  // Số phép lưu sẵn: tính lại lúc khởi động rồi mỗi LEAVE_REFRESH_MS, để qua tháng làm việc tròn hay sinh nhật là DB tự cập nhật
  container.leave.start(config.LEAVE_REFRESH_MS);
  server.listen(PORT, () => console.log(`Lương Nhân Sự đang chạy tại http://localhost:${PORT}`));
  monitor.start();
  attachAccessLog(server, monitor);
  // Tắt êm: kết thúc các luồng báo tin (khách tự nối lại) rồi đóng máy chủ; không có bước này server.close() chờ luồng SSE mãi.
  // Hết kết nối thì đóng DB (SQLite gộp file WAL về file chính); quá SHUTDOWN_GRACE_MS thì thoát cưỡng bức.
  let closing = false;
  const shutdown = code => {
    if (closing) return;
    closing = true;
    events.closeAll();
    setTimeout(() => process.exit(code || 1), config.SHUTDOWN_GRACE_MS).unref();
    server.close(() => {
      try {
        store.db.close();
      } catch (error) {
        console.error('Không đóng được DB:', error.message);
      }
      process.exit(code);
    });
    server.closeAllConnections();
  };
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown(0));
  // Windows không có SIGTERM mềm (kill = giết ngay): tiến trình cha có kênh IPC (bộ đo tải, trình giám sát) gửi 'shutdown' để tắt êm
  if (process.send) process.on('message', message => message === 'shutdown' && shutdown(0));
  // Lỗi không ai bắt: ghi log rồi tắt êm với mã 1 để trình giám sát (docker restart, systemd) dựng lại tiến trình sạch.
  // Rejection không ai bắt chỉ ghi log: để Node tự thoát vì một lỗi phụ (báo tin SSE...) sẽ làm mất cả hệ thống.
  process.on('uncaughtException', error => {
    console.error('uncaughtException:', error);
    shutdown(1);
  });
  process.on('unhandledRejection', reason => console.error('unhandledRejection:', reason));
}
server.limits = { hashGate, writeLimiter, shedder, monitor }; // để test và vận hành chỉnh/đọc số liệu giới hạn tải
module.exports = server;
