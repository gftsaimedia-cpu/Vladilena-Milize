import { Module } from '@nestjs/common';
import { PayEntriesController } from './pay-entries.controller';

/** Khoản điền thêm theo người theo tháng. */
@Module({ controllers: [PayEntriesController] })
export class PayEntriesModule {}
