import { gunzipSync, gzipSync } from 'node:zlib';
import { Injectable, Inject } from '@nestjs/common';
import type { Insertable, Kysely, Selectable, Transaction } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import {
  CONTRACT_TERM_TEXT,
  ContractTerm,
  DEFAULT_INSURANCE_RATES,
  EmployeePayslip,
  EmployeePayslipDTO,
  InsuranceRates,
  KpiCap,
  KpiInput,
  PayrollWarning,
  isInsured,
  resolveContractTerm
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
    contractTerm: ContractTerm; // resolved from staff.contract and the employee type
    insured: boolean; // resolved from the contract term and staff.insured
    dependants: number;
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
    explanationDate?: string | null;
    leaveStartDate?: string | null;
    leaveEndDate?: string | null;
    leaveType?: string | null;
    otDate?: string | null;
    otHours?: number | null;
    advanceAmount?: number | bigint | null;
    advancePeriod?: string | null;
  }>;
  isatDates?: string[]; // Saturdays of approved iSAT requests, 'YYYY-MM-DD'
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
  isatDates?: Array<string | Date>;
  kpi: any | null;
  settings: Array<{ key: string; value_json: string }>;
}

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
  const contractTerm = resolveContractTerm(staffRow.contract, staffRow.type);

  return {
    staff: {
      uuid: staffRow.uuid || staffRow.username,
      username: staffRow.username,
      name: staffRow.name,
      positionLevelText: levelRow?.name || `${(staffRow.type || 'NV').toUpperCase()} · Bậc ${staffRow.level || 1}`,
      contractStatusText: CONTRACT_TERM_TEXT[contractTerm],
      baseSalary,
      standardWorkdays: numberOrNull(typeRow?.workdays),
      employeeType: staffRow.type,
      nightAllowancePct: Number(staffRow.shift_allowance_pct ?? 30),
      isDormResident: Number(staffRow.idorm ?? 0) === 1,
      remainingAnnualLeaveDays: 22,
      contractTerm,
      insured: isInsured(contractTerm, numberOrNull(staffRow.insured)),
      dependants: Math.max(0, Math.floor(Number(staffRow.dependants) || 0)),
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
      explanationDate: dateTextOrNull(r.explanation_date),
      leaveStartDate: dateTextOrNull(r.leave_start_date),
      leaveEndDate: dateTextOrNull(r.leave_end_date),
      leaveType: r.leave_type,
      otDate: dateTextOrNull(r.ot_date),
      otHours: numberOrNull(r.ot_hours),
      advanceAmount: numberOrNull(r.advance_amount),
      advancePeriod: r.advance_period
    })),
    isatDates: (rows.isatDates ?? []).map(dateText),
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

// Columns of kpi_scores to write; a key that is absent keeps its stored value, null clears it. Scores are points x 100.
export interface KpiScorePatch {
  wework?: number | null;
  user_score?: number | null;
  peer?: number | null;
  manager?: number | null;
  self_score?: number | null;
  kpi_proposed?: number | null;
}

// What a partial run keeps from the month's current draft run: all its payslips except those of the people the call
// recalculated. exceptEmployeeIds are the call's targets by uuid or username, including the ones that failed.
export interface CarryForward {
  exceptUsernames: string[];
  exceptEmployeeIds: string[];
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

  // Position type, level and the type's benefits in effect for the month (latest version not after the month).
  private async positionInEffect(staffRow: { type: string; level: number }, month: string) {
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

    return { typeRow, levelRow, benefits };
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

    const { typeRow, levelRow, benefits } = await this.positionInEffect(staffRow, month);

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
          eb.and([eb('explanation_date', '>=', startDate), eb('explanation_date', '<=', endDate)])
        ])
      )
      .execute();

    // Saturdays of approved iSAT requests in the month (the DATE column is converted to text in mapMonthRows)
    const isatRows = await this.qb
      .selectFrom('isat_registrations')
      .innerJoin('system_requests', 'system_requests.id', 'isat_registrations.request_id')
      .select('isat_registrations.saturday as saturday')
      .where('system_requests.employee_id', '=', staffRow.uuid || employeeId)
      .where('system_requests.type', '=', 'ISAT')
      .where('system_requests.status', '=', 'APPROVED')
      .where('isat_registrations.saturday', '>=', startDate)
      .where('isat_registrations.saturday', '<=', endDate)
      .orderBy('isat_registrations.saturday', 'asc')
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
      isatDates: isatRows.map(r => r.saturday),
      kpi: kpiRow ?? null,
      settings
    });
  }

  // The payslips of the month's current draft run that a partial run keeps: everyone except the people it recalculated
  // (exceptUsernames) and every target of the call (exceptEmployeeIds, uuid or username), so a target that failed
  // does not keep its old payslip.
  private async carriedPayslips(
    trx: Transaction<DB>,
    month: string,
    carryForward: CarryForward
  ): Promise<Array<Selectable<DB['payslips']>>> {
    const previous = await trx
      .selectFrom('payroll_runs')
      .select('id')
      .where('month', '=', month)
      .where('status', '=', 'draft')
      .orderBy('run_no', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!previous) return [];

    const except = new Set(carryForward.exceptUsernames);
    if (carryForward.exceptEmployeeIds.length > 0) {
      const ids = carryForward.exceptEmployeeIds;
      const targets = await trx
        .selectFrom('staff')
        .select('username')
        .where(eb => eb.or([eb('uuid', 'in', ids), eb('username', 'in', ids)]))
        .execute();
      for (const target of targets) except.add(target.username);
    }

    const rows = await trx.selectFrom('payslips').selectAll().where('run_id', '=', previous.id).orderBy('id').execute();
    return rows.filter(row => !except.has(row.username));
  }

  // Stores a new draft run for the month (run_no + 1) and supersedes the month's earlier drafts. A month with a
  // final run is closed. With carryForward (a partial run) the payslips of the previous draft run that the call did
  // not recalculate are copied unchanged into the new run. Without payslips nothing is stored and the result is null.
  async savePayrollRunAndSlips(
    month: string,
    actor: string,
    payslips: EmployeePayslip[],
    errorCount = 0,
    carryForward?: CarryForward
  ): Promise<number | null> {
    const now = new Date().toISOString();

    return await this.qb.transaction().execute(async trx => {
      const finalRun = await trx
        .selectFrom('payroll_runs')
        .select('id')
        .where('month', '=', month)
        .where('status', '=', 'final')
        .executeTakeFirst();
      if (finalRun) throw new PayrollFinalizedError(`Kỳ lương ${month} đã chốt, không thể tính lại`);

      if (payslips.length === 0) return null;

      const latest = await trx
        .selectFrom('payroll_runs')
        .select(eb => eb.fn.max('run_no').as('max_run_no'))
        .where('month', '=', month)
        .executeTakeFirst();
      const runNo = Number(latest?.max_run_no ?? 0) + 1;

      const carried = carryForward ? await this.carriedPayslips(trx, month, carryForward) : [];

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
          slips_total: payslips.length + carried.length,
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
      for (const { id: _oldId, ...copy } of carried) {
        await trx.insertInto('payslips').values({ ...copy, run_id: run.id }).execute();
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

  // Ghi quyết định của Admin lên phiếu của người đó trong lần chạy hiện tại; kỳ đã chốt thì không đổi được.
  // Trả phiếu sau khi ghi, null khi tháng chưa có lần chạy hoặc người đó không có phiếu.
  async decidePayslip(
    month: string,
    username: string,
    status: 'approved' | 'rejected',
    actor: string,
    note?: string
  ): Promise<PayslipRecord | null> {
    const run = await this.qb
      .selectFrom('payroll_runs')
      .select(['id', 'status'])
      .where('month', '=', month)
      .where('status', '<>', 'superseded')
      .orderBy('run_no', 'desc')
      .executeTakeFirst();
    if (!run) return null;
    if (run.status === 'final') throw new PayrollFinalizedError('Kỳ lương đã chốt, không duyệt lại được phiếu');

    const row = await this.qb
      .updateTable('payslips')
      .set(eb => ({
        status,
        decided_by: actor,
        decided_at: new Date().toISOString(),
        note: note ?? null,
        rev: eb('rev', '+', 1),
      }))
      .where('run_id', '=', Number(run.id))
      .where('username', '=', username)
      .returningAll()
      .executeTakeFirst();
    return row ? readPayslipRow(row) : null;
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

  // What KPI pay the employee's level allows in the month; null when no staff has the username.
  async getKpiCap(username: string, month: string): Promise<KpiCap | null> {
    const staffRow = await this.qb
      .selectFrom('staff')
      .select(['type', 'level'])
      .where('username', '=', username)
      .executeTakeFirst();
    if (!staffRow) return null;

    const { levelRow, benefits } = await this.positionInEffect(staffRow, month);
    return resolveKpiCap(levelRow ?? null, benefits);
  }

  async saveKpiScore(username: string, month: string, patch: KpiScorePatch, actor: string): Promise<void> {
    const now = new Date().toISOString();
    await this.qb
      .insertInto('kpi_scores')
      .values({
        username,
        month,
        ...patch,
        created_by: actor,
        created_at: now,
        updated_by: actor,
        updated_at: now
      })
      .onConflict(oc =>
        oc.columns(['username', 'month']).doUpdateSet({
          ...patch,
          updated_by: actor,
          updated_at: now
        })
      )
      .execute();
  }
}
