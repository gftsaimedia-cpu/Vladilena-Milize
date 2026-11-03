import { Controller, Get, Post, Patch, Inject, Param } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { RequestV2Service } from './request-v2.service';
import { RequestType, RequestStatus } from '../../domain/request-v2';

const { HttpError, readJson } = require('../../platform/http');

@Controller('api/v2/requests')
export class RequestV2Controller {
  constructor(@Inject(RequestV2Service) private readonly service: RequestV2Service) {}

  @Post('leave')
  async createLeave(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.createLeaveRequest({
        ...body,
        employeeId
      });
      return { created: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('correction')
  async createCorrection(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.createCorrectionRequest({
        ...body,
        employeeId
      });
      return { created: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('overtime')
  async createOvertime(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.createOvertimeRequest({
        ...body,
        employeeId
      });
      return { created: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Post('advance')
  async createAdvance(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.createAdvanceRequest({
        ...body,
        employeeId
      });
      return { created: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Get()
  async listRequests(@Ctx() c: ApiContext): Promise<unknown> {
    try {
      const employeeId = c.url.searchParams.get('employeeId') || undefined;
      const type = (c.url.searchParams.get('type') as RequestType) || undefined;
      const status = (c.url.searchParams.get('status') as RequestStatus) || undefined;

      const rawLimit = c.url.searchParams.get('limit');
      const limit = rawLimit ? Number(rawLimit) : undefined;
      const rawOffset = c.url.searchParams.get('offset');
      const offset = rawOffset ? Number(rawOffset) : undefined;

      const result = await this.service.listRequests({
        employeeId,
        type,
        status,
        limit,
        offset
      });

      return result;
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Get(':id')
  async getRequest(@Ctx() c: ApiContext, @Param('id') paramId?: string): Promise<unknown> {
    const id = paramId || c.seg[3];
    const request = await this.service.getById(id);
    if (!request) {
      throw new HttpError(404, 'Không tìm thấy yêu cầu', { code: 'REQUEST_NOT_FOUND' });
    }
    return { request };
  }

  @Patch(':id/review')
  async reviewRequest(@Ctx() c: ApiContext, @Param('id') paramId?: string): Promise<unknown> {
    const id = paramId || c.seg[3];
    const body = (await readJson(c.req)) || {};
    try {
      const reviewerId = body.reviewerId || c.me?.uuid || c.me?.username || 'system';
      const request = await this.service.reviewRequest(id, reviewerId, body.action, body.note);
      return { updated: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      if (err.message?.includes('not found')) {
        throw new HttpError(404, err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }

  @Patch(':id/cancel')
  async cancelRequest(@Ctx() c: ApiContext, @Param('id') paramId?: string): Promise<unknown> {
    const id = paramId || c.seg[3];
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.cancelRequest(id, employeeId, body.reason);
      return { updated: true, request };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      if (err.message?.includes('not found')) {
        throw new HttpError(404, err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new HttpError(400, err.message, { code: 'BAD_REQUEST' });
    }
  }
}
