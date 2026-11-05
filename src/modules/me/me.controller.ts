import { Controller, Get, Post, Put, Patch, Param, Body, Query, Req, UseFilters, Inject } from '@nestjs/common';
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
import { KpiValidationError } from '../payroll/payroll.errors';
import { RequestsService } from '../requests/requests.service';
import type { RequestStatus } from '../requests/domain';
import { daySummaryOf, monthOf, stepsOf, vnToday, weekOf } from './domain';

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
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// Lỗi nghiệp vụ của service (Error thường) → 400 có mã; lỗi HTTP giữ nguyên.
function asBadRequest(err: any, code: string): never {
  if (err instanceof HttpError) throw err;
  throw new BadRequestError(err?.message || 'Dữ liệu không hợp lệ', { code });
}

const CREATE: Record<string, (s: RequestsService, input: any) => Promise<unknown>> = {
  leave: (s, i) => s.createLeaveRequest(i),
  'leave-with-makeup': (s, i) => s.createLeaveWithMakeupRequest(i),
  overtime: (s, i) => s.createOvertimeRequest(i),
  advance: (s, i) => s.createAdvanceRequest(i),
  explanation: (s, i) => s.createExplanationRequest(i),
  'shift-change': (s, i) => s.createShiftChangeRequest(i),
  isat: (s, i) => s.createIsatRequest({ employeeId: i.employeeId, saturday: i.saturday, team: i.team, conditions: i.conditions }),
};

@Controller('api/v2/me')
@UseFilters(ApiExceptionFilter)
export class MeController {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(PayrollService) private readonly payroll: PayrollService,
    @Inject(EmployeesService) private readonly employees: EmployeesService
  ) {}

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
      leave: contract.leave,
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
    const m = needMonth(month);
    const rows = await this.attendance.listTimesheets({ employeeId: me.uuid, startDate: `${m}-01`, endDate: monthEnd(m) });
    return monthOf(rows as any, m, vnToday());
  }

  @Authenticated()
  @Get('attendance/:date')
  async attendanceDay(@Req() req: Request, @Param('date') date: string): Promise<unknown> {
    const me = who(req);
    if (!DATE.test(date || '')) throw new BadRequestError('Ngày không hợp lệ (định dạng YYYY-MM-DD)', { code: 'INVALID_DATE' });
    const ts = await this.attendance.getTimesheet(me.uuid, date);
    return { ...daySummaryOf((ts ?? undefined) as any, date, vnToday()), shift: ts ? { start: ts.shiftStartTime, end: ts.shiftEndTime } : null };
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
  @Post('requests/:kind')
  async createRequest(@Req() req: Request, @Param('kind') kind: string, @Body() body: any): Promise<unknown> {
    const me = who(req);
    const create = CREATE[kind];
    if (!create) throw new NotFoundError('Không có loại đơn này', { code: 'REQUEST_KIND_NOT_FOUND' });
    try {
      const request = await create(this.requests, { ...(body || {}), employeeId: me.username });
      return { created: true, request };
    } catch (err) {
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

  // ---------- Thu nhập & KPI ----------
  @Authenticated()
  @Get('income')
  async income(@Req() req: Request, @Query('month') month?: string): Promise<unknown> {
    const me = who(req);
    const m = needMonth(month);
    const stored = await this.payroll.getPayslip(m, me.username);
    if (stored && stored.status === 'final') return { month: m, state: 'official', payslip: stored.details };
    try {
      const slip = await this.payroll.generateMonthlyPayslip(me.uuid, m);
      return { month: m, state: 'estimate', payslip: slip.toJSON() };
    } catch (err: any) {
      return { month: m, state: 'unavailable', payslip: null, reason: err?.message || 'Chưa tính được' };
    }
  }

  @Authenticated()
  @Put('kpi/self')
  async selfKpi(@Req() req: Request, @Query('month') month: string, @Body() body: { score?: number | null }): Promise<unknown> {
    const me = who(req);
    const m = needMonth(month);
    try {
      await this.payroll.setKpiScore(me.username, m, { self: body?.score ?? null }, me.username);
    } catch (err) {
      if (err instanceof KpiValidationError) throw new BadRequestError(err.message, { code: err.code });
      throw err;
    }
    return { ok: true, month: m };
  }
}
