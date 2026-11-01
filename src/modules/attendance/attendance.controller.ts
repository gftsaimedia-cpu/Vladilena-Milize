import { Controller, Get, Post, Put } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { checkInVerdict, punchState, checkoutPreview, punchExtras } from './attendance.helpers';
const { AsyncList } = require('../../../lib/shared/async-list');
const store = require('../../../lib/db');
const { HttpError, readJson, clientIp } = require('../../../lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const { rulesFor, nowIso } = require('../../../lib/request-rules'); // quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validMonth, positiveId } = require('../../../lib/domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { estimateSheet } = require('../../../lib/domain/sheet'); // lịch ước tính và ngày phép
const {
  punchStaff,
  closeStale,
  closeStaleFor,
  hintPunch,
  sessionOverlap,
  correctionVersion
} = require('../../../lib/domain/attendance'); // phiên Check-in/out dùng chung
const { sessionsFor, sessionsWithHistory } = require('../../../lib/domain/attendance/session-view');
const otSheet = require('../../../lib/domain/ot-sheet'); // OT Check-in/out được duyệt thành OT đã duyệt của ngày trong Lịch ước tính
const authz = require('../../../lib/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const audit = require('../../../lib/audit'); // nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const events = require('../../../lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const explanations = require('../../../lib/explanations'); // giải trình Check-out muộn
const { container } = require('../../../lib/domain/container'); // các lớp của lib/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const warnings = require('../../../lib/warnings'); // cảnh báo thay cho chặn
const { listOt, validateOtDeclaration } = require('../../../lib/domain/ot'); // khai OT thực tế ở Check-in/out
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class AttendanceController {
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
        serverNow: nowIso()
      };
    await closeStale(u);
    return { ...(await punchState(u)), ...(await punchExtras(u)) };
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
    const punch = (await rulesFor()).punch;
    const b = await readJson(req),
      { type, requestId, sessionId } = b;
    if (!['in', 'out'].includes(type) || typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))
      throw new HttpError(400, 'Cần loại thao tác và requestId hợp lệ');
    if (type === 'out' && !positiveId(sessionId)) throw new HttpError(400, 'Cần ID lượt Check-out');
    const operation = JSON.stringify({ type, sessionId: type === 'out' ? sessionId : null });
    const response = await store.transaction(async () => {
      await store.lock(`punch:${u.username}`); // mọi Check-in/out của một người xếp hàng: không hai lượt mở cùng lúc
      const prior = await store.getPunchRequest(u.username, requestId);
      if (prior) {
        if (prior.operation !== operation) throw new HttpError(409, 'requestId đã dùng cho thao tác khác');
        return JSON.parse(prior.response_json);
      }
      await closeStale(u);
      const t = nowIso();
      let session;
      if (type === 'in') {
        const outsideZone = await container.geofencePolicy.check(b.location); // chỉ Check-in cần vị trí; Check-out thì không. outsideZone: cờ ngoài vùng, chỉ true/false, không toạ độ
        if (await store.openSession(u.username)) throw new HttpError(409, 'Bạn đang có lượt mở — Check-out trước');
        const opened = await punch.openSessionDay(await punchStaff(u, t), t);
        const verdict = await checkInVerdict(u, t); // không có lịch / khoản được duyệt, hay ngoài khung ca mà không khoản nào phủ giờ này: không ghi gì
        if (!verdict.allowed) throw new HttpError(409, verdict.message, { code: verdict.code });
        await guardPeriod(opened.date); // ca đêm thuộc ngày bắt đầu ca
        if (outsideZone) opened.entry.outsideZone = true;
        const overlap = await sessionOverlap(u.username, t, new Date(Date.parse(t) + 1).toISOString());
        if (overlap) throw new HttpError(400, overlap);
        // Check-in không hợp lệ (trễ, ngoài ca, ngoài vùng GPS, lượt thứ hai trong ca) phải có giải trình gửi kèm (b.explanation)
        const inCases = await container.punchExplanation.casesIn(u.username, opened);
        container.punchExplanation.demand('in', inCases, b.explanation);
        session = await store.createSession(u.username, opened.date, 'open', opened.entry);
        await store.addPunch(
          u.username,
          t,
          'in',
          clientIp(req),
          false,
          { plannedShift: opened.entry.plannedShift || null },
          session.id
        );
        if (inCases.length)
          await container.punchExplanation.record({
            side: 'in',
            username: u.username,
            session,
            cases: inCases,
            text: b.explanation,
            actx
          });
      } else {
        session = await store.getSession(sessionId);
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
          session = await container.lateCheckout.record({
            ...late,
            lateMin: explanations.lateCheckoutMin(session, t, sheetDay)
          });
        else {
          // Check-out sớm (không phải muộn): cũng phải có giải trình gửi kèm; giờ bấm vẫn là giờ ra của lượt
          const outCases = await container.punchExplanation.casesOut({ staff: u, session, at: t, sheetDay });
          container.punchExplanation.demand(
            'out',
            outCases,
            b.explanation,
            outCases.length ? { preview: await checkoutPreview(u) } : {}
          );
          session = await container.lateCheckout.checkOut(late);
          if (outCases.length)
            await container.punchExplanation.record({
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
      const response = await punchState(u);
      await store.savePunchRequest(u.username, requestId, operation, session.id, response);
      return response;
    });
    // serverNow lấy lúc gửi (không lưu trong bản phát lại theo requestId, nếu không máy khách sẽ nhận giờ cũ)
    return { ...response, ...(await punchExtras(u)) };
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
    const result = await store.transaction(async () => {
      if (!positiveId(b.sessionId)) throw new HttpError(400, 'Cần chọn lượt chấm công');
      const session = await store.getSession(b.sessionId);
      if (!session) throw new HttpError(404, 'Không có lượt chấm công này');
      correctionVersion(session, b.version);
      const staff = await store.getStaff(session.username);
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
            changedAt: nowIso()
          }
        ];
        if (old.otReview) entry.otHistory = [...(old.otHistory || []), old.otReview];
      }
      delete entry.otReview;
      entry.otDeclaration = { by: admin.username, at: nowIso(), reason };
      entry.otNeedsReview = true;
      const updated = await store.updateSession(session.id, session.version, {
        date: session.date,
        state: session.state,
        entry
      });
      if (!updated) throw new HttpError(409, 'Lượt chấm công đã thay đổi — tải lại trước khi khai OT');
      await audit.write(actx, {
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
      const declared = await store.getSession(result.sessionId);
      if (declared) events.emit.attendanceChanged('ot', declared.date.slice(0, 7));
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
    await store.transaction(async () => {
      if (!positiveId(b.sessionId)) throw new HttpError(400, 'Cần chọn lượt OT');
      const session = await store.getSession(b.sessionId);
      if (!session || session.entry.extraKind !== 'ot') throw new HttpError(404, 'Lượt này không có OT');
      otSession = { username: session.username, date: session.date };
      correctionVersion(session, b.version);
      if (session.state === 'open') throw new HttpError(409, 'Lượt này đang mở');
      await guardPeriod(session.date);
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
          await validateOtDeclaration(await store.getStaff(session.username), session, session.entry);
        else {
          const err = (await rulesFor(session.date.slice(0, 7))).punch.extraFits(session.entry);
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
      await store.updateSession(session.id, session.version, { date: session.date, state: session.state, entry });
      // OT được duyệt thành OT đã duyệt của ngày trên Lịch ước tính (nguồn tiền OT của bộ máy)
      if (b.action === 'approve')
        onSheet = await otSheet.payOnSheet({
          session,
          staff: await store.getStaff(session.username),
          by: admin.username
        });
      await audit.write(actx, {
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
    events.emit.punchCorrected(ot.username, ot.date);
    events.emit.attendanceChanged('ot', ot.date.slice(0, 7));
    if (onSheet) {
      await events.emit.approvalsChanged(ot.date.slice(0, 7));
      events.emit.estimateChanged(ot.username, ot.date.slice(0, 7));
    }
    return { ok: true };
  }

  @Get('today')
  async getToday(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, needAdmin } = c;
    needAdmin();
    const { punch, actualHours: ActualHours } = await rulesFor();
    const today = punch.vnDate(nowIso());
    const people = (await store.listStaff()).filter(s => s.payrollSubject);
    await closeStaleFor(people);
    const rows = await AsyncList.map(people, async staff => {
      const sessions = await store.listSessions({ username: staff.username }),
        open = await store.openSession(staff.username);
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
    // Trạng thái hiển thị của lượt được chọn (lib/domain/attendance/session-status.ts), nạp lô một lần cho mọi người; không có lượt thì null
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
    const staff = await store.listStaff(),
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
