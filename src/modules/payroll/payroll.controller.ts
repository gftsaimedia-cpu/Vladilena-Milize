import { Controller, Get, Post, Put, Param, Body, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, ConflictError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
import { AuditEntryError } from '../audit';
import { KpiValidationError, PayrollFinalizedError } from './payroll.errors';
import { payrollTotalsOf } from './domain/payroll-totals';
import { KpiScoreBody, PayrollService } from './payroll.service';

// Tháng 01–12: '2026-13' không phải tháng.
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

@Controller('api/v2/payroll')
@UseFilters(ApiExceptionFilter)
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly service: PayrollService) {}

  @RequireCap('payroll.calculate')
  @Post(':month/calculate')
  async calculatePeriod(
    @Param('month') month: string,
    @Body() body: { employeeIds?: string[] },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    if (!month || !MONTH_PATTERN.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    // The app has no ValidationPipe: a string would otherwise be read one character at a time.
    const employeeIds = body?.employeeIds;
    if (
      employeeIds !== undefined &&
      !(Array.isArray(employeeIds) && employeeIds.every(id => typeof id === 'string' && id.trim().length > 0))
    ) {
      throw new BadRequestError('employeeIds phải là danh sách mã nhân sự', { code: 'INVALID_EMPLOYEE_IDS' });
    }

    try {
      const result = await this.service.calculatePeriodPayslips(
        month,
        employeeIds,
        user.username
      );
      return {
        month,
        calculated: true,
        runId: result.runId,
        count: result.items.length,
        items: result.items,
        errors: result.errors,
      };
    } catch (err: any) {
      // Lỗi dựng dòng nhật ký là lỗi lập trình: để bộ lọc trả 500, không đổi thành 400.
      if (err instanceof AuditEntryError) throw err;
      if (err instanceof PayrollFinalizedError) throw new ConflictError(err.message, { code: 'PAYROLL_FINALIZED' });
      throw new BadRequestError(err.message, { code: 'CALCULATE_ERROR' });
    }
  }

  @RequireCap('payroll.calculate')
  @Get(':month')
  async listPayslips(@Param('month') month: string): Promise<unknown> {
    if (!month || !MONTH_PATTERN.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    const items = await this.service.listPayslips(month);
    return { month, items, totals: payrollTotalsOf(items) };
  }

  @RequireCap('payroll.calculate')
  @Get(':month/:employeeId')
  async getPayslip(
    @Param('month') month: string,
    @Param('employeeId') employeeId: string
  ): Promise<unknown> {
    if (!month || !MONTH_PATTERN.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    const payslip = await this.service.getPayslip(month, employeeId);
    if (!payslip) {
      throw new NotFoundError('Không tìm thấy phiếu lương', { code: 'PAYSLIP_NOT_FOUND' });
    }
    return { month, payslip };
  }

  // Duyệt hoặc từ chối phiếu của một người trong lần chạy hiện tại; người quyết định lấy từ phiên.
  @RequireCap('payroll.approve')
  @Post(':month/:username/decision')
  async decidePayslip(
    @Param('month') month: string,
    @Param('username') username: string,
    @Body() body: { decision?: string; note?: string },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    if (!month || !MONTH_PATTERN.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }
    const status = body?.decision === 'approve' ? 'approved' : body?.decision === 'reject' ? 'rejected' : null;
    if (!status) throw new BadRequestError('Quyết định phải là approve hoặc reject', { code: 'INVALID_DECISION' });
    try {
      const payslip = await this.service.decidePayslip(month, username, status, user.username, body?.note);
      if (!payslip) throw new NotFoundError('Không tìm thấy phiếu lương', { code: 'PAYSLIP_NOT_FOUND' });
      return { month, payslip };
    } catch (err) {
      if (err instanceof PayrollFinalizedError) throw new ConflictError(err.message, { code: 'PAYROLL_FINALIZED' });
      throw err;
    }
  }

  @RequireCap('payroll.calculate')
  @Put(':month/kpi/:username')
  async setKpiScore(
    @Param('month') month: string,
    @Param('username') username: string,
    @Body() body: KpiScoreBody,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    if (!month || !MONTH_PATTERN.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }

    try {
      await this.service.setKpiScore(username, month, body, user.username);
    } catch (err) {
      if (err instanceof PayrollFinalizedError) throw new ConflictError(err.message, { code: 'PAYROLL_FINALIZED' });
      if (err instanceof KpiValidationError) {
        if (err.code === 'EMPLOYEE_NOT_FOUND') throw new NotFoundError(err.message, { code: err.code });
        throw new BadRequestError(err.message, { code: err.code });
      }
      throw err;
    }
    return { updated: true, username, month };
  }
}
