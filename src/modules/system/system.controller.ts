import { Controller, Get, Put, Param, Body, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, BadRequestError, CurrentUser, UserSession, Public, RequireCap } from '../../common';
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
    // Cột value_json NOT NULL: thiếu value (hay null) thì 400 (không để rơi thành 500).
    if (body?.value === undefined || body.value === null) {
      throw new BadRequestError('Giá trị cấu hình (value) không được để trống', { code: 'BAD_SETTING_INPUT' });
    }
    await this.service.setSetting(key, body.value, user.username);
    return { ok: true, key, value: body.value };
  }
}
