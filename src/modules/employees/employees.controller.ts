import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
import { AuditEntryError } from '../audit';
import { EmployeesService } from './employees.service';

@Controller('api/v2/employees')
@UseFilters(ApiExceptionFilter)
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly service: EmployeesService) {}

  @RequireCap('staff.manage')
  @Get('meta/positions')
  async getPositionsCatalog(): Promise<unknown> {
    const positions = await this.service.getPositionsCatalog();
    return { positions };
  }

  @RequireCap('staff.manage')
  @Get('meta/shifts')
  async getShiftsCatalog(): Promise<unknown> {
    const shifts = await this.service.getShiftsCatalog();
    return { shifts };
  }

  @RequireCap('staff.manage')
  @Get()
  async listEmployees(
    @Query('shiftType') shiftType?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('month') month?: string
  ): Promise<unknown> {
    if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }
    const employees = await this.service.list({ shiftType, status, q });
    // `work` và `summary` do BE tính theo tháng `month` (mặc định tháng này); `summary` luôn tính trên toàn bộ hồ sơ.
    return {
      employees: employees.map((e) => ({ ...e.toDTO(), work: this.service.workOf(e, month) })),
      total: employees.length,
      summary: await this.service.summary(month)
    };
  }

  @RequireCap('staff.manage')
  @Get(':username')
  async getEmployee(@Param('username') username: string): Promise<unknown> {
    const employee = await this.service.findByUsernameOrUuid(username);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { employee: { ...employee.toDTO(), work: this.service.workOf(employee) } };
  }

  @RequireCap('staff.manage')
  @Post()
  async createEmployee(
    @Body() body: any,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const saved = await this.service.create(body, user.username);
      return { created: true, employee: saved.toDTO() };
    } catch (err: any) {
      // Lỗi ghi nhật ký là lỗi lập trình (spec audit-log mục 4): để filter trả 500.
      if (err instanceof AuditEntryError) throw err;
      throw new BadRequestError(err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
  }

  @RequireCap('staff.manage')
  @Put(':username')
  async putEmployee(
    @Param('username') username: string,
    @Body() body: any,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    let saved;
    try {
      saved = await this.service.update(username, body, user.username);
    } catch (err: any) {
      // Lỗi ghi nhật ký là lỗi lập trình (spec audit-log mục 4): để filter trả 500.
      if (err instanceof AuditEntryError) throw err;
      throw new BadRequestError(err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    if (!saved) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { updated: true, employee: saved.toDTO() };
  }

  @RequireCap('staff.manage')
  @Delete(':username')
  async deleteEmployee(
    @Param('username') username: string,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    const ok = await this.service.deactivate(username, user.username);
    if (!ok) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { deactivated: true, username };
  }
}
