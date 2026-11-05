import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { HolidaysModule } from '../holidays';
import { RequestsRepository } from './requests.repository';
import { DayStatusRepository } from './day-status.repository';
import { ExplanationRemindersRepository } from './explanation-reminders.repository';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [AttendanceModule, HolidaysModule],
  controllers: [RequestsController],
  providers: [RequestsRepository, DayStatusRepository, ExplanationRemindersRepository, RequestsService],
  exports: [RequestsService, RequestsRepository, DayStatusRepository, ExplanationRemindersRepository],
})
export class RequestsModule {}
