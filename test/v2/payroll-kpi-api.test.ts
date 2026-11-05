import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection
} from 'kysely';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/common';
import type { DB } from '../../src/database';
import type { KpiCap } from '../../src/modules/payroll/domain';
import { PayrollController } from '../../src/modules/payroll/payroll.controller';
import { KpiValidationError, PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';
import { PayrollRepository, type KpiScorePatch } from '../../src/modules/payroll/payroll.repository';
import { PayrollService, type KpiScoreBody } from '../../src/modules/payroll/payroll.service';

class KpiRepository extends PayrollRepository {
  readonly saved: Array<{ username: string; month: string; patch: KpiScorePatch; actor: string }> = [];

  constructor(private readonly cap: KpiCap | null) {
    super({} as any);
  }

  override async getKpiCap(): Promise<KpiCap | null> {
    return this.cap;
  }

  override async saveKpiScore(username: string, month: string, patch: KpiScorePatch, actor: string): Promise<void> {
    this.saved.push({ username, month, patch, actor });
  }
}

// Người dùng phiên mà AuthGuard gán cho mọi route cần năng lực.
const ADMIN = { username: 'admin', name: 'Admin', role: 'admin', type: 'ql', level: 0 } as any;
const CAP: KpiCap = { applicable: true, kpiMax: 6_000_000 };
const NOT_APPLICABLE: KpiCap = { applicable: false, kpiMax: null };

// Runs setKpiScore against a repository that returns `cap` and records the patch it is asked to save.
async function saveWith(body: unknown, cap: KpiCap | null = CAP) {
  const repo = new KpiRepository(cap);
  await new PayrollService(repo).setKpiScore('a', '2026-10', body as KpiScoreBody, 'admin');
  return repo.saved;
}

// The call is refused with a KpiValidationError of the given code and nothing is saved.
async function assertRefused(body: unknown, code: KpiValidationError['code'], cap: KpiCap | null = CAP) {
  const repo = new KpiRepository(cap);
  await assert.rejects(
    new PayrollService(repo).setKpiScore('a', '2026-10', body as KpiScoreBody, 'admin'),
    (err: unknown) => err instanceof KpiValidationError && err.code === code
  );
  assert.deepEqual(repo.saved, []);
}

describe('PayrollService.setKpiScore', () => {
  it('stores scores as points x 100 and the proposal as it is, under the column names', async () => {
    const saved = await saveWith({ wework: 87.5, userScore: 90, proposedAmount: 5_000_000 });

    assert.deepEqual(saved, [
      {
        username: 'a',
        month: '2026-10',
        patch: { wework: 8750, user_score: 9000, kpi_proposed: 5_000_000 },
        actor: 'admin'
      }
    ]);
  });

  it('accepts selfScore as another name for self', async () => {
    const saved = await saveWith({ selfScore: 70, manager: 100, peer: 0 });
    assert.deepEqual(saved[0].patch, { self_score: 7000, manager: 10000, peer: 0 });
  });

  it('uses the short name when both the short name and its alias are sent', async () => {
    const saved = await saveWith({ user: 80, userScore: 90, self: 70, selfScore: 60 });
    assert.deepEqual(saved[0].patch, { user_score: 8000, self_score: 7000 });
  });

  it('falls back to the alias only when the short name is not sent', async () => {
    const saved = await saveWith({ user: undefined, userScore: 90, self: null, selfScore: 60 });
    assert.deepEqual(saved[0].patch, { user_score: 9000, self_score: null });
  });

  it('clears a field sent as null and leaves out the fields that were not sent', async () => {
    assert.deepEqual((await saveWith({ peer: null }))[0].patch, { peer: null });
    assert.deepEqual((await saveWith({ manager: undefined, peer: 50 }))[0].patch, { peer: 5000 });
    assert.deepEqual((await saveWith({ proposedAmount: null }))[0].patch, { kpi_proposed: null });
  });

  it('rounds a score to whole hundredths of a point', async () => {
    const saved = await saveWith({ wework: 33.333, user: 0.07, peer: 99.999, manager: 0, self: 100 });
    assert.deepEqual(saved[0].patch, { wework: 3333, user_score: 7, peer: 10000, manager: 0, self_score: 10000 });
  });

  it('treats a missing body as an empty patch', async () => {
    assert.deepEqual((await saveWith(undefined))[0].patch, {});
  });

  it('refuses a score that is not a number from 0 to 100', async () => {
    for (const bad of [101, -0.01, Number.NaN, Number.POSITIVE_INFINITY, '90', true, {}]) {
      await assertRefused({ manager: bad }, 'INVALID_KPI_SCORE');
    }
    await assertRefused({ userScore: 101 }, 'INVALID_KPI_SCORE');
    await assertRefused({ peer: 50, selfScore: -1 }, 'INVALID_KPI_SCORE');
  });

  it('words the invalid score message', async () => {
    await assert.rejects(saveWith({ manager: 101 }), { message: 'Điểm KPI phải từ 0 đến 100' });
  });

  it('refuses a proposal that is not a whole number of at least 0', async () => {
    for (const bad of [-1, 1.5, '5000000', Number.NaN, Number.POSITIVE_INFINITY, true]) {
      await assertRefused({ proposedAmount: bad }, 'INVALID_KPI_SCORE');
    }
    await assert.rejects(saveWith({ proposedAmount: 1.5 }), {
      message: 'Lương KPI đề xuất phải là số nguyên từ 0 trở lên'
    });
  });

  it('allows a proposal up to the KPI maximum and refuses one above it', async () => {
    assert.deepEqual((await saveWith({ proposedAmount: 6_000_000 }))[0].patch, { kpi_proposed: 6_000_000 });
    assert.deepEqual((await saveWith({ proposedAmount: 0 }))[0].patch, { kpi_proposed: 0 });

    await assertRefused({ proposedAmount: 6_000_001 }, 'KPI_PROPOSAL_EXCEEDS_MAX');
    await assert.rejects(saveWith({ proposedAmount: 6_000_001 }), {
      message: 'Lương KPI đề xuất phải nhỏ hơn hoặc bằng 6000000 đồng'
    });
  });

  it('refuses a proposal above 0 when the position has no KPI pay, but accepts 0 and clearing', async () => {
    await assertRefused({ proposedAmount: 1 }, 'KPI_NOT_APPLICABLE', NOT_APPLICABLE);
    // A level without kpi_max keeps the benefit switch on; still nothing can be proposed.
    await assertRefused({ proposedAmount: 1 }, 'KPI_NOT_APPLICABLE', { applicable: false, kpiMax: 6_000_000 });

    assert.deepEqual((await saveWith({ proposedAmount: 0 }, NOT_APPLICABLE))[0].patch, { kpi_proposed: 0 });
    assert.deepEqual((await saveWith({ proposedAmount: null }, NOT_APPLICABLE))[0].patch, { kpi_proposed: null });
    assert.deepEqual((await saveWith({ wework: 80 }, NOT_APPLICABLE))[0].patch, { wework: 8000 });
  });

  it('reports an unknown employee whatever the body holds, before looking at the body', async () => {
    await assertRefused({ wework: 80, proposedAmount: 1 }, 'EMPLOYEE_NOT_FOUND', null);
    await assertRefused({ manager: 101 }, 'EMPLOYEE_NOT_FOUND', null);
    await assertRefused(undefined, 'EMPLOYEE_NOT_FOUND', null);
  });

  it('checks the scores before the proposal and saves nothing when any field is wrong', async () => {
    await assertRefused({ wework: 80, manager: 120, proposedAmount: 9_000_000 }, 'INVALID_KPI_SCORE');
    await assertRefused({ wework: 80, proposedAmount: 9_000_000 }, 'KPI_PROPOSAL_EXCEEDS_MAX');
  });
});

describe('PayrollController KPI and calculation errors', () => {
  const controllerWith = (service: Record<string, unknown>) =>
    new PayrollController(service as unknown as PayrollService);

  const failWith = (err: Error) => async () => {
    throw err;
  };

  it('answers an invalid KPI proposal with 400 and the error code', async () => {
    const controller = controllerWith({
      setKpiScore: failWith(new KpiValidationError('KPI_PROPOSAL_EXCEEDS_MAX', 'Lương KPI đề xuất quá lớn'))
    });

    await assert.rejects(controller.setKpiScore('2026-10', 'a', { proposedAmount: 9 }, ADMIN), (err: unknown) => {
      assert.ok(err instanceof BadRequestError);
      assert.equal(err.status, 400);
      assert.equal(err.message, 'Lương KPI đề xuất quá lớn');
      assert.equal(err.details?.code, 'KPI_PROPOSAL_EXCEEDS_MAX');
      return true;
    });
  });

  it('keeps the code of every other KPI error on a 400, and maps an unknown employee to 404', async () => {
    for (const code of ['INVALID_KPI_SCORE', 'KPI_NOT_APPLICABLE'] as const) {
      const controller = controllerWith({ setKpiScore: failWith(new KpiValidationError(code, 'x')) });
      await assert.rejects(controller.setKpiScore('2026-10', 'a', {}, ADMIN), (err: unknown) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.details?.code, code);
        return true;
      });
    }

    const notFound = controllerWith({
      setKpiScore: failWith(new KpiValidationError('EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân sự zz'))
    });
    await assert.rejects(notFound.setKpiScore('2026-10', 'zz', {}, ADMIN), (err: unknown) => {
      assert.ok(err instanceof NotFoundError);
      assert.equal(err.status, 404);
      assert.equal(err.details?.code, 'EMPLOYEE_NOT_FOUND');
      assert.equal(err.message, 'Không tìm thấy nhân sự zz');
      return true;
    });
  });

  it('lets an unexpected error through untouched', async () => {
    const boom = new Error('boom');
    const controller = controllerWith({ setKpiScore: failWith(boom) });
    await assert.rejects(controller.setKpiScore('2026-10', 'a', {}, ADMIN), err => err === boom);
  });

  it('passes the body and the actor to the service and confirms the update', async () => {
    const calls: unknown[][] = [];
    const controller = controllerWith({
      setKpiScore: async (...args: unknown[]) => {
        calls.push(args);
      }
    });
    const body = { wework: 90 };

    assert.deepEqual(await controller.setKpiScore('2026-10', 'a', body, { username: 'admin' } as any), {
      updated: true,
      username: 'a',
      month: '2026-10'
    });
    await controller.setKpiScore('2026-10', 'a', body, ADMIN);
    assert.deepEqual(calls, [
      ['a', '2026-10', body, 'admin'],
      ['a', '2026-10', body, 'admin']
    ]);
  });

  it('rejects a malformed month before calling the service', async () => {
    const controller = controllerWith({ setKpiScore: failWith(new Error('must not run')) });
    await assert.rejects(controller.setKpiScore('2026-1', 'a', {}, ADMIN), (err: unknown) => {
      assert.ok(err instanceof BadRequestError);
      assert.equal(err.details?.code, 'INVALID_MONTH');
      return true;
    });
  });

  it('answers a calculation of a final month with 409 PAYROLL_FINALIZED', async () => {
    const controller = controllerWith({
      calculatePeriodPayslips: failWith(new PayrollFinalizedError('Kỳ lương 2026-10 đã chốt, không thể tính lại'))
    });

    await assert.rejects(controller.calculatePeriod('2026-10', {}, ADMIN), (err: unknown) => {
      assert.ok(err instanceof ConflictError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Kỳ lương 2026-10 đã chốt, không thể tính lại');
      assert.equal(err.details?.code, 'PAYROLL_FINALIZED');
      return true;
    });
  });

  it('keeps answering any other calculation failure with 400 CALCULATE_ERROR', async () => {
    const controller = controllerWith({ calculatePeriodPayslips: failWith(new Error('mất kết nối')) });

    await assert.rejects(controller.calculatePeriod('2026-10', {}, ADMIN), (err: unknown) => {
      assert.ok(err instanceof BadRequestError);
      assert.equal(err.message, 'mất kết nối');
      assert.equal(err.details?.code, 'CALCULATE_ERROR');
      return true;
    });
  });

  it('returns the per-employee errors of a calculation next to the summaries', async () => {
    const items = [{ employeeId: 'u1', netIncome: 1 }];
    const errors = [{ employeeId: 'u2', message: 'Thiếu cấu hình chức vụ hoặc bậc lương cho nv (Bậc 9)' }];
    const calls: unknown[][] = [];
    const controller = controllerWith({
      calculatePeriodPayslips: async (...args: unknown[]) => {
        calls.push(args);
        return { runId: 7, items, errors };
      }
    });

    const body = { employeeIds: ['u1', 'u2'] };
    const result = await controller.calculatePeriod('2026-10', body, { username: 'hr' } as any);

    assert.deepEqual(result, { month: '2026-10', calculated: true, runId: 7, count: 1, items, errors });
    assert.deepEqual(calls, [['2026-10', ['u1', 'u2'], 'hr']]);
  });

  it('passes a missing list or a list of employee ids on to the service', async () => {
    const calls: unknown[][] = [];
    const controller = controllerWith({
      calculatePeriodPayslips: async (...args: unknown[]) => {
        calls.push(args);
        return { runId: 7, items: [], errors: [] };
      }
    });

    await controller.calculatePeriod('2026-10', {}, ADMIN);
    await controller.calculatePeriod('2026-10', { employeeIds: ['u1'] }, ADMIN);
    await controller.calculatePeriod('2026-10', { employeeIds: [] }, ADMIN);

    assert.deepEqual(calls, [
      ['2026-10', undefined, 'admin'],
      ['2026-10', ['u1'], 'admin'],
      ['2026-10', [], 'admin']
    ]);
  });

  it('rejects employeeIds that is not a list of non-blank strings before calculating anything', async () => {
    const calls: unknown[][] = [];
    const controller = controllerWith({
      calculatePeriodPayslips: async (...args: unknown[]) => {
        calls.push(args);
        return { runId: 7, items: [], errors: [] };
      }
    });

    for (const employeeIds of ['u1', [1], [''], ['  '], ['u1', ' '], ['u1', null], {}, null, 5]) {
      await assert.rejects(controller.calculatePeriod('2026-10', { employeeIds } as any, ADMIN), (err: unknown) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'employeeIds phải là danh sách mã nhân sự');
        assert.equal(err.details?.code, 'INVALID_EMPLOYEE_IDS');
        return true;
      });
    }
    assert.deepEqual(calls, []);
  });

  it('answers a calculation that computed nothing with a null runId', async () => {
    const errors = [{ employeeId: 'u1', message: 'Thiếu cấu hình chức vụ hoặc bậc lương cho nv (Bậc 9)' }];
    const controller = controllerWith({ calculatePeriodPayslips: async () => ({ runId: null, items: [], errors }) });

    assert.deepEqual(await controller.calculatePeriod('2026-10', { employeeIds: ['u1'] }, ADMIN), {
      month: '2026-10',
      calculated: true,
      runId: null,
      count: 0,
      items: [],
      errors
    });
  });

  it('hands the stored payslip records through unchanged', async () => {
    const record = { id: 1, runId: 7, username: 'a', status: 'draft', net: 9_377_693, warnings: [], details: {} };
    const controller = controllerWith({
      listPayslips: async () => [record],
      getPayslip: async (_month: string, employeeId: string) => (employeeId === 'a' ? record : null)
    });

    assert.deepEqual(await controller.listPayslips('2026-10'), { month: '2026-10', items: [record] });
    assert.deepEqual(await controller.getPayslip('2026-10', 'a'), { month: '2026-10', payslip: record });
    await assert.rejects(controller.getPayslip('2026-10', 'zz'), (err: unknown) => {
      assert.ok(err instanceof NotFoundError);
      assert.equal(err.details?.code, 'PAYSLIP_NOT_FOUND');
      return true;
    });
  });
});

// Runs the real repository code against a Kysely whose driver records each statement and answers from a script.
function recordingDb(respond: (sql: string) => unknown[]) {
  const statements: Array<{ sql: string; parameters: readonly unknown[] }> = [];

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
  }

  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new RecordingDriver(),
      createIntrospector: inner => new PostgresIntrospector(inner),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
  return { db, statements };
}

describe('PayrollRepository.saveKpiScore', () => {
  it('upserts only the columns of the patch and refreshes the audit columns', async () => {
    const { db, statements } = recordingDb(() => []);

    await new PayrollRepository(db).saveKpiScore('a', '2026-10', { peer: null, kpi_proposed: 5_000_000 }, 'admin');

    assert.equal(statements.length, 1);
    const [{ sql, parameters }] = statements;
    const insertColumns = /^insert into "kpi_scores" \(([^)]*)\)/.exec(sql)?.[1].split(', ');
    assert.deepEqual(insertColumns, [
      '"username"',
      '"month"',
      '"peer"',
      '"kpi_proposed"',
      '"created_by"',
      '"created_at"',
      '"updated_by"',
      '"updated_at"'
    ]);
    const updateSet = /on conflict \("username", "month"\) do update set (.*)$/.exec(sql)?.[1];
    assert.deepEqual(
      updateSet?.split(', ').map(assignment => assignment.split(' = ')[0]),
      ['"peer"', '"kpi_proposed"', '"updated_by"', '"updated_at"']
    );
    assert.equal(parameters[0], 'a');
    assert.equal(parameters[1], '2026-10');
    assert.ok(parameters.includes(null));
    assert.ok(parameters.includes(5_000_000));
    assert.ok(parameters.includes('admin'));
  });

  it('with an empty patch only touches the audit columns of an existing row', async () => {
    const { db, statements } = recordingDb(() => []);

    await new PayrollRepository(db).saveKpiScore('a', '2026-10', {}, 'admin');

    const updateSet = /do update set (.*)$/.exec(statements[0].sql)?.[1];
    assert.deepEqual(
      updateSet?.split(', ').map(assignment => assignment.split(' = ')[0]),
      ['"updated_by"', '"updated_at"']
    );
  });
});

describe('PayrollRepository.getKpiCap', () => {
  const answer =
    (tables: { staff?: unknown; type?: unknown; level?: unknown; benefits?: unknown[] }) =>
    (sql: string): unknown[] => {
      if (sql.includes('from "staff"')) return tables.staff ? [tables.staff] : [];
      if (sql.includes('from "position_types"')) return tables.type ? [tables.type] : [];
      if (sql.includes('from "position_levels"')) return tables.level ? [tables.level] : [];
      if (sql.includes('from "position_type_benefits"')) return tables.benefits ?? [];
      return [];
    };
  const full = {
    staff: { type: 'nv', level: 2 },
    type: { id: '2', code: 'nv' },
    level: { kpi_max: '6000000' },
    benefits: [{ benefit: 'kpi', enabled: 1 }]
  };

  it('returns null without reading the position when the username is unknown', async () => {
    const { db, statements } = recordingDb(answer({}));

    assert.equal(await new PayrollRepository(db).getKpiCap('nobody', '2026-10'), null);
    assert.equal(statements.length, 1);
    assert.deepEqual(statements[0].parameters.slice(0, 1), ['nobody']);
  });

  it('reads the type and level in effect for the month and the KPI benefit of the type', async () => {
    const { db, statements } = recordingDb(answer(full));

    const cap = await new PayrollRepository(db).getKpiCap('a', '2026-10');

    assert.deepEqual(cap, { applicable: true, kpiMax: 6_000_000 });
    const tableOf = (sql: string) => /from "(\w+)"/.exec(sql)?.[1];
    assert.deepEqual(statements.map(s => tableOf(s.sql)), [
      'staff',
      'position_types',
      'position_levels',
      'position_type_benefits'
    ]);
    const [, type, level, benefits] = statements;
    assert.deepEqual(type.parameters.slice(0, 2), ['nv', '2026-10']);
    assert.deepEqual(level.parameters.slice(0, 3), ['nv', 2, '2026-10']);
    assert.match(type.sql, /order by "effective_month" desc/);
    assert.match(level.sql, /order by "effective_month" desc/);
    assert.deepEqual(benefits.parameters, ['2']);
  });

  it('is not applicable when the benefit is off, the level has no kpi_max or the type is missing', async () => {
    const off = recordingDb(answer({ ...full, benefits: [{ benefit: 'kpi', enabled: 0 }] }));
    assert.deepEqual(await new PayrollRepository(off.db).getKpiCap('a', '2026-10'), {
      applicable: false,
      kpiMax: 6_000_000
    });

    const noMax = recordingDb(answer({ ...full, level: { kpi_max: null } }));
    assert.deepEqual(await new PayrollRepository(noMax.db).getKpiCap('a', '2026-10'), {
      applicable: false,
      kpiMax: null
    });

    const noType = recordingDb(answer({ ...full, type: undefined }));
    assert.deepEqual(await new PayrollRepository(noType.db).getKpiCap('a', '2026-10'), {
      applicable: false,
      kpiMax: 6_000_000
    });
    assert.equal(
      noType.statements.some(s => s.sql.includes('position_type_benefits')),
      false
    );
  });
});
