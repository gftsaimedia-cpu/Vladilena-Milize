import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common';
import { RolesService } from './roles.service';

@Controller('api')
@UseFilters(ApiExceptionFilter)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('roles')
  async list(): Promise<unknown> {
    return await this.service.listRoles();
  }

  @Get('v2/roles')
  async listV2(): Promise<unknown> {
    return await this.service.listRoles();
  }
}
