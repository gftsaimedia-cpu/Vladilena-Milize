import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  imports: [AttendanceModule],
  controllers: [RequestsController],
  providers: [RequestsRepository, RequestsService],
  exports: [RequestsService, RequestsRepository],
})
export class RequestsModule {}
