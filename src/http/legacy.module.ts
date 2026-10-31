import { DynamicModule, Module } from '@nestjs/common';
import { LEGACY_API, LegacyApi, LegacyController } from './legacy.controller';

/** Phải được import SAU mọi module nghiệp vụ: route bắt-hết của nó chỉ nhận những gì module khác không nhận. */
@Module({})
export class LegacyModule {
  static register(legacy: LegacyApi): DynamicModule {
    return { module: LegacyModule, controllers: [LegacyController], providers: [{ provide: LEGACY_API, useValue: legacy }] };
  }
}
