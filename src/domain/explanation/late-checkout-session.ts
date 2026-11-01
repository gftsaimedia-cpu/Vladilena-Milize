'use strict';
// Check-out muộn chờ Admin duyệt: giờ Check-out muộn chỉ có hiệu lực khi Admin duyệt giải trình.
//   - Check-out muộn hơn giờ kết thúc ca (cộng phần làm thêm đã khai) quá config.CHECKOUT_GRACE_MIN phút: giải trình đi CÙNG lần bấm, lượt đóng ở
//     ĐÚNG trạng thái "Quên Check-out" như lượt mở quá 16 giờ (src/domain/attendance/index.ts → closeStale: state 'closed', reason 'forgot-out', không có
//     presOut) để nhân sự vẫn Check-in được ca sau và mọi màn hiện "Quên Check-out". Giờ bấm chỉ được ghi nhận: entry.requestedOut và một dòng
//     punches (bằng chứng, không ai sửa).
//   - Admin duyệt: giờ bấm thành giờ Check-out của lượt, trong cùng giao dịch với quyết định. Không duyệt: lượt giữ "Quên Check-out" và cả ngày
//     không tính lương (explanationHold, src/domain/payroll/payroll-service.ts). Đổi ý từ duyệt sang không duyệt thì lượt quay lại "Quên Check-out".
// Không khoá theo kỳ: giải trình và quyết định vẫn làm được sau khi chốt công.
const { HttpError } = require('../../platform/http');
const { ADMIN_ORIGIN } = require('../attendance/attendance-sessions');
const { SessionStatus } = require('../attendance/session-status');

const AUDIT_FIELDS = ['username', 'date', 'kind', 'status', 'decisionNote'];
// Trường của lượt "Quên Check-out" giữ lại khi Admin đổi ý từ duyệt sang không duyệt (bỏ các trường ngày công buildDay đã dựng)
const FORGOT_FIELDS = ['src', 'presIn', 'plannedShift', 'outsideShift', 'assignedShift', 'outsideZone', 'requestedOut'];

class LateCheckout {
  declare store: any;
  declare explanations: any;
  declare repository: any;
  declare punchRules: any;
  declare attendance: any;
  declare audit: any;
  declare graceMin: any;

  // store: src/platform/db.ts; explanations: ExplanationService; repository: ExplanationRepository; punchRules() → rulesFor().punch;
  // attendance: { punchStaff, sessionOverlap, hintPunch } của src/domain/attendance/index.ts; audit: src/platform/audit.ts; graceMin: config.CHECKOUT_GRACE_MIN
  constructor({ store, explanations, repository, punchRules, attendance, audit, graceMin }: any) {
    this.store = store;
    this.explanations = explanations;
    this.repository = repository;
    this.punchRules = punchRules;
    this.attendance = attendance;
    this.audit = audit;
    this.graceMin = graceMin;
  }

  // Dòng nhật ký của một giải trình (dùng chung với src/domain/explanation/routes.js)
  async auditExplanation(actx?, action?, before?, row?, reason?) {
    await this.audit.write(actx, {
      action,
      entityKind: 'explanation',
      entityId: String(row.id),
      subject: row.username,
      month: row.date.slice(0, 7),
      before: before ? this.audit.pick(before, AUDIT_FIELDS) : null,
      after: this.audit.pick(row, AUDIT_FIELDS),
      reason: reason || null,
      sensitivity: 'normal'
    });
  }

  // Entry của lượt khi Check-out tại outIso (cùng cách dựng với POST /api/punch, để duyệt giải trình dựng đúng như một lần Check-out)
  async closedEntry(staff?, session?, outIso?) {
    const punch = await this.punchRules();
    const prior = session.entry;
    let entry;
    if (prior.outsideShift || !prior.plannedShift)
      entry = { ...prior, kind: 'pending', reason: 'off-shift', presOut: outIso };
    else {
      entry = punch.buildDay(
        await this.attendance.punchStaff(staff, prior.presIn, outIso),
        prior.presIn,
        outIso,
        'punch',
        {
          plannedShift: prior.plannedShift
        }
      ).entry;
      const duplicate = await this.hasDuplicate(session.username, prior.plannedShift, session.id);
      if (duplicate && entry.kind !== 'pending')
        entry = { ...entry, kind: 'pending', reason: 'multiple-sessions', attendanceConfirmed: false };
    }
    if (prior.outsideZone) entry.outsideZone = true; // cờ ngoài vùng của lần Check-in đi theo lượt
    return entry;
  }

  // Đã có lượt chấm thật khác (khác lượt id) của người này trong cùng ca? Lượt Admin khai thay (origin ADMIN_ORIGIN) không làm lượt chấm
  // thật thành "nhiều lượt": lượt thật thắng. Hai mã ca cùng một ca (lượt có thể mang mã cũ n1 … hoặc mã mới Normal1 …)
  async hasDuplicate(username?, plannedShift?, id: any = null) {
    const punch = await this.punchRules();
    const sameShift = (code?) => punch.canonicalOf(code) === punch.canonicalOf(plannedShift.code);
    return (await this.store.listSessions({ username })).some(
      s =>
        s.id !== id &&
        s.entry.origin !== ADMIN_ORIGIN &&
        s.entry.plannedShift?.startIso === plannedShift.startIso &&
        sameShift(s.entry.plannedShift?.code)
    );
  }

  async #save(session?, entry?) {
    const next = await this.store.updateSession(session.id, session.version, {
      date: session.date,
      state: 'closed',
      entry
    });
    if (!next) throw new HttpError(409, 'Lượt chấm công vừa thay đổi — tải lại rồi làm lại', { code: 'SESSION_STALE' });
    this.attendance.hintPunch(session.username, session.date);
    return next;
  }

  async #overlap(session?, entry?) {
    return await this.attendance.sessionOverlap(session.username, entry.presIn, entry.presOut, session.id);
  }

  // Check-out bình thường (đúng giờ hoặc muộn trong mức cho phép): giờ bấm là giờ ra của lượt
  async checkOut({ staff, session, at, ip }: any) {
    const entry = await this.closedEntry(staff, session, at);
    const overlap = await this.#overlap(session, entry);
    if (overlap) throw new HttpError(400, overlap);
    const next = await this.#save(session, entry);
    await this.store.addPunch(
      staff.username,
      at,
      'out',
      ip,
      false,
      { plannedShift: entry.plannedShift || null },
      session.id
    );
    return next;
  }

  // Check-out muộn quá mức cho phép. text: giải trình gửi cùng lần bấm. Chưa có giải trình nào cho lượt này và không gửi kèm thì 409
  // CHECKOUT_NEEDS_EXPLANATION (giao diện hỏi lý do rồi bấm lại). Giải trình đã được duyệt từ trước thì không gửi lại, giờ bấm áp ngay.
  async record({ staff, session, at, ip, text, lateMin, actx }: any) {
    const existing = await this.repository.lateFor(session.id);
    const answer = typeof text === 'string' ? text.trim() : '';
    if (!answer && !existing)
      throw new HttpError(409, `Cần giải trình: ${SessionStatus.NOTE.lateOut(lateMin)}`, {
        code: 'CHECKOUT_NEEDS_EXPLANATION',
        case: 'lateOut',
        minutes: lateMin,
        note: SessionStatus.NOTE.lateOut(lateMin),
        sessionId: session.id,
        lateMin,
        graceMin: this.graceMin
      });
    let made = existing ? existing.view() : null;
    if (answer && !(existing && existing.isApproved())) {
      made = await this.explanations.submitLate({ username: staff.username, session, text: answer });
      await this.auditExplanation(actx, 'explanation.late-checkout', existing && existing.view(), made, null);
    }
    const entry: Record<string, any> = { ...session.entry, kind: 'pending', reason: 'forgot-out', requestedOut: at };
    delete entry.presOut;
    const next = await this.#save(session, entry);
    // Dòng bấm thật (auto = false) là bằng chứng giờ bấm; lượt vẫn là "Quên Check-out" cho tới khi Admin duyệt
    await this.store.addPunch(
      staff.username,
      at,
      'out',
      ip,
      false,
      { plannedShift: entry.plannedShift || null, lateCheckout: true },
      session.id
    );
    return (await this.sync(made, actx)) || next;
  }

  // Đưa lượt về đúng quyết định của giải trình Check-out muộn (gọi trong giao dịch của quyết định). Trả lượt đã đổi, hoặc null khi không đổi.
  // Lượt Admin đã sửa giờ (src 'admin') hoặc không còn giờ bấm chờ duyệt thì để nguyên: số Admin sửa tay được ưu tiên.
  async sync(view?, actx?) {
    if (!view || view.kind !== 'late-checkout' || !view.sessionId) return null;
    const session = await this.store.getSession(view.sessionId);
    const e = session && session.state === 'closed' ? session.entry : null;
    if (!e || !e.requestedOut || e.src === 'admin') return null;
    let entry;
    if (view.status === 'approved' && !e.presOut) {
      const staff = await this.store.getStaff(session.username);
      if (!staff) return null;
      entry = { ...(await this.closedEntry(staff, session, e.requestedOut)), requestedOut: e.requestedOut };
      const overlap = await this.#overlap(session, entry);
      if (overlap)
        throw new HttpError(409, `${overlap}: sửa giờ lượt đó trước rồi duyệt lại`, { code: 'SESSION_OVERLAP' });
    } else if (view.status !== 'approved' && e.presOut && e.presOut === e.requestedOut) {
      entry = { kind: 'pending', reason: 'forgot-out' };
      for (const k of FORGOT_FIELDS) if (Object.hasOwn(e, k)) entry[k] = e[k];
    } else return null;
    const next = await this.#save(session, entry);
    await this.audit.write(actx, {
      action: entry.presOut ? 'checkout.late.apply' : 'checkout.late.revert',
      entityKind: 'attendance_session',
      entityId: String(session.id),
      subject: session.username,
      month: session.date.slice(0, 7),
      before: { presOut: e.presOut || null },
      after: { presOut: entry.presOut || null, explanationId: view.id },
      reason: null
    });
    return next;
  }
}

export = { LateCheckout };
