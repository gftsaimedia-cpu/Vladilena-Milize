import { Controller, Get, Post, Inject, Param, Query, Body, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, CurrentUser, HttpError, NotFoundError, RequireCap, type UserSession } from '../../common';
import { AuditEntryError } from '../audit';
import { PunchRefusedError } from './attendance.errors';
import { AttendanceService, RecordPunchInput } from './attendance.service';
import { MONTH_PATTERN } from './domain/calendar';

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
  async recordPunch(@Body() body: RecordPunchInput, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      // Admin chấm hộ: người đăng nhập là người thao tác của nhật ký punch.correct.
      const result = await this.service.recordPunch(body, { actor: user?.username });
      return result;
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      // Lỗi dựng dòng nhật ký là lỗi lập trình: để bộ lọc trả 500, không đổi thành 400.
      if (err instanceof AuditEntryError) throw err;
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
    if (!isCalendarDate(queryDate)) {
      throw new BadRequestError(`workDate không hợp lệ (định dạng YYYY-MM-DD): ${queryDate}`, { code: 'INVALID_DATE' });
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
    for (const [name, value] of [['startDate', queryStart], ['endDate', queryEnd]] as const) {
      if (value !== undefined && !isCalendarDate(value)) {
        throw new BadRequestError(`${name} không hợp lệ (định dạng YYYY-MM-DD): ${value}`, { code: 'INVALID_DATE' });
      }
    }
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

    if (!isCalendarDate(workDate)) {
      throw new BadRequestError(`workDate không hợp lệ (định dạng YYYY-MM-DD): ${workDate}`, { code: 'INVALID_DATE' });
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
