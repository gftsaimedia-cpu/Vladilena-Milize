import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsShiftsController } from './settings-shifts.controller';
import { SettingsHelpers } from './settings.helpers';

/** Cài đặt hệ thống: ngày lễ, công tắc Agents, vùng GPS, bộ tham số lương, phiên bản cấu hình. */
@Module({
  controllers: [SettingsController, SettingsShiftsController],
  providers: [SettingsHelpers],
  exports: [SettingsHelpers]
})
export class SettingsModule {}
