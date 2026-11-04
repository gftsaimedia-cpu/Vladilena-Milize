import { Injectable, Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { DEFAULT_INSURANCE_RATES, EmployeePayslip, InsuranceRates, KpiCap, KpiInput } from './domain';

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
    kpiMaxSalary?: number;
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
  kpiScore?: {
    wework: number;
    user: number;
    peer: number;
    manager: number;
    self: number;
  } | null;
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
      kpiMaxSalary: kpiCap.kpiMax || baseSalary || undefined,
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
    kpiScore: kpiRow
      ? {
          wework: Number(kpiRow.wework ?? 0),
          user: Number(kpiRow.user_score ?? 0),
          peer: Number(kpiRow.peer ?? 0),
          manager: Number(kpiRow.manager ?? 0),
          self: Number(kpiRow.self_score ?? 0)
        }
      : null,
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

  async savePayrollRunAndSlips(month: string, actor: string, payslips: EmployeePayslip[]): Promise<number> {
    const now = new Date().toISOString();

    // 1. Create payroll_run
    const run = await this.qb
      .insertInto('payroll_runs')
      .values({
        month,
        run_no: 1,
        status: 'OFFICIAL',
        engine_version: 'v2',
        params_hash: 'v2_pure',
        params_rev: 1,
        params_json: '{}',
        switches_json: '{}',
        slips_total: payslips.length,
        slips_error: 0,
        created_by: actor,
        created_at: now,
        finished_at: now
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const runId = run.id;

    // 2. Insert payslips
    for (const slip of payslips) {
      const summary = slip.toSummary();
      const jsonStr = JSON.stringify(slip.toJSON());

      await this.qb
        .insertInto('payslips')
        .values({
          run_id: runId,
          username: summary.employeeId,
          status: 'OFFICIAL',
          gross: summary.grossIncome,
          insurance: summary.insuranceDeduction,
          tax: slip.personalIncomeTax,
          advance: summary.advanceDeduction,
          net: summary.netIncome,
          staff_terms_json: jsonStr,
          snapshot_gz: Buffer.from(jsonStr)
        })
        .execute();
    }

    return runId;
  }

  async listPayslips(month: string): Promise<any[]> {
    const run = await this.qb
      .selectFrom('payroll_runs')
      .select(['id', 'month', 'status', 'created_at'])
      .where('month', '=', month)
      .orderBy('id', 'desc')
      .executeTakeFirst();

    if (!run) return [];

    const slips = await this.qb.selectFrom('payslips').selectAll().where('run_id', '=', run.id).execute();

    return slips.map(s => ({
      id: s.id,
      runId: s.run_id,
      username: s.username,
      status: s.status,
      gross: s.gross,
      insurance: s.insurance,
      tax: s.tax,
      advance: s.advance,
      net: s.net,
      details: s.staff_terms_json ? JSON.parse(s.staff_terms_json) : null
    }));
  }

  async getPayslip(month: string, employeeId: string): Promise<any | null> {
    const run = await this.qb
      .selectFrom('payroll_runs')
      .select(['id'])
      .where('month', '=', month)
      .orderBy('id', 'desc')
      .executeTakeFirst();

    if (!run) return null;

    const slip = await this.qb
      .selectFrom('payslips')
      .selectAll()
      .where('run_id', '=', run.id)
      .where(eb => eb.or([eb('username', '=', employeeId)]))
      .executeTakeFirst();

    if (!slip) return null;

    return {
      id: slip.id,
      runId: slip.run_id,
      username: slip.username,
      status: slip.status,
      gross: slip.gross,
      insurance: slip.insurance,
      tax: slip.tax,
      advance: slip.advance,
      net: slip.net,
      details: slip.staff_terms_json ? JSON.parse(slip.staff_terms_json) : null
    };
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
