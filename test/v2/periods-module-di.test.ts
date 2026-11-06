import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { KYSELY_DB } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { HolidaysModule } from '../../src/modules/holidays/holidays.module';
import { HolidaysService } from '../../src/modules/holidays/holidays.service';
import { MeController } from '../../src/modules/me/me.controller';
import { MeModule } from '../../src/modules/me/me.module';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodsModule } from '../../src/modules/periods/periods.module';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';

// Chạy bằng tsx/esbuild nên không có design:paramtypes: mọi phụ thuộc phải có @Inject tường minh.
// Test này dựng PeriodsModule qua Nest thật; DB, TransactionCoordinator và AuditLog (toàn cục ở app) là giá trị giả.
const fakeDb = { name: 'fake-db' };
const fakeTx = { name: 'fake-tx' };
const fakeAudit = { name: 'fake-audit' };

@Global()
@Module({
  providers: [
    { provide: KYSELY_DB, useValue: fakeDb },
    { provide: TransactionCoordinator, useValue: fakeTx },
    { provide: AuditLog, useValue: fakeAudit }
  ],
  exports: [KYSELY_DB, TransactionCoordinator, AuditLog]
})
class FakeGlobalsModule {}

@Module({ imports: [FakeGlobalsModule, PeriodsModule] })
class TestRootModule {}

@Module({ imports: [FakeGlobalsModule, MeModule, HolidaysModule] })
class ConsumersRootModule {}

test('the modules that use the period gate get the shared PeriodGate and PeriodsService', async () => {
  // MeModule kéo theo Attendance, Requests, Payroll, Employees và Periods; HolidaysModule thêm cổng ngày lễ.
  const app = await NestFactory.createApplicationContext(ConsumersRootModule, { logger: false });
  try {
    const gate = app.get(PeriodGate, { strict: false });
    const periods = app.get(PeriodsService, { strict: false });
    const payroll = app.get(PayrollService, { strict: false });
    assert.ok(gate instanceof PeriodGate);
    assert.ok(periods instanceof PeriodsService);
    assert.ok(payroll instanceof PayrollService);

    const attendance = app.get(AttendanceService, { strict: false }) as any;
    const holidays = app.get(HolidaysService, { strict: false }) as any;
    const requests = app.get(RequestsService, { strict: false }) as any;
    const me = app.get(MeController, { strict: false }) as any;
    assert.equal(attendance.periodGate, gate);
    assert.equal(holidays.periodGate, gate);
    assert.equal((payroll as any).periods, periods);
    assert.equal(requests.periodGate, gate);
    assert.equal(requests.payroll, payroll);
    assert.equal(me.periods, periods);
  } finally {
    await app.close();
  }
});

test('PeriodsModule wires the gate, the service and the repository through Nest DI', async () => {
  const app = await NestFactory.createApplicationContext(TestRootModule, { logger: false });
  try {
    const repo = app.get(PeriodsRepository, { strict: false });
    const gate = app.get(PeriodGate, { strict: false });
    const service = app.get(PeriodsService, { strict: false }) as any;

    assert.ok(repo instanceof PeriodsRepository);
    assert.equal((repo as any).db, fakeDb);
    assert.equal((gate as any).repo, repo);
    assert.equal(service.repo, repo);
    assert.equal(service.tx, fakeTx);
    assert.equal(service.audit, fakeAudit);
    // Ngày trả lương đọc từ kho cài đặt: PeriodsModule nhập SettingsModule.
    assert.ok(service.settings instanceof SettingsReader);
    assert.equal(service.settings, app.get(SettingsReader, { strict: false }));
  } finally {
    await app.close();
  }
});
