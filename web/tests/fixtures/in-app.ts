import type { Page } from '@playwright/test';

/**
 * Chạy `body` trong trang đang mở và trả kết quả. Trang phải đã mở một URL của app,
 * để `import('/src/mock/…')` trong `body` lấy đúng bản module mà app đang dùng.
 */
export function inApp<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async () => { ${body} })()`) as Promise<T>;
}
