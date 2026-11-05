import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { withTempDb } from './helpers/pg-temp-db';

function build(db: Kysely<DB>, now: string): { service: PeriodsService; repo: PeriodsRepository; tx: TransactionCoordinator } {
  const tx = new TransactionCoordinator(db);
  const repo = new PeriodsRepository(db);
  const service = new PeriodsService(repo, tx, new AuditLog(new AuditRepository(), new TransactionCoordinator(db)));
  service.now = () => new Date(now);
  return { service, repo, tx };
}

const auditRows = async (client: Client) =>
  (await client.query('SELECT * FROM audit_log ORDER BY id')).rows as Array<Record<string, string | null>>;

test('lock before the month ends is refused', async t => {
  await withTempDb(t, 'periods_svc', async db => {
    const { service } = build(db, '2026-10-31T10:00:00+07:00');
    await assert.rejects(service.lock('2026-10', 'admin'), (e: any) => e.status === 409 && e.details.code === 'MONTH_NOT_ENDED');
  });
});

test('lock after the month ends writes the period and the audit row', async t => {
  await withTempDb(t, 'periods_svc', async (db, client) => {
    const { service } = build(db, '2026-11-01T08:00:00+07:00');
    const view = await service.lock('2026-10', 'admin');
    assert.equal(view.month, '2026-10');
    assert.equal(view.status, 'attendance_locked');
    assert.equal(view.steps.lockedBy, 'admin');
    assert.ok(view.steps.lockedAt);
    assert.equal(view.steps.calculatedAt, null);
    assert.deepEqual(view.actions, { unlock: { enabled: true } });

    const rows = await auditRows(client);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'period.lock');
    assert.equal(rows[0].entity_kind, 'period');
    assert.equal(rows[0].entity_id, '2026-10');
    assert.equal(rows[0].month, '2026-10');
    assert.equal(rows[0].actor, 'admin');
    assert.equal(rows[0].before_json, '{"status":"open"}');
    assert.equal(rows[0].after_json, '{"status":"attendance_locked"}');
  });
});

test('locking twice is a state error', async t => {
  await withTempDb(t, 'periods_svc', async (db, client) => {
    const { service } = build(db, '2026-11-01T08:00:00+07:00');
    await service.lock('2026-10', 'admin');
    await assert.rejects(
      service.lock('2026-10', 'admin'),
      (e: any) => e.status === 409 && e.details.code === 'PERIOD_STATE' && e.details.status === 'attendance_locked'
    );
    assert.equal((await auditRows(client)).length, 1);
  });
});

test('unlock needs a reason, then clears the lock and calculated stamps', async t => {
  await withTempDb(t, 'periods_svc', async (db, client) => {
    const { service } = build(db, '2026-11-01T08:00:00+07:00');
    await service.lock('2026-10', 'admin');
    await assert.rejects(service.unlock('2026-10', 'admin', '   '), (e: any) => e.status === 400 && e.details.code === 'REASON_REQUIRED');
    await assert.rejects(service.unlock('2026-10', 'admin', undefined), (e: any) => e.details.code === 'REASON_REQUIRED');
    await assert.rejects(service.unlock('2026-10', 'admin', 42), (e: any) => e.details.code === 'REASON_REQUIRED');

    await client.query(
      "UPDATE payroll_periods SET status = 'calculated', calculated_by = 'admin', calculated_at = '2026-11-02T01:00:00Z' WHERE month = '2026-10'"
    );
    const view = await service.unlock('2026-10', 'admin', '  Chấm thay cho Châu 31/10 ');
    assert.equal(view.status, 'open');
    assert.deepEqual(view.steps, {
      lockedAt: null, lockedBy: null, calculatedAt: null, calculatedBy: null,
      approvedAt: null, approvedBy: null, paidAt: null, paidBy: null
    });
    const row = (await client.query("SELECT * FROM payroll_periods WHERE month = '2026-10'")).rows[0];
    assert.equal(row.status, 'open');
    for (const col of ['attendance_locked_by', 'attendance_locked_at', 'calculated_by', 'calculated_at']) assert.equal(row[col], null, col);
    assert.equal(Number(row.reopen_count), 1);

    const rows = await auditRows(client);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].action, 'period.unlock');
    assert.equal(rows[1].reason, 'Chấm thay cho Châu 31/10');
    assert.equal(rows[1].before_json, '{"status":"calculated"}');
    assert.equal(rows[1].after_json, '{"status":"open"}');
  });
});

test('view of an open month before its end has no actions and the default payday', async t => {
  await withTempDb(t, 'periods_svc', async db => {
    const { service } = build(db, '2026-11-05T09:00:00+07:00');
    const view = await service.view('2026-11');
    assert.deepEqual(
      { status: view.status, payday: view.payday, actions: view.actions },
      { status: 'open', payday: '2026-12-10', actions: {} }
    );
    assert.deepEqual(await service.snapshot('2026-11'), { status: 'open', rev: 0 });
    assert.equal(await service.getPeriod('2026-11'), null);
  });
});

test('snapshot, getPeriod and list read the stored rows', async t => {
  await withTempDb(t, 'periods_svc', async db => {
    const { service, repo, tx } = build(db, '2026-12-01T08:00:00+07:00');
    await service.lock('2026-10', 'admin');
    await tx.run(trx => repo.save(trx, '2026-11', { status: 'open' }));

    assert.deepEqual(await service.snapshot('2026-10'), { status: 'attendance_locked', rev: 1 });
    assert.equal((await service.getPeriod('2026-10'))?.status, 'attendance_locked');

    const rows = await service.list();
    assert.deepEqual(rows.map(r => r.month), ['2026-11', '2026-10']);
    for (const row of rows) {
      assert.ok(!('reviewed_by' in row));
      assert.ok(!('reviewed_at' in row));
    }
  });
});
