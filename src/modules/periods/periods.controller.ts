import { Body, Controller, Get, Inject, Param, Post, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, CurrentUser, RequireCap, UserSession } from '../../common';
import { PeriodsService, type PeriodView } from './periods.service';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function needMonth(month: string): string {
  if (typeof month !== 'string' || !MONTH.test(month)) {
    throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
  }
  return month;
}

@Controller('api/v2/system/periods')
@UseFilters(ApiExceptionFilter)
export class PeriodsController {
  constructor(@Inject(PeriodsService) private readonly service: PeriodsService) {}

  @RequireCap('config.read')
  @Get()
  async listPeriods(): Promise<{ periods: unknown[] }> {
    return { periods: await this.service.list() };
  }

  @RequireCap('config.read')
  @Get(':month')
  async getPeriod(@Param('month') month: string): Promise<PeriodView> {
    return this.service.view(needMonth(month));
  }

  @RequireCap('attendance.lock')
  @Post(':month/lock')
  async lockPeriod(@Param('month') month: string, @CurrentUser() user: UserSession): Promise<PeriodView> {
    return this.service.lock(needMonth(month), user.username);
  }

  @RequireCap('attendance.lock')
  @Post(':month/unlock')
  async unlockPeriod(
    @Param('month') month: string,
    @Body() body: { reason?: unknown } | undefined,
    @CurrentUser() user: UserSession
  ): Promise<PeriodView> {
    return this.service.unlock(needMonth(month), user.username, body?.reason);
  }

  @RequireCap('payroll.approve')
  @Post(':month/approve')
  async approvePeriod(@Param('month') month: string, @CurrentUser() user: UserSession): Promise<PeriodView> {
    return this.service.approve(needMonth(month), user.username);
  }

  @RequireCap('payroll.approve')
  @Post(':month/unapprove')
  async unapprovePeriod(
    @Param('month') month: string,
    @Body() body: { reason?: unknown } | undefined,
    @CurrentUser() user: UserSession
  ): Promise<PeriodView> {
    return this.service.unapprove(needMonth(month), user.username, body?.reason);
  }

  @RequireCap('payroll.approve')
  @Post(':month/pay')
  async payPeriod(@Param('month') month: string, @CurrentUser() user: UserSession): Promise<PeriodView> {
    return this.service.pay(needMonth(month), user.username);
  }
}
