import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';

/** Check-in/out (/punch), OT thực tế (/ot), màn hôm nay (/today) và bảng chấm công (/attendance). */
@Module({ controllers: [AttendanceController] })
export class AttendanceModule {}
