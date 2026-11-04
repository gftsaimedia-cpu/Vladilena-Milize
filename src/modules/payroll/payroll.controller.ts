import { Controller, Get, Post, Put, Param, Body, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession } from '../../common';
import { PayrollService } from './payroll.service';

@Controller('api/v2/payroll')
@UseFilters(ApiExceptionFilter)
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly service: PayrollService) {}

  @Post(':month/calculate')
  async calculatePeriod(
    @Param('month') month: string,
    @Body() body: { employeeIds?: string[] },
    @CurrentUser() user?: UserSession
  ): Promise<unknown> {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    try {
      const result = await this.service.calculatePeriodPayslips(
        month,
        body?.employeeIds,
        user?.username || 'system'
      );
      return {
        month,
        calculated: true,
        runId: result.runId,
        count: result.items.length,
        items: result.items,
      };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'CALCULATE_ERROR' });
    }
  }

  @Get(':month')
  async listPayslips(@Param('month') month: string): Promise<unknown> {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    const items = await this.service.listPayslips(month);
    return { month, items };
  }

  @Get(':month/:employeeId')
  async getPayslip(
    @Param('month') month: string,
    @Param('employeeId') employeeId: string
  ): Promise<unknown> {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    const payslip = await this.service.getPayslip(month, employeeId);
    if (!payslip) {
      throw new NotFoundError('Không tìm thấy phiếu lương', { code: 'PAYSLIP_NOT_FOUND' });
    }
    return { month, payslip };
  }

  @Put(':month/kpi/:username')
  async setKpiScore(
    @Param('month') month: string,
    @Param('username') username: string,
    @Body() body: any,
    @CurrentUser() user?: UserSession
  ): Promise<unknown> {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    await this.service.setKpiScore(username, month, body, user?.username || 'system');
    return { updated: true, username, month };
  }
}
