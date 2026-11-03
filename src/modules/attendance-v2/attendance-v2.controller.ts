import { Controller, Get, Post, Inject, Param, Query, Body } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { AttendanceV2Service } from './attendance-v2.service';
const { HttpError, readJson } = require('../../platform/http');

@Controller('api/v2/attendance')
export class AttendanceV2Controller {
  constructor(@Inject(AttendanceV2Service) private readonly service: AttendanceV2Service) {}

  @Post('punches')
  async recordPunch(@Ctx() c?: ApiContext, @Body() body?: any): Promise<unknown> {
    const payload = body || (c?.req ? await readJson(c.req) : {}) || {};
    try {
      const result = await this.service.recordPunch(payload);
      return result;
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_PUNCH_INPUT' });
    }
  }

  @Get('punches')
  async getPunches(
    @Ctx() c?: ApiContext,
    @Query('employeeId') queryEmp?: string,
    @Query('workDate') queryDate?: string
  ): Promise<unknown> {
    const employeeId = queryEmp || c?.url?.searchParams?.get('employeeId') || '';
    const workDate = queryDate || c?.url?.searchParams?.get('workDate') || '';
    if (!employeeId || !workDate) {
      throw new HttpError(400, 'Thiếu thông số employeeId hoặc workDate', { code: 'MISSING_PARAMS' });
    }
    const punches = await this.service.getPunches(employeeId, workDate);
    return { punches };
  }

  @Get('timesheets')
  async listTimesheets(
    @Ctx() c?: ApiContext,
    @Query('employeeId') queryEmp?: string,
    @Query('startDate') queryStart?: string,
    @Query('endDate') queryEnd?: string,
    @Query('status') queryStatus?: string
  ): Promise<unknown> {
    const employeeId = queryEmp || c?.url?.searchParams?.get('employeeId') || undefined;
    const startDate = queryStart || c?.url?.searchParams?.get('startDate') || undefined;
    const endDate = queryEnd || c?.url?.searchParams?.get('endDate') || undefined;
    const status = queryStatus || c?.url?.searchParams?.get('status') || undefined;

    const timesheets = await this.service.listTimesheets({
      employeeId,
      startDate,
      endDate,
      status
    });
    return { timesheets };
  }

  @Get('timesheets/:employeeId/:workDate')
  async getTimesheet(
    @Ctx() c?: ApiContext,
    @Param('employeeId') paramEmp?: string,
    @Param('workDate') paramDate?: string
  ): Promise<unknown> {
    const employeeId = paramEmp || (c?.seg ? c.seg[4] : undefined);
    const workDate = paramDate || (c?.seg ? c.seg[5] : undefined);
    if (!employeeId || !workDate) {
      throw new HttpError(400, 'Thiếu thông số employeeId hoặc workDate', { code: 'MISSING_PARAMS' });
    }

    const timesheet = await this.service.getTimesheet(employeeId, workDate);
    if (!timesheet) {
      throw new HttpError(404, 'Không tìm thấy bảng công', { code: 'TIMESHEET_NOT_FOUND' });
    }
    return { timesheet };
  }
}
