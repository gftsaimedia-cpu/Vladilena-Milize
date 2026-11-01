import { Module } from '@nestjs/common';
import { ExplanationsController } from './explanations.controller';
import { ExplanationsHandlers } from './explanations.handlers';

/** Giải trình Check-out muộn, ngày vắng và yêu cầu giải trình của Admin. */
@Module({ controllers: [ExplanationsController], providers: [ExplanationsHandlers], exports: [ExplanationsHandlers] })
export class ExplanationsModule {}
