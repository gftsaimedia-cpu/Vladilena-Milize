import { Controller, Get, Inject, Param, Query, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, RequireCap } from '../../common';
import { OverviewService } from './overview.service';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !isNaN(at.getTime()) && at.toISOString().slice(0, 10) === text;
}

function optionalMonth(month?: string): string | undefined {
  if (month === undefined || month === '') return undefined;
  if (!MONTH.test(month)) throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
  return month;
}

@UseFilters(ApiExceptionFilter)
@Controller('api/v2')
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly service: OverviewService) {}

  @RequireCap('attendance.correct')
  @Get('attendance/week')
  async week(@Query('from') from?: string, @Query('q') q?: string, @Query('group') group?: string): Promise<unknown> {
    if (from !== undefined && from !== '' && !isCalendarDate(from)) {
      throw new BadRequestError('Ngày không hợp lệ (định dạng YYYY-MM-DD)', { code: 'INVALID_DATE' });
    }
    return await this.service.week(from || undefined, q, group);
  }

  @RequireCap('attendance.correct')
  @Get('attendance/employees/:username')
  async employee(@Param('username') username: string, @Query('month') month?: string): Promise<unknown> {
    const view = await this.service.employeeMonth(username, optionalMonth(month));
    if (!view) throw new NotFoundError('Không tìm thấy nhân sự', { code: 'EMPLOYEE_NOT_FOUND' });
    return view;
  }

  @RequireCap('config.read')
  @Get('overview')
  async overview(@Query('month') month?: string): Promise<unknown> {
    return await this.service.overview(optionalMonth(month));
  }
}
