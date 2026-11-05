import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { EmployeesModule } from '../employees';
import { PayrollModule } from '../payroll';
import { RequestsModule } from '../requests';
import { PeriodsModule } from '../periods';
import { SettingsModule } from '../settings';
import { MeController } from './me.controller';

@Module({
  imports: [AttendanceModule, RequestsModule, PayrollModule, EmployeesModule, PeriodsModule, SettingsModule],
  controllers: [MeController],
})
export class MeModule {}
