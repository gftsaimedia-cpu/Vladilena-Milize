import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
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
    @Query('q') q?: string
  ): Promise<unknown> {
    const employees = await this.service.list({ shiftType, status, q });
    return { employees: employees.map((e) => e.toDTO()) };
  }

  @RequireCap('staff.manage')
  @Get(':username')
  async getEmployee(@Param('username') username: string): Promise<unknown> {
    const employee = await this.service.findByUsernameOrUuid(username);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { employee: employee.toDTO() };
  }

  @RequireCap('staff.manage')
  @Post()
  async createEmployee(
    @Body() body: any,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const employee = this.service.buildEmployeeFromInput(body);
      const saved = await this.service.save(employee, user.username);
      return { created: true, employee: saved.toDTO() };
    } catch (err: any) {
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
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new NotFoundError('Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }

    try {
      const updated = this.service.buildEmployeeFromInput(body, existing);
      const saved = await this.service.save(updated, user.username);
      return { updated: true, employee: saved.toDTO() };
    } catch (err: any) {
      throw new BadRequestError(err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
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
