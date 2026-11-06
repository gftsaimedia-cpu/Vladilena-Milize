import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransactionCoordinator } from '../../src/database/transaction';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodLockedError } from '../../src/modules/periods/periods.errors';
import { withTempDb } from './helpers/pg-temp-db';

test('schema rejects the removed reviewed status', async t => {
  await withTempDb(t, 'periods_repo', async (_db, client) => {
    await assert.rejects(
      client.query("INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'reviewed')"),
      (err: { code?: string }) => err.code === '23514'
    );
  });
});

test('save inserts then bumps rev', async t => {
  await withTempDb(t, 'periods_repo', async db => {
    const tx = new TransactionCoordinator(db);
    const repo = new PeriodsRepository(db);

    const first = await tx.run(trx =>
      repo.save(trx, '2026-10', { status: 'attendance_locked', attendance_locked_by: 'admin', attendance_locked_at: 'x' })
    );
    assert.equal(first.rev, 1);
    assert.equal(first.status, 'attendance_locked');
    assert.equal(first.attendance_locked_by, 'admin');

    const second = await tx.run(trx =>
      repo.save(trx, '2026-10', { status: 'open', attendance_locked_by: null, attendance_locked_at: null })
    );
    assert.equal(second.rev, 2);
    assert.equal(second.status, 'open');
    assert.equal(second.attendance_locked_by, null);
    assert.equal(second.attendance_locked_at, null);

    assert.equal((await repo.find('2026-10'))?.rev, 2);
    assert.equal(await repo.find('2026-09'), null);
    await tx.run(trx => repo.save(trx, '2026-11', { status: 'open' }));
    assert.deepEqual((await repo.list()).map(r => r.month), ['2026-11', '2026-10']);
  });
});

test('gate blocks a punch in a locked month and lets an explanation through', async t => {
  await withTempDb(t, 'periods_repo', async db => {
    const tx = new TransactionCoordinator(db);
    const repo = new PeriodsRepository(db);
    const gate = new PeriodGate(repo);
    await tx.run(trx => repo.save(trx, '2026-10', { status: 'attendance_locked' }));

    await assert.rejects(gate.hold(undefined, ['2026-10'], 'punch'), (err: PeriodLockedError) => {
      assert.ok(err instanceof PeriodLockedError);
      assert.deepEqual(err.details, { code: 'PERIOD_LOCKED', month: '2026-10', status: 'attendance_locked' });
      return true;
    });
    await gate.hold(undefined, ['2026-10'], 'explain');
    await gate.hold(undefined, ['2026-11'], 'punch');
  });
});

test('gate checks every month and reports the first blocked one', async t => {
  await withTempDb(t, 'periods_repo', async db => {
    const tx = new TransactionCoordinator(db);
    const repo = new PeriodsRepository(db);
    const gate = new PeriodGate(repo);
    await tx.run(trx => repo.save(trx, '2026-10', { status: 'approved' }));

    await assert.rejects(gate.hold(undefined, ['2026-11', '2026-10'], 'review'), (err: PeriodLockedError) => {
      assert.equal(err.details?.month, '2026-10');
      return true;
    });
  });
});

test('lock waits for a gate holder', async t => {
  await withTempDb(t, 'periods_repo', async db => {
    const tx = new TransactionCoordinator(db);
    const repo = new PeriodsRepository(db);
    const gate = new PeriodGate(repo);
    const order: string[] = [];

    let aHeld!: () => void;
    const aHeldP = new Promise<void>(resolve => (aHeld = resolve));
    let release!: () => void;
    const releaseP = new Promise<void>(resolve => (release = resolve));

    const a = tx.run(async trx => {
      await gate.hold(trx, ['2026-10'], 'punch');
      aHeld();
      await releaseP;
    });
    await aHeldP;
    const b = tx.run(async trx => {
      await repo.lockExclusive(trx, '2026-10');
      order.push('lock');
    });

    await new Promise(resolve => setTimeout(resolve, 200));
    order.push('punch-done');
    release();
    await Promise.all([a, b]);

    assert.deepEqual(order, ['punch-done', 'lock']);
  });
});
