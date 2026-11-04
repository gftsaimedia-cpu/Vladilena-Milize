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
function recordingDb(respond: (sql: string, parameters: readonly unknown[]) => unknown[]) {
  const statements: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  const events: string[] = [];

  class RecordingDriver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return {
        async executeQuery(query: CompiledQuery) {
          statements.push({ sql: query.sql, parameters: query.parameters });
          return { rows: respond(query.sql, query.parameters) };
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

// The real service and repository code on a recording database. The month 2026-10 already holds its current draft
// run 5 with the given payslips, and the next run is stored as run 6 with id 42. `months` is what each employee id
// (uuid) loads when it is calculated; an id that is missing there has no data.
describe('PayrollService.calculatePeriodPayslips (partial recalculation)', () => {
  const STAFF = [
    { uuid: 'ua', username: 'alice' },
    { uuid: 'ub', username: 'bob' },
    { uuid: 'uc', username: 'carol' }
  ];

  class RunRepository extends PayrollRepository {
    constructor(
      db: Kysely<DB>,
      private readonly months: Record<string, EmployeeMonthlyRawData>
    ) {
      super(db);
    }

    override async getMonthlyData(employeeId: string): Promise<EmployeeMonthlyRawData | null> {
      return this.months[employeeId] ?? null;
    }

    override async listEligibleEmployees() {
      return Object.values(this.months).map(({ staff }) => ({
        uuid: staff.uuid,
        username: staff.username,
        name: staff.name
      }));
    }
  }

  const person = (username: string, uuid: string, staff: Partial<EmployeeMonthlyRawData['staff']> = {}) =>
    nvMonthData({ staff: { username, uuid, ...staff } });

  // A payslip of run 5 as the database returns it; the base salary tells the old rows apart from new ones.
  const oldRow = async (username: string, uuid: string, baseSalary: number, id: number) =>
    storedRow(buildPayslipRow(5, await makeSlip({ staff: { username, uuid, baseSalary } })), id);

  async function setup(options: {
    months: Record<string, EmployeeMonthlyRawData>;
    previous?: Array<Selectable<DB['payslips']>>;
    final?: boolean;
  }) {
    const previous = options.previous ?? [];
    const recorded = recordingDb((sql, parameters) => {
      if (sql.startsWith('select max(')) return [{ max_run_no: 5 }];
      if (sql.includes('from "payroll_runs"')) {
        if (parameters.includes('final')) return options.final ? [{ id: 3 }] : [];
        return [{ id: 5 }];
      }
      if (sql.includes('from "staff"')) {
        return STAFF.filter(s => parameters.includes(s.uuid) || parameters.includes(s.username)).map(s => ({
          username: s.username
        }));
      }
      if (sql.includes('from "payslips"')) return previous;
      if (sql.startsWith('insert into "payroll_runs"')) return [{ id: 42 }];
      return [];
    });
    const service = new PayrollService(new RunRepository(recorded.db, options.months));
    return { ...recorded, previous, service };
  }

  // The column -> value map of one "insert into payslips" statement.
  const insertedRow = ({ sql, parameters }: { sql: string; parameters: readonly unknown[] }) => {
    const columns = /^insert into "payslips" \(([^)]*)\)/.exec(sql)![1].split(', ');
    return Object.fromEntries(columns.map((column, i) => [column.replace(/"/g, ''), parameters[i]]));
  };
  const insertedPayslips = (statements: Array<{ sql: string; parameters: readonly unknown[] }>) =>
    statements.filter(s => s.sql.startsWith('insert into "payslips"')).map(insertedRow);

  it('copies the payslips of the people who were not recalculated into the new run', async () => {
    const previous = [await oldRow('alice', 'ua', 5_000_000, 11), await oldRow('bob', 'ub', 7_000_000, 12)];
    const { service, statements, events, steps } = await setup({
      months: { ua: person('alice', 'ua'), ub: person('bob', 'ub') },
      previous
    });

    const result = await service.calculatePeriodPayslips('2026-10', ['ua'], 'admin');

    assert.equal(result.runId, 42);
    assert.deepEqual(
      result.items.map(item => item.employeeId),
      ['ua']
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(steps(), [
      'select payroll_runs',
      'select payroll_runs',
      'select payroll_runs',
      'select staff',
      'select payslips',
      'update payroll_runs',
      'insert payroll_runs',
      'insert payslips',
      'insert payslips'
    ]);
    assert.deepEqual(events, ['begin', 'commit']);
    assert.deepEqual(statements[3].parameters, ['ua', 'ua']);
    assert.deepEqual(statements[4].parameters, [5]);
    assert.deepEqual(statements[5].parameters, ['superseded', '2026-10', 'draft']);
    // month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, slips_total,
    // slips_error
    assert.deepEqual(statements[6].parameters.slice(0, 2), ['2026-10', 6]);
    assert.deepEqual(statements[6].parameters.slice(8, 10), [2, 0]);

    const [alice, bob] = insertedPayslips(statements);
    // Alice was recalculated: a new row for run 42, not her old one.
    assert.equal(alice.username, 'alice');
    assert.equal(alice.run_id, 42);
    assert.equal(alice.gross, 11_007_693);
    // Bob's row is his old row unchanged, except for the new row id and run.
    const { id: _bobId, ...bobOld } = previous[1];
    assert.equal(bob.username, 'bob');
    assert.deepEqual(bob, { ...bobOld, run_id: 42 });
  });

  it('leaves out the old payslip of a target that failed and reports its error', async () => {
    const previous = [
      await oldRow('alice', 'ua', 5_000_000, 11),
      await oldRow('bob', 'ub', 7_000_000, 12),
      await oldRow('carol', 'uc', 8_000_000, 13)
    ];
    const { service, statements } = await setup({
      months: {
        ua: person('alice', 'ua'),
        ub: person('bob', 'ub', { baseSalary: null }),
        uc: person('carol', 'uc')
      },
      previous
    });

    const result = await service.calculatePeriodPayslips('2026-10', ['ua', 'ub'], 'admin');

    assert.equal(result.runId, 42);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].employeeId, 'ub');
    assert.match(result.errors[0].message, /Thiếu cấu hình/);
    assert.deepEqual(
      insertedPayslips(statements).map(row => row.username),
      ['alice', 'carol']
    );
    // month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, slips_total,
    // slips_error
    assert.deepEqual(statements[6].parameters.slice(8, 10), [2, 1]);
  });

  it('stores nothing when the only target of a partial run fails', async () => {
    const previous = [await oldRow('alice', 'ua', 5_000_000, 11), await oldRow('bob', 'ub', 7_000_000, 12)];
    const { service, statements, steps } = await setup({
      months: { ua: person('alice', 'ua', { baseSalary: null }) },
      previous
    });

    const result = await service.calculatePeriodPayslips('2026-10', ['ua'], 'admin');

    assert.equal(result.runId, null);
    assert.deepEqual(result.items, []);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].employeeId, 'ua');
    assert.deepEqual(steps(), ['select payroll_runs']);
    assert.ok(statements.every(s => s.sql.startsWith('select')));
  });

  it('stores nothing when a full run has no payslip to compute', async () => {
    const { service, statements, steps } = await setup({ months: {} });

    const result = await service.calculatePeriodPayslips('2026-10', undefined, 'admin');

    assert.deepEqual(result, { runId: null, items: [], errors: [] });
    assert.deepEqual(steps(), ['select payroll_runs']);
    assert.ok(statements.every(s => s.sql.startsWith('select')));
  });

  it('still refuses a final month when nothing was computed', async () => {
    const { service, events, steps } = await setup({ months: {}, final: true });

    await assert.rejects(service.calculatePeriodPayslips('2026-10', ['ua'], 'admin'), PayrollFinalizedError);

    assert.deepEqual(steps(), ['select payroll_runs']);
    assert.deepEqual(events, ['begin', 'rollback']);
  });

  it('carries nothing forward in a full run, with no list or an empty list', async () => {
    for (const employeeIds of [undefined, []]) {
      const previous = [await oldRow('alice', 'ua', 5_000_000, 11), await oldRow('carol', 'uc', 8_000_000, 13)];
      const { service, statements, steps } = await setup({
        months: { ua: person('alice', 'ua'), ub: person('bob', 'ub') },
        previous
      });

      const result = await service.calculatePeriodPayslips('2026-10', employeeIds, 'admin');

      assert.equal(result.runId, 42);
      assert.deepEqual(steps(), [
        'select payroll_runs',
        'select payroll_runs',
        'update payroll_runs',
        'insert payroll_runs',
        'insert payslips',
        'insert payslips'
      ]);
      assert.deepEqual(
        insertedPayslips(statements).map(row => row.username),
        ['alice', 'bob']
      );
      assert.equal(statements[3].parameters[8], 2);
    }
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
