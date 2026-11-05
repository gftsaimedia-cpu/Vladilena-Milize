import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { HolidaysRepository } from './holidays.repository';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';

@Module({
  imports: [AttendanceModule],
  controllers: [HolidaysController],
  providers: [HolidaysRepository, HolidaysService],
  exports: [HolidaysRepository, HolidaysService],
})
export class HolidaysModule {}
