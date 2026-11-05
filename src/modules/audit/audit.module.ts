import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditLog } from './audit-log';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/** Toàn cục để module khác chỉ cần @Inject(AuditLog), không phải sửa imports. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditService, AuditLog],
  exports: [AuditLog]
})
export class AuditModule {}
