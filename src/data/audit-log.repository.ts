import { Insertable, Kysely, Selectable, sql } from 'kysely';
import type { Schema } from './schema.generated';

/** Điều kiện lọc nhật ký đã chuẩn hoá (src/platform/db.ts `auditFilter` đổi bộ lọc người gọi sang dạng này). */
export interface AuditCriteria {
  /** cột = giá trị (chỉ các cột đây) */
  equals: Partial<Record<'actor' | 'action' | 'subject' | 'subject_uuid' | 'entity_kind' | 'entity_id' | 'month', string>>;
  /** mọi dòng về một người: có uuid, hoặc dòng cũ chưa có uuid ghi theo tài khoản */
  person?: { uuid: string; username: string };
  from?: string;
  to?: string;
  /** chỉ các mức nhạy cảm này; mảng rỗng = không dòng nào */
  sensitivities?: string[];
  afterId?: number;
  beforeId?: number;
}

export type AuditLogRow = Selectable<Schema['audit_log']>;

/** Bảng `audit_log` (nối chuỗi băm): chỉ thêm, đọc theo bộ lọc. Việc băm/nối nằm ở `src/platform/db.ts` (store.audit). */
export class AuditLogRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  private filtered(query: any, c: AuditCriteria) {
    let q = query;
    for (const [column, value] of Object.entries(c.equals)) q = q.where(column, '=', value);
    if (c.person)
      q = q.where((eb: any) =>
        eb.or([eb('subject_uuid', '=', c.person!.uuid), eb.and([eb('subject_uuid', 'is', null), eb('subject', '=', c.person!.username)])])
      );
    if (c.from !== undefined) q = q.where('at', '>=', c.from);
    if (c.to !== undefined) q = q.where('at', '<=', c.to);
    if (c.sensitivities) q = q.where('sensitivity', 'in', c.sensitivities.length ? c.sensitivities : ['']);
    if (c.afterId !== undefined) q = q.where('id', '>', c.afterId);
    if (c.beforeId !== undefined) q = q.where('id', '<', c.beforeId);
    return q;
  }

  /** Dòng cuối của chuỗi (id lớn nhất) hoặc undefined khi bảng rỗng. */
  async last(): Promise<{ id: number; hash: string } | undefined> {
    return this.qb.selectFrom('audit_log').select(['id', 'hash']).orderBy('id', 'desc').limit(1).executeTakeFirst();
  }

  async insert(row: Insertable<Schema['audit_log']>): Promise<void> {
    await this.qb.insertInto('audit_log').values(row).execute();
  }

  async list(criteria: AuditCriteria, order: 'asc' | 'desc', limit: number): Promise<AuditLogRow[]> {
    return this.filtered(this.qb.selectFrom('audit_log').selectAll(), criteria).orderBy('id', order).limit(limit).execute();
  }

  /** Số dòng khớp; có `cap` thì dừng đếm ở cap (trả tối đa cap). */
  async count(criteria: AuditCriteria, cap: number | null): Promise<number> {
    if (cap) {
      const capped = this.filtered(this.qb.selectFrom('audit_log').select(sql`1`.as('one')), criteria).limit(cap).as('capped');
      const row = await this.qb.selectFrom(capped).select(sql<number>`COUNT(*)`.as('total')).executeTakeFirstOrThrow();
      return Number(row.total);
    }
    const row = await this.filtered(this.qb.selectFrom('audit_log').select(sql<number>`COUNT(*)`.as('total')), criteria).executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /** Một trang theo con trỏ id tăng dần (đi lại cả chuỗi để kiểm). */
  async pageAfter(cursor: number, size: number): Promise<AuditLogRow[]> {
    return this.qb.selectFrom('audit_log').selectAll().where('id', '>', cursor).orderBy('id').limit(size).execute();
  }
}
