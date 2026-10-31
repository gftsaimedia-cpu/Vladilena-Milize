import type { Kysely } from 'kysely';
import type { Schema } from './schema.generated';

/**
 * Bảng `settings` (khoá → giá trị JSON): ngày lễ, công tắc, số phiên bản cấu hình (`config_rev`)... Một nơi đọc/ghi, có kiểu theo
 * lược đồ sinh từ migration. Ghi phải nằm trong `store.transaction(...)` của thao tác gọi nếu cần "tất cả hoặc không".
 */
export class SettingsRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  /** Giá trị đã giải JSON của khoá; không có dòng thì trả `fallback`. */
  async get<T = unknown>(key: string, fallback?: T): Promise<T> {
    const row = await this.qb.selectFrom('settings').select('value_json').where('key', '=', key).executeTakeFirst();
    return row ? (JSON.parse(row.value_json) as T) : (fallback as T);
  }

  /** Đặt giá trị (thêm hoặc ghi đè). */
  async set(key: string, value: unknown): Promise<void> {
    await this.qb
      .insertInto('settings')
      .values({ key, value_json: JSON.stringify(value) })
      .onConflict(conflict => conflict.column('key').doUpdateSet(eb => ({ value_json: eb.ref('excluded.value_json') })))
      .execute();
  }

  /** Khoá có dòng hay chưa (dùng cho mốc "đã làm một lần"). */
  async has(key: string): Promise<boolean> {
    const row = await this.qb.selectFrom('settings').select('key').where('key', '=', key).executeTakeFirst();
    return !!row;
  }
}
