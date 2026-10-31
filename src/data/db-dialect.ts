import {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  Kysely,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler
} from 'kysely';

/** Kết nối `prepare(sql).all/run` của ứng dụng: `node:sqlite` DatabaseSync hoặc PostgresDatabase (lib/data/postgres-database.js). */
export interface AppDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[] | Promise<unknown[]>;
    run(...params: unknown[]): { changes?: number | bigint; lastInsertRowid?: number | bigint } | Promise<{ changes?: number | bigint; lastInsertRowid?: number | bigint }>;
  };
}

const RETURNS_ROWS = /^\s*(select|with)\b|\breturning\b/i;

class AppConnection implements DatabaseConnection {
  constructor(private readonly db: AppDatabase) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.db.prepare(query.sql);
    if (RETURNS_ROWS.test(query.sql)) return { rows: (await statement.all(...query.parameters)) as R[] };
    const result = await statement.run(...query.parameters);
    return {
      rows: [],
      numAffectedRows: BigInt(result.changes ?? 0),
      insertId: result.lastInsertRowid === undefined || result.lastInsertRowid === null ? undefined : BigInt(result.lastInsertRowid)
    };
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

/**
 * Biên dịch theo cú pháp SQLite (`?`, nhãn "..."), vốn cũng là PostgreSQL hợp lệ; lúc chạy trên PostgreSQL, `PostgresSql`
 * (lib/data/postgres-sql.js) đổi `?` thành `$n` như mọi câu lệnh khác của ứng dụng.
 */
export class AppDialect implements Dialect {
  constructor(private readonly db: AppDatabase) {}
  createAdapter() {
    return new SqliteAdapter();
  }
  createDriver(): Driver {
    return new AppDriver(this.db);
  }
  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db);
  }
  createQueryCompiler() {
    return new SqliteQueryCompiler();
  }
}
