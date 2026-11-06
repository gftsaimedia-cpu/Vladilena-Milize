import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { SettingsModule } from '../settings';
import { PayrollRepository } from './payroll.repository';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PeriodsModule } from '../periods';
import { DepartmentsModule } from '../departments';

// AttendanceModule gives AttendanceDaysService (the payslip rewrites and reads the day rows, T6); it does not import
// PayrollModule, so there is no cycle.
@Module({
  imports: [SettingsModule, AttendanceModule, PeriodsModule, DepartmentsModule],
  controllers: [PayrollController],
  providers: [PayrollRepository, PayrollService],
  exports: [PayrollService, PayrollRepository],
})
export class PayrollModule {}
