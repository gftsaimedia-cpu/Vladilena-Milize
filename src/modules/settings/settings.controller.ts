import { Body, Controller, Get, Inject, Param, Put, Query, UseFilters } from '@nestjs/common';
import {
  ApiExceptionFilter,
  BadRequestError,
  ConflictError,
  CurrentUser,
  NotFoundError,
  RequireCap,
  UserSession
} from '../../common';
import {
  SettingsEmployeeNotFoundError,
  SettingsGroupNotFoundError,
  SettingsInputError,
  SettingsStaleError
} from './settings.errors';
import { SettingsService } from './settings.service';

/**
 * Màn Cài đặt: các nhóm con số tính lương theo tháng, vùng chấm công, tuần làm việc riêng từng người.
 * Đường cụ thể khai báo trước `:group` để Nest khớp đúng.
 */
@Controller('api/v2/settings')
@UseFilters(ApiExceptionFilter)
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly service: SettingsService) {}

  @RequireCap('config.read')
  @Get()
  async getAll(@Query('month') month: unknown): Promise<unknown> {
    return this.run(() => this.service.getAll(month));
  }

  @RequireCap('config.read')
  @Get('pay-days')
  async payDays(@Query('year') year: unknown): Promise<unknown> {
    return this.run(() => this.service.payDays(year));
  }

  @RequireCap('config.read')
  @Get('attendance-zone')
  async getZone(): Promise<unknown> {
    return this.run(() => this.service.getZone());
  }

  @RequireCap('config.write')
  @Put('attendance-zone')
  async saveZone(@Body() body: unknown, @CurrentUser() user: UserSession): Promise<unknown> {
    return this.run(() => this.service.saveZone(body, user.username));
  }

  @RequireCap('config.read')
  @Get('attendance-zone/history')
  async zoneHistory(): Promise<unknown> {
    return this.run(() => this.service.zoneHistory());
  }

  @RequireCap('config.read')
  @Get('work-weeks/:username')
  async getWorkWeek(@Param('username') username: string, @Query('month') month: unknown): Promise<unknown> {
    return this.run(() => this.service.getWorkWeek(username, month));
  }

  @RequireCap('config.write')
  @Put('work-weeks/:username')
  async saveWorkWeek(
    @Param('username') username: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    return this.run(() => this.service.saveWorkWeek(username, body, user.username));
  }

  @RequireCap('config.read')
  @Get('work-weeks/:username/history')
  async workWeekHistory(@Param('username') username: string): Promise<unknown> {
    return this.run(() => this.service.workWeekHistory(username));
  }

  @RequireCap('config.write')
  @Put(':group')
  async saveGroup(@Param('group') group: string, @Body() body: unknown, @CurrentUser() user: UserSession): Promise<unknown> {
    return this.run(() => this.service.saveGroup(group, body, user.username));
  }

  @RequireCap('config.read')
  @Get(':group/history')
  async groupHistory(@Param('group') group: string): Promise<unknown> {
    return this.run(() => this.service.groupHistory(group));
  }

  /** Lỗi của module → mã HTTP của spec; lỗi khác (DB...) đi tiếp qua ApiExceptionFilter. */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: unknown) {
      if (err instanceof SettingsInputError) throw new BadRequestError(err.message, { code: 'BAD_SETTINGS_INPUT', field: err.field });
      if (err instanceof SettingsGroupNotFoundError) throw new NotFoundError(err.message, { code: 'SETTINGS_GROUP_NOT_FOUND' });
      if (err instanceof SettingsEmployeeNotFoundError) throw new NotFoundError(err.message, { code: 'EMPLOYEE_NOT_FOUND' });
      if (err instanceof SettingsStaleError) throw new ConflictError(err.message, { code: 'SETTINGS_STALE', stamp: err.stamp });
      throw err;
    }
  }
}
