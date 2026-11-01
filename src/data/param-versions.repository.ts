import { Insertable, Kysely, Selectable, sql } from 'kysely';
import type { Schema } from './schema.generated';

export type ParamVersionRow = Selectable<Schema['param_versions']>;

/** Bảng `param_versions` (tham số lương theo tháng áp dụng): chỉ thêm dòng (trigger chặn sửa/xoá), nên ở đây chỉ có đọc. */
export class ParamVersionsRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  /** Dòng đang hiệu lực của MỖI khoá cho tháng `month`: effective_month lớn nhất ≤ month, hoà thì id lớn nhất. */
  async resolved(month: string): Promise<ParamVersionRow[]> {
    return this.qb
      .selectFrom('param_versions as p')
      .selectAll('p')
      .where('p.effective_month', '<=', month)
      .where('p.id', '=', eb =>
        eb
          .selectFrom('param_versions as q')
          .select('q.id')
          .whereRef('q.key', '=', 'p.key')
          .where('q.effective_month', '<=', month)
          .orderBy('q.effective_month', 'desc')
          .orderBy('q.id', 'desc')
          .limit(1)
      )
      .orderBy('p.key')
      .execute();
  }

  /** Lịch sử (mới nhất trước), lọc theo khoá và con trỏ `beforeId` (id < N). */
  async history(filter: { key?: string; beforeId?: number }, limit: number): Promise<ParamVersionRow[]> {
    let query = this.qb.selectFrom('param_versions').selectAll();
    if (filter.key !== undefined) query = query.where('key', '=', filter.key);
    if (filter.beforeId !== undefined) query = query.where('id', '<', filter.beforeId);
    return query.orderBy('id', 'desc').limit(limit).execute();
  }

  async count(): Promise<number> {
    const row = await this.qb.selectFrom('param_versions').select(sql<number>`COUNT(*)`.as('total')).executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /** Id lớn nhất (0 khi bảng rỗng). */
  async lastId(): Promise<number> {
    const row = await this.qb.selectFrom('param_versions').select(sql<number>`COALESCE(MAX(id), 0)`.as('id')).executeTakeFirstOrThrow();
    return Number(row.id);
  }

  /** Thêm một dòng; trả id mới. */
  async insert(row: Insertable<Schema['param_versions']>): Promise<number> {
    const result = await this.qb.insertInto('param_versions').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  /** Các dòng có hiệu lực từ đúng tháng `month` (khoá, tháng, lúc tạo), cũ → mới. */
  inMonth(month: string): Promise<Pick<ParamVersionRow, 'key' | 'effective_month' | 'created_at'>[]> {
    return this.qb.selectFrom('param_versions').select(['key', 'effective_month', 'created_at']).where('effective_month', '=', month).orderBy('id').execute();
  }

  async byBatch(batchId: string): Promise<ParamVersionRow[]> {
    return this.qb.selectFrom('param_versions').selectAll().where('batch_id', '=', batchId).orderBy('id').execute();
  }
}
