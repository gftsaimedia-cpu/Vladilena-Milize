import { Module } from '@nestjs/common';
import { AdvanceController } from './advance.controller';
import { AdvanceApprovalsHandlers } from './advance-approvals.handlers';
import { AdvanceRequestsHandlers } from './advance-requests.handlers';

/** Tạm ứng lương: lịch sử yêu cầu và duyệt theo tháng. */
@Module({
  controllers: [AdvanceController],
  providers: [AdvanceApprovalsHandlers, AdvanceRequestsHandlers],
  exports: [AdvanceApprovalsHandlers, AdvanceRequestsHandlers]
})
export class AdvanceModule {}
