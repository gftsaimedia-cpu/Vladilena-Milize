import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiGate } from './http/api-gate';
import { ApiGuard } from './http/api.guard';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestScopeInterceptor } from './http/request-scope.interceptor';
import { LegacyApi } from './http/legacy.controller';
import { LegacyModule } from './http/legacy.module';
import { AuthModule } from './modules/auth/auth.module';

/**
 * Thứ tự import là thứ tự đăng ký route: route cụ thể (ví dụ PUT /staff/shift-bulk) phải đứng trước route có tham số (PUT /staff/:u),
 * và LegacyModule (bắt-hết) luôn đứng cuối.
 */
const FEATURE_MODULES = [AuthModule];

@Module({})
export class AppModule {
  /** legacy: bộ xử lý cũ cho các route chưa chuyển module. */
  static register(legacy: LegacyApi): DynamicModule {
    return {
      module: AppModule,
      imports: [...FEATURE_MODULES, LegacyModule.register(legacy)],
      providers: [
        ApiGate,
        { provide: APP_GUARD, useClass: ApiGuard },
        { provide: APP_INTERCEPTOR, useClass: RequestScopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter }
      ]
    };
  }
}
