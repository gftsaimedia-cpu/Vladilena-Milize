import { Inject, Injectable } from '@nestjs/common';
import { Kysely, Transaction, sql } from 'kysely';
import type { DB } from './schema';
import { KYSELY_DB } from './kysely';

export type DatabaseTransaction = Transaction<DB>;

@Injectable()
export class TransactionCoordinator {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<DB>) {}

  /**
   * Run a callback inside a PostgreSQL transaction managed by Kysely.
   */
  async run<T>(callback: (trx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (trx) => {
      return await callback(trx);
    });
  }

  /**
   * Acquire a PostgreSQL transaction-level advisory lock on the given transaction.
   * The lock is automatically held until the transaction finishes (COMMIT or ROLLBACK).
   */
  async acquireAdvisoryLock(trx: DatabaseTransaction, key: string): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(trx);
  }

  /**
   * Convenience method to run a transaction with an advisory lock held throughout.
   */
  async withLock<T>(key: string, callback: (trx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return await this.run(async (trx) => {
      await this.acquireAdvisoryLock(trx, key);
      return await callback(trx);
    });
  }
}
