import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { RequestsModule } from '../requests';
import { CalendarService } from './calendar.service';

@Module({
  imports: [AttendanceModule, RequestsModule],
  providers: [CalendarService],
  exports: [CalendarService]
})
export class CalendarModule {}
