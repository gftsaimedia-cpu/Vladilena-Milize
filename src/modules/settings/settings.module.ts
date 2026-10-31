import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';

/** Cài đặt hệ thống: ngày lễ, công tắc Agents, vùng GPS, bộ tham số lương, phiên bản cấu hình. */
@Module({ controllers: [SettingsController] })
export class SettingsModule {}
