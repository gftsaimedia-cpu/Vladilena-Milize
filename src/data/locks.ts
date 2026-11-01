import { Kysely, sql } from 'kysely';
import type { Schema } from './schema.generated';

/**
 * Khoá tư vấn theo khoá nghiệp vụ, giữ tới hết giao dịch đang mở. Với nhiều kết nối (giao dịch chạy song song) nó xếp hàng các giao dịch
 * cùng khoá, nên mẫu "đọc xem có chưa rồi mới chèn" không còn hai bên cùng thấy "chưa có".
 * Gọi bên trong `store.transaction(...)`; ngoài giao dịch thì khoá nhả ngay sau câu lệnh.
 */
export class AdvisoryLocks {
  constructor(private readonly qb: Kysely<Schema>) {}

  async acquire(key: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(this.qb);
  }
}
