import { gunzipSync, gzipSync } from 'node:zlib';
import { Injectable, Inject } from '@nestjs/common';
import type { Insertable, Kysely, Selectable } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import {
  DEFAULT_INSURANCE_RATES,
  EmployeePayslip,
  EmployeePayslipDTO,
  InsuranceRates,
  KpiCap,
  KpiInput,
  PayrollWarning
} from './domain';
import { PayrollFinalizedError } from './payroll.errors';

export interface EmployeeMonthlyRawData {
  staff: {
    uuid: string;
    username: string;
    name: string;
    positionLevelText: string;
    contractStatusText: string;
    baseSalary: number | null; // position_levels.base_salary in effect; null = not configured
    standardWorkdays: number | null; // position_types.workdays in effect; null = not configured
    employeeType?: string;
    nightAllowancePct?: number;
    isDormResident?: boolean;
    remainingAnnualLeaveDays?: number;
    insured: boolean;
    dependants: number;
    hasTax: boolean;
    contractStart: string | null;
    contractEnd: string | null;
    kpiCap: KpiCap;
  };
  timesheets: Array<{
    workDate: string;
    shiftType: string;
    shiftStartTime: string;
    shiftEndTime: string;
    shiftAllowancePct: number;
    actualCheckIn?: string | null;
    actualCheckOut?: string | null;
    workHours: number;
    otHours: number;
    lateMinutes: number;
    earlyMinutes: number;
    status: string;
    dayStatus: string;
    scheduleType?: string;
  }>;
  requests: Array<{
    id: string;
    type: string;
    status: string;
    correctionDate?: string | null;
    leaveStartDate?: string | null;
    leaveEndDate?: string | null;
    leaveType?: string | null;
    otDate?: string | null;
    otHours?: number | null;
    advanceAmount?: number | bigint | null;
    advancePeriod?: string | null;
  }>;
  kpi: KpiInput | null;
  insuranceRates: InsuranceRates;
}

// Raw rows of one employee-month as the database returns them (numbers may still be strings).
export interface MonthRows {
  staff: any;
  type: any | null;
  level: any | null;
  benefits: any[];
  timesheets: any[];
  requests: any[];
  kpi: any | null;
  settings: Array<{ key: string; value_json: string }>;
}

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n: number) => String(n).padStart(2, '0');

// pg returns DATE columns as local-midnight Date objects; the payroll code works on 'YYYY-MM-DD' strings.
function dateText(value: string | Date): string {
  if (!(value instanceof Date)) return value;
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function dateTextOrNull(value: string | Date | null | undefined): string | null {
  return value === null || value === undefined ? null : dateText(value);
}

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

const dateOnlyOrNull = (value: unknown): string | null =>
  typeof value === 'string' && DATE_TEXT.test(value) ? value : null;

// KPI pay applies when the type's 'kpi' benefit is on and the level defines a kpi_max; kpiMax is null only when
// the level has none, so an applicable cap always carries a kpiMax.
export function resolveKpiCap(level: any | null, benefits: any[]): KpiCap {
  const kpiMax = numberOrNull(level?.kpi_max);
  const enabled = benefits.some(b => b.benefit === 'kpi' && Number(b.enabled) === 1);
  return { applicable: enabled && kpiMax !== null, kpiMax };
}

function parseInsuranceRates(settings: MonthRows['settings']): InsuranceRates {
  const fallback = { ...DEFAULT_INSURANCE_RATES };
  const row = settings.find(s => s.key === 'insurance_rates');
  if (!row) return fallback;
  let parsed: any;
  try {
    parsed = JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
  if (parsed === null || typeof parsed !== 'object') return fallback;
  const { bhxh, bhyt, bhtn } = parsed;
  const valid = [bhxh, bhyt, bhtn].every(rate => typeof rate === 'number' && rate >= 0 && rate <= 1);
  return valid ? { bhxh, bhyt, bhtn } : fallback;
}

export function mapMonthRows(month: string, rows: MonthRows): EmployeeMonthlyRawData {
  const { staff: staffRow, type: typeRow, level: levelRow, benefits, kpi: kpiRow } = rows;

  const baseSalary = numberOrNull(levelRow?.base_salary);
  const kpiCap = resolveKpiCap(levelRow, benefits);

  return {
    staff: {
      uuid: staffRow.uuid || staffRow.username,
      username: staffRow.username,
      name: staffRow.name,
      positionLevelText: levelRow?.name || `${(staffRow.type || 'NV').toUpperCase()} · Bậc ${staffRow.level || 1}`,
      contractStatusText: staffRow.contract_status || 'HĐLĐ từ 3 tháng',
      baseSalary,
      standardWorkdays: numberOrNull(typeRow?.workdays),
      employeeType: staffRow.type,
      nightAllowancePct: Number(staffRow.shift_allowance_pct ?? 30),
      isDormResident: Number(staffRow.idorm ?? 0) === 1,
      remainingAnnualLeaveDays: 22,
      insured: numberOrNull(staffRow.insured) !== 0,
      dependants: Math.max(0, Math.floor(Number(staffRow.dependants) || 0)),
      hasTax: numberOrNull(staffRow.tax_on) !== 0,
      contractStart: dateOnlyOrNull(staffRow.start_date),
      contractEnd: dateOnlyOrNull(staffRow.contract),
      kpiCap
    },
    timesheets: rows.timesheets.map(r => ({
      workDate: dateText(r.work_date),
      shiftType: r.shift_type,
      shiftStartTime: r.shift_start_time,
      shiftEndTime: r.shift_end_time,
      shiftAllowancePct: Number(r.shift_allowance_pct),
      actualCheckIn: r.actual_check_in instanceof Date ? r.actual_check_in.toISOString() : r.actual_check_in,
      actualCheckOut: r.actual_check_out instanceof Date ? r.actual_check_out.toISOString() : r.actual_check_out,
      workHours: Number(r.work_hours),
      otHours: Number(r.ot_hours),
      lateMinutes: Number(r.late_minutes),
      earlyMinutes: Number(r.early_minutes),
      status: r.status,
      dayStatus: r.day_status,
      scheduleType: r.schedule_type ?? undefined
    })),
    requests: rows.requests.map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      correctionDate: dateTextOrNull(r.correction_date),
      leaveStartDate: dateTextOrNull(r.leave_start_date),
      leaveEndDate: dateTextOrNull(r.leave_end_date),
      leaveType: r.leave_type,
      otDate: dateTextOrNull(r.ot_date),
      otHours: numberOrNull(r.ot_hours),
      advanceAmount: numberOrNull(r.advance_amount),
      advancePeriod: r.advance_period
    })),
    kpi: kpiRow
      ? {
          scores: {
            wework: numberOrNull(kpiRow.wework),
            user: numberOrNull(kpiRow.user_score),
            peer: numberOrNull(kpiRow.peer),
            manager: numberOrNull(kpiRow.manager),
            self: numberOrNull(kpiRow.self_score)
          },
          proposedAmount: numberOrNull(kpiRow.kpi_proposed)
        }
      : null,
    insuranceRates: parseInsuranceRates(rows.settings)
  };
}

// A stored payslip: the amounts as numbers, the warnings raised while it was computed and the full snapshot.
export interface PayslipRecord {
  id: number;
  runId: number;
  username: string;
  status: string;
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  net: number;
  warnings: PayrollWarning[];
  details: EmployeePayslipDTO;
}

const ENGINE_VERSION = 'v2-rules-2026-11';

export function buildPayslipRow(runId: number, slip: EmployeePayslip): Insertable<DB['payslips']> {
  return {
    run_id: runId,
    username: slip.username,
    status: 'draft',
    gross: slip.grossIncome,
    insurance: slip.insuranceDeduction,
    tax: slip.personalIncomeTax,
    advance: slip.advanceDeduction,
    net: slip.netIncome,
    staff_terms_json: JSON.stringify({
      employeeType: slip.employeeType,
      baseSalaryPolicy: slip.baseSalaryPolicy,
      standardWorkdays: slip.standardWorkdays,
      taxMethod: slip.taxMethod,
      dependants: slip.dependants
    }),
    snapshot_gz: gzipSync(JSON.stringify(slip.toJSON())),
    flags_json: slip.warnings.length > 0 ? JSON.stringify(slip.warnings) : null
  };
}

export function readPayslipRow(row: Selectable<DB['payslips']>): PayslipRecord {
  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    username: row.username,
    status: row.status,
    gross: Number(row.gross),
    insurance: Number(row.insurance),
    tax: Number(row.tax),
    advance: Number(row.advance),
    net: Number(row.net),
    warnings: row.flags_json ? JSON.parse(row.flags_json) : [],
    details: JSON.parse(gunzipSync(row.snapshot_gz).toString('utf8'))
  };
}

@Injectable()
export class PayrollRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  async listEligibleEmployees(): Promise<Array<{ uuid: string; username: string; name: string }>> {
    if (!this.qb) return [];
    const rows = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'username', 'name'])
      .where('locked_at', 'is', null)
      .execute();

    return rows.map(r => ({
      uuid: r.uuid || r.username,
      username: r.username,
      name: r.name
    }));
  }

  async getMonthlyData(employeeId: string, month: string): Promise<EmployeeMonthlyRawData | null> {
    if (!this.qb) return null;

    // Query staff
    const staffRow = await this.qb
      .selectFrom('staff')
      .selectAll()
      .where(eb => eb.or([eb('uuid', '=', employeeId), eb('username', '=', employeeId)]))
      .executeTakeFirst();

    if (!staffRow) return null;

    // Position type and level in effect for the month (latest version not after the month)
    const typeCode = staffRow.type || 'nv';
    const typeRow = await this.qb
      .selectFrom('position_types')
      .selectAll()
      .where('code', '=', typeCode)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();

    const levelRow = await this.qb
      .selectFrom('position_levels')
      .selectAll()
      .where('type_code', '=', typeCode)
      .where('level_no', '=', staffRow.level || 1)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();

    const benefits = typeRow
      ? await this.qb.selectFrom('position_type_benefits').selectAll().where('type_id', '=', typeRow.id).execute()
      : [];

    // Timesheet entries
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    const timesheetRows = await this.qb
      .selectFrom('timesheet_entries')
      .leftJoin('work_schedules', join =>
        join
          .onRef('work_schedules.employee_id', '=', 'timesheet_entries.employee_id')
          .onRef('work_schedules.work_date', '=', 'timesheet_entries.work_date')
      )
      .selectAll('timesheet_entries')
      .select('work_schedules.schedule_type as schedule_type')
      .where('timesheet_entries.employee_id', '=', staffRow.uuid || employeeId)
      .where('timesheet_entries.work_date', '>=', startDate)
      .where('timesheet_entries.work_date', '<=', endDate)
      .orderBy('timesheet_entries.work_date', 'asc')
      .execute();

    // Requests (filtered by target month; DATE columns are compared against the month's first and last day)
    const requestRows = await this.qb
      .selectFrom('system_requests')
      .selectAll()
      .where('employee_id', '=', staffRow.uuid || employeeId)
      .where('status', '=', 'APPROVED')
      .where(eb =>
        eb.or([
          eb.and([eb('ot_date', '>=', startDate), eb('ot_date', '<=', endDate)]),
          eb.and([eb('leave_start_date', '>=', startDate), eb('leave_start_date', '<=', endDate)]),
          eb('advance_period', '=', month),
          eb.and([eb('correction_date', '>=', startDate), eb('correction_date', '<=', endDate)])
        ])
      )
      .execute();

    // KPI scores
    const kpiRow = await this.qb
      .selectFrom('kpi_scores')
      .selectAll()
      .where('username', '=', staffRow.username)
      .where('month', '=', month)
      .executeTakeFirst();

    const settings = await this.qb
      .selectFrom('settings')
      .select(['key', 'value_json'])
      .where('key', '=', 'insurance_rates')
      .execute();

    return mapMonthRows(month, {
      staff: staffRow,
      type: typeRow ?? null,
      level: levelRow ?? null,
      benefits,
      timesheets: timesheetRows,
      requests: requestRows,
      kpi: kpiRow ?? null,
      settings
    });
  }

  // Stores a new draft run for the month (run_no + 1) and supersedes the month's earlier drafts. A month with a
  // final run is closed.
  async savePayrollRunAndSlips(
    month: string,
    actor: string,
    payslips: EmployeePayslip[],
    errorCount = 0
  ): Promise<number> {
    const now = new Date().toISOString();

    return await this.qb.transaction().execute(async trx => {
      const finalRun = await trx
        .selectFrom('payroll_runs')
        .select('id')
        .where('month', '=', month)
        .where('status', '=', 'final')
        .executeTakeFirst();
      if (finalRun) throw new PayrollFinalizedError(`Kỳ lương ${month} đã chốt, không thể tính lại`);

      const latest = await trx
        .selectFrom('payroll_runs')
        .select(eb => eb.fn.max('run_no').as('max_run_no'))
        .where('month', '=', month)
        .executeTakeFirst();
      const runNo = Number(latest?.max_run_no ?? 0) + 1;

      await trx
        .updateTable('payroll_runs')
        .set({ status: 'superseded' })
        .where('month', '=', month)
        .where('status', '=', 'draft')
        .execute();

      const run = await trx
        .insertInto('payroll_runs')
        .values({
          month,
          run_no: runNo,
          status: 'draft',
          engine_version: ENGINE_VERSION,
          params_hash: ENGINE_VERSION,
          params_rev: 1,
          params_json: '{}',
          switches_json: '{}',
          slips_total: payslips.length,
          slips_error: errorCount,
          created_by: actor,
          created_at: now,
          finished_at: now
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      for (const slip of payslips) {
        await trx.insertInto('payslips').values(buildPayslipRow(run.id, slip)).execute();
      }

      return Number(run.id);
    });
  }

  // The run a reader sees: the newest one that a later calculation has not superseded.
  private async currentRunId(month: string): Promise<number | null> {
    const run = await this.qb
      .selectFrom('payroll_runs')
      .select('id')
      .where('month', '=', month)
      .where('status', '<>', 'superseded')
      .orderBy('run_no', 'desc')
      .executeTakeFirst();
    return run ? Number(run.id) : null;
  }

  async listPayslips(month: string): Promise<PayslipRecord[]> {
    const runId = await this.currentRunId(month);
    if (runId === null) return [];

    const rows = await this.qb.selectFrom('payslips').selectAll().where('run_id', '=', runId).orderBy('id').execute();
    return rows.map(readPayslipRow);
  }

  async getPayslip(month: string, employeeId: string): Promise<PayslipRecord | null> {
    const runId = await this.currentRunId(month);
    if (runId === null) return null;

    const staff = await this.qb
      .selectFrom('staff')
      .select('username')
      .where(eb => eb.or([eb('uuid', '=', employeeId), eb('username', '=', employeeId)]))
      .executeTakeFirst();
    if (!staff) return null;

    const row = await this.qb
      .selectFrom('payslips')
      .selectAll()
      .where('run_id', '=', runId)
      .where('username', '=', staff.username)
      .executeTakeFirst();
    return row ? readPayslipRow(row) : null;
  }

  async saveKpiScore(username: string, month: string, scores: any, actor: string): Promise<void> {
    const now = new Date().toISOString();
    await this.qb
      .insertInto('kpi_scores')
      .values({
        username,
        month,
        wework: scores.wework,
        user_score: scores.user,
        peer: scores.peer,
        manager: scores.manager,
        self_score: scores.self,
        created_by: actor,
        created_at: now,
        updated_by: actor,
        updated_at: now
      })
      .onConflict(oc =>
        oc.columns(['username', 'month']).doUpdateSet({
          wework: scores.wework,
          user_score: scores.user,
          peer: scores.peer,
          manager: scores.manager,
          self_score: scores.self,
          updated_by: actor,
          updated_at: now
        })
      )
      .execute();
  }
}
