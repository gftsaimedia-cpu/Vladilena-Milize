'use strict';
// Admin ghi giờ vào / ra ⇒ lượt chấm công nguồn Admin, từ hai đường: Admin khai thay lịch (sync) và Admin duyệt giải trình ngày quên
// chấm (syncExplanation).
// Ngày công = số ngày có Check-in/out hợp lệ: ngày khai "Đi làm" mà không có lượt nào là nghỉ không phép
// (tham số attendance.missingAllRule = 'absent', src/engine/actual-hours.ts). Không có chức năng sửa giờ chấm công, nên Admin
// khai thay lịch (PUT /api/sheet kèm user) là cách duy nhất ghi nhận một ngày người đó quên chấm. Lớp này dựng, sửa, xoá đúng MỘT lượt
// đã đóng (src 'admin', đánh dấu origin = ORIGIN) cho mỗi ngày Admin khai thay, để ActualHours coi như một lượt Check-in/out hợp lệ
// (trễ / về sớm vẫn bị trừ như lượt bấm thật).
// Chỉ xét những ngày ĐỔI trong lần lưu này cộng các ngày Admin xác nhận (confirmDays: ngày vừa lưu trong hộp khai thay, kể cả khi giờ
// không đổi): ngày nhân sự tự khai "Đi làm" từ trước mà không chấm công không được biến thành ngày công chỉ vì Admin lưu lịch thay vì
// việc khác (duyệt phép...). Lượt được tạo ngay lúc lưu, kể cả ngày khai trước (ngày Admin khai thay tự tính công khi
// đã qua giờ ra, không cần Admin lưu lại). Trước giờ ra lượt chỉ là lịch: src/domain/attendance/attendance-sessions.ts giấu nó khỏi mọi lượt đọc thường;
// lượt Admin cũng không chặn Check-in thật (src/domain/attendance/index.ts → sessionOverlap bỏ qua nó) và lượt chấm thật dùng được thắng nó.
// Duyệt giải trình ngày (Admin yêu cầu / AI đề nghị) của một ngày thiếu đầu giờ vào hoặc ra thì ghi đúng MỘT lượt Admin có giờ vào = giờ
// bắt đầu ca, giờ ra = giờ kết thúc ca và entry.explanationId = id giải trình; không duyệt (hoặc đổi từ duyệt sang từ chối) thì xoá đúng lượt
// mang id đó.
// Không bao giờ đụng lượt bấm thật hay lượt Admin không mang dấu ORIGIN. Lượt bấm bị chặn (quên Check-in/out, chờ đối soát, Check-out muộn
// chờ duyệt) để nguyên; ActualHours và phần giữ ngày vì giải trình bỏ qua chúng khi ngày đã có lượt Admin.
const { HttpError } = require('../../platform/http');
const { validDate } = require('../input');

// dấu của lượt do đường này tạo (một nguồn ở src/domain/attendance/attendance-sessions.ts): chỉ lượt có dấu này mới được sửa / xoá ở đây
const { ADMIN_ORIGIN: ORIGIN } = require('./attendance-sessions');
const DECLARED_OFF = ['isat', 'leave', 'unpaid', 'approved', 'willmakeup']; // loại ngày khai nghỉ cả ngày, có dòng duyệt (server.js → OFF_DAY_TEXT)
const WORK_KINDS = ['work']; // loại ngày có giờ vào / ra (cleanDays bắt buộc in, out)
const PRESENCE_FIELDS = ['kind', 'in', 'out', 'preset', 'extraIn', 'extraOut']; // trường quyết định khoảng có mặt
const REVIEW_REASONS = ['needs-review', 'legacy-review']; // lượt chờ đối soát: ActualHours không dùng, nên không phải "chấm thật dùng được"
// Trường của lượt cũ không giữ khi dựng lại (buildDay chỉ đặt khi cần); trường làm thêm thuộc phần khai OT (POST /api/ot) nên giữ
// explanationId cũng không giữ: khai thay lại ngày qua lịch thì lượt thành lượt tay, mất dấu giải trình
const REBUILT_ONLY = ['attendanceApproved', 'reason', 'explanationId'];
const EXTRA_FIELDS = ['extraKind', 'extraIn', 'extraOut'];
const MAX_CONFIRM = 31; // số ngày tối đa của một tháng: giới hạn đầu vào, không phải số nghiệp vụ

const month = (date?) => date.slice(0, 7);
const stale = () => new HttpError(409, 'Lượt chấm công vừa thay đổi — tải lại rồi lưu lại', { code: 'SESSION_STALE' });

class AdminPresence {
  declare store: any;
  declare dayApproval: any;
  declare punchRules: any;
  declare attendance: any;
  declare nowIso: any;
  declare audit: any;
  declare warn: any;

  // store: src/platform/db.ts; punchRules(month) → rulesFor(month).punch; dayApproval(username, date, day) → dòng duyệt của ngày khai ({ status } hoặc null);
  // attendance: { punchStaff, hintPunch } của src/domain/attendance/index.ts;
  // nowIso() (qua Date.now nên sandbox giả được đồng hồ); audit: src/platform/audit.ts;
  // warn: src/platform/warnings.ts → warn (báo trong phản hồi lưu lịch, không chặn)
  constructor({ store, punchRules, dayApproval, attendance, nowIso, audit, warn }: any) {
    this.store = store;
    this.dayApproval = dayApproval;
    this.punchRules = punchRules;
    this.attendance = attendance;
    this.nowIso = nowIso;
    this.audit = audit;
    this.warn = warn;
  }

  static isOurs(session?) {
    return !!session && !!session.entry && session.entry.origin === ORIGIN;
  }

  // Ngày công của lượt (ca đêm thuộc ngày bắt đầu ca), cùng cách ActualHours nhóm lượt
  static dayOf(session?) {
    return (session.entry.plannedShift && session.entry.plannedShift.date) || session.date;
  }

  // Lượt bấm thật dùng được (đã đóng, đủ giờ vào / ra, có ca đã gán, không chờ đối soát): có thì Check-in/out thật thắng
  static isUsableReal(session?) {
    const e = session.entry || {};
    return (
      !AdminPresence.isOurs(session) &&
      session.state === 'closed' &&
      !REVIEW_REASONS.includes(e.reason) &&
      !!e.presIn &&
      !!e.presOut &&
      !!(e.plannedShift && e.plannedShift.startIso)
    );
  }

  // Ngày có lượt Admin trong danh sách lượt (src/domain/payroll/payroll-service.ts: ngày này không bị giữ vì giải trình chưa duyệt)
  static declaredDates(sessions?) {
    return new Set<any>(sessions.filter(s => AdminPresence.isOurs(s) && s.state === 'closed').map(AdminPresence.dayOf));
  }

  // confirmDays của PUT /api/sheet: không có là []; phải là mảng tối đa MAX_CONFIRM ngày YYYY-MM-DD hợp lệ thuộc tháng, sai thì 400
  static confirmed(confirmDays?, month?) {
    if (confirmDays === undefined || confirmDays === null) return [];
    if (
      !Array.isArray(confirmDays) ||
      confirmDays.length > MAX_CONFIRM ||
      !confirmDays.every(d => typeof d === 'string' && validDate(d) && d.startsWith(`${month}-`))
    )
      throw new HttpError(
        400,
        `confirmDays phải là danh sách tối đa ${MAX_CONFIRM} ngày YYYY-MM-DD trong tháng ${month}`
      );
    return confirmDays;
  }

  // Gọi TRONG giao dịch lưu lịch khai thay (sau khi lịch đã ghi). caller: Admin; owner: người được khai; prevDays, clean: lịch trước / sau;
  // confirmDays: ngày Admin xác nhận dù không đổi. Trả { set: [ngày], removed: [ngày], skipped: [ngày] }.
  async sync({ caller, owner, month, prevDays, clean, actx, confirmDays }: any) {
    const confirmed = new Set<any>(AdminPresence.confirmed(confirmDays, month));
    const same = (a?, b?) => !!a && !!b && PRESENCE_FIELDS.every(k => (a[k] || '') === (b[k] || ''));
    const dates = [...new Set<any>([...Object.keys(prevDays || {}), ...Object.keys(clean || {}), ...confirmed])]
      .filter(date => date.startsWith(`${month}-`) && (confirmed.has(date) || !same(prevDays[date], clean[date])))
      .sort();
    const result = { set: [] as any[], removed: [] as any[], skipped: [] as any[] };
    if (!dates.length) return result;
    // cả tháng bên cạnh (ca đêm cuối / đầu tháng có thể chồng giờ) và cả lượt Admin chưa tới giờ ra (để sửa / xoá được)
    const all = await this.store.listSessions({ username: owner.username, includeScheduled: true });
    for (const date of dates) {
      const day = clean[date];
      const mine = all.filter(s => AdminPresence.isOurs(s) && AdminPresence.dayOf(s) === date);
      const wanted = !!day && WORK_KINDS.includes(day.kind) && !!day.in && !!day.out;
      const built = wanted ? await this.#build(owner, date, day, all) : null;
      // Ngày không còn là ngày đi làm có giờ (hoặc không dựng được lượt): bỏ lượt Admin cũ của ngày đó, nếu có
      if (built) await this.#write(owner, date, built, mine[0], caller, actx);
      for (const s of built ? mine.slice(1) : mine) await this.#remove(s, actx);
      if (built) result.set.push(date);
      else if (mine.length) result.removed.push(date);
      if (wanted && !built) result.skipped.push(date);
      if (built || mine.length) this.attendance.hintPunch(owner.username, date); // màn đang mở nạp lại chấm công sau COMMIT
    }
    return result;
  }

  // Entry của lượt Admin cho ngày date, hoặc null (kèm cảnh báo) khi không dựng được
  async #build(owner?, date?, day?, all?) {
    const punch = await this.punchRules(month(date));
    const shown = date.split('-').reverse().join('/');
    if (all.some(s => AdminPresence.isUsableReal(s) && AdminPresence.dayOf(s) === date)) {
      this.warn(
        'ADMIN_PRESENCE_REAL_PUNCH',
        `Ngày ${shown} đã có Check-in/out thật: giữ giờ chấm thật, không ghi giờ Admin khai`,
        { date }
      );
      return null;
    }
    // Ca của lượt: ca Admin chọn cho ngày (day.preset, mọi ca trong danh mục; src/domain/sheet-checks.js đặt), không có thì ca được gán
    // như lúc Check-in. ActualHours đối chiếu giờ có mặt với ca này và bộ máy tính phụ cấp ca, giờ nghỉ, giờ thiếu theo ca này.
    const assigned = await this.attendance.punchStaff(owner, date);
    const staff =
      typeof day.preset === 'string' && Object.hasOwn(punch.SHIFT, day.preset)
        ? { ...assigned, shiftCode: day.preset }
        : assigned;
    const plannedShift = punch.planShift(staff, date);
    if (!plannedShift) {
      this.warn('ADMIN_PRESENCE_NO_SHIFT', `Ngày ${shown}: người này chưa được gán ca nên chưa ghi được giờ có mặt`, {
        date
      });
      return null;
    }
    const pres = AdminPresence.presenceOf(punch, plannedShift, date, day);
    const overlap = this.#overlap(pres, all, date);
    if (overlap) {
      this.warn('ADMIN_PRESENCE_OVERLAP', `Ngày ${shown}: ${overlap}, chưa ghi được giờ Admin khai`, { date });
      return null;
    }
    const { entry } = punch.buildDay(staff, pres.inIso, pres.outIso, 'admin', {
      plannedShift,
      approveIncomplete: true
    });
    return entry;
  }

  // Khoảng có mặt { inIso, outIso } Admin khai cho ngày date. Gồm cả phần làm thêm đã khai, để giờ làm thêm không bị cắt mất vì "ngoài giờ có
  // mặt".
  static presenceOf(punch?, plannedShift?, date?, day?) {
    return punch.presenceFor(plannedShift.code, date, day.extraIn || day.in, day.extraOut || day.out);
  }

  // Khoảng có mặt ghi cho ngày quên chấm đã được duyệt giải trình: đúng giờ bắt đầu và kết thúc ca. Đoạn OT hoặc giờ bù đã khai không có
  // bằng chứng có mặt nên không ghi (ActualHours cắt phần ngoài khoảng có mặt). Ngày lễ khai đi làm: giờ ca không phải ngày công, lấy khung đã khai.
  static forgottenPresence(punch?, plannedShift?, date?, day?, holiday?) {
    if (holiday) return AdminPresence.presenceOf(punch, plannedShift, date, day);
    return { inIso: plannedShift.startIso, outIso: plannedShift.endIso };
  }

  // Ngày thiếu chấm: không có lượt thật dùng được, không có lượt đang mở hay chờ đối soát, và mọi lượt đã đóng chỉ có một đầu giờ
  // (hoặc không có lượt nào). sessions: các lượt không phải lượt Admin của ngày công đó.
  static missesPunch(sessions?) {
    return sessions.every(s => {
      const e = s.entry || {};
      if (AdminPresence.isUsableReal(s) || s.state === 'open' || REVIEW_REASONS.includes(e.reason)) return false;
      return !(e.presIn && e.presOut);
    });
  }

  // Gọi TRONG giao dịch quyết định giải trình ngày (view: dạng view() của giải trình đã lưu quyết định). Giải trình gắn với lượt bỏ qua ở đây:
  // Check-out muộn do LateCheckout.sync lo, Check-in / Check-out không hợp lệ chỉ quyết định nhãn và giữ lương (không đổi giờ).
  // Duyệt ngày thiếu chấm ⇒ ghi lượt Admin theo giờ ca (không ghi nếu ngày đã có lượt Admin, hoặc không dựng được:
  // ngoài lịch, chưa gán ca, ngày lễ không khai giờ, ngày đã khai nghỉ, chồng giờ ⇒ cảnh báo). Không duyệt ⇒ xoá lượt mang id giải trình.
  // Trả { set: [ngày], removed: [ngày] }; ghi hoặc xoá lượt thì kỳ phải còn mở chấm công.
  async syncExplanation({ view, actx }: any) {
    const result = { set: [] as any[], removed: [] as any[] };
    if (!view || view.sessionId) return result;
    const owner = await this.store.getStaff(view.username);
    if (!owner) return result;
    const date = view.date;
    const all = await this.store.listSessions({ username: owner.username, includeScheduled: true });
    const ofDay = all.filter(s => AdminPresence.dayOf(s) === date);
    const marked = ofDay.filter(s => AdminPresence.isOurs(s) && s.entry.explanationId === view.id);
    if (view.status !== 'approved') {
      if (!marked.length) return result;
      await this.store.assertPeriodOpen(month(date), 'attendance');
      for (const s of marked) await this.#remove(s, actx, `Giải trình ${view.id}`);
      this.attendance.hintPunch(owner.username, date);
      result.removed.push(date);
      return result;
    }
    if (marked.length || ofDay.some(AdminPresence.isOurs)) return result; // lượt Admin sẵn có của ngày thắng
    if (!AdminPresence.missesPunch(ofDay)) return result; // trễ / về sớm: duyệt chỉ hết giữ, ActualHours vẫn cắt theo bậc
    const entry = await this.#buildForgotten(owner, date, all);
    if (!entry) return result;
    await this.store.assertPeriodOpen(month(date), 'attendance');
    await this.#write(owner, date, entry, null, { username: view.decidedBy }, actx, {
      extra: { explanationId: view.id },
      reason: `Giải trình ${view.id}`
    });
    this.attendance.hintPunch(owner.username, date);
    result.set.push(date);
    return result;
  }

  // Entry của lượt Admin theo giờ ca cho ngày quên chấm đã duyệt, hoặc null (kèm cảnh báo) khi không dựng được
  async #buildForgotten(owner?, date?, all?) {
    const punch = await this.punchRules(month(date));
    const shown = date.split('-').reverse().join('/');
    const skip = (why?) => {
      this.warn('EXPLANATION_NOT_RECORDED', `Ngày ${shown}: đã duyệt nhưng chưa ghi được giờ ca (${why})`, { date });
      return null;
    };
    const holiday = new Set<any>(await this.store.getSetting('holidays', [])).has(date);
    const declared = ((await this.store.getSheet(owner.username, month(date))).days || {})[date] || null;
    // Chỉ ngày nghỉ đã khai mà đang chờ duyệt hoặc đã duyệt là ngày nghỉ; khai nghỉ bị từ chối thì ngày vẫn là ngày đi làm (Check-in được), không còn khai gì
    const rejectedOff =
      !!declared &&
      DECLARED_OFF.includes(declared.kind) &&
      ((await this.dayApproval(owner.username, date, declared)) || {}).status === 'rejected';
    const day = rejectedOff ? null : declared;
    if (day && day.kind !== 'work') return skip('ngày đã khai là ngày nghỉ');
    // Ca của lượt: ca Admin chọn cho ngày nếu có, không thì ca được gán (như #build)
    const assigned = await this.attendance.punchStaff(owner, date);
    const staff =
      day && typeof day.preset === 'string' && Object.hasOwn(punch.SHIFT, day.preset)
        ? { ...assigned, shiftCode: day.preset }
        : assigned;
    const plannedShift = punch.planShift(staff, date);
    if (!plannedShift) return skip('người này chưa được gán ca');
    if (plannedShift.kind !== 'work') return skip('ngày ngoài lịch làm việc');
    if (holiday && !(day && day.in && day.out)) return skip('ngày lễ không khai giờ đi làm');
    const pres = AdminPresence.forgottenPresence(punch, plannedShift, date, day, holiday);
    const overlap = this.#overlap(pres, all, date);
    if (overlap) return skip(overlap.charAt(0).toLowerCase() + overlap.slice(1));
    const built = punch.buildDay(staff, pres.inIso, pres.outIso, 'admin', { plannedShift, approveIncomplete: true });
    return built.entry;
  }

  // Chồng giờ với lượt khác (như src/domain/attendance/index.ts → sessionOverlap), trừ lượt Admin của chính ngày này và lượt bấm bị chặn đã
  // đóng (thiếu giờ vào / ra, chờ đối soát, hoặc lượt thật cùng ngày công "không khớp ca" như Check-in ngày ngoài lịch): lượt Admin thắng
  // các lượt đó. Lượt đang mở vẫn tính (đang trong ca, không đụng tới).
  #overlap(pres?, all?, date?) {
    const a = Date.parse(pres.inIso),
      b = Date.parse(pres.outIso);
    for (const s of all) {
      const e = s.entry || {};
      if (AdminPresence.isOurs(s) && AdminPresence.dayOf(s) === date) continue;
      if (!e.presIn || (s.state !== 'open' && (!e.presOut || REVIEW_REASONS.includes(e.reason)))) continue;
      if (s.state === 'closed' && e.reason === 'off-shift' && AdminPresence.dayOf(s) === date) continue;
      const start = Date.parse(e.presIn),
        end = s.state === 'open' ? Infinity : Date.parse(e.presOut);
      if (Number.isFinite(start) && !Number.isNaN(end) && a < end && b > start)
        return `Giờ có mặt chồng với lượt ngày ${s.date}`;
    }
    return '';
  }

  // Tạo hoặc sửa lượt Admin của ngày. Sửa: chỉ thay giờ vào / ra và các trường có mặt, giữ phần khai OT của lượt cũ. Trả lượt đã ghi.
  async #write(owner?, date?, entry?, existing?, caller?, actx?, { extra = {}, reason = null }: any = {}) {
    const kept = existing ? { ...existing.entry } : {};
    for (const key of REBUILT_ONLY) delete kept[key];
    const fresh = { ...entry };
    for (const key of EXTRA_FIELDS) if (Object.hasOwn(kept, key)) delete fresh[key];
    const stamp = { origin: ORIGIN, declaredBy: caller.username, declaredAt: this.nowIso() };
    const full = { ...kept, ...fresh, ...extra, ...stamp };
    let saved;
    if (existing) {
      saved = await this.store.updateSession(existing.id, existing.version, { date, state: 'closed', entry: full });
      if (!saved) throw stale();
    } else saved = await this.store.createSession(owner.username, date, 'closed', full);
    await this.#auditRow(actx, 'attendance.admin.set', saved, existing ? existing.entry : null, full, reason);
    return saved;
  }

  // Xoá lượt Admin do đường này tạo (điều kiện origin nằm ngay trong câu lệnh: không bao giờ xoá nhầm lượt bấm thật)
  async #remove(session?, actx?, reason: any = null) {
    const gone = await this.store.sessionsRepo.removeOrigin(session.id, session.version, ORIGIN);
    if (!gone) throw stale();
    await this.#auditRow(actx, 'attendance.admin.remove', session, session.entry, null, reason);
  }

  async #auditRow(actx?, action?, session?, before?, after?, reason: any = null) {
    const times = (e?) =>
      e ? { presIn: e.presIn || null, presOut: e.presOut || null, shift: e.preset || null } : null;
    await this.audit.write(actx, {
      action,
      entityKind: 'attendance_session',
      entityId: String(session.id),
      subject: session.username,
      month: month(session.date),
      before: times(before),
      after: times(after),
      reason
    });
  }
}

export = { AdminPresence, ORIGIN };
