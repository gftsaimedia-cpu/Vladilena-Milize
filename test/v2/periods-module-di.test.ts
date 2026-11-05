import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { KYSELY_DB } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodsModule } from '../../src/modules/periods/periods.module';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';

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
  } finally {
    await app.close();
  }
});
