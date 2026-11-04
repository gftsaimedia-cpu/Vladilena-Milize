import { Injectable, Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { EmployeePayslip } from './domain';

export interface EmployeeMonthlyRawData {
  staff: {
    uuid: string;
    username: string;
    name: string;
    positionLevelText: string;
    contractStatusText: string;
    baseSalary: number;
    standardWorkdays: number;
    employeeType?: string;
    nightAllowancePct?: number;
    isDormResident?: boolean;
    kpiMaxSalary?: number;
    remainingAnnualLeaveDays?: number;
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

    // Position level
    const positionRow = await this.qb
      .selectFrom('position_levels')
      .selectAll()
      .where('type_code', '=', staffRow.type || 'nv')
      .where('level_no', '=', staffRow.level || 1)
      .executeTakeFirst();

    const baseSalary = positionRow?.base_salary ?? 6000000;
    const kpiMaxSalary = positionRow?.kpi_max ? Number(positionRow.kpi_max) : baseSalary;

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

    // Requests (filtered by target month)
    const requestRows = await this.qb
      .selectFrom('system_requests')
      .selectAll()
      .where('employee_id', '=', staffRow.uuid || employeeId)
      .where('status', '=', 'APPROVED')
      .where(eb =>
        eb.or([
          eb('ot_date', 'like', `${month}%`),
          eb('leave_start_date', 'like', `${month}%`),
          eb('advance_period', '=', month),
          eb('correction_date', 'like', `${month}%`)
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

    return {
      staff: {
        uuid: staffRow.uuid || employeeId,
        username: staffRow.username,
        name: staffRow.name,
        positionLevelText: positionRow?.name || `${(staffRow.type || 'NV').toUpperCase()} · Bậc ${staffRow.level || 1}`,
        contractStatusText: staffRow.contract_status || 'HĐLĐ từ 3 tháng',
        baseSalary,
        standardWorkdays: 26,
        employeeType: staffRow.type,
        nightAllowancePct: Number(staffRow.shift_allowance_pct ?? 30),
        isDormResident: Number(staffRow.idorm ?? 0) === 1,
        kpiMaxSalary,
        remainingAnnualLeaveDays: 22
      },
      timesheets: timesheetRows.map(r => ({
        workDate: r.work_date,
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
      requests: requestRows.map(r => ({
        id: r.id,
        type: r.type,
        status: r.status,
        correctionDate: r.correction_date,
        leaveStartDate: r.leave_start_date,
        leaveEndDate: r.leave_end_date,
        leaveType: r.leave_type,
        otDate: r.ot_date,
        otHours: r.ot_hours !== null ? Number(r.ot_hours) : null,
        advanceAmount: r.advance_amount,
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
        : null
    };
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
