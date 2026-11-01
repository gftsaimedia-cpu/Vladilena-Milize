import { AUDIT, AUTHZ, EVENTS, RULES, STORE } from '../../core/tokens';
import { Controller, Get, Put, Post, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { SLIP_MONEY, SLIP_QTY } from './periods.helpers';

const { HttpError, readJson } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validMonth } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
// công tắc Agents
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('../../platform/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const periods = require('../../domain/period/periods'); // vòng đời kỳ lương, phiếu chụp bất biến, số ước tính của nhân sự
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const warnings = require('../../platform/warnings'); // cảnh báo thay cho chặn
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class PeriodsController {
  constructor(
    @Inject(STORE) private readonly store: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(RULES) private readonly rules: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  /* ---------- Admin duyệt khoản tự khai trong Lịch ước tính (iSAT, nghỉ được duyệt, OT, làm bù) ---------- */
  // Quyền duyệt TỪNG khoản: nhóm duyệt = loại khoản (request.decide.<khoản>), kèm phạm vi dữ liệu của vai trò (nhóm mình: chỉ chính mình cho tới khi có
  // bảng phân công). Cổng ROUTE_CAPS chỉ hỏi "có ít nhất một nhóm".
  /* ---------- Admin sửa số trên phiếu lương (chỉ Admin đọc / ghi; nhân sự luôn thấy số tự tính) ---------- */
  @Get('slip-override')
  async getSlipOverride(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, url, me, actx, needAdmin, guardPeriod } = c;
    const admin = needAdmin(),
      b = req.method === 'PUT' ? await readJson(req) : null;
    const who = String((b ? b.user : url.searchParams.get('user')) || '').toLowerCase(),
      month = b ? b.month : url.searchParams.get('month');
    if (!(await this.store.getStaff(who))) throw new HttpError(404, 'Không có nhân sự này');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    if (b) {
      await guardPeriod(month);
      selfDecision(this.authz.isSelfDecision(me, who), {
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
      const opts: Record<string, any> = {};
      if (b.expectedRev !== undefined) {
        if (!Number.isInteger(b.expectedRev) || b.expectedRev < 0)
          throw new HttpError(400, 'expectedRev phải là số nguyên không âm');
        opts.expectedRev = b.expectedRev;
      }
      await this.store.transaction(async () => {
        const prior = (await this.store.getSlipOverride(who, month)).values;
        await this.store.setSlipOverride(who, month, clean, admin.username, reason, opts);
        await this.audit.slipOverride(actx, who, month, prior, clean, reason);
      });
    }
    return await this.store.getSlipOverride(who, month);
  }

  @Put('slip-override')
  async putSlipOverride(@Ctx() c: ApiContext): Promise<unknown> {
    return this.getSlipOverride(c);
  }

  /* ---------- kỳ lương: danh sách kiểm, chốt công, tính lương và bản chụp, AI kiểm tra, duyệt, chi trả, mở lại ---------- */
  @Get('periods')
  async getPeriods(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, need } = c;
    need();
    return {
      year: Number(url.searchParams.get('year') || this.rules.vnToday().slice(0, 4)),
      periods: await periods.list(url.searchParams.get('year') || this.rules.vnToday().slice(0, 4))
    };
  }

  @Get('periods/:month')
  async periodStep(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, url, me, seg, route, actx, need, routeKey } = c;
    need(); // quyền đã kiểm ở cổng ROUTE_CAPS
    const month = seg[2];
    const step = routeKey.slice(routeKey.indexOf(':month') + ':month'.length);
    if (req.method === 'GET') {
      if (step === '') return await periods.view(month);
      if (step === '/verify') return await periods.verify(month);
      if (step === '/estimates') {
        const q = url.searchParams;
        return await periods.estimates(month, {
          q: q.get('q') || undefined,
          type: q.get('type') || undefined,
          page: q.get('page') || undefined,
          pageSize: q.get('pageSize') || undefined
        });
      }
      if (step === '/payslips') {
        const q = url.searchParams;
        return await periods.payslips(month, {
          status: q.get('status') || undefined,
          q: q.get('q') || undefined,
          flag: q.get('flag') || undefined,
          type: q.get('type') || undefined,
          page: q.get('page') || undefined,
          pageSize: q.get('pageSize') || undefined
        });
      }
      if (step === '/payslips/:username' || step === '/estimates/:username') {
        let username;
        try {
          username = decodeURIComponent(seg[4]).toLowerCase();
        } catch {
          throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
        }
        const viewAll = (await this.authz.scopeOf(me, 'payroll.view')) === 'all'; // nhân sự chỉ có phạm vi tự mình
        // phiếu ước tính của người khác (kể cả của chính mình) chỉ dành cho phạm vi tất cả: lớp chặn thứ hai sau cổng route
        if (!viewAll && (step === '/estimates/:username' || username !== me.username))
          throw new HttpError(403, 'Chỉ xem được phiếu của chính mình', { code: 'FORBIDDEN_CAP' });
        // phiếu ước tính của một người đi cùng cổng payroll.view với danh sách ước tính (nhân sự đã bị chặn ở cổng)
        return step === '/estimates/:username'
          ? await periods.estimateOne(month, username)
          : await periods.payslip(month, username, { self: !viewAll });
      }
    } else {
      const b = await readJson(req);
      const by = me.username;
      // Mỗi bước kỳ trả { month, status, rev }: báo cho các màn sau khi bước đã COMMIT
      const stepDone = async out => {
        await this.events.emit.periodChanged(out);
        return out;
      };
      if (step === '/lock-attendance') return await stepDone(await periods.lockAttendance(month, b, actx, by));
      if (step === '/calculate') return await stepDone(await periods.calculate(month, b, actx, by));
      if (step === '/approve') return await stepDone(await periods.approve(month, b, actx, by));
      if (step === '/mark-paid') {
        const paid = await periods.markPaid(month, b, actx, by);
        await this.events.emit.payslipAvailable(month, await periods.payslipUsers(month));
        return await stepDone(paid);
      }
      if (step === '/reopen') {
        const inputsCap = periods.REOPEN_INPUTS_CAP(b.to);
        if (inputsCap && !(await this.authz.can(me, inputsCap)))
          throw new HttpError(403, 'Mở lại về bước này cần quyền mở lại dữ liệu đầu vào (chỉ Admin)', {
            code: 'FORBIDDEN_CAP',
            cap: inputsCap
          });
        return stepDone(await periods.reopen(month, b, actx, by));
      }
      if (step === '/payslips/decide') return { items: await periods.decidePayslips(month, b, me, actx) };
    }
  }

  @Post('periods/:month/lock-attendance')
  async postPeriodsMonthLockAttendance(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Post('periods/:month/calculate')
  async postPeriodsMonthCalculate(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Post('periods/:month/approve')
  async postPeriodsMonthApprove(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Post('periods/:month/mark-paid')
  async postPeriodsMonthMarkPaid(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Post('periods/:month/reopen')
  async postPeriodsMonthReopen(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Get('periods/:month/payslips')
  async getPeriodsMonthPayslips(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Get('periods/:month/estimates')
  async getPeriodsMonthEstimates(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Get('periods/:month/estimates/:username')
  async getPeriodsMonthEstimatesUsername(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Get('periods/:month/payslips/:username')
  async getPeriodsMonthPayslipsUsername(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Put('periods/:month/payslips/decide')
  async putPeriodsMonthPayslipsDecide(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }

  @Get('periods/:month/verify')
  async getPeriodsMonthVerify(@Ctx() c: ApiContext): Promise<unknown> {
    return this.periodStep(c);
  }
}
