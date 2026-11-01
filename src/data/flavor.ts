import { Kysely, RawBuilder, sql } from 'kysely';

/**
 * Chỗ DUY NHẤT nơi cú pháp SQLite và PostgreSQL khác nhau trong các repository. Mỗi repository lấy flavor của trình dựng truy vấn
 * (`flavorOf(qb)`) và dùng các hàm dưới đây thay vì viết `json_extract` / `LIKE` / `IS NOT` thẳng.
 */
export interface SqlFlavor {
  readonly name: 'sqlite' | 'postgres';
  /** Giá trị chuỗi tại `path` ('a.b') trong cột JSON dạng văn bản. */
  jsonText(column: string, path: string): RawBuilder<string | null>;
  /** Toán tử LIKE không phân biệt hoa thường với ASCII (SQLite LIKE vốn vậy, PostgreSQL phải ILIKE). */
  readonly like: 'like' | 'ilike';
  /** `column` khác `value`, coi NULL là một giá trị (SQLite `IS NOT`, PostgreSQL `IS DISTINCT FROM`). */
  differs(column: string, value: string | number | null): RawBuilder<boolean>;
}

const sqlite: SqlFlavor = {
  name: 'sqlite',
  like: 'like',
  jsonText: (column, path) => sql<string | null>`json_extract(${sql.ref(column)}, ${sql.lit(`$.${path}`)})`,
  differs: (column, value) => sql<boolean>`${sql.ref(column)} IS NOT ${value}`
};

const postgres: SqlFlavor = {
  name: 'postgres',
  like: 'ilike',
  jsonText: (column, path) => sql<string | null>`(${sql.ref(column)}::jsonb #>> ${sql.lit(`{${path.split('.').join(',')}}`)})`,
  differs: (column, value) => sql<boolean>`${sql.ref(column)} IS DISTINCT FROM ${value}`
};

export const flavors = { sqlite, postgres };

const registry = new WeakMap<object, SqlFlavor>();

/** Gắn flavor cho một trình dựng truy vấn (gọi ở nơi tạo nó). */
export function useFlavor<T extends object>(qb: T, flavor: SqlFlavor): T {
  registry.set(qb, flavor);
  return qb;
}

export function flavorOf(qb: Kysely<any>): SqlFlavor {
  return registry.get(qb) ?? sqlite;
}
