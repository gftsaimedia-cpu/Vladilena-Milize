import { Controller, Get, Post, Inject, Param, Query, Body, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, RequireCap } from '../../common';
import { AttendanceService, RecordPunchInput } from './attendance.service';

@Controller('api/v2/attendance')
@UseFilters(ApiExceptionFilter)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly service: AttendanceService) {}

  @RequireCap('attendance.correct')
  @Post('punches')
  async recordPunch(@Body() body: RecordPunchInput): Promise<unknown> {
    try {
      const result = await this.service.recordPunch(body);
      return result;
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_PUNCH_INPUT' });
    }
  }

  @RequireCap('attendance.correct')
  @Get('punches')
  async getPunches(
    @Query('employeeId') queryEmp?: string,
    @Query('workDate') queryDate?: string
  ): Promise<unknown> {
    if (!queryEmp || !queryDate) {
      throw new BadRequestError('Thiếu thông số employeeId hoặc workDate', { code: 'MISSING_PARAMS' });
    }
    const punches = await this.service.getPunches(queryEmp, queryDate);
    return { punches };
  }

  @RequireCap('attendance.correct')
  @Get('timesheets')
  async listTimesheets(
    @Query('employeeId') queryEmp?: string,
    @Query('startDate') queryStart?: string,
    @Query('endDate') queryEnd?: string,
    @Query('status') queryStatus?: string
  ): Promise<unknown> {
    const timesheets = await this.service.listTimesheets({
      employeeId: queryEmp,
      startDate: queryStart,
      endDate: queryEnd,
      status: queryStatus,
    });
    return { timesheets };
  }

  @RequireCap('attendance.correct')
  @Get('timesheets/:employeeId/:workDate')
  async getTimesheet(
    @Param('employeeId') employeeId: string,
    @Param('workDate') workDate: string
  ): Promise<unknown> {
    if (!employeeId || !workDate) {
      throw new BadRequestError('Thiếu thông số employeeId hoặc workDate', { code: 'MISSING_PARAMS' });
    }

    const timesheet = await this.service.getTimesheet(employeeId, workDate);
    if (!timesheet) {
      throw new NotFoundError('Không tìm thấy bảng công', { code: 'TIMESHEET_NOT_FOUND' });
    }
    return { timesheet };
  }

  @RequireCap('attendance.correct')
  @Post('recalculate')
  async recalculateTimesheet(@Body() body: { employeeId: string; workDate: string }): Promise<unknown> {
    if (!body.employeeId || !body.workDate) {
      throw new BadRequestError('Thiếu thông số employeeId hoặc workDate', { code: 'MISSING_PARAMS' });
    }
    const timesheet = await this.service.recalculateTimesheet(body.employeeId, body.workDate);
    return { timesheet };
  }
}
