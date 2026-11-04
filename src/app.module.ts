import { Module } from '@nestjs/common';
import { DatabaseModule } from './database';
import { AuthModule } from './modules/auth';
import { RolesModule } from './modules/roles';
import { EmployeesModule } from './modules/employees';
import { RequestsModule } from './modules/requests';
import { AttendanceModule } from './modules/attendance';
import { PayrollModule } from './modules/payroll';
import { SystemModule } from './modules/system';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RolesModule,
    EmployeesModule,
    RequestsModule,
    AttendanceModule,
    PayrollModule,
    SystemModule,
  ],
})
export class AppModule {}
