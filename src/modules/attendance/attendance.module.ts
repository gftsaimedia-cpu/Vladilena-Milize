import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PeriodsModule } from '../periods/periods.module';

@Module({
  imports: [SettingsModule, PeriodsModule],
  controllers: [AttendanceController],
  providers: [AttendanceRepository, AttendanceService],
  exports: [AttendanceService, AttendanceRepository],
})
export class AttendanceModule {}
