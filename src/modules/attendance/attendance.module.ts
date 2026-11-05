import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceDaysJob } from './attendance-days.job';
import { AttendanceDaysRepository } from './attendance-days.repository';
import { AttendanceDaysService } from './attendance-days.service';
import { AttendanceSettingsPort, PositionTypeAttendanceSettings } from './attendance-settings.port';

@Module({
  imports: [SettingsModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceRepository,
    AttendanceService,
    AttendanceDaysRepository,
    AttendanceDaysService,
    AttendanceDaysJob,
    // Bản tạm (spec 9.1); khi module settings vào main chỉ cần đổi useClass.
    { provide: AttendanceSettingsPort, useClass: PositionTypeAttendanceSettings }
  ],
  exports: [AttendanceService, AttendanceRepository, AttendanceDaysRepository, AttendanceDaysService, AttendanceDaysJob, AttendanceSettingsPort]
})
export class AttendanceModule {}
