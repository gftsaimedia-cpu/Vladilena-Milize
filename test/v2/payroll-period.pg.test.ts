import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { withTempDb } from './helpers/pg-temp-db';

const MONTH = '2026-10';

interface Fixture {
  payroll: PayrollService;
  periods: PeriodsService;
  repo: PayrollRepository;
}

// Hai nhân sự nv bậc 1, uuid khác tên đăng nhập như DB thật. Ngày hiện tại cố định sau tháng 10 để Chốt công được.
async function build(db: Kysely<DB>, client: Client): Promise<Fixture> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
     VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', 'pg-uuid-1'),
            ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'long', 'pg-uuid-2')`,
    [new Date().toISOString()]
  );
  const tx = new TransactionCoordinator(db);
  const periods = new PeriodsService(
    new PeriodsRepository(db),
    tx,
    new AuditLog(new AuditRepository(), new TransactionCoordinator(db))
  );
  periods.now = () => new Date('2026-11-01T08:00:00+07:00');
  const repo = new PayrollRepository(db);
  return { payroll: new PayrollService(repo, tx, periods), periods, repo };
}

test('a full run after Chốt công moves the period to calculated', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    const result = await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    assert.ok(result.runId !== null);

    const view = await periods.view(MONTH);
    assert.equal(view.status, 'calculated');
    assert.equal(view.steps.calculatedBy, 'admin');
    assert.ok(view.steps.calculatedAt);
    const row = await new PeriodsRepository(db).find(MONTH);
    assert.equal(Number(row?.current_run_id), result.runId);
    // Tính lương tự động không ghi nhật ký kỳ: chỉ có dòng của Chốt công.
    const audit = await client.query("SELECT action FROM audit_log WHERE action LIKE 'period.%' ORDER BY id");
    assert.deepEqual(audit.rows.map(r => r.action), ['period.lock']);
  });
});

test('a one-person run after Chốt công keeps attendance_locked', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    const result = await payroll.calculatePeriodPayslips(MONTH, ['pg-uuid-1'], 'admin');
    assert.ok(result.runId !== null);
    const view = await periods.view(MONTH);
    assert.equal(view.status, 'attendance_locked');
    assert.equal(view.steps.calculatedBy, null);
  });
});

test('a run while open keeps the month open', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    const result = await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    assert.ok(result.runId !== null);
    assert.equal((await periods.snapshot(MONTH)).status, 'open');
    const runs = await client.query('SELECT id FROM payroll_runs WHERE month = $1', [MONTH]);
    assert.equal(runs.rows.length, 1);
  });
});

test('a second full run keeps calculated and moves current_run_id', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    const first = await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    const second = await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin2');
    assert.notEqual(first.runId, second.runId);
    const view = await periods.view(MONTH);
    assert.equal(view.status, 'calculated');
    assert.equal(view.steps.calculatedBy, 'admin2');
    const row = await new PeriodsRepository(db).find(MONTH);
    assert.equal(Number(row?.current_run_id), second.runId);
  });
});

test('a stale rev does not promote', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    assert.equal((await periods.snapshot(MONTH)).rev, 1);
    const status = await periods.markCalculated(undefined, MONTH, {
      runId: 1,
      actor: 'admin',
      full: true,
      expectedRev: 0,
    });
    assert.equal(status, 'attendance_locked');
    assert.equal((await periods.snapshot(MONTH)).rev, 1);
  });
});

test('deciding a payslip needs a calculated period', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    await payroll.calculatePeriodPayslips(MONTH, ['pg-uuid-1'], 'admin');
    await assert.rejects(
      payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'admin'),
      (e: any) => e.status === 409 && e.details.code === 'PAYSLIP_NOT_DECIDABLE'
    );

    await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    const slip = await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'admin', 'ok');
    assert.equal(slip?.status, 'approved');
  });
});

test('KPI is frozen once the period is approved', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await client.query("UPDATE payroll_periods SET status = 'approved' WHERE month = $1", [MONTH]);

    await assert.rejects(
      payroll.setKpiScore('pg-user', MONTH, { manager: 80 }, 'admin'),
      (e: unknown) => e instanceof PayrollFinalizedError && e.message === 'Kỳ lương đã phê duyệt, không sửa KPI được'
    );
    await assert.rejects(payroll.calculatePeriodPayslips(MONTH, undefined, 'admin'), PayrollFinalizedError);
    await assert.rejects(payroll.calculatePeriodPayslips(MONTH, ['pg-uuid-1'], 'admin'), PayrollFinalizedError);
    const runs = await client.query('SELECT id FROM payroll_runs WHERE month = $1', [MONTH]);
    assert.equal(runs.rows.length, 1);
  });
});

test('resetDecision puts an approved payslip back to draft', async t => {
  await withTempDb(t, 'payroll_period', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'admin', 'ok');

    assert.equal(await payroll.resetDecision(MONTH, 'pg-uuid-1'), true);
    const row = (
      await client.query("SELECT status, decided_by, decided_at, note, rev FROM payslips WHERE username = 'pg-user'")
    ).rows[0];
    assert.equal(row.status, 'draft');
    assert.equal(row.decided_by, null);
    assert.equal(row.decided_at, null);
    assert.equal(row.note, null);
    assert.equal(Number(row.rev), 3);

    // Tìm theo username cũng được; người không có phiếu thì trả false.
    assert.equal(await payroll.resetDecision(MONTH, 'pg-user-2'), true);
    assert.equal(await payroll.resetDecision(MONTH, 'nobody'), false);
    assert.equal(await payroll.resetDecision('2026-09', 'pg-uuid-1'), false);
  });
});
