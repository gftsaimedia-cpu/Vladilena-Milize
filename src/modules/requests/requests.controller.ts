import { Controller, Get, Post, Patch, Param, Body, Query, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession } from '../../common';
import { RequestsService } from './requests.service';
import { RequestType, RequestStatus, ISAT_CONDITIONS } from './domain';

@Controller('api/v2/requests')
@UseFilters(ApiExceptionFilter)
export class RequestsController {
  constructor(@Inject(RequestsService) private readonly service: RequestsService) {}

  @Post('leave')
  async createLeave(@Body() body: any, @CurrentUser() user?: UserSession): Promise<unknown> {
    try {
      const employeeId = body.employeeId || user?.username || 'system';
      const request = await this.service.createLeaveRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('overtime')
  async createOvertime(@Body() body: any, @CurrentUser() user?: UserSession): Promise<unknown> {
    try {
      const employeeId = body.employeeId || user?.username || 'system';
      const request = await this.service.createOvertimeRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('advance')
  async createAdvance(@Body() body: any, @CurrentUser() user?: UserSession): Promise<unknown> {
    try {
      const employeeId = body.employeeId || user?.username || 'system';
      const request = await this.service.createAdvanceRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('explanation')
  async createExplanation(@Body() body: any, @CurrentUser() user?: UserSession): Promise<unknown> {
    try {
      const employeeId = body.employeeId || user?.username || 'system';
      const request = await this.service.createExplanationRequest({ ...body, employeeId });
      return { created: true, request };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('isat')
  async createIsat(@Body() body: any, @CurrentUser() user?: UserSession): Promise<unknown> {
    try {
      const employeeId = body.employeeId || user?.username || 'system';
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
  @Get('isat/conditions')
  listIsatConditions(): { conditions: Array<{ code: string; label: string }> } {
    return { conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label })) };
  }

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

  @Get(':id')
  async getRequest(@Param('id') id: string): Promise<unknown> {
    const request = await this.service.getById(id);
    if (!request) {
      throw new NotFoundError('Không tìm thấy yêu cầu', { code: 'REQUEST_NOT_FOUND' });
    }
    return { request };
  }

  @Patch(':id/review')
  async reviewRequest(
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; note?: string; reviewerId?: string },
    @CurrentUser() user?: UserSession
  ): Promise<unknown> {
    try {
      const reviewerId = body.reviewerId || user?.username || 'system';
      const request = await this.service.reviewRequest(id, reviewerId, body.action, body.note);
      return { updated: true, request };
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        throw new NotFoundError(err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Patch(':id/cancel')
  async cancelRequest(
    @Param('id') id: string,
    @Body() body: { reason?: string; employeeId?: string },
    @CurrentUser() user?: UserSession
  ): Promise<unknown> {
    try {
      const employeeId = body.employeeId || user?.username || 'system';
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
