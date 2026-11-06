import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Injectable, Inject } from '@nestjs/common';
import type { Insertable, Kysely, Selectable, Transaction } from 'kysely';
import { employedInMonth } from '../../common';
import { KYSELY_DB, type DB } from '../../database';
import type { SettingsSnapshot } from '../settings';
import {
  CONTRACT_TERM_TEXT,
  ContractTerm,
  EmployeePayslip,
  EmployeePayslipDTO,
  KpiCap,
  KpiInput,
  PayrollWarning,
  isInsured,
  resolveContractTerm
} from './domain';
import type { AllowanceRates } from './domain/allowance-rates';
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
    level: number; // staff.level; the position level row is looked up by it
    employmentStatus: 'probation' | 'official' | null; // staff.contract_status; any other value reads as null
    nightAllowancePct?: number;
    isDormResident?: boolean;
    allowanceRates: AllowanceRates | null; // % of the position version in force; null = no version for the month
    remainingAnnualLeaveDays: number | null; // null = the type keeps no leave account
    contractTerm: ContractTerm; // resolved from staff.contract and the employee type
    insured: boolean; // resolved from the contract term and staff.insured
    dependants: number;
    kpiCap: KpiCap;
  };
  // The day rows are not here: the payslip reads them from AttendanceDaysService (spec 8.1).
  requests: Array<{
    id: string;
    type: string;
    status: string;
    explanationDate?: string | null;
    actualCheckIn?: string | null; // explained check-in 'HH:MM'
    actualCheckOut?: string | null;
    leaveStartDate?: string | null;
    leaveEndDate?: string | null;
    leaveType?: string | null;
    otDate?: string | null;
    otStartTime?: string | null; // approved OT window 'HH:MM'
    otEndTime?: string | null;
    otHours?: number | null;
    advanceAmount?: number | bigint | null;
    advancePeriod?: string | null;
  }>;
  holidayDates?: string[]; // company holidays of the month, 'YYYY-MM-DD' (the holiday OT rate)
  kpi: KpiInput | null;
}

// Raw rows of one employee-month as the database returns them (numbers may still be strings).
export interface MonthRows {
  staff: any;
  type: any | null;
  level: any | null;
  benefits: any[];
  requests: any[];
  holidays?: Array<string | Date>;
  annualLeaveUsed?: number | string; // approved annual leave days in day_status since the balance date, up to the month end
  kpi: any | null;
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

// The explained times are TEXT columns ('08:00' or '08:00:00'); keep 'HH:MM', null when empty.
function clockTextOrNull(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().slice(0, 5) : '';
  return text === '' ? null : text;
}

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// KPI pay applies when the type's 'kpi' benefit is on and the level defines a kpi_max; kpiMax is null only when
// the level has none, so an applicable cap always carries a kpiMax.
export function resolveKpiCap(level: any | null, benefits: any[]): KpiCap {
  const kpiMax = numberOrNull(level?.kpi_max);
  const enabled = benefits.some(b => b.benefit === 'kpi' && Number(b.enabled) === 1);
  return { applicable: enabled && kpiMax !== null, kpiMax };
}

export function mapMonthRows(month: string, rows: MonthRows): EmployeeMonthlyRawData {
  const { staff: staffRow, type: typeRow, level: levelRow, benefits, kpi: kpiRow } = rows;

  const baseSalary = numberOrNull(levelRow?.base_salary);
  const kpiCap = resolveKpiCap(levelRow, benefits);
  const contractTerm = resolveContractTerm(staffRow.contract, staffRow.type);
  const hasLeaveAccount = benefits.some(b => b.benefit === 'leaveAccount' && Number(b.enabled) === 1);

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
      level: Number(staffRow.level ?? 1),
      employmentStatus:
        staffRow.contract_status === 'probation' || staffRow.contract_status === 'official'
          ? staffRow.contract_status
          : null,
      nightAllowancePct: Number(staffRow.shift_allowance_pct ?? 30),
      isDormResident: Number(staffRow.idorm ?? 0) === 1,
      // Không có loại thì vẫn đọc phiên bản NV để lấy ngày công (positionInEffect), nhưng không trả phụ cấp như trước.
      allowanceRates: typeRow && staffRow.type
        ? {
            flexPct: Number(typeRow.flex_pct),
            typeNightPct: Number(typeRow.night_pct),
            levelNightPct: numberOrNull(levelRow?.night_pct),
            travelPct: Number(typeRow.travel_pct),
            attendancePct: Number(typeRow.attendance_pct)
          }
        : null,
      remainingAnnualLeaveDays: hasLeaveAccount
        ? Number(staffRow.leave_balance ?? 0) - Number(rows.annualLeaveUsed ?? 0)
        : null,
      contractTerm,
      insured: isInsured(contractTerm, numberOrNull(staffRow.insured)),
      dependants: Math.max(0, Math.floor(Number(staffRow.dependants) || 0)),
      kpiCap
    },
    requests: rows.requests.map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      explanationDate: dateTextOrNull(r.explanation_date),
      actualCheckIn: clockTextOrNull(r.actual_check_in),
      actualCheckOut: clockTextOrNull(r.actual_check_out),
      leaveStartDate: dateTextOrNull(r.leave_start_date),
      leaveEndDate: dateTextOrNull(r.leave_end_date),
      leaveType: r.leave_type,
      otDate: dateTextOrNull(r.ot_date),
      otStartTime: clockTextOrNull(r.ot_start_time),
      otEndTime: clockTextOrNull(r.ot_end_time),
      otHours: numberOrNull(r.ot_hours),
      advanceAmount: numberOrNull(r.advance_amount),
      advancePeriod: r.advance_period
    })),
    holidayDates: (rows.holidays ?? []).map(dateText),
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
      : null
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
  // The Admin's decision: the reason typed with it, who decided and when (ISO time); null while undecided.
  note: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
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

/** A run just stored: what `beforeCommit` gets to write the audit row in the run's own transaction. */
export interface SavedRun {
  id: number;
  runNo: number;
  previousRunNo: number | null; // the month's highest run number before this one; null for the first run
  slips: number; // payslips in the run, carried ones included
}

/** The stored KPI of a person and month (points x 100, kpi_proposed in đồng); null columns are not entered yet. */
export type KpiScoreRow = Required<KpiScorePatch>;

const ENGINE_VERSION = 'v2-rules-2026-11';

/** The settings a run was computed with: the month's snapshot and the id of the last settings change it reflects. */
export interface RunSettings {
  snapshot: SettingsSnapshot;
  rev: number;
}

/** params_json is the snapshot as JSON and params_hash its sha256 (hex); a run without settings stores '{}' at rev 0. */
function runParams(settings?: RunSettings | null): { params_hash: string; params_rev: number; params_json: string } {
  const json = settings ? JSON.stringify(settings.snapshot) : '{}';
  return {
    params_hash: createHash('sha256').update(json).digest('hex'),
    params_rev: settings?.rev ?? 0,
    params_json: json
  };
}

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
    details: JSON.parse(gunzipSync(row.snapshot_gz).toString('utf8')),
    note: row.note ?? null,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null
  };
}

@Injectable()
export class PayrollRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /**
   * Người thuộc bảng lương. Có `month` thì chỉ lấy người có làm trong tháng đó: chưa vào làm sau cuối tháng hoặc đã nghỉ việc
   * trước đầu tháng thì không có phiếu (cùng luật `activeIn` của Tổng quan). Ngày thiếu hay không đúng dạng YYYY-MM-DD thì không giới hạn.
   */
  async listEligibleEmployees(month?: string): Promise<Array<{ uuid: string; username: string; name: string }>> {
    if (!this.qb) return [];
    const rows = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'username', 'name', 'start_date', 'resigned_on'])
      .where('locked_at', 'is', null)
      .where(eb =>
        eb.or([
          eb('payroll_subject', '=', 1),
          eb.and([eb('payroll_subject', 'is', null), eb('role', '<>', 'admin')])
        ])
      )
      .execute();

    return rows
      .filter(r => {
        return !month || employedInMonth({ startDate: r.start_date, resignedOn: r.resigned_on }, month);
      })
      .map(r => ({
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

    // The day rows (timesheet_entries, iSAT included) are read by the service through AttendanceDaysService.
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

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

    // Company holidays in the month (the DATE column is converted to text in mapMonthRows)
    const holidayRows = await this.qb
      .selectFrom('company_holidays')
      .select('holiday_date')
      .where('holiday_date', '>=', startDate)
      .where('holiday_date', '<=', endDate)
      .execute();

    // Approved annual leave days taken since the balance date, up to the month end
    let usedQuery = this.qb
      .selectFrom('day_status')
      .innerJoin('system_requests', 'system_requests.id', 'day_status.request_id')
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('day_status.employee_id', '=', staffRow.uuid || employeeId)
      .where('day_status.status', '=', 'LEAVE')
      .where('system_requests.type', '=', 'LEAVE')
      .where('system_requests.leave_type', '=', 'ANNUAL')
      .where('system_requests.status', '=', 'APPROVED')
      .where('day_status.work_date', '<=', endDate);
    if (staffRow.leave_balance_on) usedQuery = usedQuery.where('day_status.work_date', '>=', staffRow.leave_balance_on);
    const annualLeaveUsed = await usedQuery.executeTakeFirst();

    // KPI scores
    const kpiRow = await this.qb
      .selectFrom('kpi_scores')
      .selectAll()
      .where('username', '=', staffRow.username)
      .where('month', '=', month)
      .executeTakeFirst();

    return mapMonthRows(month, {
      staff: staffRow,
      type: typeRow ?? null,
      level: levelRow ?? null,
      benefits,
      requests: requestRows,
      holidays: holidayRows.map(r => r.holiday_date),
      annualLeaveUsed: annualLeaveUsed?.n ?? 0,
      kpi: kpiRow ?? null
    });
  }

  // The payslips of the month's current draft run that a partial run keeps: everyone except the people it recalculated
  // (exceptUsernames) and every target of the call (exceptEmployeeIds, uuid or username), so a target that failed
  // does not keep its old payslip.
  // Lần chạy nháp trước bị khoá FOR NO KEY UPDATE (đúng mức khoá mà câu 'superseded' sau đó vẫn lấy, chỉ lấy sớm hơn)
  // trước khi đọc phiếu để chép: một giao dịch duyệt đơn đang giữ lần chạy đó FOR SHARE (đã đưa phiếu về nháp, chưa
  // commit, xem resetDecision) thì câu này đợi nó xong; các câu sau đọc dữ liệu đã commit mới nhất, nên phiếu được chép
  // là phiếu đã về nháp, không phải bản đã duyệt cũ.
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
      .forNoKeyUpdate()
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
  // `settings` is what the run was computed with (see runParams). `beforeCommit` runs last in the run's transaction
  // (the audit row): when it throws, the run is not stored.
  async savePayrollRunAndSlips(
    month: string,
    actor: string,
    payslips: EmployeePayslip[],
    errorCount = 0,
    carryForward?: CarryForward,
    settings?: RunSettings | null,
    beforeCommit?: (trx: Transaction<DB>, run: SavedRun) => Promise<void>
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
      const previousRunNo = Number(latest?.max_run_no ?? 0);
      const runNo = previousRunNo + 1;

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
          ...runParams(settings),
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

      const saved: SavedRun = {
        id: Number(run.id),
        runNo,
        previousRunNo: previousRunNo > 0 ? previousRunNo : null,
        slips: payslips.length + carried.length
      };
      if (beforeCommit) await beforeCommit(trx, saved);
      return saved.id;
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
  // Trả phiếu sau khi ghi, null khi tháng chưa có lần chạy hoặc người đó không có phiếu. Có `trx` thì chạy trên đó.
  async decidePayslip(
    month: string,
    username: string,
    status: 'approved' | 'rejected',
    actor: string,
    note?: string | null,
    trx?: Transaction<DB>
  ): Promise<PayslipRecord | null> {
    const q = trx ?? this.qb;
    const run = await q
      .selectFrom('payroll_runs')
      .select(['id', 'status'])
      .where('month', '=', month)
      .where('status', '<>', 'superseded')
      .orderBy('run_no', 'desc')
      .executeTakeFirst();
    if (!run) return null;
    if (run.status === 'final') throw new PayrollFinalizedError('Kỳ lương đã chốt, không duyệt lại được phiếu');

    const row = await q
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

  // Quyết định đang có trên phiếu của người đó trong lần chạy hiện tại (để ghi nhật ký `before`), khoá dòng phiếu tới
  // hết `trx`; null khi tháng chưa có lần chạy hoặc người đó không có phiếu.
  async decisionOf(
    trx: Transaction<DB>,
    month: string,
    username: string
  ): Promise<{ status: string; note: string | null } | null> {
    const row = await trx
      .selectFrom('payslips as p')
      .innerJoin('payroll_runs as r', 'r.id', 'p.run_id')
      .select(['p.status', 'p.note'])
      .where('r.month', '=', month)
      .where('r.status', '<>', 'superseded')
      .where('p.username', '=', username)
      .orderBy('r.run_no', 'desc')
      .limit(1)
      .forUpdate('p')
      .executeTakeFirst();
    return row ? { status: row.status, note: row.note ?? null } : null;
  }

  // Đưa phiếu của người đó (uuid hoặc username) trong lần chạy nháp mới nhất về 'draft', xoá quyết định. Phiếu đã ở
  // 'draft' (hay 'error', trigger không cho đổi) thì không ghi gì, rev giữ nguyên. Trả true khi có phiếu được đưa về;
  // false khi không có lần chạy nháp, không có phiếu, hoặc phiếu đã ở nháp.
  // Có `trx` (giao dịch duyệt đơn, đang giữ khoá chia sẻ `period:<tháng>`) thì mọi câu chạy trên `trx`, và lần chạy
  // nháp được giữ FOR SHARE tới hết giao dịch: lần lưu của một lần tính lương (savePayrollRunAndSlips) phải đợi giao
  // dịch này xong mới thay được lần chạy đó, nên câu sửa phiếu không vấp trigger payslips_frozen_update, và phiếu được
  // chép sang lần chạy mới là phiếu đã về nháp.
  async resetDecision(month: string, employeeId: string, trx?: Transaction<DB>): Promise<boolean> {
    const q = trx ?? this.qb;
    const runId = trx ? await this.holdDraftRun(trx, month) : await this.newestDraftRunId(q, month);
    if (runId === null) return false;
    const staff = await q
      .selectFrom('staff')
      .select('username')
      .where(eb => eb.or([eb('uuid', '=', employeeId), eb('username', '=', employeeId)]))
      .executeTakeFirst();
    if (!staff) return false;

    const row = await q
      .updateTable('payslips')
      .set(eb => ({ status: 'draft', decided_by: null, decided_at: null, note: null, rev: eb('rev', '+', 1) }))
      .where('run_id', '=', runId)
      .where('username', '=', staff.username)
      .where('status', 'not in', ['draft', 'error'])
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  }

  private async newestDraftRunId(q: Kysely<DB>, month: string): Promise<number | null> {
    const run = await q
      .selectFrom('payroll_runs')
      .select('id')
      .where('month', '=', month)
      .where('status', '=', 'draft')
      .orderBy('run_no', 'desc')
      .executeTakeFirst();
    return run ? Number(run.id) : null;
  }

  // Lần chạy nháp mới nhất của tháng, khoá FOR SHARE trên `trx`. Đang chờ khoá mà một lần tính lương vừa thay lần chạy
  // đó (đã 'superseded') thì câu khoá không trả dòng nào; đọc lại lần nháp mới (READ COMMITTED: mỗi câu thấy dữ liệu đã
  // commit mới nhất) rồi khoá lại. Mỗi lần thử hụt cần một lần tính lương commit xen vào (tính lương xếp hàng theo khoá
  // `payroll_<tháng>`), nên ba lần là đủ; hụt cả ba thì coi như không có lần chạy nháp.
  private async holdDraftRun(trx: Transaction<DB>, month: string): Promise<number | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const newest = await this.newestDraftRunId(trx, month);
      if (newest === null) return null;
      const held = await trx
        .selectFrom('payroll_runs')
        .select('id')
        .where('id', '=', newest)
        .where('status', '=', 'draft')
        .forShare()
        .executeTakeFirst();
      if (held) return Number(held.id);
    }
    return null;
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

  // KPI đã lưu của người đó trong tháng, khoá dòng tới hết `trx`; null khi chưa có dòng.
  async kpiScoreOf(trx: Transaction<DB>, username: string, month: string): Promise<KpiScoreRow | null> {
    const row = await trx
      .selectFrom('kpi_scores')
      .select(['wework', 'user_score', 'peer', 'manager', 'self_score', 'kpi_proposed'])
      .where('username', '=', username)
      .where('month', '=', month)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      wework: num(row.wework),
      user_score: num(row.user_score),
      peer: num(row.peer),
      manager: num(row.manager),
      self_score: num(row.self_score),
      kpi_proposed: num(row.kpi_proposed)
    };
  }

  async saveKpiScore(
    username: string,
    month: string,
    patch: KpiScorePatch,
    actor: string,
    trx?: Transaction<DB>
  ): Promise<void> {
    const now = new Date().toISOString();
    await (trx ?? this.qb)
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
