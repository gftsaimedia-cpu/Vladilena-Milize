import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql, type Selectable, type Updateable } from 'kysely';
import { KYSELY_DB, type DB, type DatabaseTransaction } from '../../database';

export type PeriodRow = Selectable<DB['payroll_periods']>;

/** Mọi cột của kỳ lương trừ `month` (khoá) và `rev` (repository tự tăng). */
export type PeriodPatch = Omit<Updateable<DB['payroll_periods']>, 'month' | 'rev'>;

const lockKey = (month: string): string => `period:${month}`;

@Injectable()
export class PeriodsRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<DB>) {}

  /** Dòng kỳ lương của tháng; `null` khi chưa có (tức là 'open'). Có `trx` thì đọc trong giao dịch đó. */
  async find(month: string, trx?: DatabaseTransaction): Promise<PeriodRow | null> {
    const row = await (trx ?? this.db)
      .selectFrom('payroll_periods')
      .selectAll()
      .where('month', '=', month)
      .executeTakeFirst();
    return row ?? null;
  }

  /** Mọi kỳ, tháng mới nhất trước. */
  async list(): Promise<PeriodRow[]> {
    return this.db.selectFrom('payroll_periods').selectAll().orderBy('month', 'desc').execute();
  }

  /** Khoá chia sẻ theo tháng, giữ tới hết giao dịch: nhiều người cùng giữ được, chỉ chặn khoá độc quyền. */
  async lockShared(trx: DatabaseTransaction, month: string): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey(month)}, 0))`.execute(trx);
  }

  /** Khoá độc quyền theo tháng, giữ tới hết giao dịch: chờ mọi khoá chia sẻ nhả, và chặn người lấy khoá sau. */
  async lockExclusive(trx: DatabaseTransaction, month: string): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(month)}, 0))`.execute(trx);
  }

  /**
   * Ghi kỳ lương của tháng. Chưa có dòng: chèn với rev = 1 (khi đó `patch.status` bắt buộc).
   * Có dòng: cập nhật `patch` và tăng rev. Người gọi nên đang giữ `lockExclusive` của tháng.
   */
  async save(trx: DatabaseTransaction, month: string, patch: PeriodPatch): Promise<PeriodRow> {
    const existing = await this.find(month, trx);
    if (!existing) {
      if (patch.status === undefined) {
        throw new Error(`Kỳ lương ${month} chưa có dòng, cần status để tạo`);
      }
      return trx
        .insertInto('payroll_periods')
        .values({ ...patch, status: patch.status, month, rev: 1 })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return trx
      .updateTable('payroll_periods')
      .set({ ...patch, rev: sql<number>`rev + 1` })
      .where('month', '=', month)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
