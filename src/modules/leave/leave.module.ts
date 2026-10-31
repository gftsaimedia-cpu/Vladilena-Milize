import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';

/** Sổ phép năm lưu sẵn. */
@Module({ controllers: [LeaveController] })
export class LeaveModule {}
