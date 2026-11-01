import {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler
} from 'kysely';

interface Statement {
  all(...params: unknown[]): unknown[] | Promise<unknown[]>;
  run(...params: unknown[]): { changes?: number | bigint; lastInsertRowid?: number | bigint } | Promise<{ changes?: number | bigint; lastInsertRowid?: number | bigint }>;
}

/**
 * Kết nối của ứng dụng: `node:sqlite` DatabaseSync (SQLite) hoặc PostgresDatabase (lib/data/postgres-database.js).
 * Trên PostgreSQL, `native(sql)` chạy câu lệnh PostgreSQL nguyên văn (`$1`, `ILIKE`, ...) không qua bộ dịch SQLite → PostgreSQL.
 */
export interface AppDatabase {
  prepare(sql: string): Statement;
  native?(sql: string): Statement;
}

const RETURNS_ROWS = /^\s*(select|with)\b|\breturning\b/i;

class AppConnection implements DatabaseConnection {
  constructor(private readonly db: AppDatabase) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.db.native ? this.db.native(query.sql) : this.db.prepare(query.sql);
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
 * Driver chạy câu lệnh qua đúng kết nối của ứng dụng (một kết nối SQLite, hoặc kết nối của giao dịch đang mở trên PostgreSQL), nên một lệnh
 * Kysely nằm trong `store.transaction(...)` thuộc cùng giao dịch. Giao dịch do `store.transaction` quản lý (hàng đợi + SAVEPOINT),
 * không mở giao dịch riêng ở đây.
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

/** Biên dịch theo cú pháp của dialect đang chạy: PostgreSQL gốc khi kết nối có `native`, ngược lại SQLite. */
export class AppDialect implements Dialect {
  constructor(private readonly db: AppDatabase) {}
  private get postgres(): boolean {
    return typeof this.db.native === 'function';
  }
  createAdapter() {
    return this.postgres ? new PostgresAdapter() : new SqliteAdapter();
  }
  createDriver(): Driver {
    return new AppDriver(this.db);
  }
  createIntrospector(db: Kysely<any>) {
    return this.postgres ? new PostgresIntrospector(db) : new SqliteIntrospector(db);
  }
  createQueryCompiler() {
    return this.postgres ? new PostgresQueryCompiler() : new SqliteQueryCompiler();
  }
}
