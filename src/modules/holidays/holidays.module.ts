import { Module } from '@nestjs/common';
import { HolidaysRepository } from './holidays.repository';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';

@Module({
  controllers: [HolidaysController],
  providers: [HolidaysRepository, HolidaysService],
  exports: [HolidaysRepository, HolidaysService],
})
export class HolidaysModule {}
