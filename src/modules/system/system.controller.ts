import { Controller, Get, Post, Put, Param, Body, Query, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, CurrentUser, UserSession, Public, RequireCap } from '../../common';
import { SystemService } from './system.service';

@Controller('api')
@UseFilters(ApiExceptionFilter)
export class SystemController {
  constructor(@Inject(SystemService) private readonly service: SystemService) {}

  @Public()
  @Get('health')
  async health(): Promise<unknown> {
    return await this.service.checkHealth();
  }

  @Public()
  @Get('v2/system/health')
  async healthV2(): Promise<unknown> {
    return await this.service.checkHealth();
  }

  @RequireCap('config.read')
  @Get('v2/system/settings')
  async getSettings(): Promise<unknown> {
    const settings = await this.service.listSettings();
    return { settings };
  }

  @RequireCap('config.write')
  @Put('v2/system/settings/:key')
  async updateSetting(
    @Param('key') key: string,
    @Body() body: { value: string },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    await this.service.setSetting(key, body.value, user.username);
    return { ok: true, key, value: body.value };
  }

  @RequireCap('audit.read')
  @Get('v2/system/audit')
  async getAuditLogs(
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ): Promise<unknown> {
    const limit = limitStr ? Number(limitStr) : 50;
    const offset = offsetStr ? Number(offsetStr) : 0;
    const items = await this.service.listAuditLogs(limit, offset);
    return { items, count: items.length };
  }

  @RequireCap('config.read')
  @Get('v2/system/periods')
  async listPeriods(): Promise<unknown> {
    const periods = await this.service.listPeriods();
    return { periods };
  }

  @RequireCap('attendance.lock')
  @Post('v2/system/periods/:month/lock')
  async lockPeriod(
    @Param('month') month: string,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    await this.service.lockPeriod(month, user.username);
    return { ok: true, month, status: 'LOCKED' };
  }
}
