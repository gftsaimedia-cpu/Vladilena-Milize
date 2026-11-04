import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gunzipSync } from 'node:zlib';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Insertable,
  type Selectable
} from 'kysely';
import type { DB } from '../../src/database';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import {
  PayrollRepository,
  buildPayslipRow,
  readPayslipRow,
  type EmployeeMonthlyRawData
} from '../../src/modules/payroll/payroll.repository';
import { KpiValidationError, PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';
import { nvMonthData } from './payroll-fixtures';

class FixtureRepository extends PayrollRepository {
  constructor(private readonly data: EmployeeMonthlyRawData) {
    super({} as any);
  }

  override async getMonthlyData(): Promise<EmployeeMonthlyRawData | null> {
    return this.data;
  }
}

const makeSlip = (overrides?: Parameters<typeof nvMonthData>[0]) =>
  new PayrollService(new FixtureRepository(nvMonthData(overrides))).generateMonthlyPayslip('u1', '2026-10');

// A row as PostgreSQL returns it: the generated columns filled in and BIGINT values still strings.
const storedRow = (row: Insertable<DB['payslips']>, id = 1) =>
  ({
    rev: 1,
    error_code: null,
    error_detail: null,
    override_json: null,
    flags_json: null,
    decided_by: null,
    decided_at: null,
    note: null,
    ...row,
    id: String(id),
    run_id: String(row.run_id),
    gross: String(row.gross),
    insurance: String(row.insurance),
    tax: String(row.tax),
    advance: String(row.advance),
    net: String(row.net)
  }) as unknown as Selectable<DB['payslips']>;

describe('Payslip rows', () => {
  it('builds a draft row for the real username with the amounts, terms, gzip snapshot and no flags', async () => {
    const slip = await makeSlip();
    const row = buildPayslipRow(7, slip);

    assert.equal(row.run_id, 7);
    assert.equal(row.status, 'draft');
    assert.equal(row.username, 'a');
    assert.equal(row.gross, 11_007_693);
    assert.equal(row.insurance, 630_000);
    assert.equal(row.tax, 0);
    assert.equal(row.advance, 1_000_000);
    assert.equal(row.net, 9_377_693);
    assert.equal(row.flags_json, null);
    assert.deepEqual(JSON.parse(row.staff_terms_json), {
      employeeType: 'nv',
      baseSalaryPolicy: 6_000_000,
      standardWorkdays: 26,
      taxMethod: 'progressive',
      dependants: 1
    });
    assert.equal(JSON.parse(gunzipSync(row.snapshot_gz).toString()).netIncome, 9_377_693);
  });

  it('keeps the warnings of the payslip as a JSON array in flags_json', async () => {
    const row = buildPayslipRow(7, await makeSlip({ kpi: null }));

    const flags = JSON.parse(row.flags_json!);
    assert.equal(flags[0].code, 'KPI_PROPOSAL_MISSING');
    assert.deepEqual(
      flags.map((w: { code: string }) => w.code),
      ['KPI_PROPOSAL_MISSING', 'KPI_SCORE_MISSING']
    );
  });

  it('reads a stored row back with numeric amounts and the unpacked snapshot', async () => {
    const row = buildPayslipRow(7, await makeSlip());
    const record = readPayslipRow(storedRow(row));

    assert.equal(record.id, 1);
    assert.equal(record.runId, 7);
    assert.equal(record.username, 'a');
    assert.equal(record.status, 'draft');
    assert.equal(record.gross, 11_007_693);
    assert.equal(record.insurance, 630_000);
    assert.equal(record.tax, 0);
    assert.equal(record.advance, 1_000_000);
    assert.equal(record.net, 9_377_693);
    assert.deepEqual(record.warnings, []);
    assert.equal(record.details.netIncome, 9_377_693);
    assert.equal(record.details.username, 'a');
  });

  it('reads the warnings back from flags_json', async () => {
    const row = buildPayslipRow(7, await makeSlip({ kpi: null }));
    const record = readPayslipRow(storedRow(row));

    assert.deepEqual(
      record.warnings.map(w => w.code),
      ['KPI_PROPOSAL_MISSING', 'KPI_SCORE_MISSING']
    );
    assert.deepEqual(record.warnings, record.details.warnings);
  });
});

describe('Payroll errors', () => {
  it('carries a machine-readable code', () => {
    assert.equal(new PayrollFinalizedError('Kỳ lương đã chốt').code, 'PAYROLL_FINALIZED');

    const kpi = new KpiValidationError('INVALID_KPI_SCORE', 'Điểm không hợp lệ');
    assert.equal(kpi.code, 'INVALID_KPI_SCORE');
    assert.equal(kpi.message, 'Điểm không hợp lệ');
    assert.ok(kpi instanceof Error);
  });
});

// Runs the real repository code against a Kysely whose driver records each statement and answers from a script.
function recordingDb(respond: (sql: string) => unknown[]) {
  const statements: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  const events: string[] = [];

  class RecordingDriver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return {
        async executeQuery(query: CompiledQuery) {
          statements.push({ sql: query.sql, parameters: query.parameters });
          return { rows: respond(query.sql) };
        },
        async *streamQuery() {}
      } as unknown as DatabaseConnection;
    }
    override async beginTransaction(): Promise<void> {
      events.push('begin');
    }
    override async commitTransaction(): Promise<void> {
      events.push('commit');
    }
    override async rollbackTransaction(): Promise<void> {
      events.push('rollback');
    }
  }

  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new RecordingDriver(),
      createIntrospector: inner => new PostgresIntrospector(inner),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
  // One label per statement: "select payroll_runs", "update payroll_runs", "insert payslips"...
  const steps = () =>
    statements.map(s => `${s.sql.split(' ')[0]} ${s.sql.match(/(?:from|update|into) "(\w+)"/)![1]}`);
  return { db, statements, events, steps };
}

describe('PayrollRepository.savePayrollRunAndSlips (statement sequence)', () => {
  const answer = (existing: { final: boolean; maxRunNo: number | string | null }, sql: string): unknown[] => {
    if (sql.startsWith('select max(')) return [{ max_run_no: existing.maxRunNo }];
    if (sql.startsWith('select')) return existing.final ? [{ id: 3 }] : [];
    if (sql.startsWith('insert into "payroll_runs"')) return [{ id: 42 }];
    return [];
  };

  it('stores a first draft run as run 1 without superseding anything', async () => {
    const { db, statements, events, steps } = recordingDb(sql => answer({ final: false, maxRunNo: null }, sql));
    const slips = [await makeSlip(), await makeSlip({ staff: { username: 'b' } })];

    const runId = await new PayrollRepository(db).savePayrollRunAndSlips('2026-10', 'admin', slips, 1);

    assert.equal(runId, 42);
    assert.deepEqual(steps(), [
      'select payroll_runs',
      'select payroll_runs',
      'update payroll_runs',
      'insert payroll_runs',
      'insert payslips',
      'insert payslips'
    ]);
    assert.deepEqual(events, ['begin', 'commit']);
    const run = statements[3].parameters;
    // month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, slips_total,
    // slips_error
    assert.deepEqual(run.slice(0, 10), [
      '2026-10',
      1,
      'draft',
      'v2-rules-2026-11',
      'v2-rules-2026-11',
      1,
      '{}',
      '{}',
      2,
      1
    ]);
    assert.equal(run[10], 'admin');
    assert.deepEqual(
      statements.slice(4).map(s => s.parameters.slice(0, 2)),
      [
        [42, 'a'],
        [42, 'b']
      ]
    );
  });

  it('numbers the next run after the highest existing one and supersedes the open drafts of the month', async () => {
    const { db, statements } = recordingDb(sql => answer({ final: false, maxRunNo: '3' }, sql));

    await new PayrollRepository(db).savePayrollRunAndSlips('2026-10', 'admin', [await makeSlip()]);

    assert.deepEqual(statements[2].parameters, ['superseded', '2026-10', 'draft']);
    assert.equal(statements[3].parameters[1], 4);
    assert.equal(statements[3].parameters[9], 0);
  });

  it('refuses a month that already has a final run and writes nothing', async () => {
    const { db, events, steps } = recordingDb(sql => answer({ final: true, maxRunNo: 1 }, sql));

    await assert.rejects(
      new PayrollRepository(db).savePayrollRunAndSlips('2026-10', 'admin', [await makeSlip()]),
      PayrollFinalizedError
    );

    assert.deepEqual(steps(), ['select payroll_runs']);
    assert.deepEqual(events, ['begin', 'rollback']);
  });
});

describe('PayrollRepository reads', () => {
  it('lists the payslips of the newest run that is not superseded', async () => {
    const stored = storedRow(buildPayslipRow(5, await makeSlip()), 9);
    const { db, statements } = recordingDb(sql => {
      if (sql.includes('"payroll_runs"')) return [{ id: 5 }];
      if (sql.includes('"payslips"')) return [stored];
      return [];
    });

    const records = await new PayrollRepository(db).listPayslips('2026-10');

    assert.deepEqual(statements[0].parameters.slice(0, 2), ['2026-10', 'superseded']);
    assert.match(statements[0].sql, /"status" <> \$2/);
    assert.deepEqual(statements[1].parameters, [5]);
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 9);
    assert.equal(records[0].net, 9_377_693);
  });

  it('returns nothing when the month has no run to show', async () => {
    const { db } = recordingDb(() => []);
    const repo = new PayrollRepository(db);

    assert.deepEqual(await repo.listPayslips('2026-10'), []);
    assert.equal(await repo.getPayslip('2026-10', 'a'), null);
  });

  it('finds a payslip by the staff uuid or username and returns the username-keyed row', async () => {
    const stored = storedRow(buildPayslipRow(5, await makeSlip()), 9);
    const { db, statements } = recordingDb(sql => {
      if (sql.includes('from "staff"')) return [{ username: 'a' }];
      if (sql.includes('from "payroll_runs"')) return [{ id: 5 }];
      return [stored];
    });

    const record = await new PayrollRepository(db).getPayslip('2026-10', 'u1');

    assert.equal(record?.username, 'a');
    assert.equal(record?.details.netIncome, 9_377_693);
    const staffQuery = statements.find(s => s.sql.includes('from "staff"'))!;
    assert.deepEqual(staffQuery.parameters.slice(0, 2), ['u1', 'u1']);
    assert.ok(statements.some(s => s.sql.includes('from "payslips"') && s.parameters.includes('a')));
  });

  it('returns null for an employee that is not in staff', async () => {
    const { db } = recordingDb(sql => (sql.includes('from "payroll_runs"') ? [{ id: 5 }] : []));

    assert.equal(await new PayrollRepository(db).getPayslip('2026-10', 'nobody'), null);
  });
});
