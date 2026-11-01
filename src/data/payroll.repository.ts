import { Insertable, Kysely, Selectable, sql, Updateable } from 'kysely';
import { flavorOf, SqlFlavor } from './flavor';
import type { Schema } from './schema.generated';

export type PeriodRow = Selectable<Schema['payroll_periods']>;
export type RunRow = Selectable<Schema['payroll_runs']>;
export type PayslipRow = Selectable<Schema['payslips']>;

/** Bảng `payroll_periods`: một dòng mỗi tháng đã từng được chốt/đổi trạng thái (tháng chưa có dòng coi như mở). */
export class PayrollPeriodsRepository {
  private readonly flavor: SqlFlavor;

  constructor(private readonly qb: Kysely<Schema>) {
    this.flavor = flavorOf(qb);
  }

  find(month: string): Promise<PeriodRow | undefined> {
    return this.qb.selectFrom('payroll_periods').selectAll().where('month', '=', month).executeTakeFirst();
  }

  /** Các tháng có dòng, tăng dần; `year` thì chỉ năm đó. */
  list(year?: number): Promise<PeriodRow[]> {
    let query = this.qb.selectFrom('payroll_periods').selectAll();
    if (year) query = query.where('month', this.flavor.like, `${year}-%`);
    return query.orderBy('month').execute();
  }

  /** Tháng nhỏ nhất đã có dòng, hoặc null khi chưa có kỳ nào. */
  async firstMonth(): Promise<string | null> {
    const row = await this.qb.selectFrom('payroll_periods').select(sql<string | null>`MIN(month)`.as('month')).executeTakeFirstOrThrow();
    return row.month ?? null;
  }

  async insertOpen(month: string): Promise<void> {
    await this.qb.insertInto('payroll_periods').values({ month, status: 'open', rev: 0 }).execute();
  }

  /** Ghi các cột đã chọn và tăng rev lên 1. */
  async update(month: string, set: Updateable<Schema['payroll_periods']>): Promise<void> {
    await this.qb
      .updateTable('payroll_periods')
      .set({ ...set, rev: sql<number>`rev + 1` })
      .where('month', '=', month)
      .execute();
  }
}

/** Bảng `payroll_runs`: mỗi lần tính lương của một tháng (run_no tăng dần); trạng thái draft → final | superseded. */
export class PayrollRunsRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  find(id: number): Promise<RunRow | undefined> {
    return this.qb.selectFrom('payroll_runs').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Đổi các lần chạy của tháng đang ở một trong `from` thành 'superseded'. */
  async supersede(month: string, from: string[]): Promise<void> {
    await this.qb.updateTable('payroll_runs').set({ status: 'superseded' }).where('month', '=', month).where('status', 'in', from).execute();
  }

  async nextRunNo(month: string): Promise<number> {
    const row = await this.qb
      .selectFrom('payroll_runs')
      .select(sql<number>`COALESCE(MAX(run_no), 0) + 1`.as('n'))
      .where('month', '=', month)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async insert(row: Insertable<Schema['payroll_runs']>): Promise<number> {
    const result = await this.qb.insertInto('payroll_runs').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  async finish(id: number, total: number, errors: number, at: string): Promise<void> {
    await this.qb.updateTable('payroll_runs').set({ slips_total: total, slips_error: errors, finished_at: at }).where('id', '=', id).execute();
  }

  async markFinal(id: number): Promise<void> {
    await this.qb.updateTable('payroll_runs').set({ status: 'final' }).where('id', '=', id).execute();
  }
}

export interface PayslipFilter {
  status?: string;
  /** loại nhân sự đã chụp trong staff_terms_json */
  type?: string;
  /** đã escape LIKE bằng '\\' (username hoặc tên) */
  like?: string;
  flagged?: boolean;
}

/** Bảng `payslips`: phiếu lương của một người trong một lần chạy (bản chụp nén gzip). */
export class PayslipsRepository {
  private readonly flavor: SqlFlavor;

  constructor(private readonly qb: Kysely<Schema>) {
    this.flavor = flavorOf(qb);
  }

  find(runId: number, username: string): Promise<PayslipRow | undefined> {
    return this.qb.selectFrom('payslips').selectAll().where('run_id', '=', runId).where('username', '=', username).executeTakeFirst();
  }

  /** Phiếu chính thức mới nhất của một người ở một tháng (lần chạy 'final' có run_no lớn nhất). */
  finalOf(username: string, month: string): Promise<PayslipRow | undefined> {
    return this.qb
      .selectFrom('payslips as p')
      .innerJoin('payroll_runs as r', 'r.id', 'p.run_id')
      .selectAll('p')
      .where('p.username', '=', username)
      .where('r.month', '=', month)
      .where('r.status', '=', 'final')
      .orderBy('r.run_no', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  /** Phiếu chưa duyệt của lần chạy (username, status), theo username. */
  unapproved(runId: number): Promise<Pick<PayslipRow, 'username' | 'status'>[]> {
    return this.qb.selectFrom('payslips').select(['username', 'status']).where('run_id', '=', runId).where('status', '!=', 'approved').orderBy('username').execute();
  }

  /** Phiếu chưa duyệt kèm cờ (để ghi lại kết quả AI). */
  unapprovedWithFlags(runId: number): Promise<Pick<PayslipRow, 'id' | 'status' | 'flags_json' | 'username'>[]> {
    return this.qb.selectFrom('payslips').select(['id', 'status', 'flags_json', 'username']).where('run_id', '=', runId).where('status', '!=', 'approved').execute();
  }

  idsOf(runId: number): Promise<Pick<PayslipRow, 'id' | 'username'>[]> {
    return this.qb.selectFrom('payslips').select(['id', 'username']).where('run_id', '=', runId).execute();
  }

  async setOverride(id: number, overrideJson: string): Promise<void> {
    await this.qb.updateTable('payslips').set({ override_json: overrideJson }).where('id', '=', id).execute();
  }

  async insert(row: Insertable<Schema['payslips']>): Promise<number> {
    const result = await this.qb.insertInto('payslips').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  private filtered(query: any, runId: number, f: PayslipFilter) {
    let q = query.where('p.run_id', '=', runId);
    if (f.status) q = q.where('p.status', '=', f.status);
    if (f.type) q = q.where(sql`${this.flavor.jsonText('p.staff_terms_json', 'type')} = ${f.type}`);
    if (f.like) q = q.where(sql`(p.username ${sql.raw(this.flavor.like)} ${f.like} ESCAPE '\\' OR s.name ${sql.raw(this.flavor.like)} ${f.like} ESCAPE '\\')`);
    if (f.flagged === true) q = q.where('p.flags_json', 'is not', null);
    if (f.flagged === false) q = q.where('p.flags_json', 'is', null);
    return q;
  }

  /** Một trang phiếu (không có bản chụp) kèm tên nhân sự; `total` là số dòng khớp bộ lọc. */
  async page(runId: number, filter: PayslipFilter, limit: number, offset: number) {
    const total = await this.filtered(
      this.qb.selectFrom('payslips as p').leftJoin('staff as s', 's.username', 'p.username').select(sql<number>`COUNT(*)`.as('n')),
      runId,
      filter
    ).executeTakeFirstOrThrow();
    const rows = await this.filtered(
      this.qb
        .selectFrom('payslips as p')
        .leftJoin('staff as s', 's.username', 'p.username')
        .select([
          'p.id', 'p.run_id', 'p.username', 's.name', 'p.status', 'p.rev', 'p.error_code', 'p.error_detail', 'p.gross', 'p.insurance',
          'p.tax', 'p.advance', 'p.net', 'p.staff_terms_json', 'p.override_json', 'p.flags_json', 'p.decided_by', 'p.decided_at', 'p.note'
        ]),
      runId,
      filter
    )
      .orderBy('p.username')
      .limit(limit)
      .offset(offset)
      .execute();
    return { total: Number(total.n), rows: rows as any[] };
  }

  /** Số phiếu theo trạng thái. */
  async countByStatus(runId: number): Promise<{ status: string; n: number }[]> {
    const rows = await this.qb.selectFrom('payslips').select(['status', sql<number>`COUNT(*)`.as('n')]).where('run_id', '=', runId).groupBy('status').execute();
    return rows.map(r => ({ status: r.status, n: Number(r.n) }));
  }

  /** Ghi trạng thái và cờ mới của một phiếu, rev + 1. */
  async setStatusFlags(id: number, status: string, flagsJson: string | null): Promise<void> {
    await this.qb.updateTable('payslips').set({ status, flags_json: flagsJson, rev: sql<number>`rev + 1` }).where('id', '=', id).execute();
  }

  /** Duyệt hoặc trả lại một phiếu: trạng thái mới, rev + 1, người và lúc quyết định, ghi chú. */
  async decide(id: number, status: string, by: string, at: string, note: string | null): Promise<void> {
    await this.qb
      .updateTable('payslips')
      .set({ status, rev: sql<number>`rev + 1`, decided_by: by, decided_at: at, note })
      .where('id', '=', id)
      .execute();
  }

  /** Duyệt luôn phiếu của `username` trong lúc duyệt kỳ (xoá ghi chú). */
  async approveWithPeriod(runId: number, username: string, by: string, at: string): Promise<void> {
    await this.qb
      .updateTable('payslips')
      .set({ status: 'approved', rev: sql<number>`rev + 1`, decided_by: by, decided_at: at, note: null })
      .where('run_id', '=', runId)
      .where('username', '=', username)
      .execute();
  }

  /** Ghi lý do loại phiếu lỗi khỏi kỳ. */
  async excludeError(runId: number, username: string, note: string | null, by: string, at: string): Promise<void> {
    await this.qb
      .updateTable('payslips')
      .set({ note, decided_by: by, decided_at: at })
      .where('run_id', '=', runId)
      .where('username', '=', username)
      .where('status', '=', 'error')
      .execute();
  }
}

export type SlipOverrideRow = Selectable<Schema['slip_overrides']>;

/** Bảng `slip_overrides`: số Admin sửa trên phiếu của một người trong một tháng (giữ dòng với values {} khi bỏ sửa để rev không quay về 1). */
export class SlipOverridesRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  find(username: string, month: string): Promise<SlipOverrideRow | undefined> {
    return this.qb.selectFrom('slip_overrides').selectAll().where('username', '=', username).where('month', '=', month).executeTakeFirst();
  }

  /** Thêm (rev 1) hoặc ghi đè và tăng rev. */
  async upsert(username: string, month: string, valuesJson: string, updatedBy: string | null, updatedAt: string, reason: string | null): Promise<void> {
    await this.qb
      .insertInto('slip_overrides')
      .values({ username, month, values_json: valuesJson, updated_by: updatedBy, updated_at: updatedAt, reason, rev: 1 })
      .onConflict(oc =>
        oc.columns(['username', 'month']).doUpdateSet(eb => ({
          values_json: eb.ref('excluded.values_json'),
          updated_by: eb.ref('excluded.updated_by'),
          updated_at: eb.ref('excluded.updated_at'),
          reason: eb.ref('excluded.reason'),
          rev: sql<number>`slip_overrides.rev + 1`
        }))
      )
      .execute();
  }
}
