import {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult
} from 'kysely';

interface Statement {
  all(...params: unknown[]): unknown[] | Promise<unknown[]>;
  run(...params: unknown[]): { changes?: number | bigint } | Promise<{ changes?: number | bigint }>;
}

/**
 * Kết nối của ứng dụng (PostgresDatabase, src/data/postgres-database.ts). `native(sql)` chạy câu lệnh PostgreSQL nguyên văn
 * (`$1`, `ILIKE`, `RETURNING`...) trên đúng kết nối đang dùng (kết nối của giao dịch đang mở nếu có).
 */
export interface AppDatabase {
  native(sql: string): Statement;
}

const RETURNS_ROWS = /^\s*(select|with)\b|\breturning\b/i;

class AppConnection implements DatabaseConnection {
  constructor(private readonly db: AppDatabase) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.db.native(query.sql);
    if (RETURNS_ROWS.test(query.sql)) return { rows: (await statement.all(...query.parameters)) as R[] };
    const result = await statement.run(...query.parameters);
    return { rows: [], numAffectedRows: BigInt(result.changes ?? 0) };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('Không hỗ trợ streamQuery: dùng execute()/executeTakeFirst()');
  }
}

/**
 * Driver chạy câu lệnh qua đúng kết nối của ứng dụng (kết nối của giao dịch đang mở nếu có), nên một lệnh Kysely nằm trong
 * `store.transaction(...)` thuộc cùng giao dịch. Giao dịch do `store.transaction` quản lý (BEGIN/COMMIT hoặc SAVEPOINT), không mở
 * giao dịch riêng ở đây.
 */
class AppDriver implements Driver {
  constructor(private readonly db: AppDatabase) {}
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new AppConnection(this.db);
  }
  async beginTransaction(): Promise<void> {
    throw new Error('Dùng store.transaction(...) để mở giao dịch, không dùng qb.transaction()');
  }
  async commitTransaction(): Promise<void> {
    throw new Error('Dùng store.transaction(...)');
  }
  async rollbackTransaction(): Promise<void> {
    throw new Error('Dùng store.transaction(...)');
  }
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

/** Biên dịch thẳng ra PostgreSQL (`$1`, nhãn "..."). */
export class AppDialect implements Dialect {
  constructor(private readonly db: AppDatabase) {}
  createAdapter() {
    return new PostgresAdapter();
  }
  createDriver(): Driver {
    return new AppDriver(this.db);
  }
  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db);
  }
  createQueryCompiler() {
    return new PostgresQueryCompiler();
  }
}
