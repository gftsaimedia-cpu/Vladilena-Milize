import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';
import { SettingsChanges } from '../../src/modules/settings/settings-changes';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { withTempDb } from './helpers/pg-temp-db';

// Needs a real PostgreSQL. PG_TEST_URL is a control connection (a role that may CREATE/DROP DATABASE): the test
// makes its own temporary database, applies the migrations there and drops it at the end. It never touches any
// other database.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const MONTH = '2026-10';
const PARTIAL_MONTH = '2026-11';

/** A punch on the Vietnam clock; the payslip reads it through the day row (AttendanceDaysService). */
async function punch(client: Client, employeeId: string, date: string, inTime: string, outTime: string) {
  for (const [time, type] of [
    [inTime, 'IN'],
    [outTime, 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [employeeId, `${date}T${time}:00+07:00`, date, type]
    );
  }
}

/** The payroll service on the real day rows, with "now" fixed after the months it computes. */
function payrollOn(db: Kysely<DB>, now: Date, reader?: SettingsReader) {
  const coordinator = new TransactionCoordinator(db);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(reader ?? new SettingsReader(new SettingsRepository(db))),
    coordinator
  );
  const service = new PayrollService(new PayrollRepository(db), reader, days, coordinator);
  service.now = () => now;
  return service;
}

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

    await client.query(readFileSync(SCHEMA, 'utf8'));

    // One nv level-1 employee on a 'long' contract (always insured, progressive tax) with one worked day, one
    // approved OT request and a KPI row with a proposal.
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
       VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', 'pg-uuid-1')`,
      [now]
    );
    await punch(client, 'pg-uuid-1', '2026-10-01', '08:00', '17:00');
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

    // iSAT requests: only the APPROVED one of pg-uuid-1 on a Saturday of 2026-10 is paid. The others must not show:
    // a PENDING one on another Saturday of the month, an APPROVED one in 2026-09 and an APPROVED one of another
    // employee in 2026-10. Approving one writes the ISAT schedule of that Saturday (markIsatDay); a pending one has none.
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
       VALUES ('pg-user-3', 'Nhân viên PG 3', 'nv', 1, 'x', $1, 'long', 'pg-uuid-3')`,
      [now]
    );
    const seedIsat = async (employeeId: string, status: string, saturday: string) => {
      const request = await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'Đăng ký iSAT', 'ISAT', 'Tự đánh giá đạt 4/4 điều kiện', $2, now(), now())
         RETURNING id`,
        [employeeId, status]
      );
      await client.query(
        `INSERT INTO isat_registrations (request_id, saturday, full_name, team, position_type, position_level,
           level_name, shift_type, shift_start_time, shift_end_time)
         VALUES ($1, $2, 'Nhân viên PG', 'Team PG', 'nv', 1, NULL, 'NORMAL', '08:00', '17:00')`,
        [request.rows[0].id, saturday]
      );
      if (status === 'APPROVED') {
        await client.query(
          `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time,
             schedule_type, status, source_request_id)
           VALUES ($1, $2, 'NORMAL', '08:00', '17:00', 'ISAT', 'ON_LEAVE', $3)`,
          [employeeId, saturday, request.rows[0].id]
        );
      }
    };
    await seedIsat('pg-uuid-1', 'APPROVED', '2026-10-10');
    await seedIsat('pg-uuid-1', 'PENDING', '2026-10-17');
    await seedIsat('pg-uuid-1', 'APPROVED', '2026-09-26');
    await seedIsat('pg-uuid-3', 'APPROVED', '2026-10-24');

    const repo = new PayrollRepository(db);
    // Computed on 01/12: every day of October and November has reached its evaluation time.
    const service = payrollOn(db, new Date('2026-12-01T03:00:00Z'));

    // The monthly query runs on real DATE columns and returns numbers for the BIGINT ones.
    const data = await repo.getMonthlyData('pg-uuid-1', MONTH);
    assert.ok(data);
    assert.equal(data.requests.length, 1);
    assert.equal(data.requests[0].otDate, '2026-10-01');
    assert.equal('timesheets' in data, false);
    assert.equal(typeof data.staff.baseSalary, 'number');
    assert.equal(data.staff.baseSalary, 6_000_000);
    assert.equal(typeof data.kpi?.proposedAmount, 'number');
    assert.equal(data.kpi?.proposedAmount, 5_000_000);
    assert.equal(data.staff.contractTerm, 'long');
    assert.equal(data.staff.insured, true);
    assert.equal(data.staff.contractStatusText, 'HĐLĐ từ 3 tháng');
    assert.equal('isatDates' in data, false);

    // Two calculations of the same month: the second one becomes run 2 and supersedes the first.
    const slip = await service.generateMonthlyPayslip('pg-uuid-1', MONTH);
    // The worked day and the paid iSAT Saturday are day rows the payslip wrote and read back.
    const worked = slip.dailyLines.find(line => line.date === '2026-10-01');
    assert.deepEqual([worked?.kind, worked?.daySalary], ['PRESENT', 230_769]);
    const stored = await client.query(
      `SELECT to_char(work_date, 'YYYY-MM-DD') AS d, status FROM timesheet_entries
       WHERE employee_id = 'pg-uuid-1' AND work_date IN ('2026-10-01', '2026-10-10') ORDER BY work_date`
    );
    assert.deepEqual(
      stored.rows.map(r => [r.d, r.status]),
      [
        ['2026-10-01', 'PRESENT'],
        ['2026-10-10', 'ISAT']
      ]
    );
    assert.deepEqual(
      slip.dailyLines.filter(line => line.kind === 'ISAT').map(line => [line.date, line.daySalary]),
      [['2026-10-10', 230_769]]
    );
    assert.equal(slip.isatDays, 1);
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

    // A partial recalculation keeps the payslips of the people who were not recalculated. A second month is used
    // because 2026-10 is final now. The second employee is on a 'short' contract with no insured flag (NULL).
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
       VALUES ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'short', 'pg-uuid-2')`,
      [now]
    );
    const shortTerm = await repo.getMonthlyData('pg-uuid-2', PARTIAL_MONTH);
    assert.equal(shortTerm?.staff.contractTerm, 'short');
    assert.equal(shortTerm?.staff.insured, false);
    assert.equal(shortTerm?.staff.contractStatusText, 'Dưới 3 tháng');
    const both = await service.calculatePeriodPayslips(PARTIAL_MONTH, ['pg-uuid-1', 'pg-uuid-2'], 'tester');
    const onlySecond = await service.calculatePeriodPayslips(PARTIAL_MONTH, ['pg-uuid-2'], 'tester');
    assert.equal(both.items.length, 2);
    assert.deepEqual(both.errors, []);
    assert.equal(onlySecond.items.length, 1);
    assert.ok(both.runId !== null && onlySecond.runId !== null);

    const partialRuns = async () =>
      (
        await client.query(
          'SELECT id, run_no, status, slips_total, slips_error FROM payroll_runs WHERE month = $1 ORDER BY run_no',
          [PARTIAL_MONTH]
        )
      ).rows.map(r => [Number(r.id), Number(r.run_no), r.status, Number(r.slips_total), Number(r.slips_error)]);
    assert.deepEqual(await partialRuns(), [
      [both.runId, 1, 'superseded', 2, 0],
      [onlySecond.runId, 2, 'draft', 2, 0]
    ]);

    // Both payslips are in the current run; the first employee's is the copy of the one in the superseded run.
    const partialListed = await repo.listPayslips(PARTIAL_MONTH);
    assert.deepEqual(partialListed.map(p => p.username).sort(), ['pg-user', 'pg-user-2']);
    assert.ok(partialListed.every(p => p.runId === onlySecond.runId));
    assert.equal((await repo.getPayslip(PARTIAL_MONTH, 'pg-uuid-1'))?.runId, onlySecond.runId);
    const slipOf = async (runId: number, username: string) =>
      (
        await client.query(
          `SELECT status, rev, gross, insurance, tax, advance, net, staff_terms_json, flags_json, override_json,
                  decided_by, decided_at, note, encode(snapshot_gz, 'hex') AS snapshot_hex
           FROM payslips WHERE run_id = $1 AND username = $2`,
          [runId, username]
        )
      ).rows;
    const carried = await slipOf(onlySecond.runId!, 'pg-user');
    assert.equal(carried.length, 1);
    assert.deepEqual(carried, await slipOf(both.runId!, 'pg-user'));

    // When nothing could be calculated no run is stored and the current draft stays.
    const none = await service.calculatePeriodPayslips(PARTIAL_MONTH, ['nobody'], 'tester');
    assert.equal(none.runId, null);
    assert.equal(none.errors.length, 1);
    assert.deepEqual(await partialRuns(), [
      [both.runId, 1, 'superseded', 2, 0],
      [onlySecond.runId, 2, 'draft', 2, 0]
    ]);
    assert.equal((await repo.listPayslips(PARTIAL_MONTH)).length, 2);
  } finally {
    await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});

// Bình (nv level 2, 6,500,000) works Mon–Fri from 12/2026 and BHXH is 10% from 12/2026, both saved through the
// settings service. The December run reads them through the real SettingsReader and stores the month's snapshot.
test('A payroll run reads the settings store and stores the month snapshot on PostgreSQL', async t => {
  await withTempDb(t, 'payroll_settings', async (db, client) => {
    const now = new Date('2026-11-05T03:00:00.000Z');
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
       VALUES ('nv-binh', 'Bình', 'nv', 2, 'x', $1, 'long', 'u-binh')`,
      [now.toISOString()]
    );
    const settingsRepo = new SettingsRepository(db);
    const reader = new SettingsReader(settingsRepo);
    const tx = new TransactionCoordinator(db);
    const settings = new SettingsService(settingsRepo, reader, tx, new SettingsChanges(), new AuditLog(new AuditRepository(), tx));
    await settings.saveWorkWeek('nv-binh', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-12', stamp: 0 }, 'admin', now);
    await settings.saveGroup('insurance', { values: { bhxhPct: 10 }, effectiveMonth: '2026-12', stamp: 0 }, 'admin', now);

    // All 23 Mon–Fri days of December 2026 worked, punched 08:00–17:00.
    for (let day = 1; day <= 31; day++) {
      const date = `2026-12-${String(day).padStart(2, '0')}`;
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      await punch(client, 'u-binh', date, '08:00', '17:00');
    }

    const repo = new PayrollRepository(db);
    const payroll = payrollOn(db, new Date('2027-01-01T03:00:00Z'), reader);
    const result = await payroll.calculatePeriodPayslips('2026-12', ['u-binh'], 'tester');
    assert.deepEqual(result.errors, []);
    assert.ok(result.runId !== null);

    const slip = (await repo.getPayslip('2026-12', 'u-binh'))!.details;
    assert.equal(slip.standardWorkdays, 22);
    assert.equal(slip.actualWorkDays, 23);
    assert.equal(slip.dayRate, 295_455);
    assert.equal(slip.baseSalaryActual, 6_795_455);
    assert.equal(slip.insuranceBreakdown.bhxh, 650_000);

    const run = (
      await client.query('SELECT params_json, params_hash, params_rev FROM payroll_runs WHERE id = $1', [result.runId])
    ).rows[0];
    const lastChange = (await client.query('SELECT MAX(id) AS id FROM settings_changes')).rows[0];
    assert.deepEqual(JSON.parse(run.params_json), await reader.settingsFor('2026-12'));
    assert.equal(JSON.parse(run.params_json).insurance.bhxhPct, 10);
    assert.equal(run.params_hash, createHash('sha256').update(run.params_json).digest('hex'));
    assert.ok(Number(lastChange.id) > 0);
    assert.equal(Number(run.params_rev), Number(lastChange.id));
  });
});
