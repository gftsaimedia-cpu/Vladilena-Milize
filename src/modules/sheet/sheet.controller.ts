import { AUDIT, AUTHZ, DOMAIN, EVENTS, RULES, STORE } from '../../core/tokens';
import { SheetHelpers } from './sheet.helpers';
import { Controller, Get, Put, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const { AsyncList } = require('../../shared/async-list');
import { reasonOf } from '../../shared/reason';

const { HttpError, readJson } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validMonth, USERNAME_RE } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { ownerView, sheetForViewer } = require('../../domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
const { closeStale } = require('../../domain/attendance'); // phiên Check-in/out dùng chung
const { sessionsFor } = require('../../domain/attendance/session-view');
const { KpiScoring } = require('../../domain/kpi/kpi-scoring');
const { sheetApprovals } = require('../../domain/approvals'); // khoản tự khai chờ duyệt
const { checkSheetLimits } = require('../../domain/overtime/hour-limits').HourLimits; // trần OT tháng (OT cộng giờ ca chính làm ngày lễ), giới hạn iSAT theo tháng
const sheetBulk = require('../../domain/sheet-bulk'); // Admin chấm công thay nhiều người, nhiều ngày, một ca
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const periods = require('../../domain/period/periods'); // vòng đời kỳ lương, phiếu chụp bất biến, số ước tính của nhân sự
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT

const { timesheet } = require('../../domain/timesheet/services'); // kiểm nghiệp vụ lịch khai // các lớp của src/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const warnings = require('../../platform/warnings'); // cảnh báo thay cho chặn
const { estimateSheet, leaveDates, neighborDays, schedule } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const { sheetOwner, approveOnBehalf } = require('../../domain/sheet-on-behalf'); // Admin khai lịch thay nhân sự
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class SheetController {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(STORE) private readonly store: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(EVENTS) private readonly events: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(SheetHelpers) private readonly sheetHelpers: SheetHelpers
  ) {}

  /* ---------- số ước tính của chính người đăng nhập (chỉ dữ liệu của mình; ghi rõ là ước tính) ---------- */
  @Get('me/estimate')
  async getMeEstimate(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, route, need } = c;
    const u = need();
    const month = url.searchParams.get('month') || this.rules.vnToday().slice(0, 7);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
    // Không đọc tham số user: người khác không bao giờ xem được qua route này
    return await periods.estimate(u, month, { rows: url.searchParams.get('rows') === '1' });
  }

  @Get('sheet')
  async getSheet(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, need } = c;
    const u = need();
    const month = url.searchParams.get('month'),
      who = (url.searchParams.get('user') || u.username).toLowerCase();
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Tài khoản ngoài bảng lương và không có quyền xem lịch (tài khoản chỉ có vai trò) xem lịch của CHÍNH MÌNH: 200 với lịch trống, không phải 403 "xem bảng của người khác"; Admin nhận bảng đầy đủ
    // (an toàn: không có dữ liệu của ai; payrollSubject false để giao diện ẩn các phần chỉ dành cho người được trả lương)
    if (who === u.username && !u.payrollSubject && !(await this.authz.can(u, 'attendance.read', { username: who })))
      return {
        month,
        payrollSubject: false,
        days: {},
        attendanceSessions: [],
        otherLeave: [],
        neighbors: {},
        approvals: {},
        corrections: [],
        kpiWeights: Object.fromEntries((await this.rules.rulesFor(month)).kpi.COMPONENTS.map(c => [c.key, c.weight])),
        kpiParts: { complete: false }
      };
    if (!(await this.authz.can(u, 'attendance.read', { username: who })))
      throw new HttpError(403, 'Không được xem bảng của người khác');
    const staff = who === u.username ? u : await this.store.getStaff(who);
    if (staff && staff.payrollSubject) await closeStale(staff);
    // otherLeave: ngày nghỉ phép năm ở các tháng khác, để giao diện tính số phép còn lại; corrections: yêu cầu điều chỉnh trong tháng
    return {
      ...(await sheetForViewer(u, who, await estimateSheet(who, month))),
      rev: (await this.store.getSheet(who, month)).rev, // số lần lưu lịch khai; gửi lại làm expectedRev khi PUT /api/sheet
      ...(staff && who !== u.username ? { owner: await ownerView(u, staff, month) } : {}), // hồ sơ tóm tắt người được xem (khai thay)
      attendanceSessions: await sessionsFor({ username: who, month }),
      otherLeave: staff ? (await leaveDates(staff)).filter(d => !d.startsWith(month)) : [],
      neighbors: await neighborDays(who, month),
      ...(await schedule.scheduleView(staff, month)),
      // Trọng số 5 thành phần KPI của tháng (tham số kpi.weight.*), để màn nhân viên không viết cứng
      kpiWeights: Object.fromEntries((await this.rules.rulesFor(month)).kpi.COMPONENTS.map(c => [c.key, c.weight])),
      kpiParts: await this.domain.kpi.partsView(
        (await this.domain.kpi.has(staff, await this.rules.monthParams(month))) &&
          (await this.authz.can(u, 'salary.read', { username: who }))
          ? await this.store.getKpiScores(who, month)
          : null,
        month,
        u
      ),
      corrections: await this.store.listCorrections({ username: who, month }),
      approvals: await sheetApprovals(who, month, (await estimateSheet(who, month)).days),
      // Số liệu theo tham số của tháng cho app nhân viên: số phép đến hôm nay, báo cáo trễ / về sớm / phút trừ từng ngày, bảng làm tròn phút trừ
      leaveBalance: await this.sheetHelpers.leaveBalanceView(staff),
      actualReport: await this.sheetHelpers.actualReportView(staff, month),
      cutRule: await this.sheetHelpers.cutRuleView(month)
    };
  }

  @Put('sheet')
  async putSheet(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, need, guardPeriod } = c;
    const caller = need();
    const body = await readJson(req);
    const { month, days, kpiPct, kpiAmt, user: onBehalfOf, expectedRev, confirmDays, preserveKpi } = body;
    if (preserveKpi !== undefined && typeof preserveKpi !== 'boolean')
      throw new HttpError(400, 'preserveKpi phải là true hoặc false');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Admin khai lịch thay nhân sự (user khác người gọi, cần request.decide.* ở phạm vi người đó, nếu không 403): MỌI kiểm tra bên dưới chạy trên hồ sơ của người được khai
    const u = await sheetOwner(caller, onBehalfOf),
      onBehalf = u !== caller;
    if (preserveKpi && onBehalf)
      throw new HttpError(400, 'preserveKpi chỉ dùng khi khai lịch của chính mình');
    if (preserveKpi && (Object.hasOwn(body, 'kpiPct') || Object.hasOwn(body, 'kpiAmt')))
      throw new HttpError(400, 'Không gửi KPI khi yêu cầu giữ nguyên KPI đang lưu');
    await guardPeriod(month);
    const prevDays = (await estimateSheet(u.username, month)).days;
    const clean = await this.sheetHelpers.cleanDays(days);
    const { sheetParams, sched, holidays } = await timesheet().validator.validate({
      u,
      month,
      clean,
      prevDays,
      onBehalf
    }); // kiểm nghiệp vụ lịch ước tính (src/domain/timesheet/services.ts)
    await checkSheetLimits({ params: sheetParams, month, clean, prevDays, holidays }); // trần OT tháng = OT cộng giờ ca chính làm ngày lễ (MONTH_OT_CAP), isat.monthlyLimit
    // Khai thay không đụng vào % và mức KPI tự đánh giá của người được khai (đó là phần của họ): giữ đúng số đang lưu
    const kept = onBehalf || preserveKpi ? await this.store.getSheet(u.username, month) : null;
    const amt = onBehalf || preserveKpi ? kept.kpiAmt : await this.domain.kpi.cleanAmount(kpiAmt, u, month),
      pct = onBehalf || preserveKpi ? kept.kpiPct : KpiScoring.cleanScore(kpiPct);
    // Lịch và trạng thái duyệt đổi cùng nhau hoặc không đổi gì; trạng thái duyệt chỉ do máy chủ quyết, không đọc từ yêu cầu
    let decided = [];
    const changes = await this.store.transaction(async () => {
      await timesheet().revision.assert(u.username, month, expectedRev); // lệch rev → 409 SHEET_STALE, chưa ghi gì
      await this.store.setSheet(u.username, month, clean, pct, amt);
      const found = await this.store.approvals.reconcile(
        u.username,
        month,
        this.store.approvals.declaredItems(clean, { holidays: [...holidays], staffType: u.type, schedule: sched })
      );
      if (onBehalf)
        decided = (await approveOnBehalf({ caller, owner: u, month, found, prevDays, clean, actx, confirmDays }))
          .decided;
      return found;
    });
    if (changes.added.length || changes.reset.length || changes.resubmitted.length || changes.removed.length)
      await this.events.emit.approvalsChanged(month);
    if (onBehalf) {
      await this.events.emit.estimateChanged(u.username, month); // máy của người được khai nạp lại lịch
      if (decided.length) await this.events.emit.requestsDecided(decided);
    }
    return {
      ok: true,
      rev: (await this.store.getSheet(u.username, month)).rev, // gửi lại làm expectedRev ở lần lưu sau
      approvals: await sheetApprovals(u.username, month, (await estimateSheet(u.username, month)).days),
      reset: changes.reset,
      resubmitted: changes.resubmitted,
      removed: changes.removed,
      ...(onBehalf ? { onBehalf: true, autoApproved: decided.length } : {})
    };
  }

  // Admin chấm công thay hàng loạt: tất cả hoặc không (src/domain/sheet-bulk.ts)
  @Put('sheet/bulk')
  async putSheetBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, needAdmin, guardPeriod } = c;
    const caller = needAdmin();
    const plan = await sheetBulk.plan(caller, await readJson(req));
    await guardPeriod(plan.month);
    return await sheetBulk.save({ caller, actx, plan, cleanDays: this.sheetHelpers.cleanDays });
  }

  /* ---------- gán ca cho nhiều người (Hồ sơ › Gán ca): tất cả hoặc không ---------- */
  @Put('staff/shift-bulk')
  async putStaffShiftBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx, needAdmin } = c;
    needAdmin();
    const b = await readJson(req);
    const punchRules = (await this.rules.rulesFor()).punch;
    if (!Array.isArray(b.usernames) || !b.usernames.length)
      throw new HttpError(400, 'Chọn ít nhất một người để gán ca', { code: 'USERNAMES_REQUIRED' });
    const bulkMax = (await this.rules.rulesFor()).params['system.staff.bulkMax'];
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
    shiftCode = (await this.domain.shifts.canonicalOf(shiftCode)) || shiftCode; // hồ sơ lưu mã của danh mục ca
    // Ngày hiệu lực: ca đổi ngay (không có lịch hiệu lực); chỉ nhận hôm nay hoặc để trống
    if (b.effective !== undefined && b.effective !== null && b.effective !== this.rules.vnToday())
      throw new HttpError(400, 'Ca có hiệu lực ngay khi lưu: ngày hiệu lực chỉ nhận hôm nay hoặc để trống', {
        code: 'EFFECTIVE_UNSUPPORTED'
      });
    const reason = reasonOf(b.reason);
    const people = await AsyncList.map(usernames, async u => await this.store.getStaff(u));
    const missing = usernames.filter((u, i) => !people[i]);
    if (missing.length)
      throw new HttpError(404, `Không có tài khoản: ${missing.join(', ')}`, { code: 'STAFF_NOT_FOUND', missing });
    // Không ai tự đổi ca của chính mình: gán hàng loạt không được lách quy tắc đó
    selfDecision(
      people.some(p => this.authz.isSelfDecision(me, p.username) && p.shiftCode !== shiftCode),
      { doing: 'đổi ca' }
    );
    const result = await this.store.transaction(async () => {
      const updated: any[] = [],
        unchanged: any[] = [];
      for (const person of people) {
        if (person.shiftCode === shiftCode) {
          unchanged.push(person.username);
          continue;
        }
        await this.store.repos.staff.setShift(person.username, shiftCode);
        await this.audit.write(actx, {
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
    return { ok: true, shiftCode, ...result };
  }
}
