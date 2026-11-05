import { Controller, Get, Post, Delete, Param, Body, Query, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, NotFoundError, CurrentUser, UserSession, RequireCap } from '../../common';
import { businessDateText } from '../../common/business-date';
import { HolidayNotFoundError } from './holidays.errors';
import { HolidaysService } from './holidays.service';

@Controller('api/v2/holidays')
@UseFilters(ApiExceptionFilter)
export class HolidaysController {
  constructor(@Inject(HolidaysService) private readonly service: HolidaysService) {}

  @RequireCap('config.read')
  @Get()
  async list(@Query('year') year?: string): Promise<unknown> {
    return this.run(async () => ({
      items: await this.service.list(year ?? businessDateText().slice(0, 4))
    }));
  }

  @RequireCap('config.write')
  @Post()
  async create(@Body() body: { date?: unknown; name?: unknown }, @CurrentUser() user: UserSession): Promise<unknown> {
    return this.run(async () => ({
      created: true,
      holiday: await this.service.add({ date: body?.date, name: body?.name }, user.username)
    }));
  }

  @RequireCap('config.write')
  @Post('quick-add')
  async quickAdd(@Body() body: { year?: unknown }, @CurrentUser() user: UserSession): Promise<unknown> {
    return this.run(async () => ({ added: await this.service.quickAdd(body?.year, user.username) }));
  }

  @RequireCap('config.write')
  @Delete(':date')
  async remove(@Param('date') date: string): Promise<unknown> {
    return this.run(async () => {
      await this.service.remove(date);
      return { deleted: true };
    });
  }

  /** Ngày không có trong lịch → 404 HOLIDAY_NOT_FOUND; mọi lỗi khác của service → 400 BAD_REQUEST, như controller requests. */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: any) {
      if (err instanceof HolidayNotFoundError) {
        throw new NotFoundError(err.message, { code: 'HOLIDAY_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }
}
