import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { ApiGate } from './http/api-gate';
import { ApiGuard } from './http/api.guard';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestScopeInterceptor } from './http/request-scope.interceptor';
import { NotFoundModule } from './http/not-found.controller';
import { AuthModule } from './modules/auth';
import { SystemModule } from './modules/system';
import { SettingsModule } from './modules/settings';
import { SheetModule } from './modules/sheet';
import { KpiModule } from './modules/kpi';
import { ApprovalsModule } from './modules/approvals';
import { AttendanceModule } from './modules/attendance';
import { AttendanceV2Module } from './modules/attendance-v2';
import { PeriodsModule } from './modules/periods';
import { AuditModule } from './modules/audit';
import { StaffModule } from './modules/staff';
import { RolesModule } from './modules/roles';
import { BlocksModule } from './modules/blocks';
import { PositionsModule } from './modules/positions';
import { CatalogModule } from './modules/catalog';
import { EmployeesModule } from './modules/employees';
import { EmployeeV2Module } from './modules/employee-v2';
import { RequestV2Module } from './modules/request-v2';
import { LeaveModule } from './modules/leave';
import { AdvanceModule } from './modules/advance';
import { ExplanationsModule } from './modules/explanations';
import { PayEntriesModule } from './modules/pay-entries';

/**
 * Thứ tự import là thứ tự đăng ký route: route cụ thể (ví dụ PUT /staff/shift-bulk) phải đứng trước route có tham số (PUT /staff/:u),
 * và NotFoundModule (bắt-hết, trả 404) luôn đứng cuối.
 */
const FEATURE_MODULES = [
  SystemModule,
  AuthModule,
  SettingsModule,
  SheetModule,
  KpiModule,
  ApprovalsModule,
  AttendanceModule,
  AttendanceV2Module,
  PeriodsModule,
  AuditModule,
  StaffModule,
  RolesModule,
  BlocksModule,
  PositionsModule,
  CatalogModule,
  EmployeesModule,
  EmployeeV2Module,
  RequestV2Module,
  LeaveModule,
  AdvanceModule,
  ExplanationsModule,
  PayEntriesModule
];

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule, ...FEATURE_MODULES, NotFoundModule],
      providers: [
        ApiGate,
        { provide: APP_GUARD, useClass: ApiGuard },
        { provide: APP_INTERCEPTOR, useClass: RequestScopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter }
      ]
    };
  }
}
