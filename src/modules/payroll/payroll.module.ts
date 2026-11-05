import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { PayrollRepository } from './payroll.repository';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';

@Module({
  imports: [SettingsModule],
  controllers: [PayrollController],
  providers: [PayrollRepository, PayrollService],
  exports: [PayrollService, PayrollRepository],
})
export class PayrollModule {}
