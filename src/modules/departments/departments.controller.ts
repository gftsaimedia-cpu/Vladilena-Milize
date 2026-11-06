import { Body, Controller, Delete, Get, Inject, Param, Post, Put, UseFilters } from '@nestjs/common';
import {
  ApiExceptionFilter,
  BadRequestError,
  ConflictError,
  CurrentUser,
  NotFoundError,
  RequireCap,
  UserSession
} from '../../common';
import { DepartmentsService } from './departments.service';
import {
  DepartmentInputError,
  DepartmentNameTakenError,
  DepartmentNotEmptyError,
  DepartmentNotFoundError
} from './departments.errors';

/** Phòng ban của công ty (màn Cài đặt › Phòng ban); mọi màn có danh sách nhân sự lọc theo các phòng này. */
@Controller('api/v2/departments')
@UseFilters(ApiExceptionFilter)
export class DepartmentsController {
  constructor(@Inject(DepartmentsService) private readonly service: DepartmentsService) {}

  @RequireCap('config.read')
  @Get()
  async list(): Promise<unknown> {
    return { departments: await this.service.list() };
  }

  @RequireCap('config.write')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: UserSession): Promise<unknown> {
    return { department: await this.run(() => this.service.create(body, user.username)) };
  }

  @RequireCap('config.write')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: UserSession): Promise<unknown> {
    const key = idOf(id);
    return { department: await this.run(() => this.service.update(key, body, user.username)) };
  }

  @RequireCap('config.write')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: UserSession): Promise<unknown> {
    const key = idOf(id);
    await this.run(() => this.service.remove(key, user.username));
    return { deleted: true, id: key };
  }

  /** Lỗi của module → mã HTTP của tài liệu yêu cầu; lỗi khác (DB, nhật ký...) đi tiếp qua ApiExceptionFilter. */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: unknown) {
      if (err instanceof DepartmentInputError) throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
      if (err instanceof DepartmentNotFoundError) throw new NotFoundError(err.message, { code: 'DEPARTMENT_NOT_FOUND' });
      if (err instanceof DepartmentNameTakenError) throw new ConflictError(err.message, { code: 'DEPARTMENT_NAME_TAKEN' });
      if (err instanceof DepartmentNotEmptyError) throw new ConflictError(err.message, { code: 'DEPARTMENT_NOT_EMPTY' });
      throw err;
    }
  }
}

/** Mã phòng ban trên đường dẫn: số nguyên dương; không thì coi như không có phòng đó. */
function idOf(text: string): number {
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1) {
    throw new NotFoundError('Không tìm thấy phòng ban', { code: 'DEPARTMENT_NOT_FOUND' });
  }
  return n;
}
