import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseFilters, Inject } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiExceptionFilter,
  Authenticated,
  BadRequestError,
  ConflictError,
  HttpError,
  NotFoundError,
  UnauthorizedError,
} from '../../common';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';
import { PayrollService } from '../payroll/payroll.service';
import { RequestsService, type CreatedRequestDTO, type FilingKind } from '../requests/requests.service';
import { ExplanationsService } from '../requests/explanations.service';
import { SystemService } from '../system';
import { createdBody, dayConflictHttp } from '../requests/request-http';
import type { RequestStatus } from '../requests/domain';
import { daySummaryOf, estimateIncomeOf, monthOf, monthRangeOf, stepsOf, vnToday, weekOf } from './domain';

// Nhóm "của tôi": mọi route chỉ cần phiên; danh tính luôn là req.user. Không route nào đọc employeeId / username của
// client — trường lạ trong body hay query bị bỏ qua. Bảng công dùng uuid, đơn từ và phiếu lương dùng tên đăng nhập.

type Who = { username: string; uuid: string };

function who(req: Request): Who {
  const user = (req as any).user;
  if (!user?.username) throw new UnauthorizedError('Chưa đăng nhập hoặc phiên đã hết hạn');
  return { username: user.username, uuid: user.uuid || user.username };
}

const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function needMonth(month?: string): string {
  if (!month || !MONTH.test(month)) throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
  return month;
}
type MonthRange = { from: string; to: string };
// Lưới an toàn: app chỉ cho bấm tới các tháng trong khoảng; gọi thẳng tháng ngoài khoảng thì 400.
// Không gửi tháng thì lấy tháng hiện tại theo giờ máy chủ (đồng hồ điện thoại có thể lệch sang tháng sau).
function needMonthIn(month: string | undefined, range: MonthRange): string {
  const m = needMonth(month || range.to);
  if (m < range.from || m > range.to) {
    const mmyyyy = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
    throw new BadRequestError(`Chỉ xem được từ tháng ${mmyyyy(range.from)} tới tháng ${mmyyyy(range.to)}`, { code: 'MONTH_OUT_OF_RANGE', range });
  }
  return m;
}
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// Lỗi nghiệp vụ của service (Error thường) → 400 có mã; lỗi HTTP giữ nguyên.
function asBadRequest(err: any, code: string): never {
  if (err instanceof HttpError) throw err;
  throw new BadRequestError(err?.message || 'Dữ liệu không hợp lệ', { code });
}

// Nhân viên tự nộp: 6 loại truyền `filedBy: 'self'` (áp luật tự nộp); iSAT giữ nguyên.
const SELF = { filedBy: 'self' } as const;
const CREATE: Record<string, (s: RequestsService, input: any) => Promise<CreatedRequestDTO>> = {
  leave: (s, i) => s.createLeaveRequest(i, SELF),
  'leave-with-makeup': (s, i) => s.createLeaveWithMakeupRequest(i, SELF),
  overtime: (s, i) => s.createOvertimeRequest(i, SELF),
  advance: (s, i) => s.createAdvanceRequest(i, SELF),
  explanation: (s, i) => s.createExplanationRequest(i, SELF),
  'shift-change': (s, i) => s.createShiftChangeRequest(i, SELF),
  isat: (s, i) => s.createIsatRequest({ employeeId: i.employeeId, saturday: i.saturday, team: i.team, conditions: i.conditions }),
};

@Controller('api/v2/me')
@UseFilters(ApiExceptionFilter)
export class MeController {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(PayrollService) private readonly payroll: PayrollService,
    @Inject(EmployeesService) private readonly employees: EmployeesService,
    @Inject(SystemService) private readonly system: SystemService,
    @Inject(ExplanationsService) private readonly explanations: ExplanationsService
  ) {}

  // Từ tháng vào làm tới tháng hiện tại (giờ VN).
  private async monthRange(me: Who): Promise<MonthRange> {
    const employee = await this.employees.findByUsernameOrUuid(me.username);
    return monthRangeOf(employee ? employee.toDTO().contract.effectiveFrom : null, vnToday());
  }

  // Số ngày phép còn lại do server tính từ đơn; lỗi thì giữ nguyên số trong hợp đồng để hồ sơ vẫn mở được.
  private async leaveOf(me: Who, leave: any): Promise<unknown> {
    try {
      return { ...leave, remainingDays: (await this.requests.annualLeaveLeft(me.username)) ?? 0 };
    } catch {
      return leave;
    }
  }

  // ---------- Hồ sơ ----------
  @Authenticated()
  @Get('profile')
  async profile(@Req() req: Request): Promise<unknown> {
    const me = who(req);
    const employee = await this.employees.findByUsernameOrUuid(me.username);
    if (!employee) throw new NotFoundError('Không tìm thấy hồ sơ', { code: 'EMPLOYEE_NOT_FOUND' });
    const { profile, account, contract } = employee.toDTO();
    return {
      name: profile.fullName,
      username: account.username,
      dependants: profile.dependants,
      contract: { status: contract.status, term: contract.term, effectiveFrom: contract.effectiveFrom },
      position: contract.position,
      shift: contract.shift,
      leave: await this.leaveOf(me, contract.leave),
    };
  }

  // ---------- Chấm công ----------
  @Authenticated()
  @Get('today')
  async today(@Req() req: Request): Promise<unknown> {
    const me = who(req);
    const date = vnToday();
    const week = weekOf(date);
    const rows = await this.attendance.listTimesheets({ employeeId: me.uuid, startDate: week[0], endDate: week[6] });
    const by = new Map(rows.map(r => [r.workDate, r]));
    const ts = by.get(date);
    const days = week.map(d => daySummaryOf(by.get(d) as any, d, date));
    const alert = days.filter(d => d.kind === 'todo' && d.date < date).pop() ?? null;
    return {
      date,
      shift: ts ? { type: ts.shiftType, start: ts.shiftStartTime, end: ts.shiftEndTime } : null,
      punches: { in: days.find(d => d.date === date)?.in ?? null, out: days.find(d => d.date === date)?.out ?? null },
      workedMinutes: Math.round(((ts?.metrics as any)?.workHours || 0) * 60),
      week: days,
      alert: alert ? { date: alert.date, kind: 'todo' } : null,
      reminders: await this.explanations.reminders(me.username).catch(() => []),
    };
  }

  @Authenticated()
  @Post('punches')
  async punch(@Req() req: Request, @Body() body: { kind?: string; lat?: number; lng?: number; accuracyM?: number }): Promise<unknown> {
    const me = who(req);
    const type = body?.kind === 'OUT' ? 'OUT' : body?.kind === 'IN' ? 'IN' : null;
    if (!type) throw new BadRequestError('Thiếu loại chấm công (IN hoặc OUT)', { code: 'BAD_PUNCH_INPUT' });
    try {
      return await this.attendance.recordPunch({
        employeeId: me.uuid,
        type,
        latitude: body.lat,
        longitude: body.lng,
        accuracyMeters: body.accuracyM,
      });
    } catch (err) {
      asBadRequest(err, 'BAD_PUNCH_INPUT');
    }
  }

  @Authenticated()
  @Get('attendance')
  async attendanceMonth(@Req() req: Request, @Query('month') month?: string): Promise<unknown> {
    const me = who(req);
    const range = await this.monthRange(me);
    const m = needMonthIn(month, range);
    const [rows, period] = await Promise.all([
      this.attendance.listTimesheets({ employeeId: me.uuid, startDate: `${m}-01`, endDate: monthEnd(m) }),
      this.system.getPeriod(m),
    ]);
    return { ...monthOf(rows as any, m, vnToday(), period?.status ?? null), range };
  }

  @Authenticated()
  @Get('attendance/:date')
  async attendanceDay(@Req() req: Request, @Param('date') date: string): Promise<unknown> {
    const me = who(req);
    if (!DATE.test(date || '')) throw new BadRequestError('Ngày không hợp lệ (định dạng YYYY-MM-DD)', { code: 'INVALID_DATE' });
    const ts = await this.attendance.getTimesheet(me.uuid, date);
    // Phần giải trình lỗi thì ngày công vẫn mở được, chỉ thiếu thông tin giải trình.
    const explained = await this.explanations.dayView(me.username, date).catch(() => ({ explanation: null, due: null }));
    return {
      ...daySummaryOf((ts ?? undefined) as any, date, vnToday()),
      shift: ts ? { start: ts.shiftStartTime, end: ts.shiftEndTime } : null,
      ...explained,
    };
  }

  // ---------- Đơn từ ----------
  @Authenticated()
  @Get('requests')
  async listRequests(@Req() req: Request, @Query('status') status?: RequestStatus): Promise<unknown> {
    const me = who(req);
    const { items } = await this.requests.listRequests({ employeeId: me.username, limit: 500 });
    const counts = { all: items.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const r of items) {
      const k = String(r.status).toLowerCase() as keyof typeof counts;
      if (k in counts && k !== 'all') counts[k] += 1;
    }
    return { counts, items: status ? items.filter(r => r.status === status) : items };
  }

  @Authenticated()
  @Get('requests/:id')
  async getRequest(@Req() req: Request, @Param('id') id: string): Promise<unknown> {
    const me = who(req);
    const request = await this.requests.getById(id);
    if (!request || (request.employeeId !== me.username && request.employeeId !== me.uuid)) {
      throw new NotFoundError('Không tìm thấy yêu cầu', { code: 'REQUEST_NOT_FOUND' });
    }
    return { request, steps: stepsOf(request as any) };
  }

  @Authenticated()
  @Get('request-context')
  async requestContext(@Req() req: Request): Promise<unknown> {
    const me = who(req);
    try {
      return await this.requests.requestContext(me.username);
    } catch (err) {
      asBadRequest(err, 'BAD_REQUEST');
    }
  }

  // Xem trước đơn sắp nộp: luôn 200; lỗi nghiệp vụ nằm trong `ok: false`. iSAT không có xem trước.
  @Authenticated()
  @Post('requests/:kind/preview')
  async previewRequest(@Req() req: Request, @Param('kind') kind: string, @Body() body: any): Promise<unknown> {
    const me = who(req);
    if (!kind || kind === 'isat' || !Object.prototype.hasOwnProperty.call(CREATE, kind)) {
      throw new NotFoundError('Không có loại đơn này', { code: 'REQUEST_KIND_NOT_FOUND' });
    }
    return this.requests.previewRequest(kind as FilingKind, { ...(body || {}), employeeId: me.username }, SELF);
  }

  @Authenticated()
  @Post('requests/:kind')
  async createRequest(@Req() req: Request, @Param('kind') kind: string, @Body() body: any): Promise<unknown> {
    const me = who(req);
    const create = CREATE[kind];
    if (!create) throw new NotFoundError('Không có loại đơn này', { code: 'REQUEST_KIND_NOT_FOUND' });
    try {
      const created = await create(this.requests, { ...(body || {}), employeeId: me.username });
      return createdBody(created);
    } catch (err) {
      const conflict = dayConflictHttp(err, 400);
      if (conflict) throw conflict;
      asBadRequest(err, 'BAD_REQUEST');
    }
  }

  @Authenticated()
  @Patch('requests/:id/cancel')
  async cancelRequest(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }): Promise<unknown> {
    const me = who(req);
    try {
      const request = await this.requests.cancelRequest(id, me.username, body?.reason);
      return { updated: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      if (/not found/i.test(err?.message || '')) throw new NotFoundError('Không tìm thấy yêu cầu', { code: 'REQUEST_NOT_FOUND' });
      throw new ConflictError(err?.message || 'Không huỷ được đơn này', { code: 'REQUEST_NOT_CANCELLABLE' });
    }
  }

  // ---------- Thu nhập ----------
  // Chính thức khi phiếu của chính người đó ở lần chạy hiện tại đã được Admin duyệt (người dùng chốt 05/11/2026),
  // kể cả khi kỳ chưa chốt; còn lại là số tạm tính, không ghi DB.
  @Authenticated()
  @Get('income')
  async income(@Req() req: Request, @Query('month') month?: string): Promise<unknown> {
    const me = who(req);
    const range = await this.monthRange(me);
    const m = needMonthIn(month, range);
    const stored = await this.payroll.getPayslip(m, me.username);
    if (stored && stored.status === 'approved') return { month: m, state: 'official', payslip: stored.details, range };
    try {
      const slip = await this.payroll.generateMonthlyPayslip(me.uuid, m);
      return { month: m, state: 'estimate', payslip: estimateIncomeOf(slip.toJSON()), range };
    } catch (err: any) {
      return { month: m, state: 'unavailable', payslip: null, reason: err?.message || 'Chưa tính được', range };
    }
  }
}
