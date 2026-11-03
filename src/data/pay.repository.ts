import { Insertable, Kysely, Selectable, sql, Updateable } from 'kysely';
import type { Schema } from './schema.generated';
import type { LegacySchema } from './legacy-schema';

export type PayEntryRow = Selectable<Schema['pay_entries']>;
export type AdvanceRequestRow = Selectable<LegacySchema['advance_requests']>;

/** Bảng `pay_entries`: khoản điền thêm về lương (cộng hoặc trừ) theo tháng, qua duyệt. */
export class PayEntriesRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  find(id: number): Promise<PayEntryRow | undefined> {
    return this.qb.selectFrom('pay_entries').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Theo tháng (bắt buộc), tuỳ chọn người và trạng thái; cũ → mới theo id. */
  list(filter: { month: string; username?: string; status?: string }): Promise<PayEntryRow[]> {
    let query = this.qb.selectFrom('pay_entries').selectAll().where('month', '=', filter.month);
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.status) query = query.where('status', '=', filter.status);
    return query.orderBy('id').execute();
  }

  approvedOf(month: string): Promise<PayEntryRow[]> {
    return this.qb.selectFrom('pay_entries').selectAll().where('month', '=', month).where('status', '=', 'approved').orderBy('id').execute();
  }

  /** Thêm một khoản; trả id mới. */
  async insert(row: Insertable<Schema['pay_entries']>): Promise<number> {
    const result = await this.qb.insertInto('pay_entries').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  /** Sửa khoản đang chờ duyệt đúng phiên bản; trả số dòng đổi (1 = được, 0 = đã bị người khác đổi). */
  async updatePending(id: number, rev: number, set: Updateable<Schema['pay_entries']>): Promise<number> {
    const result = await this.qb
      .updateTable('pay_entries')
      .set({ ...set, rev: sql<number>`rev + 1` })
      .where('id', '=', id)
      .where('rev', '=', rev)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** Đổi khoản đúng phiên bản và một trong các trạng thái `from`; rev + 1. Trả số dòng đổi. */
  async update(id: number, rev: number, from: string[], set: Updateable<Schema['pay_entries']>): Promise<number> {
    const result = await this.qb
      .updateTable('pay_entries')
      .set({ ...set, rev: sql<number>`rev + 1` })
      .where('id', '=', id)
      .where('rev', '=', rev)
      .where('status', 'in', from)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
}

/** Bảng `advance_requests`: yêu cầu ứng lương cũ (chỉ còn đọc). */
export class AdvanceRequestsRepository {
  constructor(private readonly qb: Kysely<LegacySchema>) {}

  list(filter: { month: string; username?: string; status?: string }): Promise<AdvanceRequestRow[]> {
    let query = this.qb.selectFrom('advance_requests').selectAll().where('month', '=', filter.month);
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.status) query = query.where('status', '=', filter.status);
    return query.orderBy('id').execute();
  }

  /** Tổng đã duyệt của một người trong một tháng (đồng). */
  async grantedOf(username: string, month: string): Promise<number> {
    const row = await this.qb
      .selectFrom('advance_requests')
      .select(sql<number>`COALESCE(SUM(granted), 0)`.as('total'))
      .where('month', '=', month)
      .where('username', '=', username)
      .where('status', '=', 'approved')
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /** Người có yêu cầu đang chờ (mọi tháng). */
  pendingUsers(): Promise<{ username: string }[]> {
    return this.qb.selectFrom('advance_requests').select('username').where('status', '=', 'pending').execute();
  }

  async pendingCount(month: string): Promise<number> {
    const row = await this.qb
      .selectFrom('advance_requests')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('month', '=', month)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }
}
