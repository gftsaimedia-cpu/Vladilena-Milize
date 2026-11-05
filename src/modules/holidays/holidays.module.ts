import { Module } from '@nestjs/common';
import { HolidaysRepository } from './holidays.repository';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';
import { PeriodsModule } from '../periods/periods.module';

@Module({
  imports: [PeriodsModule],
  controllers: [HolidaysController],
  providers: [HolidaysRepository, HolidaysService],
  exports: [HolidaysRepository, HolidaysService],
})
export class HolidaysModule {}
