import { Controller, Get, Post, Patch, Param, Body, Query, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
import { RequestsService } from './requests.service';
import { createdBody, dayConflictHttp } from './request-http';
import { RequestType, RequestStatus, ISAT_CONDITIONS, LEAVE_TYPES, EXPLANATION_CASES } from './domain';

// Các route này là của Admin làm thay nhân viên: người được thao tác phải ghi rõ, không suy ra từ phiên.
function requireEmployeeId(body: any): string {
  const id = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
  if (!id) throw new Error('Thiếu employeeId của nhân viên');
  return id;
}

@Controller('api/v2/requests')
@UseFilters(ApiExceptionFilter)
export class RequestsController {
  constructor(@Inject(RequestsService) private readonly service: RequestsService) {}

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
      const created = await this.service.createAdvanceRequest({ ...body, employeeId });
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
      // Duyệt đơn của tháng đã tính lương thì phiếu của người nộp được tính lại sau khi lưu; kết quả nằm ở `recalculated`.
      const { request, recalculated } = await this.service.reviewAndRecalculate(id, reviewerId, body.action, body.note);
      return { updated: true, request, recalculated };
    } catch (err: any) {
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
      const request = await this.service.cancelRequest(id, employeeId, body.reason);
      return { updated: true, request };
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        throw new NotFoundError(err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }
}
