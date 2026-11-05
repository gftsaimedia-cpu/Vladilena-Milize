import { Controller, Get, Post, Patch, Param, Body, Query, UseFilters, Inject, Optional } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
import { AuditEntryError } from '../audit';
import { RequestsService } from './requests.service';
import { ExplanationsService, type DueItem } from './explanations.service';
import { createdBody, dayConflictHttp } from './request-http';
import { RequestType, RequestStatus, ISAT_CONDITIONS, LEAVE_TYPES, EXPLANATION_CASES, requireDateText } from './domain';

// Các route này là của Admin làm thay nhân viên: người được thao tác phải ghi rõ, không suy ra từ phiên.
function requireEmployeeId(body: any): string {
  const id = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
  if (!id) throw new Error('Thiếu employeeId của nhân viên');
  return id;
}

@Controller('api/v2/requests')
@UseFilters(ApiExceptionFilter)
export class RequestsController {
  constructor(
    @Inject(RequestsService) private readonly service: RequestsService,
    @Optional() @Inject(ExplanationsService) private readonly explanations?: ExplanationsService
  ) {}

  private explanationsService(): ExplanationsService {
    if (!this.explanations) throw new Error('ExplanationsService chưa được cấu hình');
    return this.explanations;
  }

  @RequireCap('requests.review')
  @Post('leave')
  async createLeave(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const created = await this.service.createLeaveRequest({ ...body, employeeId });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('leave-with-makeup')
  async createLeaveWithMakeup(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Số ngày nghỉ và giờ bù do server tính: `daysCount`/`leaveType` client gửi không được chuyển xuống.
      const created = await this.service.createLeaveWithMakeupRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        startDate: body.startDate,
        endDate: body.endDate,
        slots: body.slots
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('shift-change')
  async createShiftChange(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Giờ ra của ca lấy từ khung (§4); `endTime` client gửi không được chuyển xuống.
      const created = await this.service.createShiftChangeRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        startDate: body.startDate,
        endDate: body.endDate,
        shiftType: body.shiftType,
        startTime: body.startTime
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('overtime')
  async createOvertime(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Giờ OT do server tính từ khung: `hours`/`otHours`/`otRateMultiplier` client gửi không được chuyển xuống.
      const created = await this.service.createOvertimeRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        otDate: body.otDate,
        targetDate: body.targetDate,
        startTime: body.startTime,
        endTime: body.endTime
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('advance')
  async createAdvance(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Số tiền, tiêu đề và lý do do server đặt (spec 2.5): chỉ nhận nhân sự và kỳ.
      const created = await this.service.createAdvanceRequest({ employeeId, period: body.period });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('explanation')
  async createExplanation(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // `targetPunchType`/`actualPunchTime` của bản cũ không còn; chỉ chuyển các trường của §6.5.
      const created = await this.service.createExplanationRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        workDate: body.workDate,
        cases: body.cases,
        actualCheckIn: body.actualCheckIn,
        actualCheckOut: body.actualCheckOut
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('isat')
  async createIsat(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const created = await this.service.createIsatRequest({
        employeeId,
        saturday: body.saturday,
        team: body.team,
        conditions: body.conditions
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Phải khai báo trước @Get(':id') để 'isat' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('isat/conditions')
  listIsatConditions(): { conditions: Array<{ code: string; label: string }> } {
    return { conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label })) };
  }

  // 6 loại nghỉ (§9) cho form đơn nghỉ; khai báo trước @Get(':id') để 'leave-types' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('leave-types')
  listLeaveTypes(): { leaveTypes: typeof LEAVE_TYPES } {
    return { leaveTypes: LEAVE_TYPES };
  }

  // 7 trường hợp giải trình cho form; khai báo trước @Get(':id') để 'explanation-cases' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('explanation-cases')
  listExplanationCases(): { cases: typeof EXPLANATION_CASES } {
    return { cases: EXPLANATION_CASES };
  }

  // Ngày cần giải trình của mọi nhân sự (chuông của Admin); khai báo trước @Get(':id') để 'explanations-due' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('explanations-due')
  async listExplanationsDue(): Promise<{ items: DueItem[] }> {
    try {
      return { items: await this.explanationsService().listDue() };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Admin nhắc nhân viên giải trình một ngày; người nhắc là Admin đang đăng nhập
  @RequireCap('requests.review')
  @Post('explanations-due/remind')
  async remindExplanation(@Body() body: any, @CurrentUser() user: UserSession): Promise<{ reminded: true; remindedAt: string }> {
    try {
      const employeeId = requireEmployeeId(body);
      const date = requireDateText(body?.date, 'date');
      const { remindedAt } = await this.explanationsService().remind(employeeId, date, user.username);
      return { reminded: true, remindedAt };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Get()
  async listRequests(
    @Query('employeeId') employeeId?: string,
    @Query('type') type?: RequestType,
    @Query('status') status?: RequestStatus,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ): Promise<unknown> {
    try {
      const limit = limitStr ? Number(limitStr) : undefined;
      const offset = offsetStr ? Number(offsetStr) : undefined;
      return await this.service.listRequests({ employeeId, type, status, limit, offset });
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Get(':id')
  async getRequest(@Param('id') id: string): Promise<unknown> {
    const request = await this.service.getById(id);
    if (!request) {
      throw new NotFoundError('Không tìm thấy yêu cầu', { code: 'REQUEST_NOT_FOUND' });
    }
    return { request };
  }

  @RequireCap('requests.review')
  @Patch(':id/review')
  async reviewRequest(
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; note?: string },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const reviewerId = user.username;
      const request = await this.service.reviewRequest(id, reviewerId, body.action, body.note);
      return { updated: true, request };
    } catch (err: any) {
      // Lỗi ghi nhật ký là lỗi lập trình (spec audit-log mục 4): để filter trả 500.
      if (err instanceof AuditEntryError) throw err;
      const conflict = dayConflictHttp(err, 409);
      if (conflict) throw conflict;
      if (err.message?.includes('not found')) {
        throw new NotFoundError(err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Patch(':id/cancel')
  async cancelRequest(
    @Param('id') id: string,
    @Body() body: { reason?: string; employeeId?: string },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const request = await this.service.cancelRequest(id, employeeId, body.reason, user.username);
      return { updated: true, request };
    } catch (err: any) {
      if (err instanceof AuditEntryError) throw err;
      if (err.message?.includes('not found')) {
        throw new NotFoundError(err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }
}
