import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { HolidaysModule } from '../holidays';
import { PayrollModule } from '../payroll';
import { SettingsModule } from '../settings';
import { SystemModule } from '../system';
import { RequestsRepository } from './requests.repository';
import { DayStatusRepository } from './day-status.repository';
import { ExplanationRemindersRepository } from './explanation-reminders.repository';
import { ExplanationsService } from './explanations.service';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [AttendanceModule, HolidaysModule, PayrollModule, SettingsModule, SystemModule],
  controllers: [RequestsController],
  providers: [RequestsRepository, DayStatusRepository, ExplanationRemindersRepository, ExplanationsService, RequestsService],
  exports: [RequestsService, ExplanationsService, RequestsRepository, DayStatusRepository, ExplanationRemindersRepository],
})
export class RequestsModule {}
