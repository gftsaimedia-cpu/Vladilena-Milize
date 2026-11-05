import { Module } from '@nestjs/common';
import { DatabaseModule } from './database';
import { AuthModule } from './modules/auth';
import { RolesModule } from './modules/roles';
import { EmployeesModule } from './modules/employees';
import { HolidaysModule } from './modules/holidays';
import { RequestsModule } from './modules/requests';
import { AttendanceModule } from './modules/attendance';
import { PayrollModule } from './modules/payroll';
import { SystemModule } from './modules/system';
import { PeriodsModule } from './modules/periods';
import { MeModule } from './modules/me';
import { PositionsModule } from './modules/positions';
import { AuditModule } from './modules/audit';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RolesModule,
    EmployeesModule,
    HolidaysModule,
    RequestsModule,
    AttendanceModule,
    PayrollModule,
    SystemModule,
    PeriodsModule,
    MeModule,
    PositionsModule,
    AuditModule,
  ],
})
export class AppModule {}
