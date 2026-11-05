import { Controller, Get, UseFilters, Inject } from '@nestjs/common';
import { ApiExceptionFilter, RequireCap } from '../../common';
import { RolesService } from './roles.service';

@Controller('api')
@UseFilters(ApiExceptionFilter)
export class RolesController {
  constructor(@Inject(RolesService) private readonly service: RolesService) {}

  @RequireCap('staff.manage')
  @Get('roles')
  async list(): Promise<unknown> {
    return await this.service.listRoles();
  }

  @RequireCap('staff.manage')
  @Get('v2/roles')
  async listV2(): Promise<unknown> {
    return await this.service.listRoles();
  }
}
