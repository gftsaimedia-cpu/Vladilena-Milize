import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';

// Needs a real PostgreSQL. PG_TEST_URL is a control connection (a role that may CREATE/DROP DATABASE): the test
// makes its own temporary database, applies the migrations there and drops it at the end. It never touches any
// other database.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS = ['0001_baseline.sql', '0002_seed.sql', '0003_payroll_rules.sql'];
const MONTH = '2026-10';

test('PayrollRepository stores versioned draft runs on PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `payroll_rules_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;

  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  const db = createKysely(createPgPool(tempUrl.toString()));
  let controlConnected = false;
  let clientConnected = false;

  try {
    await control.connect();
    controlConnected = true;
    await control.query(`CREATE DATABASE ${dbName}`);
    await client.connect();
    clientConnected = true;

    for (const file of MIGRATIONS) {
      await client.query(readFileSync(join(__dirname, '..', '..', 'migrations', 'postgres', file), 'utf8'));
    }

    // One nv level-1 employee with one worked day, one approved OT request and a KPI row with a proposal.
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, start_date, insured, tax_on, uuid)
       VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, '2025-01-05', 1, 1, 'pg-uuid-1')`,
      [now]
    );
    await client.query(
      `INSERT INTO timesheet_entries (id, employee_id, work_date, shift_type, shift_start_time, shift_end_time,
         shift_allowance_pct, work_hours, status, day_status, created_at, updated_at)
       VALUES (gen_random_uuid(), 'pg-uuid-1', '2026-10-01', 'NORMAL', '08:00', '17:00', 0, 8, 'PRESENT', 'VALID',
         now(), now())`
    );
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_hours,
         created_at, updated_at)
       VALUES (gen_random_uuid(), 'pg-uuid-1', 'OT 2h', 'OVERTIME', 'Test', 'APPROVED', '2026-10-01', 2,
         now(), now())`
    );
    await client.query(
      `INSERT INTO kpi_scores (username, month, wework, user_score, peer, manager, self_score, kpi_proposed,
         created_by, created_at, updated_by, updated_at)
       VALUES ('pg-user', '2026-10', 9000, 8000, 7000, 8500, 10000, 5000000, 'test', $1, 'test', $1)`,
      [now]
    );

    const repo = new PayrollRepository(db);
    const service = new PayrollService(repo);

    // The monthly query runs on real DATE columns and returns numbers for the BIGINT ones.
    const data = await repo.getMonthlyData('pg-uuid-1', MONTH);
    assert.ok(data);
    assert.equal(data.requests.length, 1);
    assert.equal(data.requests[0].otDate, '2026-10-01');
    assert.equal(data.timesheets.length, 1);
    assert.equal(data.timesheets[0].workDate, '2026-10-01');
    assert.equal(typeof data.staff.baseSalary, 'number');
    assert.equal(data.staff.baseSalary, 6_000_000);
    assert.equal(typeof data.kpi?.proposedAmount, 'number');
    assert.equal(data.kpi?.proposedAmount, 5_000_000);

    // Two calculations of the same month: the second one becomes run 2 and supersedes the first.
    const slip = await service.generateMonthlyPayslip('pg-uuid-1', MONTH);
    const firstRunId = Number(await repo.savePayrollRunAndSlips(MONTH, 'tester', [slip]));
    const secondRunId = Number(await repo.savePayrollRunAndSlips(MONTH, 'tester', [slip], 1));

    const runRows = async () =>
      (
        await client.query(
          'SELECT id, run_no, status, slips_total, slips_error FROM payroll_runs WHERE month = $1 ORDER BY run_no',
          [MONTH]
        )
      ).rows.map(r => [Number(r.id), Number(r.run_no), r.status, Number(r.slips_total), Number(r.slips_error)]);
    assert.deepEqual(await runRows(), [
      [firstRunId, 1, 'superseded', 1, 0],
      [secondRunId, 2, 'draft', 1, 1]
    ]);

    // Only the newest non-superseded run is shown, keyed by the real username and unpacked from the gzip snapshot.
    const listed = await repo.listPayslips(MONTH);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].runId, secondRunId);
    assert.equal(listed[0].username, 'pg-user');
    assert.equal(listed[0].status, 'draft');
    assert.equal(listed[0].net, slip.netIncome);
    assert.equal(listed[0].details.netIncome, slip.netIncome);
    assert.equal(listed[0].details.username, 'pg-user');

    const byUuid = await repo.getPayslip(MONTH, 'pg-uuid-1');
    const byUsername = await repo.getPayslip(MONTH, 'pg-user');
    assert.equal(byUuid?.runId, secondRunId);
    assert.equal(byUuid?.id, byUsername?.id);
    assert.equal(await repo.getPayslip(MONTH, 'nobody'), null);

    // The first run keeps its payslip; saving never rewrites a superseded run.
    const oldSlips = await client.query('SELECT count(*) AS n FROM payslips WHERE run_id = $1', [firstRunId]);
    assert.equal(Number(oldSlips.rows[0].n), 1);

    // Once the month is final it cannot be recalculated, and the failed attempt leaves no new run behind.
    await client.query(`UPDATE payroll_runs SET status = 'final' WHERE id = $1`, [secondRunId]);
    await assert.rejects(repo.savePayrollRunAndSlips(MONTH, 'tester', [slip]), PayrollFinalizedError);
    assert.deepEqual(await runRows(), [
      [firstRunId, 1, 'superseded', 1, 0],
      [secondRunId, 2, 'final', 1, 1]
    ]);
    assert.equal((await repo.listPayslips(MONTH))[0].runId, secondRunId);
  } finally {
    await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});
