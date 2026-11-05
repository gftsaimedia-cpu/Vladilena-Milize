import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PeriodGate } from './period-gate';
import { PeriodsController } from './periods.controller';
import { PeriodsRepository } from './periods.repository';
import { PeriodsService } from './periods.service';

@Module({
  imports: [SettingsModule],
  controllers: [PeriodsController],
  providers: [PeriodsRepository, PeriodGate, PeriodsService],
  exports: [PeriodsRepository, PeriodGate, PeriodsService],
})
export class PeriodsModule {}
