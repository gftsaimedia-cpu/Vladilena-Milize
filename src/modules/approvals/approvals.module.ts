import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsHelpers } from './approvals.helpers';

@Module({ controllers: [ApprovalsController], providers: [ApprovalsHelpers], exports: [ApprovalsHelpers] })
export class ApprovalsModule {}
