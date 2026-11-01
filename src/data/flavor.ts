import { Kysely, RawBuilder, sql } from 'kysely';

/**
 * Các cú pháp PostgreSQL riêng mà repository dùng, gom ở một chỗ (đổi cách viết thì sửa đúng đây): đọc khoá trong cột JSON, so khớp không
 * phân biệt hoa thường, so sánh coi NULL là một giá trị. Mỗi repository lấy `flavorOf(qb)`.
 */
export interface SqlFlavor {
  /** Giá trị chuỗi tại `path` ('a.b') trong cột JSON dạng văn bản. */
  jsonText(column: string, path: string): RawBuilder<string | null>;
  /** Toán tử so khớp mẫu không phân biệt hoa thường với ASCII. */
  readonly like: 'ilike';
  /** `column` khác `value`, coi NULL là một giá trị (`IS DISTINCT FROM`). */
  differs(column: string, value: string | number | null): RawBuilder<boolean>;
}

const postgres: SqlFlavor = {
  like: 'ilike',
  jsonText: (column, path) => sql<string | null>`(${sql.ref(column)}::jsonb #>> ${sql.lit(`{${path.split('.').join(',')}}`)})`,
  differs: (column, value) => sql<boolean>`${sql.ref(column)} IS DISTINCT FROM ${value}`
};

export function flavorOf(_qb: Kysely<any>): SqlFlavor {
  return postgres;
}
