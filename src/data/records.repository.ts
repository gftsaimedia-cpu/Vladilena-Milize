import { Insertable, Kysely, Selectable, sql } from 'kysely';
import { flavorOf, SqlFlavor } from './flavor';
import type { Schema } from './schema.generated';
import type { LegacySchema } from './legacy-schema';

const count = sql<number>`COUNT(*)`.as('n');

/* ---------- Nhân sự và vai trò ---------- */

export type StaffRow = Selectable<Schema['staff']>;
export type StaffRoleRow = Selectable<Schema['staff_roles']>;

/** Bảng `staff_roles`: vai trò gán cho tài khoản (thu hồi bằng revoked_at, không xoá). */
export class StaffRolesRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  activeRow(username: string, role: string): Promise<StaffRoleRow | undefined> {
    return this.qb.selectFrom('staff_roles').selectAll().where('username', '=', username).where('role', '=', role).where('revoked_at', 'is', null).executeTakeFirst();
  }

  async insert(username: string, role: string, grantedBy: string, grantedAt: string): Promise<number> {
    const result = await this.qb.insertInto('staff_roles').values({ username, role, granted_by: grantedBy, granted_at: grantedAt }).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  find(id: number): Promise<StaffRoleRow | undefined> {
    return this.qb.selectFrom('staff_roles').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Số dòng thu hồi được (0 = không có vai trò còn hiệu lực). */
  async revoke(username: string, role: string, at: string): Promise<number> {
    const result = await this.qb
      .updateTable('staff_roles')
      .set({ revoked_at: at })
      .where('username', '=', username)
      .where('role', '=', role)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async activeRoles(username: string): Promise<string[]> {
    const rows = await this.qb.selectFrom('staff_roles').select('role').where('username', '=', username).where('revoked_at', 'is', null).orderBy('role').execute();
    return rows.map(r => r.role);
  }

  list(filter: { username?: string; role?: string; includeRevoked?: boolean }): Promise<StaffRoleRow[]> {
    let query = this.qb.selectFrom('staff_roles').selectAll();
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.role) query = query.where('role', '=', filter.role);
    if (!filter.includeRevoked) query = query.where('revoked_at', 'is', null);
    return query.orderBy('username').orderBy('role').orderBy('id').execute();
  }

  /** Số tài khoản chưa khoá đang có vai trò (theo dòng staff_roles). */
  async countAssigned(role: string): Promise<number> {
    const row = await this.qb
      .selectFrom('staff_roles as r')
      .innerJoin('staff as s', 's.username', 'r.username')
      .select(sql<number>`COUNT(DISTINCT r.username)`.as('n'))
      .where('r.role', '=', role)
      .where('r.revoked_at', 'is', null)
      .where('s.locked_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  /** Số tài khoản chưa khoá là admin: staff.role = 'admin' hoặc có dòng vai trò admin còn hiệu lực. */
  async countAdmins(): Promise<number> {
    const row = await this.qb
      .selectFrom('staff as s')
      .select(count)
      .where('s.locked_at', 'is', null)
      .where(eb =>
        eb.or([
          eb('s.role', '=', 'admin'),
          eb.exists(
            eb
              .selectFrom('staff_roles as r')
              .select(sql`1`.as('one'))
              .whereRef('r.username', '=', 's.username')
              .where('r.role', '=', 'admin')
              .where('r.revoked_at', 'is', null)
          )
        ])
      )
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }
}

/** Bảng `staff`: tài khoản và hồ sơ nhân sự. Việc dựng đối tượng nhân sự (rowToStaff) nằm ở src/platform/db.ts. */
export class StaffRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  all(): Promise<StaffRow[]> {
    return this.qb.selectFrom('staff').selectAll().orderBy('role').orderBy('type').orderBy('name').execute();
  }

  find(username: string): Promise<StaffRow | undefined> {
    return this.qb.selectFrom('staff').selectAll().where('username', '=', username).executeTakeFirst();
  }

  findByUuid(uuid: string): Promise<StaffRow | undefined> {
    return this.qb.selectFrom('staff').selectAll().where('uuid', '=', uuid).executeTakeFirst();
  }

  uuidOf(username: string): Promise<{ uuid: string | null } | undefined> {
    return this.qb.selectFrom('staff').select('uuid').where('username', '=', username).executeTakeFirst();
  }

  async exists(username: string): Promise<boolean> {
    return !!(await this.qb.selectFrom('staff').select('username').where('username', '=', username).executeTakeFirst());
  }

  /** Tài khoản chưa khai đóng bảo hiểm (insured NULL: theo mặc định của hợp đồng). */
  async usernamesWithUnsetInsured(): Promise<string[]> {
    const rows = await this.qb.selectFrom('staff').select('username').where('insured', 'is', null).execute();
    return rows.map(r => r.username);
  }

  async setShift(_username: string, _shiftCode: string | null): Promise<void> {}

  roleAndLock(username: string): Promise<{ role: string; locked_at: string | null } | undefined> {
    return this.qb.selectFrom('staff').select(['role', 'locked_at']).where('username', '=', username).executeTakeFirst();
  }

  async sessionVersion(username: string): Promise<number | null> {
    const row = await this.qb.selectFrom('staff').select('session_version').where('username', '=', username).executeTakeFirst();
    return row ? Number(row.session_version) : null;
  }

  /** Ca cố định theo mã hoặc theo mã preset cũ. */
  shiftByCodeOrPreset(code: string): Promise<{ code: string } | undefined> {
    return this.qb
      .selectFrom('work_shifts')
      .select('code')
      .where(eb => eb.or([eb('code', '=', code), eb('preset', '=', code)]))
      .executeTakeFirst();
  }

  /**
   * Thêm hoặc cập nhật theo username. Dòng đã có giữ uuid, created_at; `payrollSubjectOverride` (null = giữ), `keepContractStatus`
   * và `keepResignedOn` = giữ giá trị đang lưu thay vì ghi đè.
   */
  async upsert(
    row: Insertable<Schema['staff']>,
    options: { payrollSubjectOverride: number | null; keepContractStatus: boolean; keepResignedOn: boolean },
    { insertOnly = false }: { insertOnly?: boolean } = {}
  ): Promise<boolean> {
    if (insertOnly) {
      const inserted = await this.qb
        .insertInto('staff')
        .values(row)
        .onConflict(oc => oc.column('username').doNothing())
        .returning('username')
        .executeTakeFirst();
      return !!inserted;
    }
    await this.qb
      .insertInto('staff')
      .values(row)
      .onConflict(oc =>
        oc.column('username').doUpdateSet(eb => ({
          name: eb.ref('excluded.name'),
          role: eb.ref('excluded.role'),
          type: eb.ref('excluded.type'),
          level: eb.ref('excluded.level'),
          idorm: eb.ref('excluded.idorm'),
          pass_hash: eb.ref('excluded.pass_hash'),
          start_date: eb.ref('excluded.start_date'),
          birthday: eb.ref('excluded.birthday'),
          contract: eb.ref('excluded.contract'),
          insured: eb.ref('excluded.insured'),
          dependants: eb.ref('excluded.dependants'),
          tax_on: eb.ref('excluded.tax_on'),
          deduct_on: eb.ref('excluded.deduct_on'),
          advance_on: eb.ref('excluded.advance_on'),
          job_title: eb.ref('excluded.job_title'),
          payroll_subject: sql<number | null>`COALESCE(${options.payrollSubjectOverride}, staff.payroll_subject)`,
          family_name: eb.ref('excluded.family_name'),
          given_name: eb.ref('excluded.given_name'),
          contract_status: sql<string | null>`CASE WHEN ${options.keepContractStatus ? 1 : 0} THEN staff.contract_status ELSE excluded.contract_status END`,
          resigned_on: sql<string | null>`CASE WHEN ${options.keepResignedOn ? 1 : 0} THEN staff.resigned_on ELSE excluded.resigned_on END`
        }))
      )
      .execute();
    return true;
  }

  async setPassword(username: string, passHash: string): Promise<void> {
    await this.qb.updateTable('staff').set({ pass_hash: passHash }).where('username', '=', username).execute();
  }

  /** Khoá tài khoản chưa khoá và làm phiên cũ hết hiệu lực; trả true nếu có đổi. */
  async lock(username: string, by: string | null, at: string): Promise<boolean> {
    const result = await this.qb
      .updateTable('staff')
      .set({ locked_at: at, locked_by: by, session_version: sql<number>`session_version + 1` })
      .where('username', '=', username)
      .where('locked_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async unlock(username: string): Promise<boolean> {
    const result = await this.qb
      .updateTable('staff')
      .set({ locked_at: null, locked_by: null })
      .where('username', '=', username)
      .where('locked_at', 'is not', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /** Tăng số phiên bản phiên đăng nhập; trả số mới, null nếu không có tài khoản. */
  async bumpSessionVersion(username: string): Promise<number | null> {
    const row = await this.qb
      .updateTable('staff')
      .set({ session_version: sql<number>`session_version + 1` })
      .where('username', '=', username)
      .returning('session_version')
      .executeTakeFirst();
    return row ? Number(row.session_version) : null;
  }

  payrollSubjectRow(username: string): Promise<{ role: string; payroll_subject: number | null } | undefined> {
    return this.qb.selectFrom('staff').select(['role', 'payroll_subject']).where('username', '=', username).executeTakeFirst();
  }

  async setPayrollSubject(username: string, value: boolean): Promise<boolean> {
    const result = await this.qb.updateTable('staff').set({ payroll_subject: value ? 1 : 0 }).where('username', '=', username).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}

/* ---------- Chấm công: lượt bấm, điều chỉnh giờ, bảng công ---------- */

export type CorrectionRow = Selectable<LegacySchema['corrections']>;
export type TimesheetRow = Selectable<LegacySchema['timesheets']>;

export interface CorrectionFilter {
  username?: string;
  status?: string;
  /** 'YYYY-MM': ngày bắt đầu bằng tháng này */
  month?: string;
  sessionId?: number | null;
}

/** Bảng `punches`: từng lượt bấm Check-in/Check-out. */
export class PunchesRepository {
  constructor(private readonly qb: Kysely<LegacySchema>) {}

  async insert(row: Insertable<LegacySchema['punches']>): Promise<void> {
    await this.qb.insertInto('punches').values(row).execute();
  }
}

/** Bảng `corrections`: yêu cầu điều chỉnh giờ (chỉ còn được đọc ở API; công cụ dữ liệu demo và test dựng dòng lịch sử). */
export class CorrectionsRepository {
  private readonly flavor: SqlFlavor;

  constructor(private readonly qb: Kysely<LegacySchema>) {
    this.flavor = flavorOf(qb as any);
  }

  /** Yêu cầu đang chờ của cùng lượt (hoặc cùng ngày khi không có lượt) chuyển sang 'replaced'. */
  async replacePending(target: { sessionId: number } | { username: string; date: string }): Promise<void> {
    let query = this.qb.updateTable('corrections').set({ status: 'replaced' }).where('status', '=', 'pending');
    query = 'sessionId' in target ? query.where('session_id', '=', target.sessionId) : query.where('username', '=', target.username).where('date', '=', target.date).where('session_id', 'is', null);
    await query.execute();
  }

  async insert(row: Insertable<LegacySchema['corrections']>): Promise<number> {
    const result = await this.qb.insertInto('corrections').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  find(id: number): Promise<CorrectionRow | undefined> {
    return this.qb.selectFrom('corrections').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Yêu cầu của các phiên `sessionIds`, id giảm dần. */
  ofSessions(sessionIds: number[]): Promise<CorrectionRow[]> {
    return this.qb.selectFrom('corrections').selectAll().where('session_id', 'in', sessionIds).orderBy('id', 'desc').execute();
  }

  list(filter: CorrectionFilter, page?: { limit: number; offset: number }): Promise<CorrectionRow[]> {
    let query = this.qb.selectFrom('corrections').selectAll();
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.status) query = query.where('status', '=', filter.status);
    if (filter.month) query = query.where('date', this.flavor.like, `${filter.month}-%`);
    if (filter.sessionId !== undefined && filter.sessionId !== null) query = query.where('session_id', '=', filter.sessionId);
    query = query.orderBy('id', 'desc');
    if (page) query = query.limit(page.limit).offset(page.offset);
    return query.execute();
  }

  /** Quyết định: giờ/ngày mới chỉ thay khi có giá trị (COALESCE). */
  async decide(
    id: number,
    d: { status: string; by: string; at: string; note: string | null; reqIn: string | null; reqOut: string | null; date: string | null }
  ): Promise<void> {
    await this.qb
      .updateTable('corrections')
      .set({
        status: d.status,
        decided_by: d.by,
        decided_at: d.at,
        note: d.note,
        req_in: sql<string>`COALESCE(${d.reqIn}, req_in)`,
        req_out: sql<string>`COALESCE(${d.reqOut}, req_out)`,
        date: sql<string>`COALESCE(${d.date}, date)`
      })
      .where('id', '=', id)
      .execute();
  }
}

/** Bảng `timesheets`: bảng công của một người trong một tháng (ngày, KPI tự chấm và KPI được duyệt). */
export class TimesheetsRepository {
  constructor(private readonly qb: Kysely<LegacySchema>) {}

  find(username: string, month: string): Promise<TimesheetRow | undefined> {
    return this.qb.selectFrom('timesheets').selectAll().where('username', '=', username).where('month', '=', month).executeTakeFirst();
  }

  listOf(username: string): Promise<Pick<TimesheetRow, 'month' | 'days_json'>[]> {
    return this.qb.selectFrom('timesheets').select(['month', 'days_json']).where('username', '=', username).execute();
  }

  /** Lưu ngày công và KPI tự chấm; dòng đã có thì rev + 1. */
  async upsertSheet(username: string, month: string, daysJson: string, kpiPct: number | null, kpiAmt: number | null, at: string): Promise<void> {
    await this.qb
      .insertInto('timesheets')
      .values({ username, month, days_json: daysJson, kpi_pct: kpiPct, kpi_amt: kpiAmt, updated_at: at, rev: 1 })
      .onConflict(oc =>
        oc.columns(['username', 'month']).doUpdateSet(eb => ({
          days_json: eb.ref('excluded.days_json'),
          kpi_pct: eb.ref('excluded.kpi_pct'),
          kpi_amt: eb.ref('excluded.kpi_amt'),
          updated_at: eb.ref('excluded.updated_at'),
          rev: sql<number>`timesheets.rev + 1`
        }))
      )
      .execute();
  }

  /** Ghi KPI được duyệt (phần trăm và số tiền); không đụng ngày công. */
  async upsertKpiApproval(username: string, month: string, pct: number | null, amt: number | null, at: string): Promise<void> {
    await this.qb
      .insertInto('timesheets')
      .values({ username, month, days_json: '{}', kpi_adm_pct: pct, kpi_adm_amt: amt, updated_at: at })
      .onConflict(oc =>
        oc.columns(['username', 'month']).doUpdateSet(eb => ({
          kpi_adm_pct: eb.ref('excluded.kpi_adm_pct'),
          kpi_adm_amt: eb.ref('excluded.kpi_adm_amt'),
          updated_at: eb.ref('excluded.updated_at')
        }))
      )
      .execute();
  }

  /** Ghi riêng mức KPI được duyệt (đồng), không đụng phần trăm. */
  async upsertKpiAdmAmt(username: string, month: string, amt: number | null, at: string): Promise<void> {
    await this.qb
      .insertInto('timesheets')
      .values({ username, month, days_json: '{}', kpi_adm_amt: amt, updated_at: at })
      .onConflict(oc => oc.columns(['username', 'month']).doUpdateSet(eb => ({ kpi_adm_amt: eb.ref('excluded.kpi_adm_amt'), updated_at: eb.ref('excluded.updated_at') })))
      .execute();
  }
}

/* ---------- KPI 5 thành phần ---------- */

export type KpiScoresRow = Selectable<Schema['kpi_scores']>;
export type KpiLogRow = Selectable<Schema['kpi_score_log']>;

/** Bảng `kpi_scores` và `kpi_score_log`: điểm KPI 5 thành phần mỗi người mỗi tháng và nhật ký sửa điểm. */
export class KpiScoresRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  find(username: string, month: string): Promise<KpiScoresRow | undefined> {
    return this.qb.selectFrom('kpi_scores').selectAll().where('username', '=', username).where('month', '=', month).executeTakeFirst();
  }

  listMonth(month: string): Promise<KpiScoresRow[]> {
    return this.qb.selectFrom('kpi_scores').selectAll().where('month', '=', month).orderBy('username').execute();
  }

  /** Cập nhật các cột điểm đã đổi (khoá là tên cột thật). */
  async update(username: string, month: string, columns: Record<string, number | null>, by: string, at: string): Promise<void> {
    await this.qb
      .updateTable('kpi_scores')
      .set({ ...columns, updated_by: by, updated_at: at } as any)
      .where('username', '=', username)
      .where('month', '=', month)
      .execute();
  }

  async insert(username: string, month: string, columns: Record<string, number | null>, by: string, at: string): Promise<void> {
    await this.qb
      .insertInto('kpi_scores')
      .values({ username, month, ...columns, created_by: by, created_at: at, updated_by: by, updated_at: at } as any)
      .execute();
  }

  async log(row: Insertable<Schema['kpi_score_log']>): Promise<void> {
    await this.qb.insertInto('kpi_score_log').values(row).execute();
  }

  listLog(filter: { username?: string; month?: string }, limit?: number): Promise<KpiLogRow[]> {
    let query = this.qb.selectFrom('kpi_score_log').selectAll();
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.month) query = query.where('month', '=', filter.month);
    query = query.orderBy('id');
    if (limit !== undefined) query = query.limit(limit);
    return query.execute();
  }
}
