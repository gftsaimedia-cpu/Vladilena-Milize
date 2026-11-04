import { Module } from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceRepository, AttendanceService],
  exports: [AttendanceService, AttendanceRepository],
})
export class AttendanceModule {}
