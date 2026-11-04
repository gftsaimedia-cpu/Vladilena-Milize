import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { DB } from './schema';

// Parse int8 (20) and numeric (1700) to JavaScript number
types.setTypeParser(20, (val: string) => (val === null ? null : Number(val)));
types.setTypeParser(1700, (val: string) => (val === null ? null : Number(val)));

export const KYSELY_DB = 'KYSELY_DB';
export const PG_POOL = 'PG_POOL';

export function createPgPool(connectionString?: string): Pool {
  const url = connectionString || process.env.DATABASE_URL || 'postgres://luong:luong_dev_password@localhost:5432/luong_local';
  return new Pool({
    connectionString: url,
    max: 20,
    idleTimeoutMillis: 30000,
  });
}

export function createKysely(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}
