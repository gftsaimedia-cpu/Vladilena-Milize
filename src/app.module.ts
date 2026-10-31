import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiGate } from './http/api-gate';
import { ApiGuard } from './http/api.guard';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestScopeInterceptor } from './http/request-scope.interceptor';
import { LEGACY_API, LegacyApi, LegacyController } from './http/legacy.controller';

@Module({})
export class AppModule {
  /** legacy: bộ xử lý cũ cho các route chưa chuyển module. */
  static register(legacy: LegacyApi): DynamicModule {
    return {
      module: AppModule,
      controllers: [LegacyController],
      providers: [
        ApiGate,
        { provide: LEGACY_API, useValue: legacy },
        { provide: APP_GUARD, useClass: ApiGuard },
        { provide: APP_INTERCEPTOR, useClass: RequestScopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter }
      ]
    };
  }
}
