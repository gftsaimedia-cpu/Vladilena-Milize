import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceHelpers } from './attendance.helpers';
import { SheetModule } from '../sheet';

/** Check-in/out (/punch), OT thực tế (/ot), màn hôm nay (/today) và bảng chấm công (/attendance). */
@Module({
  imports: [SheetModule],
  controllers: [AttendanceController],
  providers: [AttendanceHelpers],
  exports: [AttendanceHelpers]
})
export class AttendanceModule {}
