import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { EmployeesModule } from '../employees';
import { PayrollModule } from '../payroll';
import { RequestsModule } from '../requests';
import { SettingsModule } from '../settings';
import { SystemModule } from '../system';
import { MeController } from './me.controller';

@Module({
  imports: [AttendanceModule, RequestsModule, PayrollModule, EmployeesModule, SystemModule, SettingsModule],
  controllers: [MeController],
})
export class MeModule {}
