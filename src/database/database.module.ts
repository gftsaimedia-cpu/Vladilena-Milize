import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { Kysely } from 'kysely';
import type { DB } from './schema';
import { KYSELY_DB, PG_POOL, createKysely, createPgPool } from './kysely';
import { TransactionCoordinator } from './transaction';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => createPgPool(),
    },
    {
      provide: KYSELY_DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => createKysely(pool),
    },
    TransactionCoordinator,
  ],
  exports: [KYSELY_DB, PG_POOL, TransactionCoordinator],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private readonly pool?: Pool) {}

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
