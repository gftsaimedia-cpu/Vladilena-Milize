import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceDaysJob } from './attendance-days.job';
import { AttendanceDaysRepository } from './attendance-days.repository';
import { AttendanceDaysService } from './attendance-days.service';
import { AttendanceSettingsListener } from './attendance-settings.listener';
import { AttendanceSettingsPort, SettingsAttendanceSettings } from './attendance-settings.port';

@Module({
  imports: [SettingsModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceRepository,
    AttendanceService,
    AttendanceDaysRepository,
    AttendanceDaysService,
    AttendanceDaysJob,
    { provide: AttendanceSettingsPort, useClass: SettingsAttendanceSettings },
    // Ghi lại dòng ngày công khi tuần làm riêng hoặc ân hạn đổi (spec 9.2).
    AttendanceSettingsListener
  ],
  exports: [AttendanceService, AttendanceRepository, AttendanceDaysRepository, AttendanceDaysService, AttendanceDaysJob, AttendanceSettingsPort]
})
export class AttendanceModule {}
