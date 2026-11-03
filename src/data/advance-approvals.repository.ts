import { Kysely, sql } from 'kysely';
import type { LegacySchema } from './legacy-schema';

export interface AdvanceApprovalEntry {
  status: string | null;
  rev: number;
  requestedAt: string;
  requestedBy: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
}

/** Các yêu cầu tạm ứng theo từng người; mọi ghi được gọi trong giao dịch đã khoá tháng. */
export class AdvanceApprovalsRepository {
  constructor(private readonly qb: Kysely<LegacySchema>) {}

  /** Phiên bản tháng và các dòng được đọc cùng một snapshot PostgreSQL, theo thứ tự yêu cầu đầu tiên. */
  async read(month: string): Promise<{ rev: number; users: Record<string, AdvanceApprovalEntry> }> {
    const rows = await this.qb
      .selectFrom('advance_approval_months as m')
      .leftJoin('advance_approval_entries as e', 'e.month', 'm.month')
      .select([
        'm.rev as month_rev',
        'e.username',
        'e.status',
        'e.rev as entry_rev',
        'e.requested_at',
        'e.requested_by',
        'e.decided_at',
        'e.decided_by',
        'e.reason'
      ])
      .where('m.month', '=', month)
      .orderBy('e.id')
      .execute();
    const users: Record<string, AdvanceApprovalEntry> = Object.create(null);
    for (const row of rows) {
      if (row.username === null) continue;
      users[row.username] = {
        status: row.status,
        rev: Number(row.entry_rev),
        requestedAt: row.requested_at!.toISOString(),
        requestedBy: row.requested_by!,
        decidedAt: row.decided_at?.toISOString() ?? null,
        decidedBy: row.decided_by,
        reason: row.reason
      };
    }
    return { rev: rows.length ? Number(rows[0].month_rev) : 0, users };
  }

  /** Ghi các dòng đổi và tăng rev tháng một lần. Danh sách rỗng không tạo hay cập nhật dữ liệu. */
  async save(month: string, entries: { username: string; entry: AdvanceApprovalEntry }[]): Promise<void> {
    if (!entries.length) return;
    await this.qb
      .insertInto('advance_approval_months')
      .values({ month, rev: 0 })
      .onConflict(conflict => conflict.column('month').doNothing())
      .execute();
    await this.qb
      .insertInto('advance_approval_entries')
      .values(
        entries.map(({ username, entry }) => ({
          month,
          username,
          status: entry.status,
          rev: entry.rev,
          requested_at: new Date(entry.requestedAt),
          requested_by: entry.requestedBy,
          decided_at: entry.decidedAt === null ? null : new Date(entry.decidedAt),
          decided_by: entry.decidedBy,
          reason: entry.reason
        }))
      )
      .onConflict(conflict =>
        conflict.columns(['month', 'username']).doUpdateSet(eb => ({
          status: eb.ref('excluded.status'),
          rev: eb.ref('excluded.rev'),
          requested_at: eb.ref('excluded.requested_at'),
          requested_by: eb.ref('excluded.requested_by'),
          decided_at: eb.ref('excluded.decided_at'),
          decided_by: eb.ref('excluded.decided_by'),
          reason: eb.ref('excluded.reason')
        }))
      )
      .execute();
    await this.qb
      .updateTable('advance_approval_months')
      .set({ rev: sql<number>`rev + 1` })
      .where('month', '=', month)
      .execute();
  }
}
