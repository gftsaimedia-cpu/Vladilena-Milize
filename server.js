// Lương Nhân Sự — web app tính lương tự phục vụ. Chạy: node server.js (Node.js >= 22.13, không cần npm install).
// Số luồng libuv phải đặt TRƯỚC khi có việc nền đầu tiên (băm mật khẩu, nén gzip); biến môi trường do người vận hành đặt thì giữ.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || String(require('./lib/config').UV_THREADPOOL_SIZE);
require('./lib/register-ts'); // nạp TypeScript lúc chạy cho src/** (kiểm kiểu: npm run typecheck)
const { createServer } = require('./src/bootstrap');
const { AsyncList } = require('./lib/shared/async-list');
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
const { cutRuleView } = require('./src/modules/sheet/sheet.helpers'); // sheet: hàm phụ đã chuyển sang module Nest
const { checkInDay, declaredDay, checkoutPreview } = require('./src/modules/attendance/attendance.helpers'); // attendance: hàm phụ đã chuyển sang module Nest
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
const { validMonth, validDate, USERNAME_RE, TIME_RE, NOTE_MAX, positiveId } = require('./lib/domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { estimateSheet, leaveDates, neighborDays, schedule } = require('./lib/domain/sheet'); // lịch ước tính và ngày phép
const { publicStaff, staffForViewer, ownerView, sheetForViewer, staffRevision } = require('./lib/domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
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
const agents = require('./lib/agents'); // công tắc Agents
const domainRoutes = require('./lib/domain/routes'); // khối phụ cấp, khoản điền thêm, lịch theo loại nhân sự
const authz = require('./lib/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const Roles = require('./lib/roles'); // vai trò tuỳ chỉnh (dữ liệu ở settings)
const audit = require('./lib/audit'); // nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('./lib/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const Positions = require('./lib/params/positions'); // chức vụ là dữ liệu: danh sách, quyền lợi, bảng quyền lợi
const { myPosition, sheetFlagsOf, activeCodesOf, withLeave } = require('./lib/domain/positions'); // cờ quyền lợi và chức vụ
const periods = require('./lib/periods'); // vòng đời kỳ lương, phiếu chụp bất biến, số ước tính của nhân sự
const events = require('./lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const { attachAccessLog } = require('./lib/ops/access-log'); // nhật ký truy cập JSON + X-Request-Id
const { container } = require('./lib/domain/container'); // các lớp của lib/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const { PersonName } = require('./lib/domain/employee/person-name'); // họ trước, tên sau
const { monitor, hashGate, writeLimiter, shedder } = require('./src/http/load-control'); // giới hạn tải dùng chung với cổng ApiGuard (src/http)
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
store.setDefaultContractResolver(async type => typeParam(await monthParams(), type, 'defaultContract'));
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



/* ---------- API ---------- */

// Bộ xử lý cũ cho route chưa chuyển sang module Nest (src/). Cổng quyền, giới hạn tải, giới hạn tốc độ ghi đã chạy ở src/http (ApiGuard).
async function api({ req, res, url, me, seg, route, policy, actx, need, needAdmin, guardPeriod }) {
  const routed = domainRoutes.handlerFor(seg); // quyền đã kiểm ở cổng ROUTE_CAPS ở trên
  if (routed) return await routed({ req, res, seg, url, me, actx });

      
  
    
    
    /* ---------- Admin duyệt khoản tự khai trong Lịch ước tính (iSAT, nghỉ được duyệt, OT, làm bù) ---------- */
  // Quyền duyệt TỪNG khoản: nhóm duyệt = loại khoản (request.decide.<khoản>), kèm phạm vi dữ liệu của vai trò (nhóm mình: chỉ chính mình cho tới khi có
  // bảng phân công). Cổng ROUTE_CAPS chỉ hỏi "có ít nhất một nhóm".
        /* ---------- Admin sửa số trên phiếu lương (chỉ Admin đọc / ghi; nhân sự luôn thấy số tự tính) ---------- */
  if (route === 'GET /slip-override' || route === 'PUT /slip-override') {
    const admin = needAdmin(),
      b = req.method === 'PUT' ? await readJson(req) : null;
    const who = String((b ? b.user : url.searchParams.get('user')) || '').toLowerCase(),
      month = b ? b.month : url.searchParams.get('month');
    if (!await store.getStaff(who)) throw new HttpError(404, 'Không có nhân sự này');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    if (b) {
      await guardPeriod(month);
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
      await store.transaction(async () => {
        const prior = (await store.getSlipOverride(who, month)).values;
        await store.setSlipOverride(who, month, clean, admin.username, reason, opts);
        await audit.slipOverride(actx, who, month, prior, clean, reason);
      });
    }
    return send(res, 200, await store.getSlipOverride(who, month));
  }
                          if (route === 'GET /staff') {
    needAdmin();
    const listParams = await monthParams();
    return send(res, 200, {
      staff: await AsyncList.map((await store.listStaff()), async s => await staffForViewer(me, s.payrollSubject ? await withLeave(listParams, s) : s))
    });
  }
  if (route === 'GET /team') {
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const kpiRows = new Map((await store.listKpiScores(month)).map(row => [row.username, row]));
    const teamParams = await monthParams(month);
    const teamSchedule = await schedule.team(month); // lịch của từng loại nhân sự
    const people = (await store.listStaff()).filter(s => s.payrollSubject);
    await closeStaleFor(people);
    // Lượt chấm công của cả tháng nạp MỘT lần (kèm lượt bấm và điều chỉnh), rồi chia theo người
    const sessionsOf = new Map();
    for (const session of await sessionsFor({ month })) {
      if (!sessionsOf.has(session.username)) sessionsOf.set(session.username, []);
      sessionsOf.get(session.username).push(session);
    }
    const rows = await AsyncList.map(people, async s => {
      const sh = await estimateSheet(s.username, month),
        attendanceSessions = sessionsOf.get(s.username) || [],
        approvals = await sheetApprovals(s.username, month, sh.days);
      return {
        staff: await staffForViewer(me, await withLeave(teamParams, s)),
        ...await sheetForViewer(me, s.username, sh),
        approvals,
        kpiParts: await kpiPartsView(
          (await hasKpi(s, teamParams)) && await authz.can(me, 'salary.read', { username: s.username })
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
      holidays: await store.getSetting('holidays', [])
    });
  }
      /* ---------- kỳ lương: danh sách kiểm, chốt công, tính lương và bản chụp, AI kiểm tra, duyệt, chi trả, mở lại ---------- */
  if (route === 'GET /periods') {
    need();
    return send(res, 200, {
      year: Number(url.searchParams.get('year') || vnToday().slice(0, 4)),
      periods: await periods.list(url.searchParams.get('year') || vnToday().slice(0, 4))
    });
  }
  const periodKey = authz.routeKey(req.method, seg);
  if (periodKey.includes('/periods/:month')) {
    need(); // quyền đã kiểm ở cổng ROUTE_CAPS
    const month = seg[2];
    const step = periodKey.slice(periodKey.indexOf(':month') + ':month'.length);
    if (req.method === 'GET') {
      if (step === '') return send(res, 200, await periods.view(month));
      if (step === '/verify') return send(res, 200, await periods.verify(month));
      if (step === '/estimates') {
        const q = url.searchParams;
        return send(
          res,
          200,
          await periods.estimates(month, {
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
          await periods.payslips(month, {
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
        const viewAll = await authz.scopeOf(me, 'payroll.view') === 'all'; // nhân sự chỉ có phạm vi tự mình
        // phiếu ước tính của người khác (kể cả của chính mình) chỉ dành cho phạm vi tất cả: lớp chặn thứ hai sau cổng route
        if (!viewAll && (step === '/estimates/:username' || username !== me.username))
          throw new HttpError(403, 'Chỉ xem được phiếu của chính mình', { code: 'FORBIDDEN_CAP' });
        // phiếu ước tính của một người đi cùng cổng payroll.view với danh sách ước tính (nhân sự đã bị chặn ở cổng)
        return send(
          res,
          200,
          step === '/estimates/:username'
            ? await periods.estimateOne(month, username)
            : await periods.payslip(month, username, { self: !viewAll })
        );
      }
    } else {
      const b = await readJson(req);
      const by = me.username;
      // Mỗi bước kỳ trả { month, status, rev }: báo cho các màn sau khi bước đã COMMIT
      const stepDone = async out => {
        await events.emit.periodChanged(out);
        return send(res, 200, out);
      };
      if (step === '/lock-attendance') return await stepDone(await periods.lockAttendance(month, b, actx, by));
      if (step === '/calculate') return await stepDone(await periods.calculate(month, b, actx, by));
      if (step === '/ai-review') {
        if (!await authz.can(me, 'payroll.calculate'))
          throw new HttpError(403, 'Cần quyền tính lương để chạy AI kiểm tra', {
            code: 'FORBIDDEN_CAP',
            cap: 'payroll.calculate'
          });
        await agents.assertEnabled();
        return await stepDone(await periods.aiReview(month, b, actx, by, async m => await aiReviewResult(m, false)));
      }
      if (step === '/approve') return await stepDone(await periods.approve(month, b, actx, by));
      if (step === '/mark-paid') {
        const paid = await periods.markPaid(month, b, actx, by);
        await events.emit.payslipAvailable(month, await periods.payslipUsers(month));
        return await stepDone(paid);
      }
      if (step === '/reopen') {
        const inputsCap = periods.REOPEN_INPUTS_CAP(b.to);
        if (inputsCap && !await authz.can(me, inputsCap))
          throw new HttpError(403, 'Mở lại về bước này cần quyền mở lại dữ liệu đầu vào (chỉ Admin)', {
            code: 'FORBIDDEN_CAP',
            cap: inputsCap
          });
        return stepDone(await periods.reopen(month, b, actx, by));
      }
      if (step === '/payslips/decide') return send(res, 200, { items: await periods.decidePayslips(month, b, me, actx) });
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
      sensitivities: await authz.auditSensitivities(me)
    };
    const size = Math.min(limit, config.AUDIT_PAGE_MAX);
    const rows = (await store.audit.list({ ...filter, limit: size })).map(audit.publicRow);
    return send(res, 200, {
      rows,
      total: await store.audit.count(filter),
      limit: size,
      // Trang kế (mới → cũ): truyền nextBeforeId vào beforeId
      nextBeforeId: rows.length === size && !q.has('afterId') ? rows[rows.length - 1].id : null
    });
  }
  if (route === 'GET /audit/verify') {
    need(); // năng lực audit.read đã kiểm ở cổng ROUTE_CAPS
    return send(res, 200, await store.audit.verify());
  }
  /* ---------- vai trò (Cài đặt › Phân quyền) ---------- */
  // GET /roles và các route vai trò tuỳ chỉnh nằm ở lib/domain/roles.js (lib/roles.js); ở đây chỉ còn gán vai trò cho tài khoản
  const rolesOfStaff = async s => await Roles.rolesOfStaff(s);
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
    if (!await store.getStaffRow(username)) throw new HttpError(404, 'Không có tài khoản này');
    if (typeof b.password !== 'string' || b.password.length < config.PASSWORD_MIN_LENGTH)
      throw new HttpError(400, `Mật khẩu cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
    const reason = reasonOf(b.reason);
    const passHash = await auth.hashPasswordAsync(b.password);
    await store.transaction(async () => {
      await store.setPassword(username, passHash);
      // Chỉ ghi hành động và lý do, không bao giờ ghi mật khẩu hay hàm băm
      await audit.write(actx, {
        action: 'password.reset',
        entityKind: 'staff',
        entityId: username,
        subject: username,
        reason: reason || null
      });
    });
    await store.bumpSessionVersion(username); // mọi phiên cũ của người đó hết hiệu lực
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
    const target = await store.getStaff(username);
    if (!target) throw new HttpError(404, 'Không có tài khoản này');
    const known = [...await Roles.knownRoleSet()];
    if (!Array.isArray(b.roles) || b.roles.some(r => typeof r !== 'string' || !known.includes(r)))
      throw new HttpError(400, `roles phải là mảng vai trò có trong hệ thống: ${known.join(', ')}`);
    const reason = reasonOf(b.reason);
    if (b.expectedRev !== undefined && b.expectedRev !== null && !Number.isInteger(b.expectedRev))
      throw new HttpError(400, 'expectedRev phải là số nguyên');
    const want = [...new Set(b.roles)].sort();
    const outcome = await store.transaction(async () => {
      const history = await store.roles.list({ username, includeRevoked: true });
      const rev = rolesRevOf(history);
      if (b.expectedRev !== undefined && b.expectedRev !== null && b.expectedRev !== rev)
        throw new HttpError(409, 'Vai trò của tài khoản này vừa được người khác đổi, tải lại rồi làm lại', {
          code: 'ROLES_STALE',
          rev
        });
      const current = await rolesOfStaff(target);
      const stored = await store.roles.activeRoles(username);
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
      const customRoles = (await authz.customTable()).roles;
      const deprecatedGrant = toGrant.find(r => customRoles.some(d => d.code === r && d.deprecated));
      if (deprecatedGrant)
        throw new HttpError(400, 'Vai trò đã ngưng dùng, không gán mới được', {
          code: 'ROLE_DEPRECATED',
          role: deprecatedGrant
        });
      for (const role of toGrant) await store.roles.grant(username, role, admin.username);
      for (const role of toRevoke) if (stored.includes(role)) await store.roles.revoke(username, role);
      // Vai trò staff = nhân sự được trả lương: gán thì bật payrollSubject, gỡ thì tắt (cùng giao dịch, có nhật ký staff.payrollSubject).
      // Tài khoản Admin gốc chưa có bậc lương hợp lệ (bậc 0) mà được gán staff thì phiếu báo lỗi bậc cho tới khi đặt bậc ở Hồ sơ; không tự đặt bậc thay Admin.
      if (
        await Roles.syncPayroll(actx, username, want.includes('staff'), target.payrollSubject) &&
        want.includes('staff') &&
        !(target.level >= 1)
      )
        warnings.warn(
          'ROLE_STAFF_NO_LEVEL',
          'Tài khoản này chưa có bậc lương hợp lệ: phiếu lương sẽ báo lỗi cho tới khi đặt chức vụ và bậc ở Hồ sơ nhân sự.'
        );
      if (await store.roles.countAdmins() < 1)
        throw new HttpError(409, 'Không được gỡ quản trị viên cuối cùng', { code: 'LAST_ADMIN' });
      // Một dòng nhật ký cho mỗi vai trò đổi (mức pii: đây là phân quyền truy cập dữ liệu cá nhân)
      for (const [role, active] of [...toGrant.map(r => [r, true]), ...toRevoke.map(r => [r, false])])
        await audit.write(actx, {
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
        rev: rolesRevOf(await store.roles.list({ username, includeRevoked: true }))
      };
    });
    if (outcome.granted.length || outcome.revoked.length) await events.emit.rolesChanged(username);
    return send(res, 200, { username, roles: await rolesOfStaff(await store.getStaff(username)), ...outcome });
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
    const prev = await store.getStaffRow(username);
    // Khoá hoặc mở khoá tài khoản đang giữ vai trò Admin cần năng lực quản lý vai trò (staff.lock gán được cho vai trò tuỳ chỉnh: không đủ để
    // khoá Admin), và không được khoá Admin chưa khoá cuối cùng (nếu không, không ai còn roles.manage để mở lại)
    const guardAdminLock = async locking => {
      if (!prev || !(prev.role === 'admin' || (await store.roles.activeRoles(username)).includes('admin'))) return;
      if (!await authz.can(me, 'roles.manage'))
        throw new HttpError(403, 'Bạn không có quyền khoá hoặc mở khoá tài khoản Admin', {
          code: 'FORBIDDEN_CAP',
          cap: 'roles.manage'
        });
      if (locking && !prev.locked_at && await store.roles.countAdmins() < 2)
        throw new HttpError(409, 'Không được khoá quản trị viên cuối cùng', { code: 'LAST_ADMIN' });
    };
    const b = await readJson(req);
    // expectedRev (tuỳ chọn): số phiên bản hồ sơ Admin đã thấy (trường rev của GET /api/staff); lệch thì 409 STAFF_STALE và không ghi gì.
    // Thiếu expectedRev thì ghi đè. Mọi kiểm tra và ghi sau đây chạy đồng bộ cùng một lượt xử lý, không có ai chen vào giữa.
    if (b.expectedRev !== undefined && b.expectedRev !== null) {
      if (typeof b.expectedRev !== 'string' || !b.expectedRev)
        throw new HttpError(400, 'expectedRev phải là chuỗi số phiên bản hồ sơ');
      const currentRev = await staffRevision(username);
      if (b.expectedRev !== currentRev)
        throw new HttpError(
          409,
          'Hồ sơ này vừa được người khác sửa. Tải lại hồ sơ rồi lưu lại để không ghi đè thay đổi của họ.',
          { code: 'STAFF_STALE', currentRev }
        );
    }
    if (Object.hasOwn(b, 'locked') && typeof b.locked !== 'boolean')
      throw new HttpError(400, 'locked phải là true hoặc false');
    if (Object.hasOwn(b, 'locked') && !await authz.can(me, 'staff.lock'))
      throw new HttpError(403, 'Bạn không có quyền khoá hoặc mở khoá tài khoản', {
        code: 'FORBIDDEN_CAP',
        cap: 'staff.lock'
      });
    if (b.locked === true && username === admin.username)
      throw new HttpError(400, 'Không thể tự khoá tài khoản đang đăng nhập');
    if (typeof b.locked === 'boolean') await guardAdminLock(b.locked);
    // Chỉ khoá / mở khoá: không kiểm các trường hồ sơ khác (tài khoản cũ có thể thiếu ngày bắt đầu làm)
    // expectedRev đã được kiểm ở trên nên không tính vào số trường: { locked, expectedRev } vẫn là yêu cầu chỉ khoá / mở khoá
    if (Object.keys(b).filter(key => key !== 'expectedRev').length === 1 && Object.hasOwn(b, 'locked')) {
      if (!prev) throw new HttpError(404, 'Không có tài khoản này');
      await store.transaction(async () => {
        // Chỉ ghi nhật ký khi trạng thái khoá thật sự đổi: gửi lại locked như cũ (lưu hồ sơ) không thêm dòng khoá / mở khoá
        const changed = b.locked ? await store.lockStaff(username, admin.username) : await store.unlockStaff(username);
        if (changed) await audit.staffLock(actx, username, b.locked);
      });
      if (b.locked) events.closeUser(username, 'locked');
      return send(res, 200, { staff: await staffForViewer(me, await store.getStaff(username)), created: false });
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
    const staffParams = await monthParams();
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
    const inPayroll = payrollSubject ?? (prev ? !!await store.isPayrollSubject(username) : role !== 'admin');
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
    if (givenShift !== null && (typeof givenShift !== 'string' || !Object.hasOwn((await rulesFor()).punch.SHIFT, givenShift)))
      throw new HttpError(400, 'Ca cố định không hợp lệ');
    const shiftCode = givenShift === null ? null : await container.shifts.canonicalOf(givenShift) || givenShift; // lưu mã của danh mục ca
    // phép năm: ngày đầu đi làm, ngày sinh, điều chỉnh tay (+/− ngày, bước 0,5)
    const startDate = b.startDate ? String(b.startDate) : null,
      birthday =
        b.birthday === undefined && prev && !await authz.can(me, 'profile.read.pii')
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
    const insured = b.insured === undefined ? ((await store.getStaffRow(username))?.insured ?? null) : b.insured;
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
        ? await (async () => {
            const was = effectivePay({ ...await store.getStaff(username), insured: (await store.getStaffRow(username)).insured }); // insured thô: NULL giữ NULL
            const now = effectivePay({ type, level, nightPct, idorm, contract, insured, dependants, ...flags });
            return Object.keys(now).filter(key => now[key] !== was[key]);
          })()
        : ['type', 'level'];
      // Không ai tự sửa lương, thuế, bảo hiểm, ca, điều chỉnh phép hay mật khẩu của CHÍNH MÌNH (Admin ngoài diện lương không bị ảnh hưởng).
      // Các trường khác của chính mình không bị kiểm ở đây.
      if (prev && authz.isSelfDecision(me, username)) {
        const was = await store.getStaff(username);
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
      if (payFields.length && !await authz.can(me, 'salary.write'))
        throw new HttpError(403, `Bạn không có quyền đổi trường lương (${payFields.join(', ')})`, {
          code: 'FORBIDDEN_CAP',
          cap: 'salary.write',
          fields: payFields
        });
      if (b.password && prev && username !== admin.username && !await authz.can(me, 'roles.manage'))
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
    const staffBefore = prev ? await store.getStaff(username) : null;
    await store.transaction(async () => {
      await store.upsertStaff({
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
      if (needsLevel && (!prev || prev.type !== type || payrollSubject === true)) await reconcileStaffType(username, type);
      // Hồ sơ không nhạy cảm có cũ, mới; trường tiền có mức pay; ngày sinh chỉ ghi "đã đổi"; mật khẩu chỉ ghi cờ
      const staffAfter = await store.getStaff(username);
      // Tắt payrollSubject thì vai trò staff đã gán cũng được thu hồi (staff = nhân sự được trả lương); bật thì staff tự dẫn xuất
      if (!staffAfter.payrollSubject && (await store.roles.activeRoles(username)).includes('staff'))
        await store.roles.revoke(username, 'staff');
      await audit.staffSaved(actx, staffBefore, staffAfter, { passwordSet: !!b.password });
      // Vào hay ra khỏi bảng lương đổi người nhận lương: một dòng riêng (mức pay), chỉ khi tài khoản đã có và cờ đổi
      if (staffBefore && staffBefore.payrollSubject !== staffAfter.payrollSubject)
        await audit.write(actx, {
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
      await store.bumpSessionVersion(username);
      if (username !== admin.username) events.closeUser(username, 'password');
    }
    if (typeof b.locked === 'boolean')
      await store.transaction(async () => {
        // Chỉ ghi nhật ký khi trạng thái khoá thật sự đổi: gửi lại locked như cũ (lưu hồ sơ) không thêm dòng khoá / mở khoá
        const changed = b.locked ? await store.lockStaff(username, admin.username) : await store.unlockStaff(username);
        if (changed) await audit.staffLock(actx, username, b.locked);
      });
    if (b.locked === true) events.closeUser(username, 'locked');
    const result = { staff: await staffForViewer(me, await store.getStaff(username)), created: !prev };
    // Admin tự đặt lại mật khẩu của mình: phiên hiện tại vừa bị thu hồi, cấp phiên mới cho trình duyệt đang dùng
    if (b.password && prev && username === admin.username)
      return send(res, 200, result, {
        'Set-Cookie': auth.cookieHeader(await auth.createSession(username), auth.SESSION_MAX_AGE_SEC)
      });
    return send(res, 200, result);
  }
  throw new HttpError(404, 'Không có API này');
}

/* ---------- server ---------- */
Roles.reconcileStaffRole().catch(error => console.error('reconcileStaffRole:', error)); // tài khoản đã gán vai trò staff mà payrollSubject còn false thì bật (staff = nhân sự được trả lương)
// HTTP do Nest đảm nhận (src/): route đã chuyển module chạy ở đó, phần còn lại rơi về api() ở trên.
const server = createServer(api);
// Giữ kết nối 65 giây thay vì 5 giây mặc định của Node (xem lib/config.js → HTTP_KEEP_ALIVE_MS)
server.keepAliveTimeout = config.HTTP_KEEP_ALIVE_MS;
server.headersTimeout = config.HTTP_HEADERS_TIMEOUT_MS;
server.requestTimeout = config.HTTP_REQUEST_TIMEOUT_MS; // kẻ gửi chậm không giữ socket mãi (luồng SSE là phản hồi nên không bị tính)

if (require.main === module)
  (async () => {
  await auth.ready; // khoá ký phiên (đọc từ DB khi không đặt SESSION_SECRET)
  if ((await store.listStaff()).length === 0) {
    let boot;
    try {
      boot = auth.bootstrapAdminPassword();
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    await store.upsertStaff({
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
  const purgePunchRequests = async () => {
    try {
      const removed = await store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
      console.log(`Dọn bảng nhớ lượt chấm công: đã xoá ${removed} dòng cũ hơn ${config.PUNCH_REQUEST_KEEP_DAYS} ngày`);
    } catch (e) {
      console.error('Không dọn được bảng nhớ lượt chấm công:', e.message);
    }
  };
  await purgePunchRequests();
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
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
server.limits = { hashGate, writeLimiter, shedder, monitor }; // để test và vận hành chỉnh/đọc số liệu giới hạn tải
module.exports = server;
