import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { EmployeesModule } from '../employees';
import { PayrollModule } from '../payroll';
import { RequestsModule } from '../requests';
import { PeriodsModule } from '../periods';
import { MeController } from './me.controller';

@Module({
  imports: [AttendanceModule, RequestsModule, PayrollModule, EmployeesModule, PeriodsModule],
  controllers: [MeController],
})
export class MeModule {}
