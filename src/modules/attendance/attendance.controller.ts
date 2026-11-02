import { AUDIT, AUTHZ, DOMAIN, EVENTS, RULES, STORE } from '../../core/tokens';
import { AttendanceHelpers } from './attendance.helpers';
import { Controller, Get, Post, Put, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const { AsyncList } = require('../../shared/async-list');

const { HttpError, readJson, clientIp } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validMonth, positiveId } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { estimateSheet } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const {
  punchStaff,
  closeStale,
  closeStaleFor,
  hintPunch,
  sessionOverlap,
  correctionVersion
} = require('../../domain/attendance'); // phiên Check-in/out dùng chung
const { sessionsFor, sessionsWithHistory } = require('../../domain/attendance/session-view');
const { ADMIN_ORIGIN } = require('../../domain/attendance/attendance-sessions');
const otSheet = require('../../domain/ot-sheet'); // OT Check-in/out được duyệt thành OT đã duyệt của ngày trong Lịch ước tính
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const explanations = require('../../domain/explanation/explanations'); // giải trình Check-out muộn
// các lớp của src/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const warnings = require('../../platform/warnings'); // cảnh báo thay cho chặn
const { listOt, validateOtDeclaration } = require('../../domain/ot'); // khai OT thực tế ở Check-in/out
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class AttendanceController {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(STORE) private readonly store: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(EVENTS) private readonly events: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AttendanceHelpers) private readonly attendanceHelpers: AttendanceHelpers
  ) {}

  /* ---------- check-in / check-out: mỗi lần ghi nhắm đúng một phiên ---------- */
  @Get('punch')
  async getPunch(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, need } = c;
    const u = need();
    if (!u.payrollSubject)
      return {
        enabled: false,
        canCheckIn: false,
        openSession: null,
        lastSession: null,
        serverNow: this.rules.nowIso()
      };
    await closeStale(u);
    return { ...(await this.attendanceHelpers.punchState(u)), ...(await this.attendanceHelpers.punchExtras(u)) };
  }

  @Post('punch')
  async postPunch(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, need, guardPeriod } = c;
    const u = need();
    if (!u.payrollSubject)
      throw new HttpError(
        403,
        u.role === 'admin' ? 'Admin không chấm công' : 'Tài khoản không thuộc bảng lương không chấm công'
      );
    const punch = (await this.rules.rulesFor()).punch;
    const b = await readJson(req),
      { type, requestId, sessionId } = b;
    if (!['in', 'out'].includes(type) || typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))
      throw new HttpError(400, 'Cần loại thao tác và requestId hợp lệ');
    if (type === 'out' && !positiveId(sessionId)) throw new HttpError(400, 'Cần ID lượt Check-out');
    const operation = JSON.stringify({ type, sessionId: type === 'out' ? sessionId : null });
    const response = await this.store.transaction(async () => {
      await this.store.lock(`punch:${u.username}`); // mọi Check-in/out của một người xếp hàng: không hai lượt mở cùng lúc
      const prior = await this.store.getPunchRequest(u.username, requestId);
      if (prior) {
        if (prior.operation !== operation) throw new HttpError(409, 'requestId đã dùng cho thao tác khác');
        return JSON.parse(prior.response_json);
      }
      await closeStale(u);
      const t = this.rules.nowIso();
      let session;
      if (type === 'in') {
        const outsideZone = await this.domain.geofencePolicy.check(b.location); // chỉ Check-in cần vị trí; Check-out thì không. outsideZone: cờ ngoài vùng, chỉ true/false, không toạ độ
        if (await this.store.openSession(u.username)) throw new HttpError(409, 'Bạn đang có lượt mở — Check-out trước');
        const opened = await punch.openSessionDay(await punchStaff(u, t), t);
        const previous = await this.store.listSessions({ username: u.username, date: opened.date });
        const endedEarly = previous.some(s => {
          const old = s.entry && s.entry.plannedShift;
          return (
            s.state === 'closed' &&
            old &&
            opened.entry.plannedShift &&
            old.startIso === opened.entry.plannedShift.startIso &&
            punch.canonicalOf(old.code) === punch.canonicalOf(opened.entry.plannedShift.code) &&
            s.entry.origin !== ADMIN_ORIGIN &&
            old.endIso &&
            s.entry.presOut &&
            Date.parse(s.entry.presOut) < Date.parse(old.endIso)
          );
        });
        if (endedEarly)
          throw new HttpError(409, 'Ca này đã kết thúc sớm; không Check-in lại trong cùng ca', { code: 'SHIFT_ALREADY_ENDED' });
        const verdict = await this.attendanceHelpers.checkInVerdict(u, t); // không có lịch / khoản được duyệt, hay ngoài khung ca mà không khoản nào phủ giờ này: không ghi gì
        if (!verdict.allowed) throw new HttpError(409, verdict.message, { code: verdict.code });
        await guardPeriod(opened.date); // ca đêm thuộc ngày bắt đầu ca
        if (outsideZone) opened.entry.outsideZone = true;
        const overlap = await sessionOverlap(u.username, t, new Date(Date.parse(t) + 1).toISOString());
        if (overlap) throw new HttpError(400, overlap);
        // Check-in không hợp lệ (trễ, ngoài ca, ngoài vùng GPS, lượt thứ hai trong ca) phải có giải trình gửi kèm (b.explanation)
        const inCases = await this.domain.punchExplanation.casesIn(u.username, opened);
        if (inCases.some(c => c.code === 'forgotIn')) opened.entry.forgotIn = true;
        this.domain.punchExplanation.demand('in', inCases, b.explanation);
        session = await this.store.createSession(u.username, opened.date, 'open', opened.entry);
        await this.store.addPunch(
          u.username,
          t,
          'in',
          clientIp(req),
          false,
          { plannedShift: opened.entry.plannedShift || null },
          session.id
        );
        if (inCases.length)
          await this.domain.punchExplanation.record({
            side: 'in',
            username: u.username,
            session,
            cases: inCases,
            text: b.explanation,
            actx
          });
      } else {
        session = await this.store.getSession(sessionId);
        if (!session || session.username !== u.username) throw new HttpError(404, 'Không có lượt chấm công này');
        if (session.state !== 'open') throw new HttpError(409, 'Lượt này đã Check-out');
        await guardPeriod(session.date);
        if (Date.parse(t) < Date.parse(session.entry.presIn))
          throw new HttpError(400, 'Giờ Check-out không thể trước giờ vào');
        // Check-out muộn hơn giờ kết thúc ca (cộng phần làm thêm đã khai) quá CHECKOUT_GRACE_MIN phút (check-out muộn chỉ có
        // hiệu lực khi Admin duyệt giải trình): giải trình gửi kèm (b.explanation), lượt thành "Quên Check-out" và giữ giờ bấm chờ Admin duyệt
        const sheetDay = (await estimateSheet(u.username, session.date.slice(0, 7))).days[session.date];
        const late = { staff: u, session, at: t, ip: clientIp(req), text: b.explanation, actx };
        if (explanations.needsExplanation(session, t, sheetDay))
          session = await this.domain.lateCheckout.record({
            ...late,
            lateMin: explanations.lateCheckoutMin(session, t, sheetDay)
          });
        else {
          // Check-out sớm (không phải muộn): cũng phải có giải trình gửi kèm; giờ bấm vẫn là giờ ra của lượt
          const outCases = await this.domain.punchExplanation.casesOut({ staff: u, session, at: t, sheetDay });
          this.domain.punchExplanation.demand(
            'out',
            outCases,
            b.explanation,
            outCases.length ? { preview: await this.attendanceHelpers.checkoutPreview(u) } : {}
          );
          session = await this.domain.lateCheckout.checkOut(late);
          if (outCases.length)
            await this.domain.punchExplanation.record({
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
      const response = await this.attendanceHelpers.punchState(u);
      await this.store.savePunchRequest(u.username, requestId, operation, session.id, response);
      return response;
    });
    // serverNow lấy lúc gửi (không lưu trong bản phát lại theo requestId, nếu không máy khách sẽ nhận giờ cũ)
    return { ...response, ...(await this.attendanceHelpers.punchExtras(u)) };
  }

  @Get('ot')
  async getOt(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, needAdmin } = c;
    needAdmin();
    const status = url.searchParams.get('status');
    return { ot: await listOt(['approved', 'rejected'].includes(status ?? '') ? status : 'pending') };
  }

  @Post('ot')
  async postOt(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, needAdmin, guardPeriod } = c;
    const admin = needAdmin(),
      b = await readJson(req);
    const result = await this.store.transaction(async () => {
      if (!positiveId(b.sessionId)) throw new HttpError(400, 'Cần chọn lượt chấm công');
      const session = await this.store.getSession(b.sessionId);
      if (!session) throw new HttpError(404, 'Không có lượt chấm công này');
      correctionVersion(session, b.version);
      const staff = await this.store.getStaff(session.username);
      if (!staff || !staff.payrollSubject) throw new HttpError(400, 'Không có nhân sự tương ứng');
      await guardPeriod(session.date);
      const reason = String(b.reason || '')
        .trim()
        .slice(0, 300);
      const entry = await validateOtDeclaration(staff, session, b),
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
            changedAt: this.rules.nowIso()
          }
        ];
        if (old.otReview) entry.otHistory = [...(old.otHistory || []), old.otReview];
      }
      delete entry.otReview;
      entry.otDeclaration = { by: admin.username, at: this.rules.nowIso(), reason };
      entry.otNeedsReview = true;
      const updated = await this.store.updateSession(session.id, session.version, {
        date: session.date,
        state: session.state,
        entry
      });
      if (!updated) throw new HttpError(409, 'Lượt chấm công đã thay đổi — tải lại trước khi khai OT');
      await this.audit.write(actx, {
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
      const declared = await this.store.getSession(result.sessionId);
      if (declared) this.events.emit.attendanceChanged('ot', declared.date.slice(0, 7));
    }
    return result;
  }

  @Put('ot')
  async putOt(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx, needAdmin, guardPeriod } = c;
    const admin = needAdmin(),
      b = await readJson(req);
    let otSession: { username: string; date: string } | null = null,
      onSheet = false;
    await this.store.transaction(async () => {
      if (!positiveId(b.sessionId)) throw new HttpError(400, 'Cần chọn lượt OT');
      const session = await this.store.getSession(b.sessionId);
      if (!session || session.entry.extraKind !== 'ot') throw new HttpError(404, 'Lượt này không có OT');
      otSession = { username: session.username, date: session.date };
      correctionVersion(session, b.version);
      if (session.state === 'open') throw new HttpError(409, 'Lượt này đang mở');
      await guardPeriod(session.date);
      selfDecision(this.authz.isSelfDecision(me, session.username), {
        doing: 'duyệt OT'
      });
      if (session.entry.otReview) throw new HttpError(409, 'OT lượt này đã được xử lý');
      if (!['approve', 'reject'].includes(b.action)) throw new HttpError(400, 'action phải là approve hoặc reject');
      const note = String(b.note || '')
        .trim()
        .slice(0, 300);
      if (b.action === 'approve') {
        if (session.entry.otDeclaration)
          await validateOtDeclaration(await this.store.getStaff(session.username), session, session.entry);
        else {
          const err = (await this.rules.rulesFor(session.date.slice(0, 7))).punch.extraFits(session.entry);
          warnIf('OT_OUTSIDE_PRESENCE', !!err, {
            message: () => `${err}: bộ máy chỉ trả phần giờ có mặt liền với ca (không trả quá giờ đã chấm công).`
          });
        }
      }
      const entry = {
        ...session.entry,
        otNeedsReview: false,
        otReview: { ok: b.action === 'approve', by: admin.username, at: this.rules.nowIso(), ...(note ? { note } : {}) }
      };
      await this.store.updateSession(session.id, session.version, { date: session.date, state: session.state, entry });
      // OT được duyệt thành OT đã duyệt của ngày trên Lịch ước tính (nguồn tiền OT của bộ máy)
      if (b.action === 'approve')
        onSheet = await otSheet.payOnSheet({
          session,
          staff: await this.store.getStaff(session.username),
          by: admin.username
        });
      await this.audit.write(actx, {
        action: 'ot.decide',
        entityKind: 'attendance_session',
        entityId: String(session.id),
        subject: session.username,
        month: session.date.slice(0, 7),
        after: { status: b.action === 'approve' ? 'approved' : 'rejected' },
        reason: note || null
      });
    });
    const ot = otSession as unknown as { username: string; date: string }; // đặt trong giao dịch ở trên (không có thì giao dịch đã ném)
    this.events.emit.punchCorrected(ot.username, ot.date);
    this.events.emit.attendanceChanged('ot', ot.date.slice(0, 7));
    if (onSheet) {
      await this.events.emit.approvalsChanged(ot.date.slice(0, 7));
      this.events.emit.estimateChanged(ot.username, ot.date.slice(0, 7));
    }
    return { ok: true };
  }

  @Get('today')
  async getToday(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, needAdmin } = c;
    needAdmin();
    const { punch, actualHours: ActualHours } = await this.rules.rulesFor();
    const today = punch.vnDate(this.rules.nowIso());
    const people = (await this.store.listStaff()).filter(s => s.payrollSubject);
    await closeStaleFor(people);
    const rows = await AsyncList.map(people, async staff => {
      const sessions = await this.store.listSessions({ username: staff.username }),
        open = await this.store.openSession(staff.username);
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
    // Trạng thái hiển thị của lượt được chọn (src/domain/attendance/session-status.ts), nạp lô một lần cho mọi người; không có lượt thì null
    const shown = new Map<any, any>(
      (await sessionsWithHistory(rows.filter(r => r.session).map(r => r.session))).map(
        (s: any) => [s.id, s] as [any, any]
      )
    );
    for (const row of rows) {
      const s = row.session && shown.get(row.session.id);
      delete row.session;
      row.status = s ? s.status : null;
      row.statusNote = s ? s.statusNote : '';
    }
    return { today, rows };
  }

  @Get('attendance')
  async getAttendance(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, needAdmin } = c;
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const staff = await this.store.listStaff(),
      names = Object.fromEntries(staff.map(s => [s.username, s.name])),
      types = Object.fromEntries(staff.map(s => [s.username, s.type]));
    await closeStaleFor(staff.filter(s => s.payrollSubject));
    return {
      month,
      rows: (await sessionsFor({ month })).map(s => ({
        ...s,
        name: names[s.username] || s.username,
        type: types[s.username]
      }))
    };
  }
}
