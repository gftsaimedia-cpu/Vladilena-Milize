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
import { DepartmentsModule } from './modules/departments';
import { SettingsModule } from './modules/settings';
import { AuditModule } from './modules/audit';
import { OverviewModule } from './modules/overview';
import { RealtimeModule } from './modules/realtime';

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
    DepartmentsModule,
    SettingsModule,
    AuditModule,
    OverviewModule,
    RealtimeModule,
  ],
})
export class AppModule {}
