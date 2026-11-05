import { Module } from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceDaysRepository } from './attendance-days.repository';
import { AttendanceDaysService } from './attendance-days.service';
import { AttendanceSettingsPort, PositionTypeAttendanceSettings } from './attendance-settings.port';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceRepository,
    AttendanceService,
    AttendanceDaysRepository,
    AttendanceDaysService,
    // Bản tạm (spec 9.1); khi module settings vào main chỉ cần đổi useClass.
    { provide: AttendanceSettingsPort, useClass: PositionTypeAttendanceSettings }
  ],
  exports: [AttendanceService, AttendanceRepository, AttendanceDaysRepository, AttendanceDaysService, AttendanceSettingsPort]
})
export class AttendanceModule {}
