import { Controller, Get, Post, Patch, Param, Body, Query, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
import { RequestsService } from './requests.service';
import { RequestType, RequestStatus, ISAT_CONDITIONS } from './domain';

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
      const request = await this.service.createLeaveRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('overtime')
  async createOvertime(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const request = await this.service.createOvertimeRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('advance')
  async createAdvance(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const request = await this.service.createAdvanceRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('explanation')
  async createExplanation(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const request = await this.service.createExplanationRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('isat')
  async createIsat(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const request = await this.service.createIsatRequest({
        employeeId,
        saturday: body.saturday,
        team: body.team,
        conditions: body.conditions
      });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Phải khai báo trước @Get(':id') để 'isat' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('isat/conditions')
  listIsatConditions(): { conditions: Array<{ code: string; label: string }> } {
    return { conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label })) };
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
