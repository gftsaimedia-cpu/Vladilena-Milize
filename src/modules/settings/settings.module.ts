import { Module } from '@nestjs/common';
import { SettingsReader } from './settings-reader';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsRepository, SettingsReader, SettingsService],
  exports: [SettingsReader]
})
export class SettingsModule {}
