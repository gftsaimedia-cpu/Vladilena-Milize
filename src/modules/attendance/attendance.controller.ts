import { Controller, Get, Post, Inject, Param, Query, Body, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, HttpError, NotFoundError, RequireCap } from '../../common';
import { PunchRefusedError } from './attendance.errors';
import { AttendanceService, RecordPunchInput } from './attendance.service';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 'YYYY-MM-DD' là một ngày có thật trên lịch (không nhận 2026-02-30). */
function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !isNaN(at.getTime()) && at.toISOString().slice(0, 10) === text;
}

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
      if (err instanceof HttpError) throw err;
      if (err instanceof PunchRefusedError) throw new BadRequestError(err.message, { code: err.code, ...err.details });
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

  /** Admin bấm tính lại (T7): một ngày (`workDate`) hoặc cả tháng (`month`) của một nhân sự. */
  @RequireCap('attendance.correct')
  @Post('recalculate')
  async recalculateTimesheet(
    @Body() body: { employeeId?: string; workDate?: string; month?: string }
  ): Promise<unknown> {
    if (!body?.employeeId || (!body.workDate && !body.month)) {
      throw new BadRequestError('Thiếu thông số employeeId và workDate hoặc month', { code: 'MISSING_PARAMS' });
    }
    if (body.workDate && body.month) {
      throw new BadRequestError('Chỉ gửi workDate hoặc month, không gửi cả hai', { code: 'AMBIGUOUS_PARAMS' });
    }
    if (body.month) {
      if (!MONTH_PATTERN.test(body.month)) {
        throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
      }
      const timesheets = await this.service.recalculateMonth(body.employeeId, body.month);
      return { timesheets };
    }
    const workDate = body.workDate as string;
    if (!isCalendarDate(workDate)) {
      // Cùng câu với kiểm tra workDate của AttendanceService (lúc chấm và lúc tính lại).
      throw new BadRequestError(`Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${workDate}`, { code: 'INVALID_DATE' });
    }
    const timesheet = await this.service.recalculateTimesheet(body.employeeId, workDate);
    return { timesheet };
  }
}
