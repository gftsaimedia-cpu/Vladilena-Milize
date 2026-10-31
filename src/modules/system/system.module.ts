import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';

/** Giám sát (/health) và luồng báo tin SSE (/events). */
@Module({ controllers: [SystemController] })
export class SystemModule {}
