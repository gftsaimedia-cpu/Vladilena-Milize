import { Module } from '@nestjs/common';
import { ExplanationsController } from './explanations.controller';

/** Giải trình Check-out muộn, ngày vắng và yêu cầu giải trình của Admin. */
@Module({ controllers: [ExplanationsController] })
export class ExplanationsModule {}
