import { Module } from '@nestjs/common';
import { SettingsChanges } from './settings-changes';
import { SettingsReader } from './settings-reader';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsRepository, SettingsReader, SettingsChanges, SettingsService],
  exports: [SettingsReader, SettingsChanges]
})
export class SettingsModule {}
