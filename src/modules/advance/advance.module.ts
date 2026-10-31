import { Module } from '@nestjs/common';
import { AdvanceController } from './advance.controller';

/** Tạm ứng lương: lịch sử yêu cầu và duyệt theo tháng. */
@Module({ controllers: [AdvanceController] })
export class AdvanceModule {}
