import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { HolidaysModule } from '../holidays';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [AttendanceModule, HolidaysModule],
  controllers: [RequestsController],
  providers: [RequestsRepository, RequestsService],
  exports: [RequestsService, RequestsRepository],
})
export class RequestsModule {}
