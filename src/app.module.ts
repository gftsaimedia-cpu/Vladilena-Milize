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
import { MeModule } from './modules/me';

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
    MeModule,
  ],
})
export class AppModule {}
