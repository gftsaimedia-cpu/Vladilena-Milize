import { Controller, Get, Inject, Query, UseFilters } from '@nestjs/common';
import { ApiExceptionFilter, RequireCap } from '../../common';
import type { VerifyResult } from './domain/audit-chain';
import { AuditService, type AuditListDTO } from './audit.service';

/** Màn Cài đặt › Nhật ký thay đổi: danh sách có lọc và kiểm tra chuỗi băm. */
@Controller('api/v2/system/audit')
@UseFilters(ApiExceptionFilter)
export class AuditController {
  constructor(@Inject(AuditService) private readonly service: AuditService) {}

  @RequireCap('audit.read')
  @Get()
  async list(@Query() query: Record<string, unknown>): Promise<AuditListDTO> {
    return this.service.list(query);
  }

  @RequireCap('audit.read')
  @Get('verify')
  async verify(): Promise<VerifyResult> {
    return this.service.verify();
  }
}
