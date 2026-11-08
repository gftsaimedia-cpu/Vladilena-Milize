import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap, requireBulkIds } from '../../common';
import { AuditEntryError } from '../audit';
import { DepartmentNotFoundError } from '../departments/departments.errors';
import { staffFilterFromQuery } from '../departments/staff-filter-http';
import { EmployeesService } from './employees.service';

// Lỗi lưu hồ sơ: phòng ban không có là 404 riêng, lỗi dữ liệu còn lại là 400.
function saveFailure(err: any): never {
  if (err instanceof AuditEntryError) throw err;
  if (err instanceof DepartmentNotFoundError) throw new NotFoundError(err.message, { code: 'DEPARTMENT_NOT_FOUND' });
  throw new BadRequestError(err.message, { code: 'BAD_EMPLOYEE_INPUT' });
}

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
    @Query('staffStatus') staffStatus?: string,
    @Query('departmentId') departmentId?: string,
    @Query('month') month?: string
  ): Promise<unknown> {
    if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestError('Tháng không hợp lệ (định dạng YYYY-MM)', { code: 'INVALID_MONTH' });
    }
    // Có bộ lọc chung (staffStatus, departmentId) thì q đi theo cách tìm không dấu của bộ lọc chung.
    const common = staffStatus !== undefined || departmentId !== undefined;
    const staff = common ? staffFilterFromQuery({ staffStatus, departmentId, q }) : undefined;
    const employees = await this.service.list({ shiftType, status, q: common ? undefined : q, staff });
    const views = await this.service.views(employees);
    // `work` và `summary` do BE tính theo tháng `month` (mặc định tháng này); `summary` luôn tính trên toàn bộ hồ sơ.
    return {
      employees: views.map((v, i) => ({ ...v, work: this.service.workOf(employees[i], month) })),
      total: employees.length,
      summary: await this.service.summary(month)
    };
  }

  @RequireCap('staff.manage')
  @Post('shift')
  async assignShift(@Body() body: { usernames?: unknown; shiftCode?: unknown; effectiveFrom?: unknown }, @CurrentUser() user: UserSession): Promise<unknown> {
    const usernames = requireBulkIds(body?.usernames);
    if (typeof body.shiftCode !== 'string') throw new BadRequestError('Thiếu mã ca', { code: 'INVALID_SHIFT_CODE' });
    if (body.effectiveFrom !== undefined && body.effectiveFrom !== null && typeof body.effectiveFrom !== 'string') {
      throw new BadRequestError('Ngày áp dụng ca mới phải là chữ YYYY-MM-DD', { code: 'INVALID_EFFECTIVE_FROM' });
    }
    return await this.service.assignShift(usernames, body.shiftCode, user.username, (body.effectiveFrom as string | undefined) ?? undefined);
  }

  @RequireCap('staff.manage')
  @Post('department')
  async assignDepartment(@Body() body: { usernames?: unknown; departmentId?: unknown }, @CurrentUser() user: UserSession): Promise<unknown> {
    const usernames = requireBulkIds(body?.usernames);
    const id = body.departmentId;
    if (id !== null && !(typeof id === 'number' && Number.isSafeInteger(id) && id >= 1)) {
      throw new BadRequestError('departmentId phải là số nguyên dương hoặc null', { code: 'INVALID_DEPARTMENT_ID' });
    }
    try {
      return await this.service.assignDepartment(usernames, id as number | null, user.username);
    } catch (err) {
      if (err instanceof DepartmentNotFoundError) throw new NotFoundError(err.message, { code: 'DEPARTMENT_NOT_FOUND' });
      throw err;
    }
  }

  @RequireCap('staff.manage')
  @Get(':username')
  async getEmployee(@Param('username') username: string): Promise<unknown> {
    const employee = await this.service.findByUsernameOrUuid(username);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { employee: { ...(await this.service.views([employee]))[0], work: this.service.workOf(employee) } };
  }

  @RequireCap('staff.manage')
  @Post()
  async createEmployee(
    @Body() body: any,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const saved = await this.service.create(body, user.username);
      return { created: true, employee: (await this.service.views([saved]))[0] };
    } catch (err: any) {
      // Lỗi ghi nhật ký là lỗi lập trình (spec audit-log mục 4): để filter trả 500.
      return saveFailure(err);
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
      return saveFailure(err);
    }
    if (!saved) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { updated: true, employee: (await this.service.views([saved]))[0] };
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
