import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult
} from 'kysely';
import type { DB } from '../../../src/database';

export interface ScriptedQuery {
  sql: string;
  parameters: readonly unknown[];
}

export type ScriptedLogEntry = 'BEGIN' | 'COMMIT' | 'ROLLBACK' | ScriptedQuery;

/**
 * Kysely thật (compiler PostgreSQL) nhưng không có DB: mỗi câu lệnh được ghi vào `log`
 * và trả về các dòng do `respond` dựng sẵn, nên test kiểm tra được SQL và thứ tự giao dịch.
 */
export function createScriptedKysely(
  respond: (query: ScriptedQuery) => Record<string, unknown>[] = () => []
): { db: Kysely<DB>; log: ScriptedLogEntry[] } {
  const log: ScriptedLogEntry[] = [];

  const connection: DatabaseConnection = {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const query = { sql: compiled.sql, parameters: compiled.parameters };
      log.push(query);
      return { rows: respond(query) as R[] };
    },
    async *streamQuery() {
      throw new Error('streamQuery is not supported by the scripted driver');
    }
  };

  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    async beginTransaction() {
      log.push('BEGIN');
    },
    async commitTransaction() {
      log.push('COMMIT');
    },
    async rollbackTransaction() {
      log.push('ROLLBACK');
    },
    async releaseConnection() {},
    async destroy() {}
  };

  const dialect: Dialect = {
    createDriver: () => driver,
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: db => new PostgresIntrospector(db)
  };

  return { db: new Kysely<DB>({ dialect }), log };
}
