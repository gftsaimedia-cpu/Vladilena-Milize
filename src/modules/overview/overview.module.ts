import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { EmployeesModule } from '../employees';
import { PayrollModule } from '../payroll';
import { PeriodsModule } from '../periods';
import { RequestsModule } from '../requests';
import { SettingsModule } from '../settings';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

// Màn Admin gộp: chỉ đọc từ service sẵn có, không bảng mới.
@Module({
  imports: [AttendanceModule, EmployeesModule, PayrollModule, PeriodsModule, RequestsModule, SettingsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
