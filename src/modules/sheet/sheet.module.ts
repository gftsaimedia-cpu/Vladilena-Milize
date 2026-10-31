import { Module } from '@nestjs/common';
import { SheetController } from './sheet.controller';

@Module({ controllers: [SheetController] })
export class SheetModule {}
